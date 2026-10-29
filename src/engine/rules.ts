/**
 * The rulebook: playing rules and league policies the owners can change at
 * the annual league meeting. Each proposal is worded the way it would be
 * submitted, and each has a real effect on the simulation that nobody tells
 * the owner about: a shorter play clock means more snaps, a longer extra
 * point means more missed kicks and more two-point tries.
 */
import { addDays } from "./dates";
import { HIDDEN_RATINGS, RULES } from "./league";
import { depthChart } from "./roster";
import { OFFENSE } from "./schemes";
import { ability, staffEffects, teamSchemes } from "./staff";
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
}

const DEFAULTS: RuleParams = {
  playClock: 40, touchback: 35, xpLine: 15, twoPointLine: 2, otMinutes: 10, dpiCap: 99, fourthAndTwenty: false,
  hipDropBan: true, tushPush: true, roughingReview: false, missedFgAtLos: false, seedByRecord: false, extraPracticeSquad: 0, deadlineShift: 0,
};

/** The rules in force this season, bound per save (see bindRules). */
export let LEAGUE_RULES: RuleParams = { ...DEFAULTS };

export interface RuleChange {
  id: string;
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

// ---- The proposals ----

export const RULE_CATALOG: RuleChange[] = [
  {
    id: "playClock35", title: "Reduce the play clock from 40 seconds to 35 seconds after a play ends",
    what: "Offenses get five fewer seconds to snap the ball between plays.", change: 0.6, appeal: -0.05,
    when: (r) => r.playClock === 40, interest: (s, t) => 0.5 * offenseLean(s, t) + 0.4 * tempo(t), apply: (r) => { r.playClock = 35; },
  },
  {
    id: "playClock40", title: "Restore the 40-second play clock",
    what: "Back to 40 seconds between plays.", change: 0.3, appeal: 0,
    when: (r) => r.playClock === 35, interest: (s, t) => -0.5 * offenseLean(s, t) - 0.4 * tempo(t), apply: (r) => { r.playClock = 40; },
  },
  {
    id: "touchback30", title: "Move the kickoff touchback from the 35-yard line to the 30-yard line",
    what: "A kick into the end zone that isn't returned comes out to the 30 instead of the 35.", change: 0.3, appeal: 0.05,
    when: (r) => r.touchback === 35, interest: (s, t) => 0.4 * kickerEdge(s, t) - 0.3 * returnEdge(t) - 0.2 * offenseLean(s, t), apply: (r) => { r.touchback = 30; },
  },
  {
    id: "touchback40", title: "Move the kickoff touchback from the 35-yard line to the 40-yard line to encourage returns",
    what: "Touchbacks come out to the 40, so kicking teams have to keep the ball in play.", change: 0.4, appeal: -0.05,
    when: (r) => r.touchback === 35, interest: (s, t) => 0.4 * returnEdge(t) + 0.3 * offenseLean(s, t), apply: (r) => { r.touchback = 40; },
  },
  {
    id: "touchback35", title: "Return the kickoff touchback to the 35-yard line",
    what: "Touchbacks go back to the 35.", change: 0.2, appeal: 0.05,
    when: (r) => r.touchback !== 35, interest: () => 0, apply: (r) => { r.touchback = 35; },
  },
  {
    id: "xp25", title: "Snap extra-point tries from the 25-yard line (a 43-yard kick)",
    what: "The extra point moves back ten yards.", change: 0.5, appeal: -0.1,
    when: (r) => r.xpLine === 15, interest: (s, t) => 0.5 * kickerEdge(s, t), apply: (r) => { r.xpLine = 25; },
  },
  {
    id: "xp15", title: "Return the extra-point snap to the 15-yard line",
    what: "Back to the 33-yard extra point.", change: 0.2, appeal: 0.05,
    when: (r) => r.xpLine !== 15, interest: (s, t) => -0.5 * kickerEdge(s, t), apply: (r) => { r.xpLine = 15; },
  },
  {
    id: "twoPoint1", title: "Spot two-point conversion tries at the 1-yard line",
    what: "Two-point tries start a yard closer.", change: 0.4, appeal: -0.05,
    when: (r) => r.twoPointLine === 2, interest: (s, t) => 0.4 * offenseLean(s, t) - 0.2 * kickerEdge(s, t), apply: (r) => { r.twoPointLine = 1; },
  },
  {
    id: "ot15", title: "Lengthen regular-season overtime from 10 minutes to 15 minutes",
    what: "One full quarter of overtime in the regular season, the same as before 2017.", change: 0.3, appeal: 0.05,
    when: (r) => r.otMinutes === 10, interest: () => 0, apply: (r) => { r.otMinutes = 15; },
  },
  {
    id: "dpi15", title: "Limit defensive pass interference to a 15-yard penalty unless the foul is flagrant",
    what: "Pass interference stops being a spot foul, the way the college game handles it.", change: 0.5, appeal: -0.1,
    when: (r) => r.dpiCap === 99, interest: (s, t) => -0.6 * offenseLean(s, t), apply: (r) => { r.dpiCap = 15; },
  },
  {
    id: "fourth20", title: "Allow a team to attempt a 4th-and-20 from its own 25-yard line in place of an onside kick, once per game",
    what: "A trailing team can keep the ball by converting a 4th-and-20 instead of recovering an onside kick.", change: 0.6, appeal: -0.05,
    when: (r) => !r.fourthAndTwenty, interest: (s, t) => 0.3 * offenseLean(s, t), apply: (r) => { r.fourthAndTwenty = true; },
  },
  {
    id: "tushPushBan", title: "Prohibit pushing, pulling or lifting the runner, including on quarterback sneaks",
    what: "The 'tush push' is banned.", change: 0.4, appeal: 0.1,
    when: (r) => r.tushPush, interest: (_s, t) => (PUSH_TEAMS.has(t) ? -1 : 0.1), apply: (r) => { r.tushPush = false; },
  },
  {
    id: "tushPushAllow", title: "Allow offensive players to push the runner",
    what: "Brings back the push play.", change: 0.3, appeal: -0.1,
    when: (r) => !r.tushPush, interest: (_s, t) => (PUSH_TEAMS.has(t) ? 1 : -0.1), apply: (r) => { r.tushPush = true; },
  },
  {
    id: "roughingReview", title: "Make roughing-the-passer fouls subject to replay review",
    what: "The replay official can take away a roughing-the-passer flag.", change: 0.3, appeal: 0.1,
    when: (r) => !r.roughingReview, interest: (s, t) => -0.3 * offenseLean(s, t), apply: (r) => { r.roughingReview = true; },
  },
  {
    id: "hipDropRepeal", title: "Repeal the prohibition on the hip-drop tackle",
    what: "Defenders could use the swivel hip-drop tackle again.", change: 0.4, appeal: -0.4,
    when: (r) => r.hipDropBan, interest: (s, t) => -0.4 * offenseLean(s, t), apply: (r) => { r.hipDropBan = false; },
  },
  {
    id: "missedFgLos", title: "Return the ball to the previous line of scrimmage after a missed field goal",
    what: "A miss gives the other team the ball where the play started, not where the kick was spotted.", change: 0.2, appeal: 0,
    when: (r) => !r.missedFgAtLos, interest: (s, t) => 0.4 * kickerEdge(s, t), apply: (r) => { r.missedFgAtLos = true; },
  },
  {
    id: "seedByRecord", title: "Seed the playoff teams by record; division winners are still guaranteed a spot",
    what: "A wild card with a better record than a division winner gets the higher seed and the home game.", change: 0.5, appeal: -0.05,
    when: (r) => !r.seedByRecord, interest: () => 0, apply: (r) => { r.seedByRecord = true; },
  },
  {
    id: "practiceSquad18", title: "Increase the practice squad from 17 players to 18",
    what: "One more practice squad spot, and one more salary to pay.", change: 0.2, appeal: 0,
    when: (r) => !r.extraPracticeSquad, interest: () => 0, apply: (r) => { r.extraPracticeSquad = 1; },
  },
  {
    id: "deadlineWeek", title: "Move the trade deadline back one week",
    what: "Teams get another week to make trades in the season.", change: 0.2, appeal: 0.05,
    when: (r) => !r.deadlineShift, interest: () => 0, apply: (r) => { r.deadlineShift = 7; },
  },
];

export const RULE_BY_ID: Record<string, RuleChange> = Object.fromEntries(RULE_CATALOG.map((r) => [r.id, r]));

/** The rules in force for a season: the 2026 rulebook plus every change adopted since, in order. */
export function rulesFor(state: GameState, season = RULES.season): RuleParams {
  const r = { ...DEFAULTS };
  for (const a of state.owners?.rules ?? []) if (a.year <= season) RULE_BY_ID[a.rule]?.apply(r);
  return r;
}

/** Binds the season's rules: the sim reads them, and the calendar and rosters follow them. Called whenever a season is applied. */
export function bindRules(state: GameState): void {
  LEAGUE_RULES = rulesFor(state);
  RULES.rosterLimits.practiceSquad = 17 + LEAGUE_RULES.extraPracticeSquad;
  if (LEAGUE_RULES.deadlineShift) {
    const k = RULES.keyDates;
    k.tradeDeadline = addDays(k.tradeDeadline, LEAGUE_RULES.deadlineShift);
    k.veteranWaiversBegin = addDays(k.veteranWaiversBegin, LEAGUE_RULES.deadlineShift);
  }
}
