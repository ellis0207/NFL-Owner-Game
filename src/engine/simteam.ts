// The two teams in a simulated game: rosters, lineups, the week's plan,
// ratings on each snap and injuries. The play-by-play itself is in sim.ts
// (game flow, kicks, runs) and simpass.ts (passes).
import { joinedToday } from "./gameweek";
import { chemistryEdge } from "./clubhouse";
import { gameConditions, type Conditions } from "./gameday";
import { type StatKey, type StatLine } from "./stats";
import { teamPlayerIds } from "./cap";
import { injure, injuryRisk, isHurt } from "./injuries";
import { PLAYER_BY_ID, RULES } from "./league";
import { depthChart, isHoldingOut, isSuspended } from "./roster";
import { LEAGUE_RULES } from "./rules";
import { gaussian, rngFor, type Rng } from "./rng";
import { Officials } from "./officials";
import { gamePlan, leagueTrend, type GamePlan } from "./strategy";
import { perPlay } from "./analytics";
import { PLAY_FLAGS as F, Recorder } from "./playlog";
import { DEFENSE, OFFENSE, type DefenseStyle, type OffenseStyle, type Personnel } from "./schemes";
import { ability, schemeFit, staffEffects, teamSchemes, trait, type StaffEffects } from "./staff";
import { innovationEdge, stPlan, type StPlan } from "./simtactics";
import { preseasonOrder, preseasonSeries } from "./coachroom";
import type { BoxScore, GameLog, GameResult, GameState, Position, ScheduledGame, ScoringPlay, TeamBox } from "./types";


export type Side = "away" | "home";
export type Depth = "screen" | "short" | "inter" | "deep";
export type Package = "nickel" | "base" | "dime";

export interface SimOutput {
  result: GameResult;
  box: BoxScore;
  log: GameLog;
}

export function yardsText(y: number): string {
  return y === 0 ? "no gain" : y < 0 ? `a loss of ${-y}` : y === 1 ? "1 yard" : `${y} yards`;
}

export const HOME_EDGE = 1.1; // rating points for the home team on every snap
export const FIT_WEIGHT = 0.6; // rating points per point of average scheme fit
export const OFF_FIT: [Position, number, number][] = [["QB", 1, 3], ["RB", 1, 1], ["WR", 3, 1], ["TE", 1, 1], ["OT", 2, 0.8], ["OG", 2, 0.8], ["C", 1, 0.8], ["FB", 1, 0.3]];
export const DEF_FIT: [Position, number, number][] = [["EDGE", 2, 1], ["IDL", 2, 1], ["LB", 2, 1], ["CB", 3, 1], ["S", 2, 1]];
export const QUARTER = 900;
/** The usual gap between a line's worst pass-rush pairing and its average one, in rating points. */
export const MISMATCH_TYPICAL = 8.7;

export function squeeze(rating: number): number {
  return 82 + (rating - 82) * 0.66;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function emptyTeamBox(): TeamBox {
  return {
    firstDowns: 0, plays: 0, yards: 0, passYds: 0, rushYds: 0, rushAtt: 0, passAtt: 0, cmp: 0, sacked: 0, sackYds: 0,
    thirdConv: 0, thirdAtt: 0, fourthConv: 0, fourthAtt: 0, turnovers: 0, penalties: 0, penYds: 0, top: 0, redZoneTd: 0, redZoneAtt: 0,
  };
}

export interface Team {
  side: Side;
  id: string;
  off: OffenseStyle;
  def: DefenseStyle;
  fx: StaffEffects;
  chart: Record<Position, string[]>;
  inactive: string[];
  /** The emergency third quarterback: inactive, but he can play if both active quarterbacks are out. */
  emergency?: string;
  out: Set<string>;
  /** The quarterback who took the last snap, for the feed's note when he changes. */
  qbNow?: string;
  form: number;
  timeouts: number;
  stats: Record<string, StatLine>;
  box: TeamBox;
  score: number;
  quarters: number[];
  drives: number;
  /** Preseason: how many series the starters play. */
  starterSeries: number;
  /** Estimated edges at game start, for the play-caller's run/pass balance. */
  passLean: number;
  /** How well the starters fit the coaches' schemes, in rating points (offense, defense). */
  offFit: number;
  defFit: number;
  /** The week's game plan: its overall edge, and the defense's tilt against runs and passes (rating points). */
  plan?: GamePlan;
  planEdge: number;
  adjRun: number;
  adjPass: number;
  /** What this offense has called by situation, as the other sideline charts it: [passes, plays]. */
  seen: Record<string, [number, number]>;
  /** The club's special teams plan. */
  st: StPlan;
  /** Edges from ideas the offense came up with this year or the last two (rating points). */
  innov: { pass: number; run: number };
}

export interface Lineup {
  qb: string;
  rbs: string[];
  wrs: string[];
  tes: string[];
  fb?: string;
  ol: string[];
  personnel: Personnel;
}

export interface DefLineup {
  edge: string[];
  idl: string[];
  lb: string[];
  cb: string[];
  s: string[];
  pkg: Package;
}

export const FALLBACK: Partial<Record<Position, Position[]>> = {
  QB: ["RB", "WR"], RB: ["FB", "WR"], FB: ["TE", "RB"], WR: ["TE", "RB"], TE: ["FB", "OT", "WR"],
  OT: ["OG", "C"], OG: ["C", "OT"], C: ["OG", "OT"], EDGE: ["LB", "IDL"], IDL: ["EDGE", "LB"],
  LB: ["S", "EDGE"], CB: ["S", "LB"], S: ["CB", "LB"], K: ["P"], P: ["K"], LS: ["TE", "C", "LB"],
};


export interface PlayOutcome {
  yards: number;
  /** The play already handled the change of possession or score. */
  ended: boolean;
  playTime: number;
  clockStops: boolean;
  involved: (string | undefined)[];
}

export abstract class SimTeams {
  rng: Rng;
  pre: boolean;
  t: Record<Side, Team>;
  scoring: ScoringPlay[] = [];
  injuries: BoxScore["injuries"] = [];
  q = 1;
  clock = QUARTER;
  pos: Side = "away"; // team with the ball
  ydl = 25; // yards from the offense's own goal line
  down = 1;
  dist = 10;
  driveStartClock = 0;
  driveReachedRz = false;
  receivedFirst: Side = "away";
  ot = { active: false, possessions: { away: 0, home: 0 }, suddenDeath: false };
  over = false;

  cond: Conditions;
  rec: Recorder;
  refs: Officials;
  quietTd = false;
  trend = { pass: 0, twoHigh: 0 };
  advice: Rng;
  /** This snap: -1 the defense sat on the call it read from the offense's tendencies, +1 it guessed wrong. */
  read: -1 | 0 | 1 = 0;

  constructor(public state: GameState, public game: ScheduledGame, away: string, home: string) {
    this.rng = rngFor(state.seed, `game:${game.id}`);
    this.rec = new Recorder(state.seed, game.id);
    this.refs = new Officials(state.seed, game.id, away, home);
    this.pre = game.type === "PRE";
    this.cond = gameConditions(state, game, away, home);
    this.t = { away: this.makeTeam("away", away), home: this.makeTeam("home", home) };
    for (const side of ["away", "home"] as const) this.t[side].form += this.cond.edge[side];
    for (const side of ["away", "home"] as const) this.t[side].passLean = this.estimatePassLean(side);
    for (const side of ["away", "home"] as const) {
      const t = this.t[side];
      const dc = this.t[this.other(side)].fx.defCalling;
      t.innov = { pass: innovationEdge(state, t.id, "pass", dc), run: innovationEdge(state, t.id, "run", dc) };
    }
    // League trends move every team's play calling and coverage a little.
    this.trend = leagueTrend(state);
    this.advice = rngFor(state.seed, `advice:${game.id}`);
    if (!this.pre) for (const side of ["away", "home"] as const) this.applyPlan(this.t[side], this.t[this.other(side)]);
  }

  /** The week's plan: a better plan is a small edge, and it tilts what the offense calls and what the defense sells out to stop. */
  applyPlan(t: Team, opp: Team): void {
    const plan = gamePlan(this.state, t.id, opp.id, this.game);
    t.plan = plan;
    t.planEdge = 0.6 * plan.quality;
    t.passLean += plan.attack === "pass" ? 0.03 : -0.03;
    t.adjRun = plan.stop === "run" ? 0.5 : -0.5;
    t.adjPass = -t.adjRun;
  }

  /** Halftime: coordinators look at what worked in the first half and adjust. */
  halftime(): void {
    const first = this.rec.halves[0];
    for (const side of ["away", "home"] as const) {
      const t = this.t[side];
      const opp = this.t[this.other(side)];
      const them = first[opp.side];
      const us = first[side];
      if (them.pn + them.rn < 15) continue;
      // The head coach's feel for the game makes the staff quicker to see what has to change.
      const sense = 0.35 + (t.fx.defCalling - 60) * 0.012 + (t.fx.gameManagement - 72) * 0.008;
      const gap = perPlay(them.re, them.rn) - perPlay(them.pe, them.pn);
      if (Math.abs(gap) > 0.2 && this.advice() < sense) {
        const stopRun = gap > 0;
        if ((t.adjRun > 0) !== stopRun) {
          t.adjRun = stopRun ? 0.5 : -0.5;
          t.adjPass = -t.adjRun;
          const text = `Halftime: the ${t.id} defense adjusts to ${stopRun ? "stop the run" : "take away the pass"}.`;
          this.rec.note(this, text);
          t.plan?.adjust.push(text);
        }
      }
      const mine = perPlay(us.pe, us.pn) - perPlay(us.re, us.rn);
      if (us.pn + us.rn >= 15 && Math.abs(mine) > 0.25 && this.advice() < 0.3 + (t.fx.offCalling - 60) * 0.012 + (t.fx.gameManagement - 72) * 0.008) {
        t.passLean += mine > 0 ? 0.04 : -0.04;
        const text = `Halftime: the ${t.id} offense leans ${mine > 0 ? "on the pass" : "on the run"}, which worked in the first half.`;
        this.rec.note(this, text);
        t.plan?.adjust.push(text);
      }
    }
  }

  makeTeam(side: Side, id: string): Team {
    const schemes = teamSchemes(id);
    const fx = staffEffects(id);
    const full = depthChart(this.state, id, this.game.date);
    // Anyone who joined today missed the league's paperwork deadline for this game.
    const late: string[] = [];
    if (!this.pre) {
      for (const pos of Object.keys(full) as Position[]) {
        full[pos] = full[pos].filter((pid) => {
          if (!joinedToday(this.state, pid, id, this.game.date)) return true;
          late.push(pid);
          return false;
        });
      }
    }
    if (this.pre) preseasonOrder(this.state, id, full);
    const { chart, inactive, emergency } = this.pre ? { chart: full, inactive: [] as string[], emergency: undefined } : gameDayActives(full);
    inactive.push(...late);
    // Injured players on the 53 are inactive too.
    for (const pid of teamPlayerIds(this.state, id)) {
      if (this.state.players[pid].status === "active" && (isHurt(this.state, pid, this.game.date) || isHoldingOut(this.state, pid, this.game.date) || isSuspended(this.state, pid, this.game.date))) inactive.push(pid);
    }
    const leadershipSd = 3.0 - (fx.leadership - 75) * 0.03;
    const r = this.rng();
    const wk = this.game.week ?? 1;
    const starterSeries = preseasonSeries(this.state, id, wk) ?? (wk === 2 ? (r < 0.3 ? 0 : r < 0.8 ? 1 : 2) : r < 0.65 ? 0 : r < 0.95 ? 1 : 2);
    return {
      side, id, off: OFFENSE[schemes.offense], def: DEFENSE[schemes.defense], fx, chart, inactive, emergency,
      out: new Set(), form: gaussian(this.rng) * leadershipSd + chemistryEdge(this.state, id), timeouts: 3, stats: {}, box: emptyTeamBox(),
      score: 0, quarters: [0, 0, 0, 0], drives: 0, starterSeries, passLean: 0,
      offFit: this.unitFit(id, chart, OFF_FIT), defFit: this.unitFit(id, chart, DEF_FIT),
      planEdge: 0, adjRun: 0, adjPass: 0, seen: {}, st: stPlan(this.state, id), innov: { pass: 0, run: 0 },
    };
  }

  /** Weighted scheme fit of a unit's starters. */
  unitFit(team: string, chart: Record<Position, string[]>, unit: [Position, number, number][]): number {
    let total = 0;
    let weight = 0;
    for (const [pos, n, w] of unit) {
      for (const id of chart[pos].slice(0, n)) {
        total += w * schemeFit(this.state, id, team);
        weight += w;
      }
    }
    return weight ? total / weight : 0;
  }

  // ---- People on the field ----

  tier(team: Team): number {
    if (!this.pre) return 0;
    if (team.drives <= team.starterSeries) return 0;
    return this.q <= 2 ? 1 : 2;
  }

  /** Healthy players available at a position for this team (in-game injuries removed), with fallbacks. */
  pool(team: Team, pos: Position): string[] {
    const list = team.chart[pos].filter((id) => !team.out.has(id));
    if (pos === "QB" && !list.length && team.emergency && !team.out.has(team.emergency)) list.push(team.emergency);
    for (const f of FALLBACK[pos] ?? []) for (const id of team.chart[f]) if (!team.out.has(id)) list.push(id);
    if (!list.length) {
      // Nobody left at the spot: anyone who can still stand up plays it.
      for (const ids of Object.values(team.chart)) for (const id of ids) if (!team.out.has(id)) list.push(id);
      if (!list.length) list.push(...Object.values(team.chart).flat());
    }
    return list;
  }

  /** Picks n players at a position for the current tier, skipping anyone already used. */
  pickN(team: Team, pos: Position, n: number, used: Set<string>, starters = n): string[] {
    const list = this.pool(team, pos);
    const chosen: string[] = [];
    const offset = this.tier(team) * starters;
    const order = [...list.slice(offset), ...list.slice(0, offset).reverse()];
    for (const id of order) {
      if (chosen.length >= n) break;
      if (used.has(id)) continue;
      chosen.push(id);
      used.add(id);
    }
    return chosen;
  }

  offenseLineup(team: Team, personnel: Personnel): Lineup {
    const used = new Set<string>();
    const [qb] = this.pickN(team, "QB", 1, used);
    // The lead back's share of the backs' snaps: a clear starter is a workhorse, two close backs share it.
    const rbPool = this.pickN(team, "RB", 2, new Set(used), 2);
    const gap = rbPool.length > 1 ? ability(this.state, rbPool[0]) - ability(this.state, rbPool[1]) : 10;
    const rbStarter = this.rng() < clamp(0.64 + gap * 0.012, 0.5, 0.82);
    const rb = rbStarter || rbPool.length < 2 ? rbPool[0] : rbPool[1];
    if (rb) used.add(rb);
    const nWr = { "10": 4, "11": 3, "12": 2, "13": 1, "21": 2 }[personnel];
    const nTe = { "10": 0, "11": 1, "12": 2, "13": 3, "21": 1 }[personnel];
    // Receivers rotate: the fourth man spells the third, and now and then any starter takes a breather.
    // A substitute lines up last in the progression. In the real league about fifteen players a season
    // catch passes for a team, and its top three see only about 55% of the targets.
    const pool = this.pickN(team, "WR", Math.min(5, nWr + 2), new Set(used), 3);
    let wrs = pool.slice(0, nWr);
    const bench = pool.slice(nWr);
    if (nWr >= 2 && bench.length && this.rng() < 0.25) wrs = [...wrs.slice(0, nWr - 1), bench[0]];
    else if (nWr >= 2 && bench.length && this.rng() < 0.12) {
      const out = Math.floor(this.rng() * nWr);
      wrs = [...wrs.filter((_, i) => i !== out), bench[bench.length - 1]];
    }
    wrs.forEach((id) => used.add(id));
    const tePool = this.pickN(team, "TE", nTe + 1, new Set(used), 2);
    const tes = nTe && tePool.length > nTe && this.rng() < 0.15 ? [...tePool.slice(1, nTe), tePool[nTe]] : tePool.slice(0, nTe);
    tes.forEach((id) => used.add(id));
    const fb = personnel === "21" ? this.pickN(team, "FB", 1, used)[0] : undefined;
    const ol = [...this.pickN(team, "OT", 2, used), ...this.pickN(team, "OG", 2, used), ...this.pickN(team, "C", 1, used)];
    return { qb, rbs: rb ? [rb] : [], wrs, tes, fb, ol, personnel };
  }

  defenseLineup(team: Team, pkg: Package): DefLineup {
    const used = new Set<string>();
    const threeFour = team.def.front === "34";
    const rotate = (pos: Position, n: number, rate: number, starters = n) => {
      const list = this.pickN(team, pos, n + 1, new Set(used), starters);
      const out = list.slice(0, n);
      if (list.length > n && this.rng() < rate * n) out[Math.floor(this.rng() * n)] = list[n];
      out.forEach((id) => used.add(id));
      return out;
    };
    const nIdl = pkg === "base" && threeFour ? 3 : 2;
    const nLb = pkg === "base" ? (threeFour ? 2 : 3) : pkg === "nickel" ? 2 : 1;
    const nCb = pkg === "base" ? 2 : pkg === "nickel" ? 3 : 4;
    // Linemen rotate to stay fresh: a starting edge plays about three snaps in four, an interior lineman about seven in ten.
    const edge = rotate("EDGE", 2, 0.25);
    const idl = rotate("IDL", nIdl, 0.3);
    // The back seven come off the field less, but a backup still spells a starter now and then.
    const lb = rotate("LB", nLb, 0.13, threeFour ? 2 : 3);
    const cb = rotate("CB", nCb, 0.05, 3);
    const s = rotate("S", 2, 0.11);
    return { edge, idl, lb, cb, s, pkg };
  }

  specialist(team: Team, pos: "K" | "P" | "LS"): string | undefined {
    return this.pool(team, pos)[0];
  }

  returner(team: Team, kind: "kr" | "pr"): string | undefined {
    const cands = [
      ...this.pool(team, "RB").slice(1, 3), ...this.pool(team, "WR").slice(2, 5), ...this.pool(team, "CB").slice(2, 4),
    ];
    let best: string | undefined;
    let bestV = -1;
    for (const id of cands) {
      const v = kind === "kr" ? trait(this.state, id, "speed") : 0.6 * trait(this.state, id, "agility") + 0.4 * trait(this.state, id, "speed");
      if (v > bestV) {
        bestV = v;
        best = id;
      }
    }
    return best;
  }

  /** Ten coverage players for a kick: backups who play special teams. */
  coverage(team: Team): string[] {
    const out: string[] = [];
    for (const [pos, from, n] of [["LB", 2, 3], ["S", 2, 2], ["CB", 3, 2], ["TE", 2, 1], ["RB", 2, 1], ["WR", 4, 1]] as [Position, number, number][]) {
      out.push(...team.chart[pos].filter((id) => !team.out.has(id)).slice(from, from + n));
    }
    return out;
  }

  // ---- Bookkeeping ----

  add(team: Team, id: string | undefined, key: StatKey, v = 1): void {
    if (!id) return;
    const line = (team.stats[id] ??= {});
    this.rec.credit(team.side, id, key, v);
    if (key === "passLong" || key === "rushLong" || key === "recLong" || key === "fgLong" || key === "puntLong") line[key] = Math.max(line[key] ?? 0, v);
    else line[key] = (line[key] ?? 0) + v;
  }

  snaps(team: Team, ids: (string | undefined)[], key: "offSnaps" | "defSnaps" | "stSnaps"): void {
    for (const id of ids) this.add(team, id, key);
  }

  // Ratings are spread wide by design (they rank every player in camp), so the
  // engine squeezes them toward a typical starter: talent matters on every
  // snap, but no lineup is so outclassed that it can't win on a good day.
  tr(id: string | undefined, name: string): number {
    return squeeze(id ? trait(this.state, id, name) : 40);
  }

  ab(id: string | undefined): number {
    return squeeze(id ? ability(this.state, id) : 40);
  }

  avg(ids: (string | undefined)[], f: (id: string | undefined) => number): number {
    return ids.length ? ids.reduce((s, id) => s + f(id), 0) / ids.length : 40;
  }

  other(side: Side): Side {
    return side === "away" ? "home" : "away";
  }

  homeEdge(side: Side): number {
    return this.game.neutral ? 0 : side === "home" ? HOME_EDGE / 2 : -HOME_EDGE / 2;
  }

  /** Shared per-snap offense-minus-defense edge from coaching, form and home field. */
  baseEdge(o: Team, d: Team): number {
    const calling = (o.fx.offCalling - 75) * 0.14 - (d.fx.defCalling - 75) * 0.14 + o.fx.command - d.fx.command;
    // Game script: a defense protecting a lead plays soft, and the trailing offense takes what it gives.
    const lead = o.score - d.score;
    const script = this.q >= 3 || (this.q === 2 && this.clock < 300) ? -clamp(lead, -21, 21) * 0.16 : 0;
    // Scheme fit: players who suit what their coaches ask of them play faster.
    const fit = (o.offFit - d.defFit) * FIT_WEIGHT;
    return calling + fit + o.form - d.form + this.homeEdge(o.side) - this.homeEdge(d.side) + script + o.planEdge - d.planEdge;
  }

  estimatePassLean(side: Side): number {
    // A rough look at whether this offense should lean pass or run against this defense.
    const o = this.t[side];
    const d = this.t[this.other(side)];
    const top = (team: Team, pos: Position, n: number, f: (id: string) => number) =>
      team.chart[pos].slice(0, n).reduce((s, id) => s + f(id), 0) / Math.max(1, Math.min(n, team.chart[pos].length));
    const pass = 0.4 * top(o, "QB", 1, (id) => this.ab(id)) + 0.3 * top(o, "WR", 3, (id) => this.ab(id)) + 0.3 * top(o, "OT", 2, (id) => this.tr(id, "passBlock"))
      - (0.5 * top(d, "CB", 3, (id) => this.ab(id)) + 0.5 * top(d, "EDGE", 2, (id) => this.tr(id, "passRush")));
    const run = 0.5 * top(o, "RB", 1, (id) => this.ab(id)) + 0.5 * top(o, "OG", 2, (id) => this.tr(id, "runBlock"))
      - (0.5 * top(d, "IDL", 2, (id) => this.tr(id, "runStop")) + 0.5 * top(d, "LB", 2, (id) => this.tr(id, "runStop")));
    const skill = o.fx.offCalling / 100;
    return clamp((pass - run) * 0.006 * skill, -0.08, 0.08);
  }

  name(id: string | undefined): string {
    return id ? PLAYER_BY_ID[id].name : "Team";
  }

  // ---- Injuries ----

  maybeInjure(o: Team, d: Team, involved: (string | undefined)[], onField: (string | undefined)[]): void {
    if (this.rng() > (LEAGUE_RULES.hipDropBan ? 0.075 : 0.077)) return;
    // About half the time it's someone in on the ball; otherwise anyone in the trenches or on the field.
    const onBall = this.rng() < 0.5;
    const pool = onBall ? involved.filter(Boolean) as string[] : onField.filter(Boolean) as string[];
    if (!pool.length) return;
    const id = pool[Math.floor(this.rng() * pool.length)];
    // A lead back is in on the ball twenty times a game, but most of those hits are glancing: real
    // workhorses miss about two games a season, not four.
    if (onBall && PLAYER_BY_ID[id]?.position === "RB" && this.rng() < 0.4) return;
    // Quarterbacks are protected by the rules and mostly throw from a clean pocket: starters miss far fewer
    // games than the men around them.
    if (PLAYER_BY_ID[id]?.position === "QB" && this.rng() < 0.45) return;
    const team = this.isOn(o, id) ? o : d;
    if (this.rng() > Math.min(1, 0.75 * injuryRisk(this.state, id, team.id))) return;
    const { injury, days } = injure(this.state, id, team.id, this.rng);
    this.injuries.push({ player: id, team: team.id, type: injury.type });
    const who = `${this.name(id)} (${team.id} ${PLAYER_BY_ID[id]?.position ?? ""})`.replace(" )", ")");
    const hurt = `INJURY: ${who} is down after the play, ${injury.type.toLowerCase()}.`;
    if (days <= 3 && this.rng() < 0.55) {
      // Shook it off and returned.
      this.rec.more(` ${hurt} He walks off and is expected back.`, F.injury);
      return;
    }
    team.out.add(id);
    const spot = (Object.keys(team.chart) as Position[]).find((p) => team.chart[p].includes(id));
    const next = spot ? this.pool(team, spot)[0] : undefined;
    this.rec.more(` ${hurt} He is out for the rest of the game${next && next !== id ? `; ${this.name(next)} replaces him` : ""}.`, F.injury);
  }

  isOn(team: Team, id: string): boolean {
    return Object.values(team.chart).some((list) => list.includes(id));
  }
}

/**
 * The 48 who dress on game day. Healthy scratches come from the deepest
 * spots on the depth chart, keeping enough at each position to play.
 */
export function gameDayActives(chart: Record<Position, string[]>): { chart: Record<Position, string[]>; inactive: string[]; emergency?: string } {
  const KEEP: Partial<Record<Position, number>> = { QB: 2, RB: 3, FB: 1, WR: 5, TE: 3, OT: 3, OG: 3, C: 2, EDGE: 4, IDL: 4, LB: 4, CB: 5, S: 4, K: 1, P: 1, LS: 1 };
  const all = Object.values(chart).reduce((s, l) => s + l.length, 0);
  let extra = all - RULES.rosterLimits.gameDayActive;
  const out = Object.fromEntries(Object.entries(chart).map(([p, l]) => [p, [...l]])) as Record<Position, string[]>;
  const inactive: string[] = [];
  const order: Position[] = ["QB", "OG", "OT", "C", "WR", "TE", "RB", "LB", "CB", "S", "IDL", "EDGE", "FB"];
  while (extra > 0) {
    let removed = false;
    for (const pos of order) {
      if (extra <= 0) break;
      if (out[pos].length > (KEEP[pos] ?? 0)) {
        inactive.push(out[pos].pop()!);
        extra--;
        removed = true;
      }
    }
    if (!removed) break;
  }
  // A third quarterback on the inactive list can be the emergency quarterback (since 2023).
  const emergency = chart.QB.find((id) => inactive.includes(id));
  return { chart: out, inactive, emergency };
}
