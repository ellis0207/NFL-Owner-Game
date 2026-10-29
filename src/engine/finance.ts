// Cash, kept separate from the cap. A signing bonus is paid when the deal is
// signed even though the cap spreads it over five years, so front-loading and
// big bonuses cost real money now. Salaries are paid weekly in the season.
import { leagueYear, REG_WEEKS, dealOf, dealYear } from "./contracts";
import { teamPlayerIds, practiceSquadCapHit } from "./cap";
import { TEAMS } from "./league";
import type { GameState } from "./types";

export function payCash(state: GameState, team: string, amount: number, year = leagueYear(state.date)): void {
  if (!amount) return;
  const f = (state.finance[team] ??= { paid: {} });
  f.paid[year] = (f.paid[year] ?? 0) + Math.round(amount);
}

export function cashPaid(state: GameState, team: string, year = leagueYear(state.date)): number {
  return state.finance[team]?.paid[year] ?? 0;
}

/** One regular-season paycheck for every team: a week of base salary for the 53, IR and practice squad. */
export function payWeek(state: GameState): void {
  const year = leagueYear(state.date);
  for (const { id: team } of TEAMS) {
    let total = 0;
    for (const id of teamPlayerIds(state, team)) {
      const p = state.players[id];
      if (p.status === "ps") {
        const d = dealOf(state, id);
        total += (d?.kind === "practice" ? dealYear(d, year)?.base ?? 0 : practiceSquadCapHit()) / REG_WEEKS;
      }
      else if (p.status === "active" || p.status === "ir") {
        if (p.holdout?.kind === "holdout" || p.suspended) continue; // holdouts and suspended players forfeit game checks
        const y = dealYear(dealOf(state, id), year);
        if (y && !y.void) total += y.base / REG_WEEKS;
      }
    }
    payCash(state, team, total, year);
  }
}

/** Cash still owed this league year to the current roster (base salary for the weeks left). */
export function cashOwedThisYear(state: GameState, team: string, weeksLeft: number): number {
  const year = leagueYear(state.date);
  let total = 0;
  for (const id of teamPlayerIds(state, team)) {
    const y = dealYear(dealOf(state, id), year);
    if (y && !y.void && state.players[id].status !== "ps") total += (y.base * Math.min(weeksLeft, y.weeks ?? REG_WEEKS)) / REG_WEEKS;
  }
  return Math.round(total);
}

/** Cash owed next league year under current contracts: salaries and non-prorated bonuses. */
export function cashNextYear(state: GameState, team: string): number {
  const year = leagueYear(state.date) + 1;
  let total = 0;
  for (const id of teamPlayerIds(state, team)) {
    const y = dealYear(dealOf(state, id), year);
    if (y && !y.void) total += y.base + Math.max(0, y.bonus);
  }
  return Math.round(total);
}
