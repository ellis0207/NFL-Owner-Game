/**
 * The rulebook: playing rules and league policies the owners can change at
 * the annual league meeting. Each proposal is worded the way it would be
 * submitted, and each has a real effect on the simulation that nobody tells
 * the owner about: a shorter play clock means more snaps, a longer extra
 * point means more missed kicks and more two-point tries.
 */
import { addDays } from "./dates";
import { eraRules, practiceSquadBase, ruleSeason } from "./eras";
import { bindFormat, type SeasonFormat } from "./format";
import { HIDDEN_RATINGS, RULES } from "./league";
import { depthChart } from "./roster";
import { OFFENSE } from "./schemes";
import { ability, staffEffects, teamSchemes } from "./staff";
import { gateShareCost, marketIndex, premiumPoolCost } from "./leaguemoney";
import type { GameState } from "./types";

/** What the simulation and the calendar read from the rulebook. */
export interface RuleParams {
  /** Seconds between plays. */
  playClock: number;
  /** Where a kickoff touchback is spotted. */
  touchback: number;
  /** Yard line extra points are snapped from. */
  xpLine: number;
  /** Yard line two-point tries are snapped from. */
  twoPointLine: number;
  /** Minutes of regular-season overtime. */
  otMinutes: number;
  /** Most yards a non-flagrant defensive pass interference can cost. */
  dpiCap: number;
  /** A trailing team can try a 4th-and-20 instead of an onside kick. */
  fourthAndTwenty: boolean;
  /** The hip-drop tackle is banned (since 2024). */
  hipDropBan: boolean;
  /** Pushing the runner (the "tush push") is allowed. */
  tushPush: boolean;
  /** Roughing-the-passer fouls can be reviewed. */
  roughingReview: boolean;
  /** A missed field goal goes back to the line of scrimmage instead of the spot of the kick. */
  missedFgAtLos: boolean;
  /** Playoff seeding by record, with division winners still in. */
  seedByRecord: boolean;
  /** Extra practice squad spots. */
  extraPracticeSquad: number;
  /** Days the trade deadline moves back. */
  deadlineShift: number;
  /** Regular-season games per team. */
  games: number;
  /** Bye weeks per team. */
  byes: number;
  /** International games added to the usual series each season. */
  intlExtra: number;
  /** A booth official can fix clear errors on the spot. */
  skyJudge: boolean;
  /** League-mandated protective equipment and sensors. */
  safetyTech: boolean;
  /** The visiting teams' share of the gate (after the stadium deduction) that goes into the league pool. */
  gateShare: number;
  /** Share of premium-seating revenue pooled and split evenly. */
  premiumPool: number;
  /** Clubs in the playoff field: 14 since 2020, 12 before. */
  playoffTeams: number;
}

const DEFAULTS: RuleParams = {
  playClock: 40, touchback: 35, xpLine: 15, twoPointLine: 2, otMinutes: 10, dpiCap: 99, fourthAndTwenty: false,
  hipDropBan: true, tushPush: true, roughingReview: false, missedFgAtLos: false, seedByRecord: false, extraPracticeSquad: 0, deadlineShift: 0,
  games: 17, byes: 1, intlExtra: 0, skyJudge: false, safetyTech: false, gateShare: 0.34, premiumPool: 0, playoffTeams: 14,
};

/** The rules in force this season, bound per save (see bindRules). */
export let LEAGUE_RULES: RuleParams = { ...DEFAULTS };

/** What a proposal is about: owners line up issue by issue, so an ally on one can be an opponent on another. */
export type Issue = "competition" | "scheduling" | "money" | "international" | "technology" | "rosters";
export const ISSUES: Record<Issue, string> = {
  competition: "Playing rules", scheduling: "The season and schedule", money: "Revenue sharing", international: "International growth", technology: "Officiating and safety technology", rosters: "Rosters and transactions",
};

export interface RuleChange {
  id: string;
  issue: Issue;
  /** The league office's read for the briefing: what it costs a club a year, and how hard it is to put in place (engine figures, shown as estimates). */
  cost?: (state: GameState) => number;
  difficulty?: "low" | "medium" | "high";
  /** A technology that has to go through a committee trial season before it can be voted on. */
  trial?: string;
  /** The proposal as it would be submitted. */
  title: string;
  /** What changes, in plain words (never the hidden effect). */
  what: string;
  /** How far it moves the game from what it is: traditionalist owners dislike big changes. */
  change: number;
  /** How the league tends to feel about it before anyone's own interest comes in, -1 to 1. */
  appeal: number;
  /** Whether it can be proposed under the current rules. */
  when: (r: RuleParams) => boolean;
  /** How much a team stands to gain, -1 to 1 (engine only). */
  interest: (state: GameState, team: string) => number;
  apply: (r: RuleParams) => void;
}

// ---- What each team stands to gain ----

const balanceCache = new WeakMap<GameState, { date: string; v: Record<string, number> }>();

/** Positive for a team built on its passing game, negative for one built on its pass defense. */
function offenseLean(state: GameState, team: string): number {
  let hit = balanceCache.get(state);
  if (!hit || hit.date !== state.date) {
    hit = { date: state.date, v: {} };
    balanceCache.set(state, hit);
  }
  if (hit.v[team] === undefined) {
    const c = depthChart(state, team);
    const avg = (ids: (string | undefined)[]) => {
      const xs = ids.filter(Boolean).map((id) => ability(state, id!));
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 70;
    };
    const off = avg([c.QB[0], c.QB[0], c.WR[0], c.WR[1], c.OT[0]]);
    const def = avg([c.EDGE[0], c.EDGE[1], c.CB[0], c.CB[1], c.S[0]]);
    hit.v[team] = Math.max(-1, Math.min(1, (off - def) / 8));
  }
  return hit.v[team];
}

function kickerEdge(state: GameState, team: string): number {
  const k = depthChart(state, team).K[0];
  const t = k ? HIDDEN_RATINGS[k]?.traits : undefined;
  return t ? Math.max(-1, Math.min(1, ((t.kickPower ?? 80) + (t.kickAccuracy ?? 80) - 160) / 15)) : 0;
}

function returnEdge(team: string): number {
  return Math.max(-1, Math.min(1, (staffEffects(team).specialTeams - 70) / 20));
}

function tempo(team: string): number {
  return -OFFENSE[teamSchemes(team).offense].tempo / 4;
}

/** The two offenses that built their short-yardage game on the push. */
const PUSH_TEAMS = new Set(["PHI", "BUF"]);

/** Big markets lean one way on sharing money and the schedule, small markets the other: -1 to 1 (see leaguemoney.ts). */
function marketLean(_state: GameState, team: string): number {
  return Math.max(-1, Math.min(1, (marketIndex(team) - 1) * 2));
}

// ---- The proposals ----

export const RULE_CATALOG: RuleChange[] = [
  {
    id: "playClock35", issue: "competition", title: "Reduce the play clock from 40 seconds to 35 seconds after a play ends",
    what: "Offenses get five fewer seconds to snap the ball between plays.", change: 0.6, appeal: -0.05,
    when: (r) => r.playClock === 40, interest: (s, t) => 0.5 * offenseLean(s, t) + 0.4 * tempo(t), apply: (r) => { r.playClock = 35; },
  },
  {
    id: "playClock40", issue: "competition", title: "Restore the 40-second play clock",
    what: "Back to 40 seconds between plays.", change: 0.3, appeal: 0,
    when: (r) => r.playClock === 35, interest: (s, t) => -0.5 * offenseLean(s, t) - 0.4 * tempo(t), apply: (r) => { r.playClock = 40; },
  },
  {
    id: "touchback30", issue: "competition", title: "Move the kickoff touchback from the 35-yard line to the 30-yard line",
    what: "A kick into the end zone that isn't returned comes out to the 30 instead of the 35.", change: 0.3, appeal: 0.05,
    when: (r) => r.touchback === 35, interest: (s, t) => 0.4 * kickerEdge(s, t) - 0.3 * returnEdge(t) - 0.2 * offenseLean(s, t), apply: (r) => { r.touchback = 30; },
  },
  {
    id: "touchback40", issue: "competition", title: "Move the kickoff touchback from the 35-yard line to the 40-yard line to encourage returns",
    what: "Touchbacks come out to the 40, so kicking teams have to keep the ball in play.", change: 0.4, appeal: -0.05,
    when: (r) => r.touchback === 35, interest: (s, t) => 0.4 * returnEdge(t) + 0.3 * offenseLean(s, t), apply: (r) => { r.touchback = 40; },
  },
  {
    id: "touchback35", issue: "competition", title: "Return the kickoff touchback to the 35-yard line",
    what: "Touchbacks go back to the 35.", change: 0.2, appeal: 0.05,
    when: (r) => r.touchback !== 35, interest: () => 0, apply: (r) => { r.touchback = 35; },
  },
  {
    id: "xp25", issue: "competition", title: "Snap extra-point tries from the 25-yard line (a 43-yard kick)",
    what: "The extra point moves back ten yards.", change: 0.5, appeal: -0.1,
    when: (r) => r.xpLine === 15, interest: (s, t) => 0.5 * kickerEdge(s, t), apply: (r) => { r.xpLine = 25; },
  },
  {
    id: "xp15", issue: "competition", title: "Return the extra-point snap to the 15-yard line",
    what: "Back to the 33-yard extra point.", change: 0.2, appeal: 0.05,
    when: (r) => r.xpLine !== 15, interest: (s, t) => -0.5 * kickerEdge(s, t), apply: (r) => { r.xpLine = 15; },
  },
  {
    id: "twoPoint1", issue: "competition", title: "Spot two-point conversion tries at the 1-yard line",
    what: "Two-point tries start a yard closer.", change: 0.4, appeal: -0.05,
    when: (r) => r.twoPointLine === 2, interest: (s, t) => 0.4 * offenseLean(s, t) - 0.2 * kickerEdge(s, t), apply: (r) => { r.twoPointLine = 1; },
  },
  {
    id: "ot15", issue: "competition", title: "Lengthen regular-season overtime from 10 minutes to 15 minutes",
    what: "One full quarter of overtime in the regular season, the same as before 2017.", change: 0.3, appeal: 0.05,
    when: (r) => r.otMinutes === 10, interest: () => 0, apply: (r) => { r.otMinutes = 15; },
  },
  {
    id: "dpi15", issue: "competition", title: "Limit defensive pass interference to a 15-yard penalty unless the foul is flagrant",
    what: "Pass interference stops being a spot foul, the way the college game handles it.", change: 0.5, appeal: -0.1,
    when: (r) => r.dpiCap === 99, interest: (s, t) => -0.6 * offenseLean(s, t), apply: (r) => { r.dpiCap = 15; },
  },
  {
    id: "fourth20", issue: "competition", title: "Allow a team to attempt a 4th-and-20 from its own 25-yard line in place of an onside kick, once per game",
    what: "A trailing team can keep the ball by converting a 4th-and-20 instead of recovering an onside kick.", change: 0.6, appeal: -0.05,
    when: (r) => !r.fourthAndTwenty, interest: (s, t) => 0.3 * offenseLean(s, t), apply: (r) => { r.fourthAndTwenty = true; },
  },
  {
    id: "tushPushBan", issue: "competition", title: "Prohibit pushing, pulling or lifting the runner, including on quarterback sneaks",
    what: "The 'tush push' is banned.", change: 0.4, appeal: 0.1,
    when: (r) => r.tushPush, interest: (_s, t) => (PUSH_TEAMS.has(t) ? -1 : 0.1), apply: (r) => { r.tushPush = false; },
  },
  {
    id: "tushPushAllow", issue: "competition", title: "Allow offensive players to push the runner",
    what: "Brings back the push play.", change: 0.3, appeal: -0.1,
    when: (r) => !r.tushPush, interest: (_s, t) => (PUSH_TEAMS.has(t) ? 1 : -0.1), apply: (r) => { r.tushPush = true; },
  },
  {
    id: "roughingReview", issue: "competition", title: "Make roughing-the-passer fouls subject to replay review",
    what: "The replay official can take away a roughing-the-passer flag.", change: 0.3, appeal: 0.1,
    when: (r) => !r.roughingReview, interest: (s, t) => -0.3 * offenseLean(s, t), apply: (r) => { r.roughingReview = true; },
  },
  {
    id: "hipDropRepeal", issue: "competition", title: "Repeal the prohibition on the hip-drop tackle",
    what: "Defenders could use the swivel hip-drop tackle again.", change: 0.4, appeal: -0.4,
    when: (r) => r.hipDropBan, interest: (s, t) => -0.4 * offenseLean(s, t), apply: (r) => { r.hipDropBan = false; },
  },
  {
    id: "missedFgLos", issue: "competition", title: "Return the ball to the previous line of scrimmage after a missed field goal",
    what: "A miss gives the other team the ball where the play started, not where the kick was spotted.", change: 0.2, appeal: 0,
    when: (r) => !r.missedFgAtLos, interest: (s, t) => 0.4 * kickerEdge(s, t), apply: (r) => { r.missedFgAtLos = true; },
  },
  {
    id: "seedByRecord", issue: "scheduling", title: "Seed the playoff teams by record; division winners are still guaranteed a spot",
    what: "A wild card with a better record than a division winner gets the higher seed and the home game.", change: 0.5, appeal: -0.05,
    when: (r) => !r.seedByRecord, interest: () => 0, apply: (r) => { r.seedByRecord = true; },
  },
  {
    id: "practiceSquad18", issue: "rosters", title: "Increase the practice squad from 17 players to 18",
    what: "One more practice squad spot, and one more salary to pay.", change: 0.2, appeal: 0,
    when: (r) => !r.extraPracticeSquad, interest: () => 0, apply: (r) => { r.extraPracticeSquad = 1; },
  },
  {
    id: "deadlineWeek", issue: "rosters", title: "Move the trade deadline back one week",
    what: "Teams get another week to make trades in the season.", change: 0.2, appeal: 0.05,
    when: (r) => !r.deadlineShift, interest: () => 0, apply: (r) => { r.deadlineShift = 7; },
  },
  {
    id: "games18", issue: "scheduling", title: "Expand the regular season to 18 games, each team playing a ninth home game against a cross-conference opponent",
    what: "One more game for every team, the season a week longer, and more national TV inventory to sell. Players are paid over the extra week.", change: 0.9, appeal: -0.15,
    difficulty: "high", cost: () => -18_000_000,
    when: (r) => r.games === 17, interest: (s, t) => 0.1 + 0.15 * marketLean(s, t), apply: (r) => { r.games = 18; },
  },
  {
    id: "games17", issue: "scheduling", title: "Return the regular season to 17 games",
    what: "Back to 17 games and the shorter season.", change: 0.4, appeal: 0,
    difficulty: "medium", cost: () => 15_000_000,
    when: (r) => r.games === 18, interest: (s, t) => -0.2 - 0.2 * marketLean(s, t), apply: (r) => { r.games = 17; },
  },
  {
    id: "secondBye", issue: "scheduling", title: "Give every team a second bye week, playing the regular season over 19 weeks",
    what: "Each team gets two weeks off during the season; the season ends a week later and the networks get another week of games.", change: 0.5, appeal: -0.1,
    difficulty: "medium", cost: () => 1_500_000,
    when: (r) => r.byes === 1, interest: (s, t) => -0.05 + 0.1 * marketLean(s, t), apply: (r) => { r.byes = 2; },
  },
  {
    id: "oneBye", issue: "scheduling", title: "Return to one bye week per team",
    what: "Back to a single week off and the shorter season.", change: 0.3, appeal: 0,
    difficulty: "low", cost: () => -1_500_000,
    when: (r) => r.byes === 2, interest: () => -0.05, apply: (r) => { r.byes = 1; },
  },
  {
    id: "intlMore", issue: "international", title: "Add two more international regular-season games each year, with clubs assigned home marketing areas abroad",
    what: "More games abroad: more overseas fans and sponsors for the league, and more clubs giving up a home game.", change: 0.4, appeal: -0.1,
    difficulty: "medium", cost: () => 1_200_000,
    when: (r) => r.intlExtra < 4, interest: (s, t) => 0.05 - 0.25 * marketLean(s, t), apply: (r) => { r.intlExtra += 2; },
  },
  {
    id: "intlFewer", issue: "international", title: "Cap the international series at its usual size",
    what: "Ends the extra games abroad.", change: 0.2, appeal: -0.05,
    difficulty: "low", cost: () => -1_000_000,
    when: (r) => r.intlExtra > 0, interest: (s, t) => 0.15 * marketLean(s, t), apply: (r) => { r.intlExtra = 0; },
  },
  {
    id: "skyJudge", issue: "technology", trial: "skyJudge", title: "Add a booth official who can correct clear and obvious errors on the field in real time",
    what: "After a committee trial season: a replay official upstairs fixes clear mistakes without a challenge.", change: 0.3, appeal: 0.08,
    difficulty: "medium", cost: () => 400_000,
    when: (r) => !r.skyJudge, interest: () => 0.05, apply: (r) => { r.skyJudge = true; },
  },
  {
    id: "safetyTech", issue: "technology", trial: "safetyTech", title: "Require position-specific protective helmets and in-game impact sensors league-wide",
    what: "After a committee trial season: every club equips players with the new helmets and the sensors that flag hard hits for the medical staff.", change: 0.3, appeal: 0.1,
    difficulty: "medium", cost: () => 900_000,
    when: (r) => !r.safetyTech, interest: () => 0.05, apply: (r) => { r.safetyTech = true; },
  },
  {
    id: "gateShare40", issue: "money", title: "Raise the visiting teams' gate share pooled by the league from 34% to 40%",
    what: "More of each home gate goes into the pool split 32 ways: small-market clubs gain, clubs with big gates give up more.", change: 0.4, appeal: -0.05,
    difficulty: "low", cost: (s) => gateShareCost(s, 0.06),
    when: (r) => r.gateShare < 0.4, interest: (s, t) => -0.7 * marketLean(s, t), apply: (r) => { r.gateShare = 0.4; },
  },
  {
    id: "gateShare34", issue: "money", title: "Return the pooled visiting gate share to 34%",
    what: "Clubs keep more of their own gates.", change: 0.2, appeal: 0,
    difficulty: "low", cost: (s) => gateShareCost(s, -0.06),
    when: (r) => r.gateShare >= 0.4, interest: (s, t) => 0.7 * marketLean(s, t), apply: (r) => { r.gateShare = 0.34; },
  },
  {
    id: "premiumPool", issue: "money", title: "Pool 15% of premium-seating and suite revenue and share it equally",
    what: "Clubs with big suite incomes pay into a pool for the rest, the way the gate is already shared.", change: 0.5, appeal: -0.1,
    difficulty: "medium", cost: (s) => premiumPoolCost(s, 0.15),
    when: (r) => !r.premiumPool, interest: (s, t) => -0.8 * marketLean(s, t), apply: (r) => { r.premiumPool = 0.15; },
  },
  {
    id: "premiumPoolEnd", issue: "money", title: "End the pooling of premium-seating revenue",
    what: "Each club keeps its own suite and club-seat revenue again.", change: 0.3, appeal: 0,
    difficulty: "low", cost: (s) => premiumPoolCost(s, -0.15),
    when: (r) => r.premiumPool > 0, interest: (s, t) => 0.8 * marketLean(s, t), apply: (r) => { r.premiumPool = 0; },
  },
];

export const RULE_BY_ID: Record<string, RuleChange> = Object.fromEntries(RULE_CATALOG.map((r) => [r.id, r]));

/** The rules in force for a season: the 2026 rulebook plus every change adopted since, in order. */
export function rulesFor(state: GameState, season = RULES.season): RuleParams {
  // A historical start begins from the rulebook of its season (eras.ts), then the owners' votes apply.
  const r = state.era ? { ...DEFAULTS, ...eraRules(ruleSeason(state, season)) } : { ...DEFAULTS };
  for (const a of state.owners?.rules ?? []) if (a.year <= season && (a.until === undefined || a.until >= season)) RULE_BY_ID[a.rule]?.apply(r);
  return r;
}

/**
 * Binds the season's shape (games and byes) for every season, from the rules
 * the save's owners have adopted. Called before the calendar is read.
 */
export function bindSeasonFormat(state: GameState, season = RULES.season): void {
  const cache = new Map<number, SeasonFormat>();
  let seen = -1;
  bindFormat((y) => {
    const n = state.owners?.rules.length ?? 0;
    if (n !== seen) { cache.clear(); seen = n; }
    let f = cache.get(y);
    if (!f) {
      const r = rulesFor(state, y);
      f = { games: r.games, byes: r.byes };
      cache.set(y, f);
    }
    return f;
  }, season);
}

/** Binds the season's rules: the sim reads them, and the calendar and rosters follow them. Called whenever a season is applied. */
export function bindRules(state: GameState): void {
  LEAGUE_RULES = rulesFor(state);
  bindSeasonFormat(state);
  RULES.rosterLimits.practiceSquad = (state.era ? practiceSquadBase(state, RULES.season) : 17) + LEAGUE_RULES.extraPracticeSquad;
  if (LEAGUE_RULES.deadlineShift) {
    const k = RULES.keyDates;
    k.tradeDeadline = addDays(k.tradeDeadline, LEAGUE_RULES.deadlineShift);
    k.veteranWaiversBegin = addDays(k.veteranWaiversBegin, LEAGUE_RULES.deadlineShift);
  }
}
