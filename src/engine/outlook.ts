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
