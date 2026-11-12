// The club's borrowing: a revolving credit facility, term loans negotiated
// with lenders, covenants they test every quarter, and the market rate that
// floating debt and every refinancing are priced on.
//
// NFL clubs borrow under league rules: the league caps how much debt a club
// may carry (reported at around $500 million in recent years, with extra room
// for stadium financing; the figures here are approximations), and lenders
// usually secure club loans with the club's share of league media money or
// with the owner's equity. The lenders below are made up.
//
// Cash below zero is a draw on the credit facility. Past the facility's limit
// the owner has to put money in (the capital call in business.ts).
import { rateLean } from "./economy";
import { addDays, daysBetween, shortDate } from "./dates";
import { business, businessChief, cashBalance, operatingEstimate, post, pnl } from "./business";
import { leagueYear } from "./contracts";
import { money, news, send } from "./inbox";
import { TEAM_BY_ID } from "./league";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { gaussian, rngFor } from "./rng";
import { execBoost } from "./executives";
import { consulting, restatements } from "./treasury";
import { reserved } from "./investors";
import type { CreditFacility, DebtState, GameState, LedgerCat, Loan, LoanKind, LoanOffer, LoanTerms } from "./types";

const M = 1_000_000;

/** The market's base rate when the game starts (a short-term benchmark rate, roughly where it sat in 2026). */
const START_RATE = 0.0375;
/** Where rates drift back to over the years. */
const NEUTRAL_RATE = 0.035;
/** The league's cap on club debt, and the extra room it allows for stadium and facility borrowing (approximate). */
export const LEAGUE_DEBT_LIMIT = 500 * M;
export const STADIUM_DEBT_ROOM = 500 * M;
const DEFAULT_FACILITY: CreditFacility = { lender: "First Keystone Bank", limit: 300 * M, spread: 0.02, commitment: 0.003, matures: "2029-07-31" };

/** Made-up lenders, each with its own appetite. */
interface Lender {
  name: string;
  what: string;
  /** Added to the priced margin. */
  margin: number;
  amort: "amortizing" | "bullet";
  fee: number;
  minCoverage: number;
  maxLeverage: number;
  /** Leverage past which this lender won't lend. */
  walkAway: number;
  maxYears: number;
  security: string;
}

export const LENDERS: Lender[] = [
  { name: "First Keystone Bank", what: "A big commercial bank: the cheapest money, paid down every month, with tight covenants.", margin: -0.0025, amort: "amortizing", fee: 0.0075, minCoverage: 1.75, maxLeverage: 4, walkAway: 4.5, maxYears: 10, security: "First lien on the club's assets" },
  { name: "Meridian Sports Finance", what: "A sports lender that knows how league money flows. Interest only, principal at the end.", margin: -0.001, amort: "bullet", fee: 0.01, minCoverage: 1.5, maxLeverage: 5, walkAway: 5.5, maxYears: 12, security: "Assignment of the club's league media revenue" },
  { name: "Harborline Capital", what: "A private credit fund: expensive, but it lends when banks won't and the covenants are loose.", margin: 0.0125, amort: "bullet", fee: 0.015, minCoverage: 1.15, maxLeverage: 6.5, walkAway: 7, maxYears: 7, security: "Pledge of the owner's equity in the club" },
];

// ---- State ----

export function debt(state: GameState): DebtState {
  return (state.debt ??= newDebt(state));
}

function newDebt(state: GameState): DebtState {
  const bg = state.owner?.background;
  return {
    rates: { [state.date.slice(0, 7)]: START_RATE },
    facility: { ...DEFAULT_FACILITY },
    loans: [],
    offers: [],
    trust: 50 + (bg === "finance" ? 10 : bg === "family" ? 5 : 0),
    tests: [],
    log: [],
  };
}

/** Saves from before borrowing get the old $300 million credit line as a facility. */
export function ensureDebt(state: GameState): void {
  debt(state);
}

// ---- The market rate ----

function nextMonth(m: string): string {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** The base rate this month: it wanders a little each month and drifts back toward normal over the years. */
export function marketRate(state: GameState, month = state.date.slice(0, 7)): number {
  const d = debt(state);
  if (d.rates[month] !== undefined) return d.rates[month];
  const known = Object.keys(d.rates).sort();
  let m = known[known.length - 1];
  if (!m || m > month) return d.rates[known[0]] ?? START_RATE;
  let r = d.rates[m];
  while (m < month) {
    m = nextMonth(m);
    const rng = rngFor(state.seed, `rate:${m}`);
    // The central bank leans against inflation and the cycle.
    r = Math.max(0.005, Math.min(0.08, r + 0.06 * (NEUTRAL_RATE + rateLean(state) - r) + gaussian(rng) * 0.0012));
    r = Math.round(r * 10000) / 10000;
    d.rates[m] = r;
  }
  // Keep five years of history.
  const keys = Object.keys(d.rates).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete d.rates[k];
  return r;
}

export function loanRate(state: GameState, l: LoanTerms & { stepUp?: number }): number {
  return (l.kind === "floating" ? marketRate(state) + l.rate : l.rate) + (l.stepUp ?? 0);
}

export function facilityRate(state: GameState): number {
  return marketRate(state) + debt(state).facility.spread;
}

// ---- What the club owes and can carry ----

export function openLoans(state: GameState): Loan[] {
  return debt(state).loans.filter((l) => !l.repaid && l.balance > 0);
}

export function drawn(state: GameState): number {
  return Math.max(0, -cashBalance(state));
}

/** How far cash can go below zero before the owner has to put money in. */
export function creditLimit(state: GameState): number {
  return debt(state).facility.limit;
}

export function totalDebt(state: GameState): number {
  return openLoans(state).reduce((t, l) => t + l.balance, 0) + drawn(state);
}

/** Debt counted against the league's limit: loan balances and what's drawn on the credit line. */
export function leagueDebt(state: GameState): number {
  return totalDebt(state);
}

function stadiumDebt(state: GameState): number {
  return openLoans(state).filter((l) => l.purpose === "projects").reduce((t, l) => t + l.balance, 0);
}

export function debtRoom(state: GameState, purpose: LoanOffer["purpose"]): number {
  const general = LEAGUE_DEBT_LIMIT - (leagueDebt(state) - stadiumDebt(state));
  return purpose === "projects" ? general + STADIUM_DEBT_ROOM - stadiumDebt(state) : general;
}

/**
 * What lenders count as the club's yearly operating income (before interest):
 * the last twelve months once the owner has a year of books, the public
 * estimate before that.
 */
export function earningsBase(state: GameState): number {
  const since = state.owner?.since ?? state.date;
  if (daysBetween(since, state.date) < 365) return Math.max(20 * M, operatingEstimate(state, state.userTeam));
  const from = addDays(state.date, -365);
  let t = 0;
  for (const e of business(state).ledger) if (e.date > from && OPERATING.has(e.cat)) t += e.amount;
  return t;
}

/** Categories in operating income: everything but owner money, loans, construction, deposits and interest. */
const NOT_OPERATING = new Set<LedgerCat>(["capital", "distribution", "deposits", "projects", "loanIn", "principal", "interest", "loanFees", "escrow", "relocation"]);
const OPERATING = new Set<LedgerCat>((["national", "tickets", "premium", "concessions", "parking", "merch", "sponsorship", "localMedia", "naming", "events", "gatePool", "gateShare", "intl",
  "players", "staff", "staffOwed", "businessOps", "marketing", "gameday", "community", "medical", "facilities", "scouts", "scouting", "stadium", "rent", "debt", "travel", "benefits",
  "league", "fines", "hosting", "bids", "professional", "content", "brand", "venue", "security", "technology", "global"] as LedgerCat[]).filter((c) => !NOT_OPERATING.has(c)));

/** Interest and scheduled principal over the next twelve months (balloon payments at maturity aside). */
export function debtService(state: GameState, extra?: LoanTerms): number {
  let t = drawn(state) * facilityRate(state);
  for (const l of openLoans(state)) {
    t += l.balance * loanRate(state, l);
    if (l.amort === "amortizing") t += Math.min(l.balance, l.amount / l.years);
  }
  if (extra) t += extra.amount * loanRate(state, extra) + (extra.amort === "amortizing" ? extra.amount / extra.years : 0);
  return t;
}

export function coverage(state: GameState, extra?: LoanTerms): number {
  const ds = debtService(state, extra);
  return ds > 0 ? earningsBase(state) / ds : 99;
}

export function leverage(state: GameState, extraDebt = 0): number {
  const e = earningsBase(state);
  const d = totalDebt(state) + extraDebt;
  return e > 0 ? d / e : d > 0 ? 99 : 0;
}

export function trustWord(t: number): string {
  return t >= 70 ? "Lenders compete for our business" : t >= 55 ? "Good standing with lenders" : t >= 40 ? "Ordinary standing" : t >= 25 ? "Lenders are wary" : "Lenders don't trust us";
}

function changeTrust(state: GameState, delta: number): void {
  const d = debt(state);
  d.trust = Math.max(0, Math.min(90, Math.round(d.trust + delta)));
}

function log(state: GameState, text: string): void {
  debt(state).log.unshift({ date: state.date, text });
  debt(state).log.splice(40);
}

// ---- Term sheets ----

export interface LoanRequest {
  amount: number;
  years: number;
  kind: LoanKind;
  purpose: LoanOffer["purpose"];
  refinances?: string;
}

/** The margin a lender asks: more for a club that's stretched, less for one lenders trust. */
function pricedMargin(state: GameState, lender: Lender, req: LoanRequest, lev: number): number {
  const rng = rngFor(state.seed, `loan:${state.date}:${lender.name}:${req.amount}:${req.years}`);
  let m = 0.015 + 0.0035 * Math.max(0, lev - 1) + (50 - debt(state).trust) * 0.0002 + lender.margin + (rng() - 0.5) * 0.003;
  // Longer money costs a little more.
  m += Math.max(0, req.years - 5) * 0.0005;
  // A good CFO shops the deal harder and presents the club better.
  m -= execBoost(state, "CFO") * 0.002;
  return Math.max(0.006, Math.round(m * 10000) / 10000);
}

/** Lenders' answers to a request: term sheets from the ones willing to lend, or the reason none are. */
export function requestLoan(state: GameState, req: LoanRequest): string {
  const d = debt(state);
  const amount = Math.round(req.amount / M) * M;
  if (amount < 25 * M) return "Lenders won't paper a club loan under $25 million.";
  const refi = req.refinances ? d.loans.find((l) => l.id === req.refinances && !l.repaid) : undefined;
  const room = debtRoom(state, req.purpose) + (refi?.balance ?? 0);
  if (amount > room) return `That would put us over the league's debt limit. We have room for about ${money(Math.max(0, room))}.`;
  const lev = leverage(state, amount - (refi?.balance ?? 0));
  d.offers = d.offers.filter((o) => o.purpose !== req.purpose || o.refinances !== req.refinances);
  const made: LoanOffer[] = [];
  for (const lender of LENDERS) {
    if (lev > lender.walkAway) continue;
    const years = Math.min(req.years, lender.maxYears);
    // Financing advisers (treasury.ts) shave a little off every quote; a restated year adds to it.
    const margin = pricedMargin(state, lender, { ...req, years }, lev) - (consulting(state, "financing") ? 0.0015 : 0) + restatements(state) * 0.001;
    // Fixed money is priced off the market rate plus a term premium.
    const rate = req.kind === "fixed" ? Math.round((marketRate(state) + margin + 0.002 + years * 0.0004) * 10000) / 10000 : margin;
    const offer: LoanOffer = {
      id: `${state.date}:${lender.name}:${req.purpose}`, date: state.date, expires: addDays(state.date, 14), purpose: req.purpose, refinances: refi?.id,
      lender: lender.name, amount, years, kind: req.kind, rate, amort: lender.amort, fee: lender.fee,
      minCoverage: lender.minCoverage, maxLeverage: lender.maxLeverage, security: lender.security,
    };
    // A lender won't sign up to covenants the club would break on day one.
    if (coverage(state, offer) < lender.minCoverage * 1.05 && !refi) continue;
    made.push(offer);
  }
  d.offers.push(...made);
  if (!made.length) {
    return lev > 5 ? `No lender will go that far: it would put our debt at ${lev.toFixed(1)} times what the club earns in a year.`
      : "Lenders passed: the club's earnings don't cover the payments with enough room to spare.";
  }
  return `${made.length} term sheet${made.length > 1 ? "s" : ""} in. They're good for two weeks.`;
}

/** Push a lender for better terms, once: it may sharpen the price, hold firm, or walk. */
export function pushLender(state: GameState, id: string): string {
  const d = debt(state);
  const o = d.offers.find((x) => x.id === id);
  if (!o) return "That offer is gone.";
  if (o.pushed) return `${o.lender} already gave us their best.`;
  o.pushed = true;
  const r = rngFor(state.seed, `push:${id}`)() + (d.trust - 50) / 200;
  if (r < 0.15) {
    d.offers = d.offers.filter((x) => x !== o);
    changeTrust(state, -1);
    return `${o.lender} pulled the offer. "We were already sharp on that one."`;
  }
  if (r < 0.45) return `${o.lender} held firm on the price.`;
  const cut = r > 0.85 ? 0.003 : 0.0015;
  o.rate = Math.round((o.rate - cut) * 10000) / 10000;
  o.fee = Math.max(0.005, Math.round((o.fee - 0.0025) * 10000) / 10000);
  return `${o.lender} came down ${Math.round(cut * 10000)} basis points and trimmed the fee.`;
}

export function acceptLoan(state: GameState, id: string): string | null {
  const d = debt(state);
  const o = d.offers.find((x) => x.id === id);
  if (!o) return "That offer is gone.";
  if (o.expires < state.date) return "That offer expired.";
  const refi = o.refinances ? d.loans.find((l) => l.id === o.refinances && !l.repaid) : undefined;
  if (o.amount > debtRoom(state, o.purpose) + (refi?.balance ?? 0)) return "That would put us over the league's debt limit.";
  // Big new borrowing is a reserved matter for the ownership group's board (refinancing isn't new debt).
  const board = refi ? null : reserved(state, "debt", o.amount, `Borrowing ${money(o.amount)} from ${o.lender}`);
  if (board) return board;
  const loan: Loan = {
    ...o, id: `L${d.loans.length + 1}-${state.date}`, start: state.date, maturity: addDays(state.date, Math.round(o.years * 365.25)),
    balance: o.amount, stepUp: 0, breaches: 0, purpose: o.purpose,
  };
  delete (loan as Partial<LoanOffer>).expires;
  delete (loan as Partial<LoanOffer>).pushed;
  delete (loan as Partial<LoanOffer>).date;
  delete (loan as Partial<LoanOffer>).refinances;
  d.loans.push(loan);
  d.offers = d.offers.filter((x) => x.purpose !== o.purpose || x.refinances !== o.refinances);
  post(state, "loanIn", o.amount, `${o.lender}, ${o.years}-year ${o.kind} loan`);
  post(state, "loanFees", -o.amount * o.fee, `${o.lender}: arrangement fee`);
  post(state, "professional", -0.25 * M, `Lawyers on the ${o.lender} loan`);
  if (refi) payOff(state, refi, "Refinanced");
  log(state, `Borrowed ${money(o.amount)} from ${o.lender} (${o.kind}, ${o.years} years${refi ? `, refinancing ${refi.lender}` : ""}).`);
  if (o.amount >= 150 * M) news(state, `${TEAM_BY_ID[state.userTeam].name} close a ${money(o.amount)} loan with ${o.lender}`);
  return null;
}

function payOff(state: GameState, l: Loan, why: string): void {
  if (l.balance > 0) post(state, "principal", -l.balance, `${why}: ${l.lender}`);
  l.balance = 0;
  l.repaid = state.date;
  delete l.accelerated;
}

/** Pay a loan down early from cash. Fixed-rate lenders charge 1% of what's prepaid for the broken rate. */
export function prepay(state: GameState, id: string, amount: number): string | null {
  const l = openLoans(state).find((x) => x.id === id);
  if (!l) return "That loan is paid off.";
  const pay = Math.min(l.balance, Math.round(amount));
  if (cashBalance(state) - pay < 0) return "We don't have that much cash; drawing the credit line to repay a loan doesn't help.";
  post(state, "principal", -pay, `Early repayment: ${l.lender}`);
  if (l.kind === "fixed") post(state, "loanFees", -pay * 0.01, `${l.lender}: prepayment charge`);
  l.balance -= pay;
  if (l.balance <= 0) {
    l.repaid = state.date;
    log(state, `Paid off the ${l.lender} loan early.`);
  }
  return null;
}

/** Ask the facility's bank for a bigger or smaller line. A bigger one costs a fee and needs room under the league limit. */
export function resizeFacility(state: GameState, limit: number): string | null {
  const d = debt(state);
  const f = d.facility;
  limit = Math.max(50 * M, Math.min(600 * M, Math.round(limit / (25 * M)) * 25 * M));
  if (limit === f.limit) return null;
  if (limit < drawn(state)) return `We've drawn ${money(drawn(state))}; the line can't be smaller than that.`;
  if (limit > f.limit) {
    if (leverage(state) > 4.5) return `${f.lender} won't raise the line while our debt is this high against earnings.`;
    post(state, "loanFees", -(limit - f.limit) * 0.0025, `${f.lender}: fee on the larger credit line`);
  }
  log(state, `Credit line ${limit > f.limit ? "raised" : "cut"} to ${money(limit)}.`);
  f.limit = limit;
  return null;
}

// ---- Every month and every quarter ----

/** Monthly interest and principal, the credit line's interest and the fee on its unused part (from business.ts on the 1st). */
export function serviceDebt(state: GameState): void {
  const d = debt(state);
  marketRate(state);
  for (const l of openLoans(state)) {
    const rate = loanRate(state, l);
    post(state, "interest", -l.balance * rate / 12, `${l.lender} at ${(rate * 100).toFixed(2)}%`);
    if (l.amort === "amortizing") {
      const pay = Math.min(l.balance, Math.round(l.amount / (l.years * 12)));
      post(state, "principal", -pay, `Scheduled principal: ${l.lender}`);
      l.balance -= pay;
      if (l.balance <= 0) l.repaid = state.date;
    }
  }
  const used = drawn(state);
  if (used > 0) post(state, "interest", -used * facilityRate(state) / 12, `${money(used)} drawn on the credit line at ${(facilityRate(state) * 100).toFixed(2)}%`);
  const unused = Math.max(0, d.facility.limit - used);
  if (unused > 0) post(state, "loanFees", -unused * d.facility.commitment / 12, `${d.facility.lender}: fee on the unused credit line`);
}

/** Each loan's covenants, checked at the start of every quarter. */
function testCovenants(state: GameState): void {
  const d = debt(state);
  const cov = coverage(state);
  const lev = leverage(state);
  const chief = businessChief(state);
  for (const l of openLoans(state)) {
    const ok = cov >= l.minCoverage && lev <= l.maxLeverage;
    d.tests.unshift({ date: state.date, loan: l.id, coverage: Math.round(cov * 100) / 100, leverage: Math.round(lev * 100) / 100, ok });
    if (ok) {
      if (l.breaches) log(state, `Back in compliance with ${l.lender}.`);
      l.breaches = 0;
      changeTrust(state, 1);
      continue;
    }
    l.breaches++;
    const what = cov < l.minCoverage ? `earnings cover debt service only ${cov.toFixed(2)} times (the loan requires ${l.minCoverage})` : `debt is ${lev.toFixed(1)} times earnings (the loan allows ${l.maxLeverage})`;
    if (l.breaches === 1) {
      // The usual first answer: a waiver, for a fee and a higher rate, and no money out to the owner until it's fixed.
      post(state, "loanFees", -l.balance * 0.0025, `${l.lender}: covenant waiver`);
      l.stepUp += 0.005;
      changeTrust(state, -8);
      log(state, `Broke a covenant with ${l.lender}: ${what}. Waived for a fee and half a point more interest.`);
      send(state, "business", chief, `We broke a covenant with ${l.lender}`,
        `At the quarter's test, ${what}. ${l.lender} waived it this time, for a fee of ${money(l.balance * 0.0025)} and another half point of interest. ` +
        "Until we pass a test again, no money can go out to you. If we miss the next one, they can call the loan.");
    } else if (!l.accelerated) {
      l.accelerated = addDays(state.date, 90);
      changeTrust(state, -15);
      log(state, `${l.lender} called the loan: ${money(l.balance)} due ${shortDate(l.accelerated)}.`);
      send(state, "business", chief, `${l.lender} has called the loan`,
        `We missed a second covenant test in a row (${what}). ${l.lender} wants the ${money(l.balance)} balance repaid by ${shortDate(l.accelerated)}. ` +
        "Other lenders have sent refinancing terms; otherwise the money comes out of our cash, then the credit line, then your pocket.");
      requestLoan(state, { amount: l.balance, years: 5, kind: "floating", purpose: "refinance", refinances: l.id });
      addStory(state, {
        outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [state.userTeam],
        headline: `Lender calls a ${TEAM_BY_ID[state.userTeam].name} loan`,
        body: `${l.lender} has demanded repayment of about ${money(l.balance)} after the club missed its loan covenants twice, people familiar with the matter say. Such defaults are rare in the NFL, where the league watches club debt closely.`,
      });
    }
  }
  d.tests.splice(40);
}

/** True while a lender's covenant breach bars money going out to the owner. */
export function distributionsBlocked(state: GameState): boolean {
  // Under league supervision (shocks.ts) nothing goes out to the owner until the recovery plan is met.
  return openLoans(state).some((l) => l.breaches > 0 || l.accelerated) || state.shocks?.distress?.stage === "supervised";
}

export function debtDaily(state: GameState): void {
  const d = debt(state);
  const chief = businessChief(state);
  d.offers = d.offers.filter((o) => o.expires >= state.date);
  for (const l of openLoans(state)) {
    const due = l.accelerated && l.accelerated < l.maturity ? l.accelerated : l.maturity;
    if (state.date >= due) {
      payOff(state, l, l.accelerated ? "Called loan repaid" : "Maturity");
      log(state, `Repaid ${l.lender} at ${l.accelerated ? "the lender's demand" : "maturity"}.`);
      continue;
    }
    // Four months out, lenders line up to refinance a maturing loan.
    if (daysBetween(state.date, l.maturity) === 120 && l.amort === "bullet") {
      requestLoan(state, { amount: l.balance, years: l.years, kind: l.kind, purpose: "refinance", refinances: l.id });
      send(state, "business", chief, `The ${l.lender} loan comes due ${shortDate(l.maturity)}`,
        `${money(l.balance)} is due at maturity. Refinancing terms are on the Financing page at today's rates (the market rate is ${(marketRate(state) * 100).toFixed(2)}%). ` +
        "If we do nothing, it's paid from cash and the credit line.");
    }
  }
  // The facility renews for three more years at whatever the bank thinks of us then.
  if (state.date >= d.facility.matures) {
    const lev = leverage(state);
    const before = d.facility.spread;
    d.facility.spread = Math.round((0.0175 + Math.max(0, lev - 2) * 0.0025 + (50 - d.trust) * 0.0001) * 10000) / 10000;
    d.facility.matures = addDays(d.facility.matures, 365 * 3);
    post(state, "loanFees", -d.facility.limit * 0.002, `${d.facility.lender}: credit line renewal`);
    send(state, "business", chief, "The credit line is renewed",
      `${d.facility.lender} renewed our ${money(d.facility.limit)} line through ${shortDate(d.facility.matures)} at ${(d.facility.spread * 100).toFixed(2)} points over the market rate` +
      (d.facility.spread > before ? ", up from before." : d.facility.spread < before ? ", better than before." : "."));
  }
  if (state.date.slice(8) === "01" && ["01", "04", "07", "10"].includes(state.date.slice(5, 7)) && openLoans(state).length) testCovenants(state);
  if (state.date.slice(8) === "01") liquidityWatch(state);
}

/** Warns when the next three months look likely to run through the credit line. */
function liquidityWatch(state: GameState): void {
  const plan = state.books?.plan[leagueYear(state.date)];
  if (!plan) return;
  const monthly = Object.entries(plan).reduce((t, [c, v]) => t + (NOT_OPERATING.has(c as LedgerCat) ? 0 : v ?? 0), 0) / 12;
  let due = 0;
  for (const l of openLoans(state)) {
    const end = l.accelerated ?? l.maturity;
    if (daysBetween(state.date, end) <= 90) due += l.balance;
  }
  const ahead = cashBalance(state) + Math.min(0, monthly) * 3 - due - debtService(state) / 4;
  if (ahead >= -creditLimit(state) * 0.9) return;
  const recent = debt(state).log[0];
  if (recent && recent.text.startsWith("Cash warning") && daysBetween(recent.date, state.date) < 60) return;
  log(state, `Cash warning: about ${money(ahead)} in three months.`);
  send(state, "business", businessChief(state), "We're heading for the end of the credit line",
    `On our budget, cash will be around ${money(ahead)} in three months against a ${money(creditLimit(state))} credit line${due ? `, with ${money(due)} of loans coming due` : ""}. ` +
    "We can borrow (Business, Financing), cut department budgets, or you can put money in. If we do nothing, a capital call is coming.");
}

/** How much more interest a year if rates rise, and the fixed loans that will have to refinance in the next three years. */
export function rateExposure(state: GameState): { floating: number; plus1: number; plus2: number; refinancing: { lender: string; balance: number; date: string; now: number; then: number }[] } {
  const floating = openLoans(state).filter((l) => l.kind === "floating").reduce((t, l) => t + l.balance, 0) + drawn(state);
  const refinancing = openLoans(state).filter((l) => l.kind === "fixed" && l.amort === "bullet" && daysBetween(state.date, l.maturity) <= 3 * 365)
    .map((l) => ({ lender: l.lender, balance: l.balance, date: l.maturity, now: l.rate, then: marketRate(state) + 0.02 }));
  return { floating, plus1: floating * 0.01, plus2: floating * 0.02, refinancing };
}

/** Capital calls cost the club standing with lenders. */
export function noteCapitalCall(state: GameState): void {
  changeTrust(state, -6);
  log(state, "Capital call: the owner covered cash past the credit line.");
}

/** A loan taken on to buy the club (the leveraged takeover). It's on the books from day one; the money went to the seller. */
export function acquisitionLoan(state: GameState, amount: number): void {
  const d = debt(state);
  d.loans.push({
    id: `L0-${state.date}`, lender: "Meridian Sports Finance", amount, years: 7, kind: "floating", rate: 0.025, amort: "bullet", fee: 0.01,
    minCoverage: 1.5, maxLeverage: 5, security: "Assignment of the club's league media revenue",
    start: state.date, maturity: addDays(state.date, Math.round(7 * 365.25)), balance: amount, stepUp: 0, breaches: 0, purpose: "Acquisition financing",
  });
  log(state, `Took over the club with ${money(amount)} of acquisition debt from Meridian Sports Finance.`);
}

/**
 * A stadium construction loan: 30 years, fixed, secured on the building's
 * revenue. It counts against the stadium room above the league's debt limit.
 */
export function stadiumLoan(state: GameState, amount: number): string | null {
  const room = debtRoom(state, "projects");
  if (amount > room) return `The league's debt rules leave room for about ${money(Math.max(0, room))} of stadium debt.`;
  const d = debt(state);
  const rate = Math.round((marketRate(state) + 0.017) * 10000) / 10000;
  const terms = { lender: "Sterling Municipal & Stadium Capital", amount, years: 30, kind: "fixed" as const, rate, amort: "amortizing" as const, fee: 0.0075, minCoverage: 1.25, maxLeverage: 6, security: "The new stadium's revenue" };
  if (coverage(state, terms) < 1.3) return "Lenders passed: the club's earnings don't cover a loan that size with room to spare.";
  d.loans.push({ ...terms, id: `LS-${state.date}`, start: state.date, maturity: addDays(state.date, Math.round(30 * 365.25)), balance: amount, stepUp: 0, breaches: 0, purpose: "projects" });
  post(state, "loanIn", amount, "Stadium construction loan");
  post(state, "loanFees", -amount * terms.fee, "Stadium loan: arrangement fee");
  log(state, `Borrowed ${money(amount)} for the new stadium (30-year fixed at ${(rate * 100).toFixed(2)}%).`);
  return null;
}

/** The league's stadium program: a low-rate loan repaid from the club's share of premium-seat revenue. */
export function leagueStadiumLoan(state: GameState, amount: number): void {
  const d = debt(state);
  d.loans.push({
    lender: "League stadium program", amount, years: 25, kind: "fixed", rate: 0.03, amort: "amortizing", fee: 0, minCoverage: 1, maxLeverage: 8,
    security: "The club's share of premium-seating revenue", id: `LG-${state.date}`, start: state.date, maturity: addDays(state.date, Math.round(25 * 365.25)),
    balance: amount, stepUp: 0, breaches: 0, purpose: "League stadium program",
  });
  post(state, "loanIn", amount, "League stadium program loan");
  log(state, `The league's stadium program lent ${money(amount)}.`);
}

/** The year's interest on the club's debt as pnl() sees it, for the statements. */
export function interestCost(state: GameState, year: number): number {
  const p = pnl(state, year);
  return -(p.interest ?? 0);
}
