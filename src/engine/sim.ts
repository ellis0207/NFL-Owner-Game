// Play-by-play game simulation.
//
// Every snap is called by the team's real play-caller from their scheme's
// tendencies, adjusted for down, distance, score and clock. The play is then
// resolved from the traits of the players on the field: an outside-zone run
// leans on linemen who move well and a back with vision, a deep shot on a
// fast receiver, the quarterback's arm and the time the line buys against
// the rush. Rosters that fit their coaches' schemes play better, good
// play-callers make better calls, and luck still decides plenty of Sundays.
import { addLine, pack, type StatKey, type StatLine } from "./stats";
import { teamPlayerIds } from "./cap";
import { injure, injuryRisk, isHurt } from "./injuries";
import { PLAYER_BY_ID, RULES } from "./league";
import { depthChart } from "./roster";
import { gaussian, rngFor, type Rng } from "./rng";
import { DEFENSE, OFFENSE, type DefenseStyle, type OffenseStyle, type Personnel, type RunType } from "./schemes";
import { ability, schemeFit, staffEffects, teamSchemes, trait, type StaffEffects } from "./staff";
import type { BoxScore, GameResult, GameState, Position, ScheduledGame, ScoringPlay, TeamBox } from "./types";

type Side = "away" | "home";
type Depth = "screen" | "short" | "inter" | "deep";
type Package = "nickel" | "base" | "dime";

export interface SimOutput {
  result: GameResult;
  box: BoxScore;
}

const HOME_EDGE = 1.1; // rating points for the home team on every snap
const FIT_WEIGHT = 0.6; // rating points per point of average scheme fit
const OFF_FIT: [Position, number, number][] = [["QB", 1, 3], ["RB", 1, 1], ["WR", 3, 1], ["TE", 1, 1], ["OT", 2, 0.8], ["OG", 2, 0.8], ["C", 1, 0.8], ["FB", 1, 0.3]];
const DEF_FIT: [Position, number, number][] = [["EDGE", 2, 1], ["IDL", 2, 1], ["LB", 2, 1], ["CB", 3, 1], ["S", 2, 1]];
const QUARTER = 900;

function squeeze(rating: number): number {
  return 82 + (rating - 82) * 0.66;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function emptyTeamBox(): TeamBox {
  return {
    firstDowns: 0, plays: 0, yards: 0, passYds: 0, rushYds: 0, rushAtt: 0, passAtt: 0, cmp: 0, sacked: 0, sackYds: 0,
    thirdConv: 0, thirdAtt: 0, fourthConv: 0, fourthAtt: 0, turnovers: 0, penalties: 0, penYds: 0, top: 0, redZoneTd: 0, redZoneAtt: 0,
  };
}

interface Team {
  side: Side;
  id: string;
  off: OffenseStyle;
  def: DefenseStyle;
  fx: StaffEffects;
  chart: Record<Position, string[]>;
  inactive: string[];
  out: Set<string>;
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
}

interface Lineup {
  qb: string;
  rbs: string[];
  wrs: string[];
  tes: string[];
  fb?: string;
  ol: string[];
  personnel: Personnel;
}

interface DefLineup {
  edge: string[];
  idl: string[];
  lb: string[];
  cb: string[];
  s: string[];
  pkg: Package;
}

const FALLBACK: Partial<Record<Position, Position[]>> = {
  QB: ["RB", "WR"], RB: ["FB", "WR"], FB: ["TE", "RB"], WR: ["TE", "RB"], TE: ["FB", "OT", "WR"],
  OT: ["OG", "C"], OG: ["C", "OT"], C: ["OG", "OT"], EDGE: ["LB", "IDL"], IDL: ["EDGE", "LB"],
  LB: ["S", "EDGE"], CB: ["S", "LB"], S: ["CB", "LB"], K: ["P"], P: ["K"], LS: ["TE", "C", "LB"],
};

export function simulateGame(state: GameState, game: ScheduledGame, away: string, home: string): SimOutput {
  return new GameSim(state, game, away, home).play();
}

class GameSim {
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

  constructor(public state: GameState, public game: ScheduledGame, away: string, home: string) {
    this.rng = rngFor(state.seed, `game:${game.id}`);
    this.pre = game.type === "PRE";
    this.t = { away: this.makeTeam("away", away), home: this.makeTeam("home", home) };
    for (const side of ["away", "home"] as const) this.t[side].passLean = this.estimatePassLean(side);
  }

  makeTeam(side: Side, id: string): Team {
    const schemes = teamSchemes(id);
    const fx = staffEffects(id);
    const full = depthChart(this.state, id, this.game.date);
    const { chart, inactive } = this.pre ? { chart: full, inactive: [] as string[] } : gameDayActives(full);
    // Injured players on the 53 are inactive too.
    for (const pid of teamPlayerIds(this.state, id)) {
      if (this.state.players[pid].status === "active" && isHurt(this.state, pid, this.game.date)) inactive.push(pid);
    }
    const leadershipSd = 3.0 - (fx.leadership - 75) * 0.03;
    const r = this.rng();
    const wk = this.game.week ?? 1;
    const starterSeries = wk === 2 ? (r < 0.3 ? 0 : r < 0.8 ? 1 : 2) : r < 0.65 ? 0 : r < 0.95 ? 1 : 2;
    return {
      side, id, off: OFFENSE[schemes.offense], def: DEFENSE[schemes.defense], fx, chart, inactive,
      out: new Set(), form: gaussian(this.rng) * leadershipSd, timeouts: 3, stats: {}, box: emptyTeamBox(),
      score: 0, quarters: [0, 0, 0, 0], drives: 0, starterSeries, passLean: 0,
      offFit: this.unitFit(id, chart, OFF_FIT), defFit: this.unitFit(id, chart, DEF_FIT),
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
    const rbStarter = this.rng() < 0.68;
    const rbPool = this.pickN(team, "RB", 2, new Set(used), 2);
    const rb = rbStarter || rbPool.length < 2 ? rbPool[0] : rbPool[1];
    if (rb) used.add(rb);
    const nWr = { "10": 4, "11": 3, "12": 2, "13": 1, "21": 2 }[personnel];
    const nTe = { "10": 0, "11": 1, "12": 2, "13": 3, "21": 1 }[personnel];
    let wrs = this.pickN(team, "WR", Math.min(4, nWr + 1), new Set(used), 3);
    if (nWr === 3 && wrs.length === 4 && this.rng() < 0.12) wrs = [wrs[0], wrs[1], wrs[3]];
    else wrs = wrs.slice(0, nWr);
    wrs.forEach((id) => used.add(id));
    const tes = this.pickN(team, "TE", nTe, used, 2);
    const fb = personnel === "21" ? this.pickN(team, "FB", 1, used)[0] : undefined;
    const ol = [...this.pickN(team, "OT", 2, used), ...this.pickN(team, "OG", 2, used), ...this.pickN(team, "C", 1, used)];
    return { qb, rbs: rb ? [rb] : [], wrs, tes, fb, ol, personnel };
  }

  defenseLineup(team: Team, pkg: Package): DefLineup {
    const used = new Set<string>();
    const threeFour = team.def.front === "34";
    const rotate = (pos: Position, n: number, rate: number) => {
      const list = this.pickN(team, pos, n + 1, new Set(used), n);
      const out = list.slice(0, n);
      if (list.length > n && this.rng() < rate * n) out[Math.floor(this.rng() * n)] = list[n];
      out.forEach((id) => used.add(id));
      return out;
    };
    const nIdl = pkg === "base" && threeFour ? 3 : 2;
    const nLb = pkg === "base" ? (threeFour ? 2 : 3) : pkg === "nickel" ? 2 : 1;
    const nCb = pkg === "base" ? 2 : pkg === "nickel" ? 3 : 4;
    const edge = rotate("EDGE", 2, 0.12);
    const idl = rotate("IDL", nIdl, 0.14);
    const lb = this.pickN(team, "LB", nLb, used, threeFour ? 2 : 3);
    const cb = this.pickN(team, "CB", nCb, used, 3);
    const s = this.pickN(team, "S", 2, used);
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
    const calling = (o.fx.offCalling - 75) * 0.14 - (d.fx.defCalling - 75) * 0.14;
    // Game script: a defense protecting a lead plays soft, and the trailing offense takes what it gives.
    const lead = o.score - d.score;
    const script = this.q >= 3 || (this.q === 2 && this.clock < 300) ? -clamp(lead, -21, 21) * 0.16 : 0;
    // Scheme fit: players who suit what their coaches ask of them play faster.
    const fit = (o.offFit - d.defFit) * FIT_WEIGHT;
    return calling + fit + o.form - d.form + this.homeEdge(o.side) - this.homeEdge(d.side) + script;
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

  // ---- Game flow ----

  play(): SimOutput {
    const away = this.t.away;
    const home = this.t.home;
    this.receivedFirst = this.rng() < 0.5 ? "away" : "home";
    this.kickoff(this.other(this.receivedFirst));
    let guard = 0;
    while (!this.over && guard++ < 400) this.snap();

    const result: GameResult = { away: away.id, home: home.id, awayScore: away.score, homeScore: home.score, overtime: this.ot.active };
    const players = { away: {} as Record<string, number[]>, home: {} as Record<string, number[]> };
    for (const side of ["away", "home"] as const) {
      for (const [id, line] of Object.entries(this.t[side].stats)) players[side][id] = pack(line);
    }
    const box: BoxScore = {
      quarters: { away: away.quarters, home: home.quarters },
      team: { away: away.box, home: home.box },
      players,
      scoring: this.scoring,
      inactives: { away: away.inactive, home: home.inactive },
      injuries: this.injuries,
    };
    return { result, box };
  }

  /** Points scored: tracks quarter totals and the scoring summary. */
  score(team: Team, points: number, text: string): void {
    team.score += points;
    team.quarters[Math.min(this.q, 5) - 1] = (team.quarters[Math.min(this.q, 5) - 1] ?? 0) + points;
    this.scoring.push({ q: this.q, clock: Math.max(0, Math.round(this.clock)), team: team.id, text, away: this.t.away.score, home: this.t.home.score });
  }

  tick(seconds: number): void {
    const before = this.clock;
    this.t[this.pos].box.top += Math.max(0, Math.min(seconds, before));
    this.clock -= seconds;
    if ((this.q === 2 || this.q === 4) && before > 120 && this.clock <= 120) this.clock = 120; // two-minute warning
  }

  endOfPeriodCheck(): void {
    if (this.clock > 0) return;
    if (this.ot.active) {
      // Regular-season overtime is one 10-minute period; playoff games keep going.
      if (this.game.type === "POST") {
        this.q++;
        this.clock = QUARTER;
        return;
      }
      this.over = true;
      return;
    }
    if (this.q === 2) {
      this.q = 3;
      this.clock = QUARTER;
      this.t.away.timeouts = 3;
      this.t.home.timeouts = 3;
      this.kickoff(this.receivedFirst);
      return;
    }
    if (this.q === 4) {
      if (this.t.away.score !== this.t.home.score || this.pre) {
        this.over = true;
        return;
      }
      this.startOvertime();
      return;
    }
    this.q++;
    this.clock = QUARTER;
  }

  startOvertime(): void {
    this.ot.active = true;
    this.q = 5;
    this.clock = this.game.type === "POST" ? QUARTER : 600;
    this.t.away.timeouts = 2;
    this.t.home.timeouts = 2;
    const receiver: Side = this.rng() < 0.5 ? "away" : "home";
    this.kickoff(this.other(receiver));
  }

  /** Called whenever a possession ends; decides overtime outcomes. */
  possessionEnded(by: Side): void {
    if (!this.ot.active) return;
    this.ot.possessions[by]++;
    const a = this.t.away.score;
    const h = this.t.home.score;
    if (this.ot.possessions.away >= 1 && this.ot.possessions.home >= 1) {
      if (a !== h) this.over = true;
      else this.ot.suddenDeath = true;
    }
  }

  newPossession(side: Side, ydl: number): void {
    this.pos = side;
    this.ydl = clamp(ydl, 1, 99);
    this.down = 1;
    this.dist = Math.min(10, 100 - this.ydl);
    this.driveStartClock = this.clock;
    this.driveReachedRz = false;
    this.t[side].drives++;
  }

  turnover(newYdl: number): void {
    const was = this.pos;
    this.t[was].box.turnovers++;
    this.possessionEnded(was);
    if (this.over) return;
    this.newPossession(this.other(was), newYdl);
  }

  // ---- Kicks ----

  kickoff(kicking: Side): void {
    const k = this.t[kicking];
    const r = this.t[this.other(kicking)];
    const kicker = this.specialist(k, "K");
    this.snaps(k, [kicker, ...this.coverage(k)], "stSnaps");
    this.snaps(r, this.coverage(r), "stSnaps");
    // Onside kick when trailing late.
    const trail = r.score - k.score;
    if (this.q >= 4 && this.clock < 150 && trail > 0 && trail <= 16 && !this.ot.active) {
      this.tick(4);
      if (this.rng() < 0.12) {
        this.newPossession(kicking, 48);
        return;
      }
      this.newPossession(r.side, 52);
      return;
    }
    // 2025 kickoff rules: touchbacks come out to the 35, and most kicks are returned.
    const power = this.tr(kicker, "kickPower");
    if (this.rng() < 0.28 + (power - 80) * 0.006) {
      this.newPossession(r.side, 35);
      return;
    }
    const ret = this.returner(r, "kr");
    const skill = this.tr(ret, "speed") - 80 + (r.fx.specialTeams - k.fx.specialTeams) * 0.15;
    let yards = Math.round(23 + gaussian(this.rng) * 5 + skill * 0.15);
    const burst = this.rng();
    if (burst < 0.035 + skill * 0.001) yards += 15 + Math.round(this.rng() * 40);
    this.tick(6);
    this.add(r, ret, "kr");
    if (burst < 0.003 + skill * 0.0002 || yards >= 100) {
      this.add(r, ret, "krYds", 100);
      this.add(r, ret, "krTd");
      this.newPossession(r.side, 99);
      this.touchdown(r, `${this.name(ret)} kickoff return`, ret);
      return;
    }
    yards = clamp(yards, 5, 95);
    this.add(r, ret, "krYds", yards);
    this.tackle(k, this.coverage(k), 0);
    if (this.rng() < 0.006) {
      // Muffed or fumbled return.
      this.add(r, ret, "fum");
      this.add(r, ret, "fumLost");
      this.newPossession(kicking, 100 - yards);
      this.t[r.side].box.turnovers++;
      return;
    }
    this.newPossession(r.side, yards);
  }

  punt(): void {
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    const punter = this.specialist(o, "P");
    this.snaps(o, [punter, this.specialist(o, "LS"), ...this.coverage(o)], "stSnaps");
    this.snaps(d, this.coverage(d), "stSnaps");
    this.tick(7);
    if (this.rng() < 0.006) {
      // Blocked.
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 100 - Math.max(1, this.ydl - 8));
      return;
    }
    const power = this.tr(punter, "kickPower");
    const placement = this.tr(punter, "placement");
    let gross = Math.round(49.5 + (power - 80) * 0.22 + gaussian(this.rng) * 7 + (o.fx.specialTeams - 70) * 0.03);
    const room = 100 - this.ydl;
    // Short-field punts are aimed inside the 20 instead of hit for distance.
    if (room < 45) gross = Math.round(room - 5 - this.rng() * 8 + (placement - 80) * 0.1);
    gross = clamp(gross, 20, 75);
    this.add(o, punter, "punts");
    let landing = this.ydl + gross;
    if (landing >= 100) {
      this.add(o, punter, "puntYds", room);
      this.add(o, punter, "puntLong", room);
      this.add(o, punter, "puntTb");
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 20);
      return;
    }
    this.add(o, punter, "puntYds", gross);
    this.add(o, punter, "puntLong", gross);
    const r = this.rng();
    let ret = 0;
    const returner = this.returner(d, "pr");
    if (landing < 90 && r < 0.42) {
      const skill = this.tr(returner, "agility") - 80 + (d.fx.specialTeams - o.fx.specialTeams) * 0.15;
      ret = Math.round(Math.max(0, 8 + gaussian(this.rng) * 6 + skill * 0.15));
      if (this.rng() < 0.03 + skill * 0.001) ret += 15 + Math.round(this.rng() * 50);
      this.add(d, returner, "pr");
      if (landing - ret <= 0) {
        this.add(d, returner, "prYds", landing);
        this.add(d, returner, "prTd");
        this.possessionEnded(o.side);
        if (this.over) return;
        this.newPossession(d.side, 99);
        this.touchdown(d, `${this.name(returner)} ${landing}-yard punt return`, returner);
        return;
      }
      this.add(d, returner, "prYds", ret);
      this.tackle(o, this.coverage(o), 0);
      if (this.rng() < 0.01) {
        // Muffed punt recovered by the kicking team.
        this.add(d, returner, "fum");
        this.add(d, returner, "fumLost");
        d.box.turnovers++;
        this.newPossession(o.side, landing - ret);
        return;
      }
    } else if (landing >= 95) {
      landing = 90 + Math.floor(this.rng() * 8);
    }
    landing -= ret;
    if (landing >= 80) this.add(o, punter, "puntIn20");
    this.possessionEnded(o.side);
    if (!this.over) this.newPossession(d.side, 100 - landing);
  }

  fgMakeChance(kicker: string | undefined, distance: number): number {
    const power = this.tr(kicker, "kickPower");
    const acc = this.tr(kicker, "kickAccuracy");
    const l50 = 62.5 + (power - 80) * 0.25;
    const p = 1 / (1 + Math.exp((distance - l50) / 6));
    return clamp(p * (0.985 + (acc - 80) * 0.002), 0.02, 0.995);
  }

  fieldGoal(): void {
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    const kicker = this.specialist(o, "K");
    const distance = 100 - this.ydl + 17;
    this.snaps(o, [kicker, this.specialist(o, "LS"), this.specialist(o, "P"), ...this.coverage(o)], "stSnaps");
    this.snaps(d, this.coverage(d), "stSnaps");
    this.tick(5);
    this.add(o, kicker, "fga");
    if (distance >= 50) this.add(o, kicker, "fga50");
    else if (distance >= 40) this.add(o, kicker, "fga40");
    const made = this.rng() < this.fgMakeChance(kicker, distance) && this.rng() > 0.01;
    if (made) {
      this.add(o, kicker, "fgm");
      this.add(o, kicker, "fgLong", distance);
      if (distance >= 50) this.add(o, kicker, "fgm50");
      else if (distance >= 40) this.add(o, kicker, "fgm40");
      this.score(o, 3, `${this.name(kicker)} ${distance}-yard field goal`);
      this.possessionEnded(o.side);
      if (this.over) return;
      this.kickoff(o.side);
      return;
    }
    this.possessionEnded(o.side);
    if (!this.over) this.newPossession(d.side, Math.max(20, 100 - (this.ydl - 7)));
  }

  touchdown(team: Team, text: string, scorer?: string): void {
    void scorer;
    this.score(team, 6, text);
    if (this.ot.active && this.ot.suddenDeath) {
      this.over = true;
      return;
    }
    // Extra point or two-point try.
    const opp = this.t[this.other(team.side)];
    const diff = team.score - opp.score;
    const late = this.q >= 4 || (this.q === 3 && this.clock < 300);
    const chart = late && [-2, -5, -10, 1, 5, -13, -16].includes(diff);
    const goForTwo = (!this.ot.active || !this.ot.suddenDeath) && (chart || this.rng() < 0.03 + (team.fx.gameManagement - 70) * 0.001);
    const kicker = this.specialist(team, "K");
    this.snaps(team, [kicker, this.specialist(team, "LS"), ...this.coverage(team)], "stSnaps");
    const last = this.scoring[this.scoring.length - 1];
    if (goForTwo) {
      const lineup = this.offenseLineup(team, "11");
      const ok = this.rng() < 0.47 + (this.ab(lineup.qb) - 80) * 0.004;
      if (ok) {
        team.score += 2;
        team.quarters[Math.min(this.q, 5) - 1] += 2;
        const scorer2 = this.rng() < 0.6 ? lineup.wrs[0] ?? lineup.qb : lineup.rbs[0] ?? lineup.qb;
        this.add(team, scorer2, "twoPt");
        last.text += " (two-point conversion good)";
      } else last.text += " (two-point try failed)";
    } else {
      this.add(team, kicker, "xpa");
      const acc = this.tr(kicker, "kickAccuracy");
      if (this.rng() < 0.968 + (acc - 80) * 0.002) {
        this.add(team, kicker, "xpm");
        team.score += 1;
        team.quarters[Math.min(this.q, 5) - 1] += 1;
        last.text += ` (${this.name(kicker)} kick)`;
      } else last.text += " (kick failed)";
    }
    last.away = this.t.away.score;
    last.home = this.t.home.score;
    this.tick(4);
    this.possessionEnded(team.side);
    if (this.over) return;
    this.kickoff(team.side);
  }

  safety(defense: Team): void {
    defense.score += 2;
    defense.quarters[Math.min(this.q, 5) - 1] += 2;
    this.scoring.push({ q: this.q, clock: Math.max(0, Math.round(this.clock)), team: defense.id, text: "Safety", away: this.t.away.score, home: this.t.home.score });
    if (this.ot.active) {
      this.over = true;
      return;
    }
    // Free kick from the 20.
    this.newPossession(defense.side, 40 + Math.round(gaussian(this.rng) * 6));
  }

  /** A touchdown on a drive that reached the red zone (or started the play inside it). */
  redZoneTouchdown(o: Team): void {
    if (this.driveReachedRz || this.ydl >= 80) {
      if (!this.driveReachedRz) o.box.redZoneAtt++;
      o.box.redZoneTd++;
    }
  }

  name(id: string | undefined): string {
    return id ? PLAYER_BY_ID[id].name : "Team";
  }

  tackle(d: Team, candidates: (string | undefined)[], yards: number, weights?: number[]): void {
    const list = candidates.filter(Boolean) as string[];
    if (!list.length) return;
    const pickOne = () => {
      if (!weights) return list[Math.floor(this.rng() * list.length)];
      const total = weights.reduce((s, w) => s + w, 0);
      let r = this.rng() * total;
      for (let i = 0; i < list.length; i++) {
        r -= weights[i] ?? 0;
        if (r <= 0) return list[i];
      }
      return list[list.length - 1];
    };
    const a = pickOne();
    if (this.rng() < 0.2 && list.length > 1) {
      let b = pickOne();
      if (b === a) b = list[(list.indexOf(a) + 1) % list.length];
      this.add(d, a, "tklAst");
      this.add(d, b, "tklAst");
    } else this.add(d, a, "tklSolo");
    if (yards < 0) this.add(d, a, "tfl");
  }

  // ---- A snap ----

  snap(): void {
    if (this.over) return;
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    const lead = o.score - d.score;
    const late = this.q >= 4;

    // End-of-half and end-of-game decisions.
    if (this.shouldKneel(o, d)) {
      this.kneel(o, d);
      return;
    }
    const fgDist = 100 - this.ydl + 17;
    const kicker = this.specialist(o, "K");
    const fgChance = this.fgMakeChance(kicker, fgDist);
    const lastPlay = this.clock <= 8 && (this.q === 2 || (this.q === 4 && lead >= -3 && lead <= 0) || (this.ot.active && lead >= -3 && lead <= 0));
    if (lastPlay && fgChance > 0.3) {
      this.fieldGoal();
      this.afterPlay(0, false);
      return;
    }
    if (this.ot.active && this.ot.suddenDeath && ((fgChance > 0.65 && this.down >= 3) || (fgChance > 0.9 && this.down >= 2))) {
      this.fieldGoal();
      this.afterPlay(0, false);
      return;
    }
    if (this.down === 4) {
      const choice = this.fourthDown(o, fgChance, lead);
      if (choice === "punt") {
        this.punt();
        this.afterPlay(0, false);
        return;
      }
      if (choice === "fg") {
        this.fieldGoal();
        this.afterPlay(0, false);
        return;
      }
    }

    const hurry = (late && lead < 0 && this.clock < 300) || (late && lead <= -9 && this.clock < 600) || (this.q === 2 && this.clock < 120)
      || (this.ot.active && this.game.type !== "POST" && lead <= 0 && this.clock < 360);
    const milk = late && lead > 0 && this.clock < 420;

    // Penalties before or instead of the play.
    if (this.penalty(o, d)) {
      this.afterPlay(hurry ? 12 : milk ? 38 : 30, true);
      return;
    }
    if (this.down === 3) o.box.thirdAtt++;
    if (this.down === 4) o.box.fourthAtt++;

    const passProb = this.passProbability(o, lead, hurry, milk);
    const isPass = this.rng() < passProb;
    const personnel = this.choosePersonnel(o, isPass, hurry);
    const lineup = this.offenseLineup(o, personnel);
    const pkg: Package = this.down >= 3 && this.dist >= 7 ? "dime" : personnel === "12" || personnel === "13" || personnel === "21" ? "base" : "nickel";
    const def = this.defenseLineup(d, pkg);
    const onField = [lineup.qb, ...lineup.rbs, ...lineup.wrs, ...lineup.tes, lineup.fb, ...lineup.ol];
    this.snaps(o, onField, "offSnaps");
    this.snaps(d, [...def.edge, ...def.idl, ...def.lb, ...def.cb, ...def.s], "defSnaps");
    o.box.plays++;

    const startDown = this.down;
    const before = this.ydl;
    const outcome = isPass ? this.passPlay(o, d, lineup, def, hurry) : this.runPlay(o, d, lineup, def);
    this.maybeInjure(o, d, outcome.involved, [...onField, ...def.edge, ...def.idl, ...def.lb, ...def.cb, ...def.s]);
    if (outcome.ended) {
      this.afterPlay(0, false);
      return;
    }
    this.advance(o, d, outcome.yards, startDown, before);
    const runoff = outcome.clockStops ? 0 : hurry ? 12 : milk ? 38 : 29 + o.off.tempo;
    this.tick(outcome.playTime);
    this.afterPlay(runoff, outcome.clockStops);
  }

  /** Moves the ball and handles downs, first downs, touchdowns and safeties after a normal play. */
  advance(o: Team, d: Team, yards: number, startDown: number, before: number): void {
    if (this.over) return;
    this.ydl = before + yards;
    if (this.ydl >= 80 && !this.driveReachedRz) {
      this.driveReachedRz = true;
      o.box.redZoneAtt++;
    }
    if (this.ydl >= 100) return; // the play itself scored
    if (this.ydl <= 0) {
      this.possessionEnded(o.side);
      this.safety(d);
      return;
    }
    if (yards >= this.dist) {
      o.box.firstDowns++;
      if (startDown === 3) o.box.thirdConv++;
      if (startDown === 4) o.box.fourthConv++;
      this.down = 1;
      this.dist = Math.min(10, 100 - this.ydl);
      return;
    }
    this.dist -= yards;
    this.down++;
    if (this.down > 4) {
      // Turnover on downs.
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 100 - this.ydl);
    }
  }

  afterPlay(runoff: number, stopped: boolean): void {
    if (this.over) return;
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    // Timeouts: a trailing defense stops the clock late; a hurrying offense saves time.
    if (!stopped && runoff > 0) {
      const lead = o.score - d.score;
      const lateHalf = (this.q === 2 && this.clock < 120) || (this.q >= 4 && this.clock < 180);
      if (lateHalf && lead > 0 && d.timeouts > 0 && this.q >= 4 && d.fx.gameManagement > 45) {
        d.timeouts--;
        runoff = 0;
      } else if (lateHalf && lead <= 0 && o.timeouts > 0 && this.clock < 60) {
        o.timeouts--;
        runoff = 0;
      }
    }
    this.tick(Math.min(runoff, Math.max(0, this.clock)));
    this.endOfPeriodCheck();
  }

  shouldKneel(o: Team, d: Team): boolean {
    const lead = o.score - d.score;
    if (lead <= 0) return false;
    if (this.q === 4 || (this.ot.active && this.game.type === "POST")) {
      const downsLeft = 5 - this.down;
      return this.clock <= downsLeft * 40 - d.timeouts * 38 && this.clock > 0;
    }
    return this.q === 2 && this.clock <= 30 && this.ydl < 60;
  }

  kneel(o: Team, d: Team): void {
    const lineup = this.offenseLineup(o, "11");
    this.snaps(o, [lineup.qb, ...lineup.rbs, ...lineup.wrs, ...lineup.tes, ...lineup.ol], "offSnaps");
    this.add(o, lineup.qb, "car");
    this.add(o, lineup.qb, "rushYds", -1);
    o.box.rushAtt++;
    o.box.rushYds -= 1;
    o.box.yards -= 1;
    o.box.plays++;
    this.ydl -= 1;
    this.down++;
    this.dist++;
    const timeoutStop = d.timeouts > 0 && this.q === 4 && (d.timeouts--, true);
    this.tick(timeoutStop ? 2 : 40);
    if (this.down > 4) {
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 100 - this.ydl);
    }
    this.endOfPeriodCheck();
  }

  fourthDown(o: Team, fgChance: number, lead: number): "go" | "punt" | "fg" {
    const late = this.q === 4;
    const gm = (o.fx.gameManagement - 70) / 30; // -1 conservative .. +1 aggressive and sharp
    const r = this.rng();
    if (late && lead < 0) {
      if (this.clock < 120 || (lead < -8 && this.clock < 360) || (lead < -3 && this.clock < 240)) {
        return lead >= -3 && fgChance > 0.5 && this.clock < 30 ? "fg" : "go";
      }
    }
    if (late && lead > 0 && this.clock < 120 && this.ydl > 50 && fgChance < 0.8 && this.dist > 2) return "punt";
    if (this.ot.active) {
      // Overtime: a field goal wins sudden death; otherwise nobody wants to settle for a tie.
      if (lead === 0 && this.ot.suddenDeath && fgChance > 0.45) return "fg";
      if (lead < 0 && lead >= -3 && fgChance > 0.45 && this.clock < 90) return "fg";
      if (lead <= 0 && this.ydl >= 40 && this.dist <= 4) return "go";
      if (lead <= 0 && this.clock < 240 && this.ydl >= 30) return "go";
    }
    const opp = this.ydl >= 60;
    if (this.dist <= 1) {
      const go = opp ? 0.78 + 0.15 * gm : this.ydl >= 45 ? 0.62 + 0.2 * gm : this.ydl >= 30 ? 0.25 + 0.15 * gm : 0.05;
      if (r < go) return "go";
    } else if (this.dist <= 2) {
      const go = opp ? 0.5 + 0.15 * gm : this.ydl >= 45 ? 0.35 + 0.15 * gm : 0.04;
      if (r < go) return "go";
    } else if (this.dist <= 4 && opp && fgChance < 0.75) {
      if (r < 0.28 + 0.12 * gm) return "go";
    }
    if (fgChance >= 0.45 && this.ydl >= 55) return "fg";
    if (this.ydl >= 62 && this.dist <= 5 && r < 0.4) return "go";
    if (this.ydl >= 65) return fgChance >= 0.3 ? "fg" : "go";
    return "punt";
  }

  passProbability(o: Team, lead: number, hurry: boolean, milk: boolean): number {
    let p = o.off.passRate + o.passLean;
    if (this.down === 1) p -= 0.06;
    if (this.down === 2 && this.dist >= 8) p += 0.08;
    if (this.down === 2 && this.dist <= 3) p -= 0.12;
    if (this.down >= 3) p = this.dist >= 5 ? 0.9 : this.dist >= 3 ? 0.68 : 0.42;
    if (this.ydl >= 98) p -= 0.15;
    if (hurry) p = Math.max(p, 0.8);
    if (milk) p -= 0.25;
    if (this.q >= 3 && lead >= 14) p -= 0.12;
    if (this.q >= 3 && lead <= -14) p += 0.12;
    return clamp(p, 0.12, 0.95);
  }

  choosePersonnel(o: Team, isPass: boolean, hurry: boolean): Personnel {
    if (hurry || (this.down >= 3 && this.dist >= 7)) return o.off.personnel["10"] && this.rng() < 0.3 ? "10" : "11";
    if (this.dist <= 1 && (this.down >= 3 || this.ydl >= 97)) return this.rng() < 0.6 ? "13" : "12";
    const mix = o.off.personnel;
    const entries = Object.entries(mix) as [Personnel, number][];
    let total = 0;
    for (const [k, w] of entries) total += w * (isPass ? (k === "11" || k === "10" ? 1.3 : 0.8) : k === "11" || k === "10" ? 0.75 : 1.3);
    let r = this.rng() * total;
    for (const [k, w] of entries) {
      r -= w * (isPass ? (k === "11" || k === "10" ? 1.3 : 0.8) : k === "11" || k === "10" ? 0.75 : 1.3);
      if (r <= 0) {
        if (k === "21" && !this.pool(o, "FB").length) return "12";
        return k;
      }
    }
    return "11";
  }

  // ---- Penalties ----

  penalty(o: Team, d: Team): boolean {
    const discipline = (t: Team) => 1.15 - (t.fx.leadership - 70) * 0.008;
    const r = this.rng();
    const offRate = 0.047 * discipline(o);
    const defRate = 0.04 * discipline(d);
    if (r >= offRate + defRate) return false;
    const offense = r < offRate;
    const kind = this.rng();
    const team = offense ? o : d;
    let yards: number;
    let autoFirst = false;
    let replay = true;
    if (offense) {
      if (kind < 0.33) yards = 5; // false start, delay, illegal formation
      else if (kind < 0.85) yards = 10; // holding
      else yards = 15; // personal foul, offensive pass interference, illegal block
      // Half the distance to the goal when inside it.
      yards = Math.min(yards, Math.floor(this.ydl / 2));
      this.ydl -= yards;
      this.dist += yards;
      if (kind >= 0.33) this.tick(6);
    } else {
      if (kind < 0.35) yards = 5; // offside, neutral zone, encroachment
      else if (kind < 0.55) {
        yards = 5; // defensive holding, illegal contact
        autoFirst = true;
      } else if (kind < 0.8) {
        yards = Math.round(8 + this.rng() * 28); // defensive pass interference: a spot foul
        autoFirst = true;
      } else {
        yards = 15; // roughing, unnecessary roughness, face mask
        autoFirst = true;
      }
      yards = Math.min(yards, Math.max(1, Math.floor((100 - this.ydl) / 2)));
      if (kind >= 0.55 && kind < 0.8) yards = Math.min(yards, 99 - this.ydl);
      this.ydl += yards;
      if (autoFirst || yards >= this.dist) {
        this.down = 1;
        this.dist = Math.min(10, 100 - this.ydl);
        o.box.firstDowns++;
        replay = false;
      } else this.dist -= yards;
      if (kind >= 0.35) this.tick(6);
    }
    void replay;
    team.box.penalties++;
    team.box.penYds += yards;
    return true;
  }

  // ---- Runs ----

  runPlay(o: Team, d: Team, lu: Lineup, def: DefLineup): PlayOutcome {
    let type = this.pickRun(o, lu);
    const carrier = type === "qbRun" ? lu.qb : lu.rbs[0] ?? lu.qb;
    if (carrier === lu.qb && type !== "qbRun") type = "qbRun";
    const tr = (id: string | undefined, t: string) => this.tr(id, t);
    // Blocking: each run concept asks something different of the line.
    const blockTrait = (id: string | undefined) =>
      type === "outsideZone" ? 0.5 * tr(id, "runBlock") + 0.3 * tr(id, "agility") + 0.2 * tr(id, "speed")
        : type === "gap" ? 0.5 * tr(id, "runBlock") + 0.5 * tr(id, "strength")
          : 0.7 * tr(id, "runBlock") + 0.3 * tr(id, "strength");
    let block = this.avg(lu.ol, blockTrait);
    const helpers = [...lu.tes.map((id) => tr(id, "blocking")), ...(lu.fb ? [tr(lu.fb, "blocking")] : [])];
    if (helpers.length) block = (block * 5 + helpers.reduce((a, b) => a + b, 0) * 0.6) / (5 + helpers.length * 0.6);
    const front = [...def.idl, ...def.edge, ...def.lb];
    const frontTrait = (id: string | undefined) =>
      type === "outsideZone" ? 0.6 * tr(id, "runStop") + 0.4 * tr(id, "speed") : 0.7 * tr(id, "runStop") + 0.3 * tr(id, "strength");
    let stop = this.avg(front, frontTrait);
    // Box count: light boxes against two-back and heavy sets give up yards.
    const boxSafety = this.rng() > d.def.twoHigh ? def.s[0] : undefined;
    if (boxSafety) stop = (stop * front.length + tr(boxSafety, "box")) / (front.length + 1) + 1.2;
    if (def.pkg === "nickel") stop -= 1.2 * (0.5 + d.def.lightBox);
    if (def.pkg === "dime") stop -= 3;
    const runner = type === "outsideZone" ? 0.5 * tr(carrier, "vision") + 0.3 * tr(carrier, "burst") + 0.2 * tr(carrier, "agility")
      : type === "gap" ? 0.5 * tr(carrier, "power") + 0.3 * tr(carrier, "vision") + 0.2 * tr(carrier, "strength")
        : type === "qbRun" ? 0.6 * tr(carrier, "mobility") + 0.4 * tr(carrier, "speed")
          : 0.5 * tr(carrier, "vision") + 0.3 * tr(carrier, "power") + 0.2 * tr(carrier, "burst");
    const motion = o.off.motion * 1.5 - (d.def.disguise * 0.5);
    const e = 0.55 * block + 0.45 * runner - stop + this.baseEdge(o, d) + motion;

    const shortYardage = this.dist <= 2 && this.down >= 3;
    const goalLine = this.ydl >= 97;
    const redZone = this.ydl >= 80 ? 0.07 : 0;
    let pStuff = clamp(0.155 - 0.006 * e + (shortYardage || goalLine ? 0.06 : 0) + redZone, 0.06, 0.4);
    if (type === "qbRun" && this.dist <= 1) pStuff *= 0.6; // the sneak
    const burst = type === "qbRun" ? tr(carrier, "speed") : tr(carrier, "burst");
    const pBig = clamp(0.108 + 0.004 * e + (burst - 82) * 0.0025, 0.03, 0.22);
    const r = this.rng();
    let yards: number;
    if (r < pStuff) {
      const k = this.rng();
      yards = k < 0.45 ? 0 : k < 0.7 ? -1 : k < 0.85 ? -2 : -3 - Math.floor(this.rng() * 3);
    } else if (r < pStuff + pBig) {
      yards = 10 + Math.round(-Math.log(Math.max(1e-6, this.rng())) * (7.5 + (tr(carrier, "speed") - 82) * 0.15));
    } else {
      const mode = 3.9 + e * 0.045;
      yards = Math.max(1, Math.min(9, Math.round(mode + (this.rng() + this.rng() + this.rng() - 1.5) * 3.2)));
    }
    const room = 100 - this.ydl;
    yards = Math.min(yards, room);
    const td = yards >= room;
    this.add(o, carrier, "car");
    this.add(o, carrier, "rushYds", yards);
    this.add(o, carrier, "rushLong", yards);
    o.box.rushAtt++;
    o.box.rushYds += yards;
    o.box.yards += yards;
    const outOfBounds = type === "outsideZone" || type === "qbRun" ? this.rng() < 0.14 : this.rng() < 0.05;
    const stops = this.clockStopsOnOutOfBounds(outOfBounds);
    if (td) {
      this.add(o, carrier, "rushTd");
      this.tick(6);
      this.redZoneTouchdown(o);
      this.touchdown(o, `${this.name(carrier)} ${yards}-yard run`, carrier);
      return { yards, ended: true, playTime: 0, clockStops: true, involved: [carrier, ...front.slice(0, 2)] };
    }
    // Fumbles.
    const fumbleP = 0.011 - (tr(carrier, "power") - 80) * 0.0001;
    if (this.rng() < fumbleP) {
      this.add(o, carrier, "fum");
      const forcer = front[Math.floor(this.rng() * front.length)];
      this.add(d, forcer, "ff");
      if (this.rng() < 0.55) {
        this.add(o, carrier, "fumLost");
        const recoverer = front[Math.floor(this.rng() * front.length)];
        this.add(d, recoverer, "fr");
        this.tackle(d, front, yards);
        this.tick(6);
        this.turnover(100 - (this.ydl + yards));
        return { yards, ended: true, playTime: 0, clockStops: true, involved: [carrier, forcer] };
      }
    }
    const tacklers = [...def.lb, ...def.idl, ...def.edge, ...def.s, ...def.cb];
    const long = yards >= 10;
    const weights = tacklers.map((id) => {
      const pos = PLAYER_BY_ID[id].position;
      if (long) return pos === "S" ? 1.5 : pos === "CB" ? 1.2 : pos === "LB" ? 1.3 : 0.3;
      return pos === "LB" ? 1.9 : pos === "IDL" ? 1.2 : pos === "EDGE" ? 1.2 : pos === "S" ? 1.0 : 0.8;
    });
    this.tackle(d, tacklers, yards, weights);
    return { yards, ended: false, playTime: 5, clockStops: stops, involved: [carrier, tacklers[0]] };
  }

  pickRun(o: Team, lu: Lineup): RunType {
    const mob = this.tr(lu.qb, "mobility");
    const mix = { ...o.off.runMix };
    mix.qbRun *= clamp(1 + (mob - 80) * 0.08, 0.2, 3);
    if (this.dist <= 1 && this.down >= 3) mix.qbRun += 0.15; // sneaks
    const total = mix.outsideZone + mix.insideZone + mix.gap + mix.qbRun;
    let r = this.rng() * total;
    for (const k of ["outsideZone", "insideZone", "gap", "qbRun"] as RunType[]) {
      r -= mix[k];
      if (r <= 0) return k;
    }
    return "insideZone";
  }

  clockStopsOnOutOfBounds(oob: boolean): boolean {
    if (!oob) return false;
    return (this.q === 2 && this.clock < 120) || (this.q >= 4 && this.clock < 300);
  }

  // ---- Passes ----

  passPlay(o: Team, d: Team, lu: Lineup, def: DefLineup, hurry: boolean): PlayOutcome {
    const tr = (id: string | undefined, t: string) => this.tr(id, t);
    const qb = lu.qb;
    const depth = this.pickDepth(o);
    const playAction = depth !== "screen" && this.down <= 2 && !hurry && this.rng() < o.off.playAction * 1.6;
    const blitz = this.rng() < d.def.blitz * (this.down === 3 ? 1.35 : 1);
    const man = this.rng() < d.def.man * (blitz ? 1.3 : 1);
    const twoHigh = !blitz && this.rng() < d.def.twoHigh;
    const base = this.baseEdge(o, d);

    // Protection against the rush.
    const protect = this.avg(lu.ol, (id) => 0.75 * tr(id, "passBlock") + 0.25 * tr(id, "agility"));
    const rushers = [...def.edge, ...def.idl];
    const blitzers = blitz ? [...def.lb.slice(0, 1), ...(this.rng() < 0.3 ? def.s.slice(1, 2) : [])] : [];
    const rushValue = this.avg(rushers, (id) => tr(id, "passRush")) + blitzers.length * 1.5 + (blitzers.length ? this.avg(blitzers, (id) => tr(id, "blitz") - 80) * 0.1 : 0);
    const holdTime = depth === "deep" ? 0.07 : depth === "inter" ? 0.02 : depth === "short" ? -0.07 : -0.25;
    const pocket = (tr(qb, "decisions") - 80) * 0.003 + (tr(qb, "mobility") - 80) * 0.001;
    const pPressure = clamp(0.29 + (rushValue - protect) * 0.011 + (blitz ? 0.09 : 0) + holdTime - pocket - (playAction ? 0.0 : 0) - base * 0.004, 0.04, 0.65);
    const pressured = this.rng() < pPressure;

    if (pressured && depth !== "screen") {
      const pSack = clamp(0.23 - (tr(qb, "mobility") - 80) * 0.004 - (tr(qb, "decisions") - 80) * 0.002 + (depth === "deep" ? 0.06 : 0), 0.07, 0.42);
      const r = this.rng();
      if (r < pSack) return this.sack(o, d, qb, [...rushers, ...blitzers]);
      const pScramble = clamp(0.1 + (tr(qb, "mobility") - 80) * 0.007, 0.02, 0.32);
      if (r < pSack + pScramble) return this.scramble(o, d, qb, def);
      const hitter = [...rushers, ...blitzers][Math.floor(this.rng() * (rushers.length + blitzers.length))];
      if (this.rng() < 0.4) this.add(d, hitter, "qbHits");
      if (this.rng() < 0.14) {
        // Throwaway.
        this.add(o, qb, "att");
        o.box.passAtt++;
        return { yards: 0, ended: false, playTime: 6, clockStops: true, involved: [qb] };
      }
    }

    // Who gets the ball.
    const target = this.pickTarget(o, d, lu, depth);
    const pos = PLAYER_BY_ID[target].position;
    const cover = this.coverFor(def, lu, target, man);
    const recv = depth === "deep" ? 0.45 * tr(target, "deep") + 0.35 * tr(target, "speed") + 0.2 * tr(target, "routes")
      : depth === "screen" ? 0.5 * tr(target, "yac") + 0.5 * tr(target, "agility")
        : depth === "inter" ? 0.6 * tr(target, pos === "WR" ? "routes" : "receiving") + 0.2 * tr(target, "hands") + 0.2 * tr(target, "agility")
          : 0.6 * tr(target, pos === "WR" ? "routes" : "receiving") + 0.4 * tr(target, "agility");
    const cpos = cover ? PLAYER_BY_ID[cover].position : "LB";
    const coverSkill = !cover ? 40
      : cpos === "CB" ? (man ? 0.6 * tr(cover, "man") + 0.25 * tr(cover, "press") + 0.15 * tr(cover, "speed") : 0.7 * tr(cover, "zone") + 0.3 * tr(cover, "speed"))
        : cpos === "S" ? 0.6 * tr(cover, "coverage") + 0.4 * tr(cover, "range")
          : 0.7 * tr(cover, "coverage") + 0.3 * tr(cover, "speed");
    let sep = recv - coverSkill;
    if (man) sep += o.off.motion * 2.2;
    if (playAction) sep += 2.5 + (o.passLean < 0 ? 1.5 : 0);
    if (depth === "deep") sep += twoHigh ? -4 : 2;
    if (depth === "short" && twoHigh) sep += 1.5;
    sep += base;
    const accuracy = depth === "deep" ? 0.5 * tr(qb, "accuracy") + 0.5 * tr(qb, "arm") : tr(qb, "accuracy");
    const baseComp = { screen: 0.88, short: 0.79, inter: 0.61, deep: 0.39 }[depth];
    const compressed = this.ydl >= 80 ? 0.11 : 0;
    let pComp = baseComp - compressed + sep * 0.008 + (accuracy - 80) * 0.006 + (tr(target, "hands") - 80) * 0.0025 - (pressured ? 0.19 : 0);
    pComp = clamp(pComp, 0.1, 0.93);
    const decisions = tr(qb, "decisions") - d.def.disguise * 5;
    const baseInt = { screen: 0.004, short: 0.012, inter: 0.024, deep: 0.039 }[depth];
    const ballSkill = cover ? (cpos === "CB" ? tr(cover, "zone") : cpos === "S" ? tr(cover, "range") : tr(cover, "coverage")) : 60;
    const pInt = clamp(baseInt * clamp(1 - (decisions - 80) * 0.035, 0.45, 2.2) * (pressured ? 1.6 : 1) * (1 + (ballSkill - 80) * 0.02) * (1 - sep * 0.015), 0.002, 0.12);

    this.add(o, qb, "att");
    this.add(o, target, "tgt");
    o.box.passAtt++;
    const r = this.rng();
    if (r < pInt) {
      const backs = [...def.cb, ...def.s, ...def.lb];
      const picker = this.rng() < 0.55 && cover ? cover : backs[Math.floor(this.rng() * backs.length)] ?? cover;
      this.add(o, qb, "int");
      this.add(d, picker, "defInt");
      this.add(d, picker, "pd");
      const spot = this.ydl + ({ screen: 0, short: 6, inter: 14, deep: 28 }[depth]);
      let ret = Math.round(-Math.log(Math.max(1e-6, this.rng())) * 11);
      const theirYdl = 100 - Math.min(99, spot);
      if (theirYdl + ret >= 100 || this.rng() < 0.03) {
        ret = 100 - theirYdl;
        this.add(d, picker, "intYds", ret);
        this.add(d, picker, "defTd");
        this.tick(8);
        o.box.turnovers++;
        this.possessionEnded(o.side);
        if (!this.over) {
          this.newPossession(d.side, 99);
          this.touchdown(d, `${this.name(picker)} ${ret}-yard interception return`, picker);
        }
        return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [picker, target] };
      }
      this.add(d, picker, "intYds", ret);
      this.tick(8);
      this.turnover(Math.min(99, theirYdl + ret));
      return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [picker, target] };
    }
    if (r < pInt + (1 - pComp)) {
      if (cover && this.rng() < 0.28 + (coverSkill - recv) * 0.01) this.add(d, cover, "pd");
      return { yards: 0, ended: false, playTime: 6, clockStops: true, involved: [target, cover] };
    }

    // Completion.
    const air = depth === "screen" ? -3 + Math.floor(this.rng() * 5)
      : depth === "short" ? 1 + Math.floor(this.rng() * 7)
        : depth === "inter" ? 9 + Math.floor(this.rng() * 8)
          : 20 + Math.round(-Math.log(Math.max(1e-6, this.rng())) * 7);
    const yacSkill = 0.6 * tr(target, "yac") + 0.4 * tr(target, "speed");
    const tackleSpeed = cover ? tr(cover, "speed") : 70;
    const yacMean = { screen: 5.0, short: 3.0, inter: 2.3, deep: 3.0 }[depth] + (yacSkill - 80) * 0.07 + (o.off === OFFENSE.wideZone ? 0.5 : 0);
    let yac = Math.max(0, Math.round(-Math.log(Math.max(1e-6, this.rng())) * Math.max(1.5, yacMean)));
    if (this.rng() < 0.02 + (yacSkill - tackleSpeed) * 0.0015) yac += 10 + Math.round(this.rng() * 35);
    const room = 100 - this.ydl;
    const yards = Math.min(room, air + yac);
    this.add(o, qb, "cmp");
    this.add(o, qb, "passYds", yards);
    this.add(o, qb, "passLong", yards);
    this.add(o, target, "rec");
    this.add(o, target, "recYds", yards);
    this.add(o, target, "recLong", yards);
    o.box.cmp++;
    o.box.passYds += yards;
    o.box.yards += yards;
    if (yards >= room) {
      this.add(o, qb, "passTd");
      this.add(o, target, "recTd");
      this.tick(7);
      this.redZoneTouchdown(o);
      this.touchdown(o, `${this.name(qb)} ${yards}-yard pass to ${this.name(target)}`, target);
      return { yards, ended: true, playTime: 0, clockStops: true, involved: [target, cover] };
    }
    if (this.rng() < 0.006) {
      this.add(o, target, "fum");
      if (cover) this.add(d, cover, "ff");
      if (this.rng() < 0.6) {
        this.add(o, target, "fumLost");
        if (cover) this.add(d, cover, "fr");
        this.tackle(d, [cover], 0);
        this.tick(7);
        this.turnover(100 - (this.ydl + yards));
        return { yards, ended: true, playTime: 0, clockStops: true, involved: [target, cover] };
      }
    }
    const tacklers = [cover, ...def.lb, ...def.s, ...def.cb.filter((id) => id !== cover)].filter(Boolean) as string[];
    this.tackle(d, tacklers, yards < 0 ? yards : 1, tacklers.map((id, i) => (i === 0 ? 2.5 : PLAYER_BY_ID[id].position === "CB" ? 0.5 : 1)));
    const oob = this.rng() < (hurry ? 0.4 : 0.18);
    return { yards, ended: false, playTime: 7, clockStops: this.clockStopsOnOutOfBounds(oob), involved: [target, cover] };
  }

  pickDepth(o: Team): Depth {
    let { screen, short, deep } = o.off;
    if (this.down >= 3 && this.dist >= 8) {
      screen *= 0.6;
      short *= 0.6;
      deep *= 1.3;
    }
    if (this.down >= 3 && this.dist <= 4) {
      short *= 1.4;
      deep *= 0.6;
    }
    const room = 100 - this.ydl;
    if (room < 20) deep = 0;
    const inter = Math.max(0.05, 1 - o.off.screen - o.off.short - o.off.deep);
    const total = screen + short + inter + deep;
    const r = this.rng() * total;
    if (r < screen) return "screen";
    if (r < screen + short) return "short";
    if (r < screen + short + inter) return "inter";
    return "deep";
  }

  pickTarget(o: Team, d: Team, lu: Lineup, depth: Depth): string {
    const cands: string[] = [];
    const weights: number[] = [];
    const push = (id: string | undefined, w: number) => {
      if (!id || w <= 0) return;
      cands.push(id);
      weights.push(w);
    };
    const q = (id: string, keys: string[]) => Math.max(0.3, 1 + (keys.reduce((s, k) => s + this.tr(id, k), 0) / keys.length - 80) * 0.03);
    lu.wrs.forEach((id, i) => {
      const role = [1, 0.82, 0.62, 0.45][i] ?? 0.4;
      const fit = depth === "deep" ? q(id, ["deep", "speed"]) : depth === "screen" ? q(id, ["yac"]) * 0.7 : q(id, ["routes", "hands"]);
      push(id, role * fit);
    });
    lu.tes.forEach((id, i) => push(id, (i === 0 ? 0.62 : 0.25) * o.off.teTargets * q(id, ["receiving"]) * (depth === "deep" ? 0.5 : 1)));
    lu.rbs.forEach((id) => push(id, 0.38 * o.off.rbTargets * q(id, ["receiving"]) * (depth === "screen" ? 2.2 : depth === "short" ? 1.1 : depth === "deep" ? 0.1 : 0.4)));
    if (lu.fb) push(lu.fb, 0.06);
    // Game plans built to take away the top option.
    const top = weights.indexOf(Math.max(...weights));
    if (top >= 0) weights[top] *= 1 - 0.18 * d.def.gamePlan;
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i];
    }
    return cands[0] ?? lu.qb;
  }

  coverFor(def: DefLineup, lu: Lineup, target: string, man: boolean): string | undefined {
    const pos = PLAYER_BY_ID[target].position;
    const wrIndex = lu.wrs.indexOf(target);
    if (wrIndex >= 0) {
      if (man || this.rng() < 0.65) return def.cb[wrIndex] ?? def.s[0] ?? def.cb[0];
      return def.s[Math.floor(this.rng() * def.s.length)] ?? def.cb[0];
    }
    if (pos === "TE") return this.rng() < 0.5 ? def.s[0] ?? def.lb[0] : def.lb[0] ?? def.s[0];
    return def.lb[Math.floor(this.rng() * def.lb.length)] ?? def.s[1] ?? def.s[0];
  }

  sack(o: Team, d: Team, qb: string, rushers: string[]): PlayOutcome {
    const weights = rushers.map((id) => Math.max(0.3, 1 + (this.tr(id, "passRush") - 80) * 0.03) * (PLAYER_BY_ID[id].position === "EDGE" ? 1.25 : 1));
    const pick = () => {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.rng() * total;
      for (let i = 0; i < rushers.length; i++) {
        r -= weights[i];
        if (r <= 0) return rushers[i];
      }
      return rushers[0];
    };
    const a = pick();
    const loss = Math.min(this.ydl, 4 + Math.round(this.rng() * 6));
    if (this.rng() < 0.12) {
      let b = pick();
      if (b === a) b = rushers[(rushers.indexOf(a) + 1) % rushers.length];
      this.add(d, a, "sacks", 0.5);
      this.add(d, b, "sacks", 0.5);
      this.add(d, a, "tklAst");
      this.add(d, b, "tklAst");
    } else {
      this.add(d, a, "sacks");
      this.add(d, a, "tklSolo");
    }
    this.add(d, a, "tfl");
    this.add(d, a, "qbHits");
    this.add(o, qb, "sacked");
    this.add(o, qb, "sackYds", loss);
    o.box.sacked++;
    o.box.sackYds += loss;
    o.box.yards -= loss;
    // Strip sacks.
    if (this.rng() < 0.12) {
      this.add(o, qb, "fum");
      this.add(d, a, "ff");
      if (this.rng() < 0.55) {
        this.add(o, qb, "fumLost");
        this.add(d, rushers[Math.floor(this.rng() * rushers.length)], "fr");
        this.tick(6);
        if (this.ydl - loss <= 0) {
          this.possessionEnded(o.side);
          if (!this.over) {
            this.newPossession(d.side, 99);
            this.touchdown(d, `${this.name(a)} fumble recovery in the end zone`, a);
          }
          o.box.turnovers++;
          return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [qb, a] };
        }
        this.turnover(100 - (this.ydl - loss));
        return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [qb, a] };
      }
    }
    return { yards: -loss, ended: false, playTime: 6, clockStops: false, involved: [qb, a] };
  }

  scramble(o: Team, d: Team, qb: string, def: DefLineup): PlayOutcome {
    const mob = this.tr(qb, "mobility");
    let yards = Math.max(-1, Math.round(4 + gaussian(this.rng) * 3 + (mob - 80) * 0.12));
    if (this.rng() < 0.08 + (mob - 80) * 0.004) yards += 10 + Math.round(this.rng() * 25);
    const room = 100 - this.ydl;
    yards = Math.min(yards, room);
    this.add(o, qb, "car");
    this.add(o, qb, "rushYds", yards);
    this.add(o, qb, "rushLong", yards);
    o.box.rushAtt++;
    o.box.rushYds += yards;
    o.box.yards += yards;
    if (yards >= room) {
      this.add(o, qb, "rushTd");
      this.tick(7);
      this.redZoneTouchdown(o);
      this.touchdown(o, `${this.name(qb)} ${yards}-yard run`, qb);
      return { yards, ended: true, playTime: 0, clockStops: true, involved: [qb] };
    }
    // Most scrambles end with a slide or out of bounds.
    if (this.rng() < 0.45) this.tackle(d, [...def.lb, ...def.s, ...def.edge], yards);
    return { yards, ended: false, playTime: 6, clockStops: this.clockStopsOnOutOfBounds(this.rng() < 0.4), involved: [qb] };
  }

  // ---- Injuries ----

  maybeInjure(o: Team, d: Team, involved: (string | undefined)[], onField: (string | undefined)[]): void {
    if (this.rng() > 0.024) return;
    const pool = this.rng() < 0.6 ? involved.filter(Boolean) as string[] : onField.filter(Boolean) as string[];
    if (!pool.length) return;
    const id = pool[Math.floor(this.rng() * pool.length)];
    const team = this.isOn(o, id) ? o : d;
    if (this.rng() > Math.min(1, 0.75 * injuryRisk(this.state, id, team.id))) return;
    const { injury, days } = injure(this.state, id, team.id, this.rng);
    this.injuries.push({ player: id, team: team.id, type: injury.type });
    if (days <= 3 && this.rng() < 0.55) return; // shook it off and returned
    team.out.add(id);
  }

  isOn(team: Team, id: string): boolean {
    return Object.values(team.chart).some((list) => list.includes(id));
  }
}

interface PlayOutcome {
  yards: number;
  /** The play already handled the change of possession or score. */
  ended: boolean;
  playTime: number;
  clockStops: boolean;
  involved: (string | undefined)[];
}

/**
 * The 48 who dress on game day. Healthy scratches come from the deepest
 * spots on the depth chart, keeping enough at each position to play.
 */
export function gameDayActives(chart: Record<Position, string[]>): { chart: Record<Position, string[]>; inactive: string[] } {
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
  return { chart: out, inactive };
}

/** For tests and tuning: adds up box score lines. */
export function sumLines(lines: number[][]): StatLine {
  const t: StatLine = {};
  for (const l of lines) addLine(t, l);
  return t;
}
