// Salary cap accounting.
//
// Offseason (before the first regular-season game) only a team's 51 largest
// cap hits count, the "Top 51" rule. From opening night every player on the
// 53 counts in full and practice squad players count at their weekly pay.
// Dead money from released players counts throughout.
import { PLAYER_BY_ID, RULES, SEASON, TEAM_BY_ID } from "./league";
import type { ContractSeason, GameState } from "./types";

const REGULAR_SEASON_WEEKS = 18;

export function contractSeason(playerId: string, year: number): ContractSeason | undefined {
  return PLAYER_BY_ID[playerId]?.contract.seasons.find((s) => s.year === year);
}

export function capHit(playerId: string, year = SEASON): number {
  return contractSeason(playerId, year)?.capHit ?? 0;
}

export function contractYearsLeft(playerId: string, year = SEASON): number {
  return PLAYER_BY_ID[playerId]?.contract.seasons.filter((s) => s.year >= year).length ?? 0;
}

export function isRegularSeasonOrLater(date: string): boolean {
  return date >= RULES.keyDates.regularSeasonStart;
}

export function practiceSquadCapHit(): number {
  return RULES.practiceSquadWeekly.standard * REGULAR_SEASON_WEEKS;
}

export function teamPlayerIds(state: GameState, team: string): string[] {
  return Object.entries(state.players)
    .filter(([, p]) => p.team === team && p.status !== "fa")
    .map(([id]) => id);
}

export function deadMoney(state: GameState, team: string, year = SEASON): number {
  const base = year === SEASON ? TEAM_BY_ID[team].cap2026.deadMoney : 0;
  return base + (state.deadMoney[team]?.[String(year)] ?? 0);
}

export function capLimit(team: string, year = SEASON): number {
  return year === SEASON ? TEAM_BY_ID[team].cap2026.adjustedCap : RULES.salaryCap;
}

export interface CapSummary {
  limit: number;
  players: number;
  dead: number;
  used: number;
  space: number;
  rule: "top51" | "full";
}

export function capSummary(state: GameState, team: string): CapSummary {
  const ids = teamPlayerIds(state, team);
  const rule = isRegularSeasonOrLater(state.date) ? "full" : "top51";
  let players: number;
  if (rule === "top51") {
    const hits = ids.map((id) => capHit(id)).sort((a, b) => b - a);
    players = hits.slice(0, 51).reduce((a, b) => a + b, 0);
  } else {
    players = ids.reduce(
      (sum, id) => sum + (state.players[id].status === "ps" ? practiceSquadCapHit() : capHit(id)),
      0,
    );
  }
  const dead = deadMoney(state, team);
  const limit = capLimit(team);
  return { limit, players, dead, used: players + dead, space: limit - players - dead, rule };
}

export interface ReleaseCost {
  /** Dead money charged to this season. */
  deadThisYear: number;
  /** Dead money pushed to next season (bonus proration and guarantees beyond this year). */
  deadNextYear: number;
  /** Cap space this season gained by the release (can be negative). */
  savingsThisYear: number;
}

/**
 * Releasing a player after June 1, as every move in this game is: this
 * season keeps its own bonus proration and guaranteed pay as dead money, and
 * everything owed beyond this season lands on next season's cap.
 */
export function releaseCost(playerId: string, year = SEASON): ReleaseCost {
  const seasons = PLAYER_BY_ID[playerId]?.contract.seasons ?? [];
  const current = seasons.find((s) => s.year === year);
  const future = seasons.filter((s) => s.year > year);
  const deadThisYear = current ? current.proratedBonus + current.guaranteedSalary : 0;
  const deadNextYear = future.reduce((sum, s) => sum + s.proratedBonus + s.guaranteedSalary, 0);
  return { deadThisYear, deadNextYear, savingsThisYear: (current?.capHit ?? 0) - deadThisYear };
}

export function addDeadMoney(state: GameState, team: string, year: number, amount: number): void {
  if (!amount) return;
  const byYear = (state.deadMoney[team] ??= {});
  byYear[String(year)] = (byYear[String(year)] ?? 0) + amount;
}
