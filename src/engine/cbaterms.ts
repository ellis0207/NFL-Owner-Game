// The terms of the labor agreement in force for a league year: the players'
// share of revenue (which sets the cap), minimum salaries, the rookie pool,
// benefits, camp practice limits, the season's length and the cash floor.
// The real 2020 agreement runs through the 2030 season; later agreements are
// bargained in the save (labor.ts), which binds them here. This file imports
// nothing, so contracts, the cap and the business can read it at load time.

export interface CbaTerms {
  /** The players' share of all revenue: the cap follows it. */
  share: number;
  /** Minimum salaries against the old schedule carried forward. */
  minScale: number;
  /** The rookie pool against the old scale. */
  rookieScale: number;
  /** League benefit plans (pensions, health, annuities) against the old cost. */
  benefits: number;
  /** Padded practices allowed in training camp. */
  practice: number;
  /** Regular-season games the players agreed to play. */
  games: 16 | 17 | 18;
  /** Safety provisions added (field standards, independent doctors, recovery days). */
  safety: number;
  /** The share of the caps each club must pay in cash over a four-year period. */
  cashFloor: number;
  /** Before 2011: rookie deals were bargained freely (longer and far richer at the top), with no fifth-year option. */
  noWageScale?: boolean;
  /** A league year with no salary cap (2010). */
  uncapped?: boolean;
  /** Accrued seasons for unrestricted free agency when not four (six in 2010). */
  ufaSeasons?: number;
  /** Plan B (1989-1992): each club protects 37 players; the others whose contracts end are free to sign anywhere. */
  planB?: boolean;
  /** No franchise or transition tags (before the 1993 agreement). */
  noTags?: boolean;
}

/** The 2020 agreement: 48.5% with the 17th game, 16 padded practices in camp, the 89% cash floor. */
export const BASE_TERMS: CbaTerms = { share: 0.485, minScale: 1, rookieScale: 1, benefits: 1, practice: 16, games: 17, safety: 0, cashFloor: 0.89 };

let lookup: (year: number) => CbaTerms = () => BASE_TERMS;

/** The terms in force for a league year (an expired agreement's terms carry forward until a new one). */
export function termsFor(year: number): CbaTerms {
  return lookup(year);
}

/** Binds the save's agreements (called by labor.ts when a season is applied or a deal is signed). */
export function bindTerms(fn: (year: number) => CbaTerms): void {
  lookup = fn;
}
