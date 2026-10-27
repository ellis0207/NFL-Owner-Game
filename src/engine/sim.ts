// Whole-game simulation. A first version: each team gets about eleven
// possessions, and how each one ends (touchdown, field goal, nothing) depends
// on the offense against the opposing defense, plus home field and luck.
// Step 3 adds staff, injuries and game-planning on top of this.
import { HIDDEN_RATINGS } from "./league";
import { depthChart } from "./roster";
import { gaussian, rngFor, type Rng } from "./rng";
import type { GameResult, GameState, Position, ScheduledGame } from "./types";

type Unit = [Position, number, number][]; // position, starters counted, weight

const OFFENSE: Unit = [
  ["QB", 1, 0.34], ["OT", 2, 0.12], ["OG", 2, 0.08], ["C", 1, 0.04],
  ["WR", 3, 0.2], ["TE", 1, 0.08], ["RB", 1, 0.08], ["FB", 0, 0], ["LS", 0, 0],
];
const DEFENSE: Unit = [
  ["EDGE", 2, 0.24], ["IDL", 2, 0.16], ["LB", 2, 0.16], ["CB", 3, 0.26], ["S", 2, 0.18],
];

export interface TeamStrength {
  offense: number;
  defense: number;
  kicker: number;
}

function unitRating(chart: Record<Position, string[]>, unit: Unit, depthOffset: number): number {
  let total = 0;
  let weight = 0;
  for (const [pos, count, w] of unit) {
    if (!count) continue;
    const players = chart[pos].slice(depthOffset, depthOffset + count);
    const ratings = players.map((id) => HIDDEN_RATINGS[id].overall);
    while (ratings.length < count) ratings.push(40); // an empty spot is filled by a street free agent
    total += w * (ratings.reduce((a, b) => a + b, 0) / count);
    weight += w;
  }
  return total / weight;
}

/** Preseason games are mostly played by backups, so strength blends in depth. */
export function teamStrength(state: GameState, team: string, preseason = false): TeamStrength {
  const chart = depthChart(state, team);
  const starters = { offense: unitRating(chart, OFFENSE, 0), defense: unitRating(chart, DEFENSE, 0) };
  const kicker = chart.K[0] ? HIDDEN_RATINGS[chart.K[0]].overall : 50;
  if (!preseason) return { ...starters, kicker };
  const backups = { offense: unitRating(chart, OFFENSE, 1), defense: unitRating(chart, DEFENSE, 2) };
  return {
    offense: 0.3 * starters.offense + 0.7 * backups.offense,
    defense: 0.3 * starters.defense + 0.7 * backups.defense,
    kicker,
  };
}

const SCRIPT = 0.55; // rating points of edge lost per point of lead
const HOME_EDGE = 1.6; // rating points, roughly 1.5-2 points on the scoreboard

function possession(rng: Rng, edge: number, kicker: number): number {
  // edge: offense minus opposing defense, in rating points
  const td = clamp(0.225 + 0.0105 * edge, 0.06, 0.45);
  const fgTry = clamp(0.17 + 0.002 * edge, 0.1, 0.24);
  const roll = rng();
  if (roll < td) return rng() < 0.94 ? 7 : rng() < 0.5 ? 8 : 6;
  if (roll < td + fgTry) return rng() < clamp(0.78 + 0.004 * (kicker - 70), 0.6, 0.95) ? 3 : 0;
  return roll > 0.995 ? 2 : 0; // a rare safety for the defense, credited to this side for simplicity
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function simulateGame(state: GameState, game: ScheduledGame, away: string, home: string): GameResult {
  const rng = rngFor(state.seed, game.id);
  const pre = game.type === "PRE";
  const a = teamStrength(state, away, pre);
  const h = teamStrength(state, home, pre);
  const homeEdge = game.neutral ? 0 : HOME_EDGE;
  // Each side's form on the day: the main source of upsets.
  const awayForm = gaussian(rng) * 3.8;
  const homeForm = gaussian(rng) * 3.8;
  const drives = 10 + Math.floor(rng() * 3);

  let awayScore = 0;
  let homeScore = 0;
  for (let i = 0; i < drives; i++) {
    // Game script: the team ahead plays it safe and the team behind takes chances.
    const awayLead = awayScore - homeScore;
    awayScore += possession(rng, a.offense + awayForm - (h.defense + homeForm) - homeEdge / 2 - SCRIPT * awayLead, a.kicker);
    homeScore += possession(rng, h.offense + homeForm - (a.defense + awayForm) + homeEdge / 2 + SCRIPT * (awayScore - homeScore), h.kicker);
  }

  let overtime = false;
  if (awayScore === homeScore && !pre) {  // preseason games have no overtime
    overtime = true;
    // Most overtimes end with a score; a regular-season game can end tied.
    if (game.type === "POST" || rng() < 0.9) {
      const homeShare = 0.5 + 0.01 * (h.offense - a.offense + homeEdge);
      const points = rng() < 0.45 ? 6 : 3;
      if (rng() < homeShare) homeScore += points;
      else awayScore += points;
    }
  }
  return { away, home, awayScore, homeScore, overtime };
}
