// Cash, kept separate from the cap. A signing bonus is paid when the deal is
// signed even though the cap spreads it over five years, so front-loading and
// big bonuses cost real money now. Salaries are paid weekly in the season.
import { leagueYear, REG_WEEKS, dealOf, dealYear } from "./contracts";
import { teamPlayerIds, practiceSquadCapHit } from "./cap";
import { TEAMS } from "./league";
import type { GameState } from "./types";

/**
 * Rough annual revenue by team, dollars: public estimates of each franchise's
 * football revenue (national TV and licensing are shared equally; the gap is
 * local revenue). The business side will model this in detail later.
 */
export const REVENUE_ESTIMATE: Record<string, number> = {
  DAL: 1_250e6, NE: 790e6, LA: 770e6, NYG: 730e6, SF: 720e6, LV: 700e6, NYJ: 690e6, PHI: 680e6, CHI: 680e6, WAS: 650e6,
  HOU: 640e6, MIA: 630e6, KC: 620e6, GB: 620e6, DEN: 610e6, SEA: 610e6, ATL: 610e6, BAL: 610e6, PIT: 610e6, MIN: 600e6,
  TB: 600e6, LAC: 600e6, CAR: 590e6, NO: 590e6, TEN: 590e6, CLE: 590e6, DET: 590e6, IND: 580e6, JAX: 580e6, BUF: 570e6,
  ARI: 570e6, CIN: 560e6,
};

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
        if (p.holdout?.kind === "holdout") continue; // holdouts forfeit game checks
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
