// Salary cap accounting.
//
// Offseason (from the new league year to the first regular-season game) only
// a team's 51 largest cap hits count, the "Top 51" rule. From opening night
// every player on the 53 counts in full and practice squad players count at
// their weekly pay. Dead money from released players counts throughout.
// Unused cap space rolls over into the next league year.
import { dealCapHit, dealOf, dealYearsLeft, leagueYear, releaseCharges, salaryCap, writeMinimumDeal } from "./contracts";
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
  state.contracts[playerId] = writeMinimumDeal(team, state.date, yearsExpIn(playerId, leagueYear(state.date)));
}

/**
 * Accrued seasons on a date: the seasons before 2026, plus 2026 once its
 * regular season is over. Four or more makes a vested veteran.
 */
export function accruedSeasons(playerId: string, date: string): number {
  const year = leagueYear(date);
  const done = year === SEASON && date > RULES.keyDates.regularSeasonEnd ? 1 : 0;
  return PLAYER_BY_ID[playerId].yearsExp + Math.max(0, year - SEASON) + done;
}

/** Credited seasons a player will have going into a league year. */
export function yearsExpIn(playerId: string, year: number): number {
  return PLAYER_BY_ID[playerId].yearsExp + Math.max(0, year - SEASON);
}

export function isRegularSeasonOrLater(date: string): boolean {
  return date >= RULES.keyDates.regularSeasonStart;
}

export function practiceSquadCapHit(): number {
  return RULES.practiceSquadWeekly.standard * REGULAR_SEASON_WEEKS;
}

/** A practice squad player's cap charge: the weekly pay left on the practice deal. */
export function psCapHit(state: GameState, playerId: string, year: number): number {
  const deal = dealOf(state, playerId);
  return deal?.kind === "practice" ? dealCapHit(deal, year) : practiceSquadCapHit();
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

export function deadMoney(state: GameState, team: string, year = leagueYear(state.date)): number {
  const base = year === SEASON ? TEAM_BY_ID[team].cap2026.deadMoney : 0;
  return base + (state.deadMoney[team]?.[String(year)] ?? 0);
}

/** Space carried over from the year before, once the league year has opened. */
export function rollover(state: GameState | undefined, team: string, year: number): number {
  return state?.league?.rollover?.[team]?.[year] ?? 0;
}

/** A team's adjusted cap: the league cap plus rollover (2026 is the real adjusted figure). */
export function capLimit(team: string, year = SEASON, state?: GameState): number {
  if (year === SEASON) return TEAM_BY_ID[team].cap2026.adjustedCap;
  return salaryCap(state, year) + rollover(state, team, year);
}

/**
 * Rollover: unused space carries into the next league year. It is set when
 * the season ends; moves made after that, before the new league year, change
 * this year's books and so the amount carried over.
 */
export function adjustRollover(state: GameState, team: string, delta: number): void {
  const rollover = state.league?.rollover?.[team];
  if (!rollover || leagueYear(state.date) !== SEASON || !delta) return;
  rollover[SEASON + 1] = Math.max(0, (rollover[SEASON + 1] ?? 0) + delta);
}

/** The Top 51 rule applies from the new league year until opening night. */
export function isTop51(date: string): boolean {
  return leagueYear(date) > SEASON || date < RULES.keyDates.regularSeasonStart;
}

export interface CapSummary {
  limit: number;
  players: number;
  dead: number;
  used: number;
  space: number;
  rule: "top51" | "full";
}

export function capSummary(state: GameState, team: string, year = leagueYear(state.date)): CapSummary {
  const ids = teamPlayerIds(state, team);
  const rule = year > leagueYear(state.date) || isTop51(state.date) ? "top51" : "full";
  let players: number;
  if (rule === "top51") {
    const hits = ids.map((id) => capHit(id, year, state)).sort((a, b) => b - a);
    players = hits.slice(0, 51).reduce((a, b) => a + b, 0);
  } else {
    players = ids.reduce(
      (sum, id) => sum + (state.players[id].status === "ps" ? psCapHit(state, id, year) : capHit(id, year, state)),
      0,
    );
  }
  const dead = deadMoney(state, team, year);
  const limit = capLimit(team, year, state);
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
  /** Salary still owed inside the dead money, this year and next: a waiver claim takes it over. */
  salaryThisYear: number;
  salaryNextYear: number;
}

/** What releasing a player today would cost, under the June 1 rules for today's date. */
export function releaseCost(playerId: string, state?: GameState, opts: { june1?: boolean; date?: string } = {}): ReleaseCost {
  const date = opts.date ?? state?.date ?? RULES.keyDates.regularSeasonStart;
  const injured = !!state?.players[playerId]?.injury;
  const termPay = !!state && state.termPay?.[playerId] === leagueYear(date);
  const c = releaseCharges(dealOf(state, playerId), date, { june1: opts.june1, injured, termPay });
  return { deadThisYear: c.thisYear, deadNextYear: c.nextYear, savingsThisYear: c.savings, cashOwed: c.cashOwed, salaryThisYear: c.salaryThisYear, salaryNextYear: c.salaryNextYear };
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
