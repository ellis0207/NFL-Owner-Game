// Contracts the way the CBA counts them: base salary, prorated bonuses, void
// years, guarantees, and what happens to all of it when a player is released.
//
// Original contracts come from the data (OverTheCap year-by-year lines) and are
// converted on first use; contracts signed in the game are stored in the save.
import { addDays, daysBetween } from "./dates";
import { keyDatesFor, newLeagueYearDate } from "./calendar";
import { BASE_SEASON, KNOWN_CAPS, PLAYER_BY_ID, RULES } from "./league";
import type { Deal, DealKind, DealYear, GameState, PlayerData } from "./types";

export const REG_WEEKS = 18;
/** Signing and option bonuses spread over at most five league years. */
export const MAX_PRORATION_YEARS = 5;
/** Veteran salary benefit: the most a qualifying minimum deal can add in bonus. */
export const VSB_MAX_BONUS = 167_500;

// ---- League calendar ----

/** First day of a league year: the date in the data, else the second Wednesday of March. */
export function leagueYearStart(year: number): string {
  return newLeagueYearDate(year);
}

/** The league year a date belongs to (the 2026 league year runs to March 2027). */
export function leagueYear(date: string): number {
  const y = Number(date.slice(0, 4));
  return date >= leagueYearStart(y) ? y : y - 1;
}

/** Releases after June 1 split dead money across two league years. */
export function isPostJune1(date: string): boolean {
  const y = leagueYear(date);
  return date > `${y}-06-01` && date < leagueYearStart(y + 1);
}

/** Regular-season paychecks already paid in a date's league year. */
export function weeksPaid(date: string): number {
  const kd = keyDatesFor(leagueYear(date));
  if (date <= kd.regularSeasonStart) return 0;
  if (date > kd.regularSeasonEnd) return REG_WEEKS;
  return Math.min(REG_WEEKS, Math.floor(daysBetween(kd.regularSeasonStart, date) / 7) + 1);
}

// ---- Salary cap and minimums by year ----

/** The cap for a league year: set in the save once the league announces it, else projected. */
export function salaryCap(state: GameState | undefined, year: number): number {
  return state?.league?.caps[year] ?? projectedCap(year);
}

/**
 * Public projection: from the last cap the league announced, growing about as
 * the league and union forecast (8.5% into 2027, about 7% a year after that).
 */
export function projectedCap(year: number): number {
  let base = RULES.salaryCap;
  let from = BASE_SEASON;
  for (const [y, cap] of Object.entries(KNOWN_CAPS)) {
    const yy = Number(y);
    if (yy > from && yy <= year) {
      from = yy;
      base = cap;
    }
  }
  let cap = base;
  for (let y = from + 1; y <= year; y++) cap *= y === BASE_SEASON + 1 ? 1.085 : 1.07;
  return Math.round(cap / 100_000) * 100_000;
}

/**
 * League minimums by credited seasons: the CBA's tables for 2026 and 2027,
 * its $45,000 yearly steps through 2030, and growth of about 5% a year once
 * the current deal's schedule runs out (its terms carry forward).
 */
export function minimumSalary(yearsExp: number, year = RULES.season): number {
  const table = year <= BASE_SEASON ? RULES.minimumSalary : RULES.minimumSalaryNextYear;
  const steps = Object.keys(table).map(Number).sort((a, b) => a - b);
  const step = steps.filter((s) => s <= yearsExp).pop() ?? 0;
  const capped = Math.min(year, 2030);
  const base = table[String(step)] + Math.max(0, capped - BASE_SEASON - 1) * 45_000;
  if (year <= 2030) return base;
  return Math.round(base * Math.pow(1.05, year - 2030) / 5_000) * 5_000;
}

// ---- Reading a contract ----

const KIND_FROM_DATA: Record<string, DealKind> = {
  Drafted: "rookie", UDFA: "rookie", Franchise: "franchise", Transition: "transition",
  RFA: "rfa", ERFA: "erfa", Extension: "extension", Practice: "practice", "Minimum (estimated)": "minimum",
};

const dataDeals = new Map<string, Deal>();

/**
 * The last year a data contract will really be played. OverTheCap lists void
 * and placeholder years too: those count less than their listed base salary
 * (or nothing). Extension and rookie lengths in the data count only new or
 * original years, so for those the year-by-year shape decides.
 */
function lastRealYear(c: PlayerData["contract"]): number {
  const stated = (c.signedYear ?? BASE_SEASON) + (c.years ?? c.seasons.length) - 1;
  // A tag followed by a long-term deal keeps the tag's type and length in the data: read its seasons instead.
  const retagged = (c.type === "Franchise" || c.type === "Transition") && c.seasons.length > 1;
  const flexible = c.type === "Extension" || c.type === "Other" || c.type === "Drafted" || retagged;
  let last = c.seasons[0]?.year ?? BASE_SEASON;
  for (const s of c.seasons) {
    const counts = s.capHit > 0 && s.capHit >= s.baseSalary;
    if (counts && (s.year <= stated || flexible || s.guaranteedSalary > 0)) last = s.year;
  }
  return last;
}

/** The player's contract as of the start of the game. */
export function originalDeal(id: string): Deal {
  let d = dataDeals.get(id);
  if (d) return d;
  const p = PLAYER_BY_ID[id];
  const c = p.contract;
  const lastReal = lastRealYear(c);
  const years: DealYear[] = c.seasons.map((s) => {
    // Years past the real length are void years: only what OverTheCap counts on the cap stays.
    const isVoid = s.year > lastReal;
    const bonus = isVoid ? 0 : s.capHit - s.baseSalary - s.proratedBonus;
    return {
      year: s.year,
      base: isVoid ? 0 : s.baseSalary,
      proration: isVoid ? s.capHit : s.proratedBonus,
      bonus,
      guaranteed: Math.min(s.guaranteedSalary, s.baseSalary + Math.max(0, bonus)),
      injuryGuaranteed: 0,
      ...(isVoid ? { void: true } : {}),
    };
  });
  const prorated = years.reduce((sum, y) => sum + y.proration, 0);
  d = {
    team: p.team ?? "",
    signed: `${c.signedYear ?? BASE_SEASON}-03-15`,
    kind: (c.type === "Franchise" || c.type === "Transition") && c.seasons.length > 1 ? "extension" : KIND_FROM_DATA[c.type ?? ""] ?? "veteran",
    signingBonus: prorated,
    total: c.totalValue ?? 0,
    apy: c.apy ?? 0,
    guaranteedAtSigning: c.guaranteed ?? 0,
    years,
  };
  dataDeals.set(id, d);
  return d;
}

/** A player's current contract, or null for a free agent. */
export function dealOf(state: GameState | undefined, id: string): Deal | null {
  if (state && id in state.contracts) return state.contracts[id] ?? null;
  if (state && state.players[id]?.status === "fa") return null;
  return PLAYER_BY_ID[id] ? originalDeal(id) : null;
}

export function dealYear(deal: Deal | null, year: number): DealYear | undefined {
  return deal?.years.find((y) => y.year === year);
}

/** What one league year of a contract counts against the cap. */
export function yearCapHit(y: DealYear | undefined): number {
  if (!y) return 0;
  const weeks = y.weeks ?? REG_WEEKS;
  return Math.round((y.base * weeks) / REG_WEEKS + y.proration + y.bonus);
}

export function dealCapHit(deal: Deal | null, year: number): number {
  return yearCapHit(dealYear(deal, year));
}

/** Real (playable) years left from a league year on. */
export function dealYearsLeft(deal: Deal | null, year: number): number {
  return deal?.years.filter((y) => y.year >= year && !y.void).length ?? 0;
}

/** Last real year of a contract. */
export function lastYear(deal: Deal | null): number | null {
  const real = deal?.years.filter((y) => !y.void) ?? [];
  return real.length ? real[real.length - 1].year : null;
}

export interface ReleaseCharges {
  /** Dead money on this league year's cap (salary already paid included). */
  thisYear: number;
  /** Dead money pushed to next league year. */
  nextYear: number;
  /** Cap space this league year gained (can be negative). */
  savings: number;
  /** Cash still owed to the player (guarantees not yet paid). */
  cashOwed: number;
  /** The part of the dead money that is salary still owed: a team that claims the player off waivers takes it over. */
  salaryThisYear: number;
  salaryNextYear: number;
}

/**
 * Releasing a player. Unamortized bonus and remaining guarantees accelerate.
 * Before June 1 they all land on this league year unless the team uses one of
 * its two post-June 1 designations; after June 1 (or with a designation) only
 * this year's share stays and the rest moves to next year.
 * During the season, base salary already paid has already counted.
 */
export function releaseCharges(deal: Deal | null, date: string, opts: { june1?: boolean; injured?: boolean; termPay?: boolean } = {}): ReleaseCharges {
  if (!deal) return { thisYear: 0, nextYear: 0, savings: 0, cashOwed: 0, salaryThisYear: 0, salaryNextYear: 0 };
  const year = leagueYear(date);
  const cur = dealYear(deal, year);
  const later = deal.years.filter((y) => y.year > year);
  // Termination pay makes the whole season's salary owed, like a guarantee.
  const guaranteeOf = (y: DealYear) => (opts.termPay && y.year === year ? Math.max(y.guaranteed, y.base) : y.guaranteed) + (opts.injured || (y.vests && y.vests <= date) ? y.injuryGuaranteed : 0);

  let paid = 0;
  let salaryNow = 0;
  if (cur && !cur.void) {
    const weeks = cur.weeks ?? REG_WEEKS;
    const paidWeeks = Math.max(0, Math.min(weeks, weeksPaid(date) - (REG_WEEKS - weeks)));
    const paidBase = (cur.base * paidWeeks) / REG_WEEKS;
    const paidBonus = date >= leagueYearStart(year) ? cur.bonus : 0;
    paid = paidBase + paidBonus;
    salaryNow = paidBonus + Math.max(paidBase, Math.min(guaranteeOf(cur), (cur.base * weeks) / REG_WEEKS));
  }
  const prorationNow = cur?.proration ?? 0;
  const prorationLater = later.reduce((s, y) => s + y.proration, 0);
  const guaranteeLater = later.filter((y) => !y.void).reduce((s, y) => s + guaranteeOf(y), 0);

  const split = opts.june1 || isPostJune1(date);
  const thisYear = Math.round(prorationNow + salaryNow + (split ? 0 : prorationLater + guaranteeLater));
  const nextYear = Math.round(split ? prorationLater + guaranteeLater : 0);
  return {
    thisYear,
    nextYear,
    savings: yearCapHit(cur) - thisYear,
    cashOwed: Math.round(salaryNow - paid + guaranteeLater),
    salaryThisYear: Math.round(salaryNow - paid + (split ? 0 : guaranteeLater)),
    salaryNextYear: Math.round(split ? guaranteeLater : 0),
  };
}

// ---- Writing a contract ----

export type Shape = "flat" | "rising" | "front";

/** The terms of an offer, the way a front office writes one up. */
export interface Terms {
  /** Real years, not counting void years. */
  years: number;
  /** Total new money over the real years, signing bonus included. */
  total: number;
  signingBonus: number;
  /** Fully guaranteed at signing, signing bonus included. */
  guaranteed: number;
  /** More salary guaranteed for injury only, until it vests on the fifth day of its league year. */
  injuryGuaranteed: number;
  voidYears: number;
  shape: Shape;
}

const SHAPE_WEIGHT: Record<Shape, (i: number, n: number) => number> = {
  flat: () => 1,
  rising: (i) => 1 + 0.14 * i,
  front: (i) => Math.max(0.55, 1.25 - 0.15 * i),
};

/**
 * Writes up a contract from terms: base salaries by shape, the signing bonus
 * spread over up to five years (void years included), guarantees filled from
 * the first year forward.
 */
export function writeDeal(terms: Terms, opts: { team: string; date: string; kind: DealKind; firstYear: number; yearsExp: number; carry?: DealYear[] }): Deal {
  const n = Math.max(1, Math.round(terms.years));
  const sb = Math.max(0, Math.min(terms.signingBonus, terms.total));
  const carry = opts.carry ?? [];
  const spread = Math.min(MAX_PRORATION_YEARS, carry.length + n + terms.voidYears);
  const perYear = spread ? sb / spread : 0;

  const weights = Array.from({ length: n }, (_, i) => SHAPE_WEIGHT[terms.shape](i, n));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pool = terms.total - sb;
  const years: DealYear[] = [];
  carry.forEach((y) => years.push({ ...y }));
  for (let i = 0; i < n; i++) {
    const year = opts.firstYear + i;
    const min = minimumSalary(opts.yearsExp + carry.length + i, year);
    years.push({ year, base: Math.max(min, Math.round((pool * weights[i]) / wsum / 1000) * 1000), proration: 0, bonus: 0, guaranteed: 0, injuryGuaranteed: 0 });
  }
  for (let v = 0; v < terms.voidYears; v++) {
    years.push({ year: opts.firstYear + n + v, base: 0, proration: 0, bonus: 0, guaranteed: 0, injuryGuaranteed: 0, void: true });
  }
  for (let i = 0; i < spread && i < years.length; i++) years[i].proration += Math.round(perYear);

  // Guarantees: full first, then injury-only that vests at the start of the league year before it is owed.
  let full = Math.max(0, terms.guaranteed - sb);
  let injury = Math.max(0, terms.injuryGuaranteed);
  for (const y of years.slice(carry.length)) {
    if (y.void) continue;
    const g = Math.min(full, y.base);
    y.guaranteed = g;
    full -= g;
    const ig = Math.min(injury, y.base - g);
    if (ig > 0) {
      y.injuryGuaranteed = ig;
      y.vests = addDays(leagueYearStart(y.year), 4);
      injury -= ig;
    }
  }
  const real = years.slice(carry.length).filter((y) => !y.void);
  const total = sb + real.reduce((s, y) => s + y.base, 0);
  return {
    team: opts.team, signed: opts.date, kind: opts.kind,
    signingBonus: sb, total, apy: Math.round(total / n),
    guaranteedAtSigning: Math.min(total, sb + real.reduce((s, y) => s + y.guaranteed, 0)),
    years,
  };
}

/**
 * An extension: the years left on the current deal stay (their bonus proration
 * too), new years are added after them, and the new signing bonus spreads over
 * the whole remaining contract from this league year.
 */
export function writeExtension(current: Deal, terms: Terms, date: string, yearsExp: number): Deal {
  const year = leagueYear(date);
  const keep = current.years.filter((y) => y.year >= year && !y.void);
  const oldVoids = current.years.filter((y) => y.void);
  const first = (keep.length ? keep[keep.length - 1].year : year - 1) + 1;
  const deal = writeDeal(terms, { team: current.team, date, kind: "extension", firstYear: first, yearsExp, carry: keep });
  // Old void-year proration accelerates onto the current year when the deal is redone.
  const leftover = oldVoids.reduce((s, y) => s + y.proration, 0);
  if (leftover && deal.years[0]) deal.years[0].proration += leftover;
  return deal;
}

/** A deal signed after the season has started covers only the weeks left: base salary is paid by the week. */
export function prorateFirstYear(deal: Deal, date: string): Deal {
  const first = deal.years[0];
  const paid = weeksPaid(date);
  if (!first || first.year !== leagueYear(date) || paid <= 0) return deal;
  first.weeks = Math.max(1, REG_WEEKS - paid);
  return deal;
}

/** A one-year minimum deal; veterans with four or more seasons count only a two-year player's minimum. */
export function writeMinimumDeal(team: string, date: string, yearsExp: number, opts: { bonus?: number; guaranteed?: boolean; year?: number } = {}): Deal {
  // A reserve/future deal signed after the season covers next league year.
  const year = opts.year ?? leagueYear(date);
  const base = minimumSalary(yearsExp, year);
  const bonus = Math.min(opts.bonus ?? 0, VSB_MAX_BONUS);
  const weeks = year > leagueYear(date) ? REG_WEEKS : REG_WEEKS - weeksPaid(date);
  const vsb = yearsExp >= 4 ? base - minimumSalary(2, year) : 0;
  const y: DealYear = {
    year, base, proration: bonus, bonus: -vsb * (Math.max(1, weeks) / REG_WEEKS), guaranteed: opts.guaranteed ? base : 0, injuryGuaranteed: 0,
    ...(weeks < REG_WEEKS ? { weeks: Math.max(1, weeks) } : {}),
  };
  return {
    team, signed: date, kind: "minimum", signingBonus: bonus, total: base + bonus, apy: base + bonus,
    guaranteedAtSigning: bonus + y.guaranteed, years: [y],
  };
}

/** Practice squad pay: weekly, by accrued seasons (veterans are paid more). */
export function practiceWeekly(accrued: number, year = RULES.season): number {
  const w = RULES.practiceSquadWeekly;
  const grow = Math.pow(1.05, Math.max(0, year - BASE_SEASON));
  return Math.round((accrued >= 3 ? w.veteranMin : w.standard) * grow / 50) * 50;
}

/** A practice squad contract for the rest of the league year, paid by the week. */
export function writePracticeDeal(team: string, date: string, accrued: number): Deal {
  const year = leagueYear(date);
  const base = practiceWeekly(accrued, year) * REG_WEEKS;
  const weeks = Math.max(1, REG_WEEKS - weeksPaid(date));
  return {
    team, signed: date, kind: "practice", signingBonus: 0, total: base, apy: base, guaranteedAtSigning: 0,
    years: [{ year, base, proration: 0, bonus: 0, guaranteed: 0, injuryGuaranteed: 0, ...(weeks < REG_WEEKS ? { weeks } : {}) }],
  };
}

/**
 * The contract a team takes on when it claims a player off waivers: the
 * salary that's left, guarantees included. Bonus proration stays with the
 * team that released him, and so does termination pay.
 */
export function claimedDeal(deal: Deal | null, team: string, date: string, yearsExp: number): Deal {
  const year = leagueYear(date);
  if (!deal) return writeMinimumDeal(team, date, yearsExp);
  const weeks = Math.max(1, REG_WEEKS - weeksPaid(date));
  const years = deal.years.filter((y) => y.year >= year && !y.void).map((y) => {
    const next: DealYear = { ...y, proration: 0 };
    if (y.year === year) {
      // Bonuses already earned this league year were paid by the old team.
      if (date >= leagueYearStart(year)) next.bonus = Math.min(0, y.bonus);
      next.weeks = Math.min(y.weeks ?? REG_WEEKS, weeks);
      if (next.weeks >= REG_WEEKS) delete next.weeks;
    }
    return next;
  });
  if (!years.length) return writeMinimumDeal(team, date, yearsExp);
  const total = years.reduce((s, y) => s + y.base + Math.max(0, y.bonus), 0);
  return {
    team, signed: date, kind: deal.kind === "practice" ? "minimum" : deal.kind, signingBonus: 0, total,
    apy: Math.round(total / years.length), guaranteedAtSigning: years.reduce((s, y) => s + y.guaranteed, 0), years,
    ...(deal.fifthYearOption && !deal.fifthYearOption.declined ? { fifthYearOption: deal.fifthYearOption } : {}),
  };
}

// ---- Trades ----

/**
 * What a team keeps on its cap when it trades a player away. Salary already
 * paid this league year has counted; the signing bonus proration doesn't
 * travel: this year's share stays, and later years' (void years included)
 * accelerate onto this year, or onto next year for a trade after June 1.
 * Guarantees go with the contract, so none of them become dead money.
 */
export function tradeCharges(deal: Deal | null, date: string): { thisYear: number; nextYear: number } {
  if (!deal) return { thisYear: 0, nextYear: 0 };
  const year = leagueYear(date);
  const cur = dealYear(deal, year);
  let paid = 0;
  if (cur && !cur.void) {
    const weeks = cur.weeks ?? REG_WEEKS;
    const paidWeeks = Math.max(0, Math.min(weeks, weeksPaid(date) - (REG_WEEKS - weeks)));
    paid = (cur.base * paidWeeks) / REG_WEEKS + (date >= leagueYearStart(year) ? cur.bonus : 0);
  }
  const later = deal.years.filter((y) => y.year > year).reduce((s, y) => s + y.proration, 0);
  const split = isPostJune1(date);
  return {
    thisYear: Math.round(paid + (cur?.proration ?? 0) + (split ? 0 : later)),
    nextYear: Math.round(split ? later : 0),
  };
}

/**
 * The contract a team takes on in a trade: the rest of the salary and its
 * guarantees, no bonus proration, and only the weeks left this season. The
 * headline numbers stay those of the original deal.
 */
export function tradedDeal(deal: Deal, team: string, date: string): Deal {
  const year = leagueYear(date);
  const weeks = Math.max(1, REG_WEEKS - weeksPaid(date));
  const years = deal.years.filter((y) => y.year >= year && !y.void).map((y) => {
    const next: DealYear = { ...y, proration: 0 };
    if (y.year === year) {
      if (date >= leagueYearStart(year)) next.bonus = Math.min(0, y.bonus);
      next.weeks = Math.min(y.weeks ?? REG_WEEKS, weeks);
      if (next.weeks >= REG_WEEKS) delete next.weeks;
    }
    return next;
  });
  return { ...deal, team, years, ...(deal.fifthYearOption ? { fifthYearOption: { ...deal.fifthYearOption } } : {}) };
}

/** A one-year tender or tag: the whole amount is base salary. Tags are fully guaranteed once signed. */
export function writeOneYear(team: string, date: string, kind: DealKind, amount: number): Deal {
  const year = date >= leagueYearStart(Number(date.slice(0, 4))) ? leagueYear(date) : leagueYear(date) + 1;
  const guaranteed = kind === "franchise" || kind === "transition" ? amount : 0;
  return {
    team, signed: date, kind, signingBonus: 0, total: amount, apy: amount, guaranteedAtSigning: guaranteed,
    years: [{ year, base: amount, proration: 0, bonus: 0, guaranteed, injuryGuaranteed: 0 }],
  };
}

/**
 * A tag or tender added to a player's current contract for next league year.
 * The years already played stay for the cap's history; any void years are
 * dropped, and their proration is returned so it can be charged as dead money.
 */
export function addOneYear(current: Deal | null, team: string, date: string, kind: DealKind, amount: number, year: number): { deal: Deal; voided: number } {
  const keep = (current?.years ?? []).filter((y) => y.year < year && !y.void).map((y) => ({ ...y }));
  const voided = (current?.years ?? []).filter((y) => y.void && y.year >= year).reduce((s, y) => s + y.proration, 0);
  const one = writeOneYear(team, date, kind, amount);
  one.years = [...keep, { ...one.years[0], year }];
  return { deal: one, voided };
}

/** Void years reached at the new league year: their proration lands as dead money. */
export function voidedProration(deal: Deal, year: number): number {
  const last = lastYear(deal);
  if (last === null || year !== last + 1) return 0;
  return deal.years.filter((y) => y.void).reduce((s, y) => s + y.proration, 0);
}

// ---- Rookie scale ----

/**
 * Slotted rookie contract value for a draft pick: four years, scaled to the cap
 * (the 2025 first pick signed for about 17.5% of that year's cap; the last
 * picks get four years of minimums).
 */
export function rookieScale(pick: number, year: number): { total: number; signingBonus: number; years: number; option: boolean } {
  const cap = projectedCap(year);
  const share = 0.0155 + 0.1595 * Math.exp(-(pick - 1) / 22);
  const total = Math.round((cap * share) / 1000) * 1000;
  const sbShare = 0.04 + 0.62 * Math.exp(-(pick - 1) / 40);
  return { total, signingBonus: Math.round((total * sbShare) / 1000) * 1000, years: 4, option: pick <= 32 };
}
