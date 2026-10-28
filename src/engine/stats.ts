// Player game stats: the packed form stored in box scores, and season totals.
import { GAME_BY_ID } from "./league";
import type { BoxScore, GameState, GameType } from "./types";

/** Every stat a player can record in a game. Box scores store values in this order. */
export const STAT_KEYS = [
  "offSnaps", "defSnaps", "stSnaps",
  "cmp", "att", "passYds", "passTd", "int", "sacked", "sackYds", "passLong",
  "car", "rushYds", "rushTd", "rushLong", "fum", "fumLost",
  "tgt", "rec", "recYds", "recTd", "recLong",
  "tklSolo", "tklAst", "tfl", "sacks", "qbHits", "defInt", "intYds", "pd", "ff", "fr", "defTd",
  "fgm", "fga", "fgLong", "fgm40", "fga40", "fgm50", "fga50", "xpm", "xpa",
  "punts", "puntYds", "puntIn20", "puntTb", "puntLong",
  "kr", "krYds", "krTd", "pr", "prYds", "prTd", "twoPt",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatLine = Partial<Record<StatKey | "g", number>>;

const INDEX = Object.fromEntries(STAT_KEYS.map((k, i) => [k, i])) as Record<StatKey, number>;
const LONGS = new Set<StatKey>(["passLong", "rushLong", "recLong", "fgLong", "puntLong"]);

export function pack(line: StatLine): number[] {
  const out = STAT_KEYS.map((k) => line[k] ?? 0);
  while (out.length && out[out.length - 1] === 0) out.pop();
  return out;
}

export function unpack(values: number[]): StatLine {
  const line: StatLine = {};
  values.forEach((v, i) => {
    if (v) line[STAT_KEYS[i]] = v;
  });
  return line;
}

export function stat(values: number[] | undefined, key: StatKey): number {
  return values?.[INDEX[key]] ?? 0;
}

/** Adds one game into a running total (longs take the max). */
export function addLine(total: StatLine, values: number[]): void {
  values.forEach((v, i) => {
    if (!v) return;
    const k = STAT_KEYS[i];
    total[k] = LONGS.has(k) ? Math.max(total[k] ?? 0, v) : (total[k] ?? 0) + v;
  });
  if (values.some((v, i) => v && i < 3)) total.g = (total.g ?? 0) + 1;
}

export interface SeasonLine {
  team: string;
  line: StatLine;
}

let cache: { key: string; byType: Partial<Record<GameType, Record<string, SeasonLine>>> } | null = null;

/** Season totals for every player, for one part of the season. */
export function seasonTotals(state: GameState, type: GameType): Record<string, SeasonLine> {
  const key = `${state.id}:${Object.keys(state.box).length}`;
  if (cache?.key !== key) cache = { key, byType: {} };
  const hit = cache.byType[type];
  if (hit) return hit;
  const out: Record<string, SeasonLine> = {};
  for (const [gameId, box] of Object.entries(state.box)) {
    if (GAME_BY_ID[gameId]?.type !== type) continue;
    const r = state.results[gameId];
    for (const side of ["away", "home"] as const) {
      const team = r[side];
      for (const [pid, values] of Object.entries(box.players[side])) {
        const row = (out[pid] ??= { team, line: {} });
        row.team = team;
        addLine(row.line, values);
      }
    }
  }
  return (cache.byType[type] = out);
}

/** One player's games, oldest first. */
export function gameLog(state: GameState, id: string): { gameId: string; team: string; opp: string; home: boolean; values: number[] }[] {
  const out = [];
  for (const [gameId, box] of Object.entries(state.box)) {
    const r = state.results[gameId];
    for (const side of ["away", "home"] as const) {
      const values = box.players[side][id];
      if (values) out.push({ gameId, team: r[side], opp: side === "home" ? r.away : r.home, home: side === "home", values });
    }
  }
  return out.sort((a, b) => GAME_BY_ID[a.gameId].date.localeCompare(GAME_BY_ID[b.gameId].date));
}

export interface TeamTotals {
  g: number;
  pf: number;
  pa: number;
  yards: number;
  yardsAllowed: number;
  passYds: number;
  rushYds: number;
  turnovers: number;
  takeaways: number;
  sacks: number;
}

export function teamTotals(state: GameState, type: GameType): Record<string, TeamTotals> {
  const out: Record<string, TeamTotals> = {};
  for (const [gameId, box] of Object.entries(state.box)) {
    if (GAME_BY_ID[gameId]?.type !== type) continue;
    const r = state.results[gameId];
    for (const side of ["away", "home"] as const) {
      const other = side === "home" ? "away" : "home";
      const t = (out[r[side]] ??= { g: 0, pf: 0, pa: 0, yards: 0, yardsAllowed: 0, passYds: 0, rushYds: 0, turnovers: 0, takeaways: 0, sacks: 0 });
      const mine: BoxScore["team"]["away"] = box.team[side];
      const theirs = box.team[other];
      t.g++;
      t.pf += side === "home" ? r.homeScore : r.awayScore;
      t.pa += side === "home" ? r.awayScore : r.homeScore;
      t.yards += mine.yards;
      t.yardsAllowed += theirs.yards;
      t.passYds += mine.passYds;
      t.rushYds += mine.rushYds;
      t.turnovers += mine.turnovers;
      t.takeaways += theirs.turnovers;
      t.sacks += theirs.sacked;
    }
  }
  return out;
}
