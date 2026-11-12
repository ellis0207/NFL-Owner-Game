// What the analysts tell the owner about the season and the years ahead.
//
// Attribution splits a record into what the points say (a team that outscores
// opponents by a lot should win most games), close-game luck, turnovers,
// schedule strength and injuries to starters, so a 10-7 season that "should"
// have been 8-9 reads that way. The outlook lists the starters who are getting
// old for their position or whose contracts are running out, so needs show
// up a year before they become holes. Everything here comes from public
// facts: results, box scores, ages and contracts.
import { contractYearsLeft } from "./cap";
import { ageOn } from "./dates";
import { GAME_BY_ID, PLAYER_BY_ID, RULES, SCHEDULE } from "./league";
import { depthChart } from "./roster";
import { standings, winPct } from "./standings";
import type { GameState, Position } from "./types";
import { FORMAT } from "./format";
import { perceivedAbility, staffEffects } from "./staff";

/** The age by which a position usually starts to slip. */
const PEAK_END: Partial<Record<Position, number>> = { QB: 35, RB: 28, WR: 30, TE: 30, OT: 32, OG: 32, C: 32, EDGE: 30, IDL: 31, LB: 30, CB: 29, S: 30, K: 38, P: 38 };
const STARTERS: [Position, number][] = [["QB", 1], ["RB", 1], ["WR", 3], ["TE", 1], ["OT", 2], ["OG", 2], ["C", 1], ["EDGE", 2], ["IDL", 2], ["LB", 2], ["CB", 3], ["S", 2], ["K", 1], ["P", 1]];

export interface Attribution {
  games: number;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  /** Wins the point margin predicts. */
  expected: number;
  closeW: number;
  closeL: number;
  turnoverMargin: number;
  /** Opponents' combined win share. */
  schedule: number;
  /** Starter-games missed by players on the opening depth chart. */
  missed: number;
  lines: string[];
}

export function attribution(state: GameState, team: string): Attribution | null {
  const table = standings(state);
  const rec = table[team];
  const games = rec.w + rec.l + rec.t;
  if (!games) return null;
  // The Pythagorean expectation, with the exponent that fits pro football.
  const e = 2.37;
  const expected = games * (rec.pf ** e / (rec.pf ** e + rec.pa ** e || 1));
  let closeW = 0, closeL = 0, tm = 0, opp = 0, oppN = 0, missed = 0;
  const firstChart = new Set<string>();
  const firstGame = SCHEDULE.find((g) => g.type === "REG" && (g.away === team || g.home === team));
  if (firstGame) {
    const c = depthChart(state, team, firstGame.date);
    for (const [pos, n] of STARTERS) for (const id of c[pos].slice(0, n)) firstChart.add(id);
  }
  for (const [id, r] of Object.entries(state.results)) {
    const g = GAME_BY_ID[id];
    if (!g || g.type !== "REG" || (r.away !== team && r.home !== team)) continue;
    const us = r.away === team ? "away" : "home";
    const them = us === "away" ? "home" : "away";
    const margin = (us === "away" ? r.awayScore - r.homeScore : r.homeScore - r.awayScore);
    if (Math.abs(margin) <= 8 && margin !== 0) margin > 0 ? closeW++ : closeL++;
    const box = state.box[id];
    if (box) {
      tm += box.team[them].turnovers - box.team[us].turnovers;
      missed += box.inactives[us].filter((p) => firstChart.has(p)).length;
    }
    const o = table[r[them]];
    opp += winPct(o.w, o.l, o.t);
    oppN++;
  }
  const schedule = oppN ? opp / oppN : 0.5;
  const wins = rec.w + rec.t / 2;
  const lines: string[] = [];
  const luck = wins - expected;
  lines.push(Math.abs(luck) < 0.8 ? `The record matches the scoreboard: about ${expected.toFixed(1)} wins' worth of point margin.`
    : luck > 0 ? `${luck.toFixed(1)} more wins than the point margin predicts. Some of that is luck that tends not to last.`
      : `${(-luck).toFixed(1)} fewer wins than the point margin predicts: a better team than the record.`);
  if (closeW + closeL >= 3) lines.push(`${closeW}-${closeL} in one-score games, which mostly come down to a few plays.`);
  if (Math.abs(tm) >= 5) lines.push(`Turnover margin of ${tm > 0 ? "+" : ""}${tm}: ${tm > 0 ? "helpful, and hard to repeat" : "costly, and likely to even out"}.`);
  lines.push(schedule >= 0.53 ? "A hard schedule so far." : schedule <= 0.47 ? "A soft schedule so far." : "An average schedule so far.");
  if (missed >= 12) lines.push(`Injuries and absences: opening-day starters missed ${missed} games between them.`);
  return { games, w: rec.w, l: rec.l, t: rec.t, pf: rec.pf, pa: rec.pa, expected, closeW, closeL, turnoverMargin: tm, schedule, missed, lines };
}

export interface OutlookRow {
  id: string;
  pos: Position;
  age: number | null;
  yearsLeft: number;
  flags: string[];
}

/** Starters who are aging past their position's peak or whose deals run out within two seasons. */
export function teamOutlook(state: GameState, team: string): OutlookRow[] {
  const c = depthChart(state, team);
  const out: OutlookRow[] = [];
  for (const [pos, n] of STARTERS) {
    for (const id of c[pos].slice(0, n)) {
      const p = PLAYER_BY_ID[id];
      const age = ageOn(p.birthDate, state.date);
      const yearsLeft = contractYearsLeft(id, RULES.season, state);
      const flags: string[] = [];
      const peak = PEAK_END[pos] ?? 30;
      if (age !== null && age >= peak) flags.push(age >= peak + 2 ? "Well past the usual decline age" : "At the age the position starts to slip");
      // Years left counts this season: 1 means the deal ends after it.
      if (yearsLeft <= 2) flags.push(yearsLeft <= 1 ? "Contract ends after this season" : "Contract ends after next season");
      if (flags.length) out.push({ id, pos, age, yearsLeft, flags });
    }
  }
  return out;
}

// ---- The coaches' case for a player ----

const CASE_WEIGHT: Partial<Record<Position, number>> = { QB: 3, EDGE: 1.3, OT: 1.1, WR: 1, CB: 1, IDL: 1, S: 0.8, LB: 0.8, TE: 0.8, OG: 0.8, C: 0.8, RB: 0.6, K: 0.3, P: 0.2 };

/**
 * What the coaching staff says a player would add: wins a season, the
 * change in playoff chances, and for linemen the sacks it should save. It is
 * their estimate from their own read of him against the starter he'd replace.
 */
/**
 * How much better than our weakest starter at his position one evaluator
 * thinks a player is, and the wins a season that's worth. The coaches judge
 * by default; the GM and the pro scouts read the same player their own way,
 * which is how the staff come to disagree (engine numbers, shown as wins).
 */
export function winsAdded(state: GameState, team: string, id: string, who: "coach" | "gm" | "pro" = "coach"): { wins: number; delta: number } {
  const p = PLAYER_BY_ID[id];
  const n = STARTERS.find(([pos]) => pos === p.position)?.[1] ?? 1;
  const fx = staffEffects(team);
  const eye = who === "coach" ? fx.coachEval : who === "gm" ? fx.gmEval : fx.proScouting;
  const read = (x: string) => perceivedAbility(state, x, `${who}:${team}`, eye);
  const starters = (depthChart(state, team)[p.position] ?? []).filter((x) => x !== id).slice(0, n);
  const weakest = starters.length < n ? 50 : Math.min(...starters.map(read));
  const delta = Math.max(0, read(id) - weakest);
  return { wins: Math.round(FORMAT.games * 0.03 * (CASE_WEIGHT[p.position] ?? 0.5) * delta / 10 * 10) / 10, delta };
}

export function coachCase(state: GameState, team: string, id: string): { wins: number; before: number; after: number; sacks: number; text: string } {
  const p = PLAYER_BY_ID[id];
  const { wins, delta } = winsAdded(state, team, id);
  const games = FORMAT.games;
  const rec = standings(state)[team];
  const played = rec ? rec.w + rec.l + rec.t : 0;
  const base = (played ? winPct(rec.w, rec.l, rec.t) : 0.5) * games;
  const odds = (w: number) => 1 / (1 + Math.exp(-(w - games * 0.56) / 1.4));
  const before = Math.round(odds(base) * 100);
  const after = Math.round(odds(base + wins) * 100);
  const sacks = ["OT", "OG", "C"].includes(p.position) ? Math.round(delta * 0.25) : 0;
  const text = delta < 2
    ? `The coaches don't see ${p.name} beating out our starters.`
    : `The coaches figure ${p.name} adds about ${wins.toFixed(1)} win${wins === 1 ? "" : "s"} a season (playoff chances ${before}% to ${after}%)${sacks ? ` and about ${sacks} fewer sacks allowed` : ""}.`;
  return { wins, before, after, sacks, text };
}
