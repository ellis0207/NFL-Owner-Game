// Salary cap accounting.
//
// Offseason (before the first regular-season game) only a team's 51 largest
// cap hits count, the "Top 51" rule. From opening night every player on the
// 53 counts in full and practice squad players count at their weekly pay.
// Dead money from released players counts throughout.
import { dealCapHit, dealOf, dealYearsLeft, leagueYear, releaseCharges, writeMinimumDeal } from "./contracts";
import { PLAYER_BY_ID, RULES, SEASON, TEAM_BY_ID } from "./league";
import type { GameState } from "./types";

export { minimumSalary } from "./contracts";

const REGULAR_SEASON_WEEKS = 18;

export function capHit(playerId: string, year = SEASON, state?: GameState): number {
  return dealCapHit(dealOf(state, playerId), year);
}

export function contractYearsLeft(playerId: string, year = SEASON, state?: GameState): number {
  return dealYearsLeft(dealOf(state, playerId), year);
}

/** A one-year minimum deal; signed mid-season, only the weeks left count. */
export function signMinimumDeal(state: GameState, playerId: string, team: string): void {
  state.contracts[playerId] = writeMinimumDeal(team, state.date, PLAYER_BY_ID[playerId].yearsExp);
}

export function isRegularSeasonOrLater(date: string): boolean {
  return date >= RULES.keyDates.regularSeasonStart;
}

export function practiceSquadCapHit(): number {
  return RULES.practiceSquadWeekly.standard * REGULAR_SEASON_WEEKS;
}

// Team -> player ids, rebuilt whenever a player joins a team (see invalidateRosters).
// Players who leave are filtered out on read, so only signings need to invalidate.
const rosterIndex = new WeakMap<GameState, Record<string, string[]>>();

export function invalidateRosters(state: GameState): void {
  rosterIndex.delete(state);
}

export function teamPlayerIds(state: GameState, team: string): string[] {
  let index = rosterIndex.get(state);
  if (!index) {
    index = {};
    for (const id in state.players) {
      const t = state.players[id].team;
      if (t) (index[t] ??= []).push(id);
    }
    rosterIndex.set(state, index);
  }
  return (index[team] ?? []).filter((id) => {
    const p = state.players[id];
    return p.team === team && p.status !== "fa";
  });
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
    const hits = ids.map((id) => capHit(id, SEASON, state)).sort((a, b) => b - a);
    players = hits.slice(0, 51).reduce((a, b) => a + b, 0);
  } else {
    players = ids.reduce(
      (sum, id) => sum + (state.players[id].status === "ps" ? practiceSquadCapHit() : capHit(id, SEASON, state)),
      0,
    );
  }
  const dead = deadMoney(state, team);
  const limit = capLimit(team);
  return { limit, players, dead, used: players + dead, space: limit - players - dead, rule };
}

export interface ReleaseCost {
  /** Dead money charged to this league year (salary already paid included). */
  deadThisYear: number;
  /** Dead money pushed to next league year. */
  deadNextYear: number;
  /** Cap space this league year gained by the release (can be negative). */
  savingsThisYear: number;
  /** Guaranteed cash still owed to the player. */
  cashOwed: number;
}

/** What releasing a player today would cost, under the June 1 rules for today's date. */
export function releaseCost(playerId: string, state?: GameState, opts: { june1?: boolean; date?: string } = {}): ReleaseCost {
  const date = opts.date ?? state?.date ?? RULES.keyDates.regularSeasonStart;
  const injured = !!state?.players[playerId]?.injury;
  const c = releaseCharges(dealOf(state, playerId), date, { june1: opts.june1, injured });
  return { deadThisYear: c.thisYear, deadNextYear: c.nextYear, savingsThisYear: c.savings, cashOwed: c.cashOwed };
}

/** The league year a release made today is charged to. */
export function chargeYear(state: GameState): number {
  return leagueYear(state.date);
}

export function addDeadMoney(state: GameState, team: string, year: number, amount: number): void {
  if (!amount) return;
  const byYear = (state.deadMoney[team] ??= {});
  byYear[String(year)] = (byYear[String(year)] ?? 0) + amount;
}
