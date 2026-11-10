// The club's accounting: the statements an owner reads, the budget the
// business office plans the year with, and the forecast for the years ahead.
//
// The ledger in business.ts is the club's bank account, one line per
// payment. From it and the contracts, projects and loans, the books build:
// - an income statement on the accrual basis: a signing bonus is paid in
//   cash on signing but counted over the contract's years (as the cap counts
//   it), season-ticket deposits count when the games are played, and
//   stadium and facility projects are written off over their useful lives;
// - a balance sheet: what the club owns, what it owes, and the owner's stake;
// - a cash-flow statement that splits operating cash from construction
//   (investing) and from loans and the owner's money (financing), and
//   reconciles to the bank;
// - the approved budget for the league year against what actually happened,
//   and a five- to twenty-year forecast with a range around it.
// The league year (mid-March to mid-March) is the fiscal year. When it ends
// the books close, the auditors sign off, the owner pays tax on the club's
// income (ownership.ts) and next year's budget is approved.
import { FORMAT } from "./format";
import { late } from "./late";
import { business, businessChief, cashBalance, CATEGORY, deferredRevenue, FINANCING, inflation, operatingEstimate, pnl, post, revenueEstimate, yearPlan } from "./business";
import { dealOf, dealYear, leagueYear, leagueYearStart, salaryCap } from "./contracts";
import { addDays, daysBetween } from "./dates";
import { coverage, debt, debtService, drawn, facilityRate, leverage, loanRate, openLoans, totalDebt } from "./debt";
import { cashOwedThisYear, cashNextYear } from "./finance";
import { money, send } from "./inbox";
import { RULES, SCHEDULE, TEAMS } from "./league";
import { closeOwnerYear, equityAtPurchase, owner } from "./ownership";
import { PROJECT_BY_ID } from "./projects";
import type { BooksState, GameState, LedgerCat, YearClose } from "./types";

const M = 1_000_000;

export function books(state: GameState): BooksState {
  if (state.books) return state.books;
  state.books = { year: leagueYear(state.date), plan: {}, closed: [], reserveMonths: 2 };
  approvePlan(state, state.books.year);
  return state.books;
}

/** Saves from before the books get a budget for this league year, made today. */
export function ensureBooks(state: GameState): void {
  books(state);
}

/** Construction, loans and the owner's money: not operating cash. */
const INVESTING: LedgerCat[] = ["projects", "escrow"];
const FINANCING_CASH: LedgerCat[] = ["capital", "distribution", "loanIn", "principal", "loanFees"];
const BORROWING: LedgerCat[] = ["interest", "loanFees"];

function isRevenue(cat: LedgerCat): boolean {
  return !FINANCING.includes(cat) && !BORROWING.includes(cat) && (CATEGORY[cat].side === "in" || cat === "gateShare");
}
function isExpense(cat: LedgerCat): boolean {
  return !FINANCING.includes(cat) && !BORROWING.includes(cat) && CATEGORY[cat].side === "out" && cat !== "gateShare";
}

// ---- The budget ----

/** Regular-season paychecks still to come this league year. */
function weeksLeft(state: GameState): number {
  const k = RULES.keyDates;
  if (leagueYear(state.date) !== RULES.season) return FORMAT.weeks;
  if (state.date < k.regularSeasonStart) return FORMAT.weeks;
  return Math.max(0, FORMAT.weeks - Math.ceil(daysBetween(k.regularSeasonStart, state.date) / 7));
}

/** Player cash planned for a league year: what's been paid, what the contracts still owe, and room for the signings to come in the spring. */
function playerPlan(state: GameState, year: number): number {
  const us = state.userTeam;
  const now = leagueYear(state.date);
  if (year === now) {
    // Paid so far (the ledger has the bonuses paid before the takeover too) and the paychecks to come.
    const paid = -business(state).ledger.filter((e) => e.year === year && e.cat === "players").reduce((t, e) => t + e.amount, 0);
    const known = paid + cashOwedThisYear(state, us, weeksLeft(state));
    const spring = state.date < addDays(leagueYearStart(year), 75);
    return -Math.round(spring ? Math.max(known, salaryCap(state, year) * 0.92) : known);
  }
  // Later years follow how this club actually spends against the cap, drifting toward the 92% a club
  // needs to stay clear of the four-year cash floor, instead of assuming every club spends to the cap.
  const thisYear = -playerPlan(state, now);
  const ratio = Math.max(0.85, Math.min(1, thisYear / salaryCap(state, now)));
  const toward = (n: number) => ratio + (0.92 - ratio) * Math.min(1, n / 4);
  if (year === now + 1) return -Math.round(Math.max(cashNextYear(state, us), salaryCap(state, year) * toward(1)));
  return -Math.round(salaryCap(state, year) * toward(year - now));
}

/** Interest and principal planned for a league year from the loans on the books, at today's rates. */
function debtPlan(state: GameState, year: number): { interest: number; principal: number; fees: number } {
  let interest = 0;
  let principal = 0;
  for (const l of openLoans(state)) {
    const bal = balanceAt(state, l, year);
    interest -= bal * loanRate(state, l);
    if (l.amort === "amortizing") principal -= Math.min(bal, l.amount / l.years);
    else if (leagueYear(l.maturity) === year) principal -= bal;
  }
  const f = debt(state).facility;
  const fees = -Math.max(0, f.limit - drawn(state)) * f.commitment;
  interest -= drawn(state) * facilityRate(state);
  return { interest, principal, fees };
}

/** A loan's balance at the start of a later league year, on its schedule. */
function balanceAt(state: GameState, l: ReturnType<typeof openLoans>[number], year: number): number {
  const now = leagueYear(state.date);
  if (year <= now) return l.balance;
  if (leagueYear(l.maturity) < year) return 0;
  if (l.amort === "bullet") return l.balance;
  return Math.max(0, l.balance - (year - now) * l.amount / l.years);
}

/** Every category planned for a league year. */
export function planFor(state: GameState, year: number): Partial<Record<LedgerCat, number>> {
  const plan = yearPlan(state, year);
  plan.players = playerPlan(state, year);
  const d = debtPlan(state, year);
  if (d.interest) plan.interest = Math.round(d.interest);
  if (d.principal) plan.principal = Math.round(d.principal);
  if (d.fees) plan.loanFees = Math.round(d.fees);
  plan.professional = -Math.round(0.6 * M * inflation(year));
  for (const k of Object.keys(plan) as LedgerCat[]) plan[k] = Math.round(plan[k]!);
  return plan;
}

/** The business office's budget for the league year, approved on the first day of it (or the day the owner takes over). */
export function approvePlan(state: GameState, year: number): void {
  const b = books(state);
  b.plan[year] = planFor(state, year);
  for (const y of Object.keys(b.plan).map(Number)) if (y < year - 2) delete b.plan[y];
}

export function planTotals(plan: Partial<Record<LedgerCat, number>>): { revenue: number; expenses: number; operating: number } {
  let revenue = 0;
  let expenses = 0;
  for (const [c, v] of Object.entries(plan) as [LedgerCat, number][]) {
    if (isRevenue(c)) revenue += v;
    else if (isExpense(c)) expenses -= v;
  }
  return { revenue, expenses, operating: revenue - expenses };
}

/** Monthly lines (league money, sponsors, staff, departments, the building, the bank): one twelfth each month. */
const MONTHLY = new Set<LedgerCat>(["national", "sponsorship", "localMedia", "naming", "staff", "staffOwed", "businessOps", "marketing", "community", "medical", "facilities", "scouts",
  "benefits", "league", "stadium", "rent", "debt", "interest", "loanFees", "content", "security", "technology"]);
/** Game lines: earned or spent as the preseason and regular season are played. */
const GAMES = new Set<LedgerCat>(["tickets", "premium", "concessions", "parking", "merch", "gateShare", "gatePool", "gameday", "travel", "intl"]);

/** How much of a category's year should be behind us by today. */
export function elapsedShare(state: GameState, cat: LedgerCat, year: number): number {
  const now = leagueYear(state.date);
  if (year < now) return 1;
  if (year > now) return 0;
  const start = leagueYearStart(year);
  if (MONTHLY.has(cat)) {
    // Monthly items post on the 1st, from the first 1st after the league year opens.
    let n = 0;
    for (let m = 1; m <= 12; m++) {
      const d = new Date(`${start.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + m);
      if (d.toISOString().slice(0, 10) <= state.date) n++;
    }
    return n / 12;
  }
  if (GAMES.has(cat) || cat === "players") {
    const us = state.userTeam;
    const games = SCHEDULE.filter((g) => (g.home === us || g.away === us) && (g.type === "PRE" || g.type === "REG"));
    const played = games.filter((g) => g.date < state.date || (g.date === state.date && state.results[g.id])).length;
    const share = games.length ? played / games.length : 0;
    // Players: the spring's bonuses, then paychecks through the season.
    return cat === "players" ? 0.3 + 0.7 * (1 - weeksLeft(state) / FORMAT.weeks) : share;
  }
  return Math.min(1, daysBetween(start, state.date) / 365);
}

export interface VarianceRow {
  cat: LedgerCat;
  plan: number;
  toDate: number;
  actual: number;
  /** Actual less plan to date: positive is better than planned. */
  variance: number;
  /** Actual so far plus the rest of the plan. */
  projected: number;
}

export function budgetVsActual(state: GameState, year: number): VarianceRow[] {
  const plan = books(state).plan[year] ?? {};
  const actual = new Map<LedgerCat, number>();
  for (const e of business(state).ledger) if (e.year === year) actual.set(e.cat, (actual.get(e.cat) ?? 0) + e.amount);
  const cats = new Set<LedgerCat>([...Object.keys(plan) as LedgerCat[], ...actual.keys()]);
  const order = Object.keys(CATEGORY) as LedgerCat[];
  return order.filter((c) => cats.has(c)).map((cat) => {
    const p = plan[cat] ?? 0;
    const share = elapsedShare(state, cat, year);
    const toDate = Math.round(p * share);
    const a = actual.get(cat) ?? 0;
    return { cat, plan: p, toDate, actual: a, variance: a - toDate, projected: Math.round(a + p * (1 - share)) };
  });
}

// ---- Capital assets ----

/** Useful lives: stadium work 25 years, the team's own buildings 15. */
function lifeOf(id: string): number {
  return PROJECT_BY_ID[id]?.stadium ? 25 : 15;
}

/** Built projects at cost and written down, and the ones still under construction. */
export function fixedAssets(state: GameState): { cost: number; accumulated: number; inProgress: number; rows: { id: string; title: string; cost: number; net: number; life: number; opened?: string }[] } {
  let cost = 0;
  let accumulated = 0;
  let inProgress = 0;
  const rows = [];
  for (const p of business(state).projects ?? []) {
    const title = PROJECT_BY_ID[p.id]?.title ?? p.id;
    if (!p.opened) {
      inProgress += p.paid;
      rows.push({ id: p.id, title, cost: p.paid, net: p.paid, life: lifeOf(p.id) });
      continue;
    }
    const years = Math.min(lifeOf(p.id), Math.max(0, daysBetween(p.opens, state.date) / 365));
    const dep = p.cost / lifeOf(p.id) * years;
    cost += p.cost;
    accumulated += dep;
    rows.push({ id: p.id, title, cost: p.cost, net: Math.round(p.cost - dep), life: lifeOf(p.id), opened: p.opens });
  }
  return { cost, accumulated: Math.round(accumulated), inProgress, rows };
}

/** Depreciation charged in a league year (to date for the year in progress). */
export function depreciation(state: GameState, year: number): number {
  const from = leagueYearStart(year);
  const to = year < leagueYear(state.date) ? leagueYearStart(year + 1) : state.date;
  let t = 0;
  for (const p of business(state).projects ?? []) {
    if (!p.opened) continue;
    const start = p.opens > from ? p.opens : from;
    const endLife = addDays(p.opens, Math.round(lifeOf(p.id) * 365));
    const end = endLife < to ? endLife : to;
    if (end > start) t += p.cost / lifeOf(p.id) * daysBetween(start, end) / 365;
  }
  return Math.round(t);
}

// ---- Player contracts on the accrual basis ----

/** Signing bonuses paid in a league year and the bonus proration and dead money charged to it. */
function playerAccruals(state: GameState, year: number): { bonusesPaid: number; charged: number; prepaid: number } {
  const us = state.userTeam;
  let bonusesPaid = 0;
  let charged = 0;
  let prepaid = 0;
  for (const [id, p] of Object.entries(state.players)) {
    if (p.team !== us) continue;
    const deal = dealOf(state, id);
    if (!deal || deal.team !== us) continue;
    if (leagueYear(deal.signed) === year) bonusesPaid += deal.signingBonus;
    charged += dealYear(deal, year)?.proration ?? 0;
    for (const y of deal.years) if (y.year > year) prepaid += y.proration;
  }
  const dead = state.deadMoney[us] ?? {};
  charged += dead[String(year)] ?? 0;
  for (const [y, v] of Object.entries(dead)) if (Number(y) > year) prepaid += v;
  return { bonusesPaid, charged, prepaid };
}

export interface IncomeStatement {
  year: number;
  revenue: number;
  /** Player pay counted the way the cap counts it: salaries plus each year's share of bonuses. */
  players: number;
  playersCash: number;
  otherExpenses: number;
  /** Operating income before depreciation (EBITDA). */
  ebitda: number;
  depreciation: number;
  interest: number;
  net: number;
  /** Operating income on the cash basis, as the ledger shows it. */
  cashOperating: number;
}

export function incomeStatement(state: GameState, year: number): IncomeStatement {
  const p = pnl(state, year);
  const playersCash = p.expenses.find((r) => r.cat === "players")?.amount ?? 0;
  const acc = playerAccruals(state, year);
  // Cash paid less the bonuses still to be earned, plus this year's share of bonuses paid in earlier years.
  const players = Math.round(playersCash + acc.bonusesPaid - acc.charged);
  const otherCost = p.totalExpenses + playersCash;
  const ebitda = p.totalRevenue + players - otherCost;
  const dep = depreciation(state, year);
  return {
    year, revenue: p.totalRevenue, players, playersCash, otherExpenses: -otherCost, ebitda, depreciation: -dep, interest: p.interest,
    net: ebitda - dep + p.interest, cashOperating: p.operating,
  };
}

// ---- The balance sheet ----

export interface BalanceSheet {
  assets: { label: string; amount: number }[];
  liabilities: { label: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  contributed: number;
  retained: number;
}

export function balanceSheet(state: GameState): BalanceSheet {
  const cash = cashBalance(state);
  const fa = fixedAssets(state);
  const acc = playerAccruals(state, leagueYear(state.date));
  const o = owner(state);
  const assets = [
    { label: "Cash", amount: Math.max(0, cash) },
    { label: "Gate-pool share due from the league", amount: Math.round(business(state).pool / TEAMS.length) },
    { label: "Prepaid player bonuses (to be counted in later years)", amount: Math.round(acc.prepaid) },
    { label: "Guaranteed pay funded in escrow with the league", amount: Math.round(state.compliance?.escrow ?? 0) },
    { label: "Construction in progress", amount: fa.inProgress },
    { label: "Stadium and facility improvements, net of depreciation", amount: Math.round(fa.cost - fa.accumulated) },
    { label: "Franchise and league membership, at the purchase price", amount: o.purchase },
  ].filter((a) => a.amount);
  const staffOwed = (state.staff?.owed ?? []).filter((x) => x.team === state.userTeam && x.through >= RULES.season)
    .reduce((t, x) => t + x.salary * (x.through - RULES.season + Math.max(0, 1 - daysBetween(leagueYearStart(RULES.season), state.date) / 365)), 0);
  const liabilities = [
    { label: "Credit line drawn", amount: drawn(state) },
    ...openLoans(state).map((l) => ({ label: `${l.lender} loan (${l.kind}, due ${l.maturity.slice(0, 4)})`, amount: l.balance })),
    { label: "Season-ticket deposits for games not yet played", amount: deferredRevenue(state) },
    { label: "Fired coaches still under contract", amount: Math.round(staffOwed) },
  ].filter((a) => a.amount);
  const totalAssets = assets.reduce((t, a) => t + a.amount, 0);
  const totalLiabilities = liabilities.reduce((t, a) => t + a.amount, 0);
  const equity = totalAssets - totalLiabilities;
  const contributed = equityAtPurchase(state) + o.putIn - o.takenOut;
  return { assets, liabilities, totalAssets, totalLiabilities, equity, contributed, retained: equity - contributed };
}

// ---- Cash flow ----

export interface CashFlow {
  year: number;
  begin: number;
  operating: { cat: LedgerCat; amount: number }[];
  investing: { cat: LedgerCat; amount: number }[];
  financing: { cat: LedgerCat; amount: number }[];
  totals: { operating: number; investing: number; financing: number };
  end: number;
  /** The statement's ending cash matches the bank (the year in progress). */
  reconciled: boolean;
}

export function cashFlow(state: GameState, year: number): CashFlow {
  const b = business(state);
  let begin = b.opening;
  const sums = new Map<LedgerCat, number>();
  let later = 0;
  for (const e of b.ledger) {
    if (e.year < year) begin += e.amount;
    else if (e.year === year) sums.set(e.cat, (sums.get(e.cat) ?? 0) + e.amount);
    else later += e.amount;
  }
  const order = (Object.keys(CATEGORY) as LedgerCat[]).filter((c) => sums.has(c));
  const row = (c: LedgerCat) => ({ cat: c, amount: sums.get(c)! });
  const investing = order.filter((c) => INVESTING.includes(c)).map(row);
  const financing = order.filter((c) => FINANCING_CASH.includes(c)).map(row);
  const operating = order.filter((c) => !INVESTING.includes(c) && !FINANCING_CASH.includes(c)).map(row);
  const sum = (r: { amount: number }[]) => r.reduce((t, x) => t + x.amount, 0);
  const totals = { operating: sum(operating), investing: sum(investing), financing: sum(financing) };
  const end = begin + totals.operating + totals.investing + totals.financing;
  return { year, begin, operating, investing, financing, totals, end, reconciled: Math.abs(end + later - cashBalance(state)) < 1 };
}

// ---- Ratios ----

export function ratios(state: GameState, year: number): { label: string; value: string; league?: string }[] {
  const p = pnl(state, year);
  const rev = p.totalRevenue || 1;
  const share = (cats: LedgerCat[]) => -p.expenses.filter((r) => cats.includes(r.cat)).reduce((t, r) => t + r.amount, 0) / rev;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const margins = TEAMS.map((t) => operatingEstimate(state, t.id) / revenueEstimate(state, t.id)).sort((a, b) => a - b);
  const median = margins[Math.floor(margins.length / 2)];
  const cov = coverage(state);
  return [
    { label: "Operating margin", value: pct(p.operating / rev), league: pct(median) },
    { label: "Player pay (cash) as a share of revenue", value: pct(share(["players"])), league: "about 45-50%" },
    { label: "Coaches, scouts and front office", value: pct(share(["staff", "staffOwed", "scouts", "scouting"])) },
    { label: "Business office, marketing and community", value: pct(share(["businessOps", "marketing", "community", "gameday"])) },
    { label: "Stadium: upkeep, rent and stadium debt", value: pct(share(["stadium", "rent", "debt"])) },
    { label: "Debt-service coverage (earnings over interest and principal)", value: cov >= 99 ? "No debt" : `${cov.toFixed(2)}x` },
    { label: "Debt to a year's earnings", value: `${leverage(state).toFixed(2)}x` },
  ];
}

// ---- The reserve policy ----

/** What the reserve policy keeps on hand: months of operating costs and debt service. */
export function reserveTarget(state: GameState): number {
  const b = books(state);
  const plan = b.plan[leagueYear(state.date)] ?? {};
  const costs = planTotals(plan).expenses;
  return Math.round(b.reserveMonths * (costs + debtService(state)) / 12 / M) * M;
}
/** The year in progress: what's happened plus the rest of the budget. */
export function projectedYear(state: GameState): { revenue: number; operating: number } {
  const full: Partial<Record<LedgerCat, number>> = {};
  for (const r of budgetVsActual(state, leagueYear(state.date))) full[r.cat] = r.projected;
  return planTotals(full);
}
late.reserve = reserveTarget;
late.projected = projectedYear;

export function setReserve(state: GameState, months: number): void {
  books(state).reserveMonths = Math.max(0, Math.min(6, Math.round(months)));
}

// ---- The forecast ----

export interface ForecastYear {
  year: number;
  revenue: number;
  players: number;
  otherCosts: number;
  operating: number;
  capex: number;
  interest: number;
  principal: number;
  /** Cash at the end of the league year: the middle case and the range. */
  cash: number;
  low: number;
  high: number;
  /** Money the low case needs from loans or the owner beyond the credit line. */
  shortfall: number;
}

/**
 * The years ahead on today's contracts, budgets, loans and rates: revenue
 * grows with the league's national money and local prices, players are paid
 * about what the cap allows, and the range widens every year for ticket
 * demand, renewals, construction overruns and rates.
 */
export function forecast(state: GameState, years: number): ForecastYear[] {
  const now = leagueYear(state.date);
  const out: ForecastYear[] = [];
  let cash = cashBalance(state);
  let low = cash;
  let high = cash;
  const limit = debt(state).facility.limit;
  const floating = openLoans(state).filter((l) => l.kind === "floating").reduce((t, l) => t + l.balance, 0);
  const unopened = (business(state).projects ?? []).filter((p) => !p.opened);
  for (let i = 0; i < years; i++) {
    const year = now + i;
    // This year: what's happened plus the rest of the budget; cash moves only by the rest.
    let plan: Partial<Record<LedgerCat, number>> = {};
    let rest: Partial<Record<LedgerCat, number>> = {};
    if (i === 0) {
      for (const r of budgetVsActual(state, year)) {
        plan[r.cat] = r.projected;
        rest[r.cat] = r.projected - r.actual;
      }
    } else plan = rest = planFor(state, year);
    const t = planTotals(plan);
    const r = planTotals(rest);
    const playersAmt = plan.players ?? 0;
    const capex = -unopened.reduce((s, p) => {
      const openYear = leagueYear(p.opens);
      if (year > openYear) return s;
      const left = p.cost - p.paid;
      return s + left / Math.max(1, openYear - now + 1);
    }, 0);
    const interest = (plan.interest ?? 0) + (plan.loanFees ?? 0);
    const principal = plan.principal ?? 0;
    const delta = r.operating + (rest.interest ?? 0) + (rest.loanFees ?? 0) + (rest.principal ?? 0) + capex;
    cash += delta;
    const u = 0.02 + 0.015 * i;
    const rateRisk = floating * Math.min(0.03, 0.005 * (i + 1));
    low += delta - r.revenue * u - rateRisk + capex * 0.15;
    high += delta + r.revenue * u * 0.8;
    out.push({
      year, revenue: Math.round(t.revenue), players: Math.round(playersAmt), otherCosts: Math.round(-(t.expenses + playersAmt)), operating: Math.round(t.operating),
      capex: Math.round(capex), interest: Math.round(interest), principal: Math.round(principal), cash: Math.round(cash), low: Math.round(low), high: Math.round(high),
      shortfall: Math.max(0, Math.round(-low - limit)),
    });
  }
  return out;
}

// ---- Closing the year ----

function closeYear(state: GameState, year: number): YearClose {
  const b = books(state);
  const p = pnl(state, year);
  const inc = incomeStatement(state, year);
  const plan = planTotals(b.plan[year] ?? {});
  // The auditors tie every ledger line to a statement line.
  const lines = business(state).ledger.filter((e) => e.year === year);
  const tied = lines.every((e) => CATEGORY[e.cat] && Number.isFinite(e.amount));
  const cf = cashFlow(state, year);
  const sums = cf.totals.operating + cf.totals.investing + cf.totals.financing;
  const audit = tied && Math.abs(sums - lines.reduce((t, e) => t + e.amount, 0)) < 1 ? "clean" : "qualified";
  const close: YearClose = {
    year, revenue: p.totalRevenue, operating: p.operating, depreciation: -inc.depreciation, interest: -p.interest, net: inc.net,
    cashEnd: cashBalance(state), debtEnd: totalDebt(state), planRevenue: Math.round(plan.revenue), planOperating: Math.round(plan.operating), audit,
  };
  b.closed.push(close);
  b.closed = b.closed.slice(-25);
  return close;
}

export function booksDaily(state: GameState): void {
  const b = books(state);
  const year = leagueYear(state.date);
  if (year <= b.year) return;
  const prev = b.year;
  const c = closeYear(state, prev);
  const tax = closeOwnerYear(state, prev, c.net);
  b.year = year;
  post(state, "professional", -0.6 * M * inflation(year), `Audit of the ${prev} books`);
  approvePlan(state, year);
  const next = planTotals(b.plan[year] ?? {});
  const miss = c.operating - c.planOperating;
  send(state, "business", businessChief(state), `The ${prev} books are closed`,
    `Revenue came in at ${money(c.revenue)} and operating income at ${money(c.operating)}, ${miss >= 0 ? `${money(miss)} better` : `${money(-miss)} worse`} than the budget. ` +
    `On the accrual basis (bonuses spread over contracts, buildings depreciated) the club earned ${money(c.net)}. The auditors gave a ${c.audit} opinion. ` +
    (tax.tax ? `Your share of the taxes on the club's income comes to ${money(tax.tax)}, after writing off ${money(tax.writeOff)} of the purchase price. ` : `No tax is due: the write-off of the purchase price${tax.writeOff ? ` (${money(tax.writeOff)} a year)` : ""} covers the club's income. `) +
    `The ${year} budget plans ${money(next.revenue)} of revenue and ${money(next.operating)} of operating income; it's on the Business page under Plan.`);
}

/** The years' forecasts against what happened. */
export function forecastBias(state: GameState): { year: number; plan: number; actual: number; miss: number }[] {
  return books(state).closed.map((c) => ({ year: c.year, plan: c.planOperating, actual: c.operating, miss: c.operating - c.planOperating }));
}
