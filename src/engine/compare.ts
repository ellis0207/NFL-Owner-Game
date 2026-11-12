// Side-by-side comparisons for the owner's big decisions. Each one lays
// genuinely different options next to each other, with every number worked
// out by the system that owns it: the contract model writes the cash and cap
// years, the ticket office runs its renewal model, the lenders' covenants are
// tested, the coaching market is searched, the projects' effects are priced
// on this year's books. Staff estimates come as ranges, with the assumptions
// they rest on and where the staff disagree, never as a hidden rating.
//
// A comparison also carries a forecast for each option (a number and a low
// to high range) that the cause-and-effect log keeps, so later seasons can be
// held up against what the staff expected.
import { business, cashBalance, setNextSeasonPrices } from "./business";
import { cause } from "./causes";
import { MARKETS } from "./stadiums";
import { canHold, reputation, staff } from "./coaches";
import { candidates } from "./carousel";
import { dealCapHit, leagueYear, leagueYearStart, releaseCharges, salaryCap, writeDeal } from "./contracts";
import { addDays } from "./dates";
import { acceptLoan, coverage, debtService, earningsBase, leverage, loanRate, marketRate } from "./debt";
import { market } from "./freeagency";
import { money } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { winsAdded } from "./outlook";
import { severanceOwed, regard } from "./people";
import { PROJECT_BY_ID, projectTerms, startProject } from "./projects";
import { standings, winPct } from "./standings";
import { planRenewals, tix } from "./ticketing";
import { fanBase } from "./fans";
import { FORMAT } from "./format";
import type { GameState, LoanOffer, OfferTerms, StaffRole } from "./types";

const M = 1_000_000;

/** A staff forecast: the middle case and the range around it. */
export interface Forecast {
  metric: string;
  unit: "wins" | "money" | "holders" | "pct" | "games";
  low: number;
  mid: number;
  high: number;
  /** How directly the decision drives this number, for reading it later. */
  attribution: "direct" | "partial" | "weak";
}

export interface Comparison {
  kind: "signing" | "dismissal" | "renovation" | "tickets" | "financing";
  title: string;
  options: { label: string; note?: string }[];
  /** One cell per option. */
  rows: { label: string; cells: string[] }[];
  assumptions: string[];
  /** Where the staff read it differently. */
  views: { who: string; text: string }[];
  /** One forecast per option. */
  forecasts: Forecast[];
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const range = (f: Forecast, fmt: (n: number) => string) => (f.low === f.high ? fmt(f.mid) : `${fmt(f.low)} to ${fmt(f.high)}`);
const wins = (n: number) => `${n.toFixed(1)} win${n === 1 ? "" : "s"}`;

// ---- Player signing ----

/** Cash and cap by league year for terms, from the contract model. */
function schedule(state: GameState, team: string, id: string, terms: OfferTerms) {
  const first = state.date >= leagueYearStart(leagueYear(state.date)) && state.date < RULES.keyDates.regularSeasonStart ? leagueYear(state.date) : leagueYear(state.date) + (state.date > RULES.keyDates.superBowl ? 1 : 0);
  const deal = writeDeal(terms, { team, date: state.date, kind: "veteran", firstYear: first, yearsExp: PLAYER_BY_ID[id]?.yearsExp ?? 4 });
  const real = deal.years.filter((y) => !y.void);
  const cash = real.map((y, i) => (i === 0 ? terms.signingBonus : 0) + y.base + y.bonus);
  const cap = real.map((y) => dealCapHit(deal, y.year));
  // Cut after one season: what is still owed and what stays on the cap.
  const cut = real.length > 1 ? releaseCharges(deal, leagueYearStart(first + 1)) : null;
  return { deal, first, cash, cap, cut };
}

function roleWords(delta: number): string {
  return delta >= 6 ? "A clear starter" : delta >= 2 ? "Competes to start" : "Depth behind our starters";
}

/** The range of wins added across the coaches', the GM's and the pro scouts' reads. */
function winsRange(state: GameState, id: string): { f: Forecast; views: { who: string; text: string }[]; delta: number } {
  const us = state.userTeam;
  const reads = (["coach", "gm", "pro"] as const).map((w) => ({ who: w, ...winsAdded(state, us, id, w) }));
  const ws = reads.map((r) => r.wins).sort((a, b) => a - b);
  const label = { coach: "The coaches", gm: "The GM", pro: "The pro scouts" };
  const views = reads.map((r) => ({ who: label[r.who], text: `${roleWords(r.delta)}; about ${wins(r.wins)} a season.` }));
  return { f: { metric: `Wins added by ${PLAYER_BY_ID[id]?.name ?? "the player"}`, unit: "wins", low: ws[0], mid: ws[1], high: ws[2], attribution: "weak" }, views, delta: reads[0].delta };
}

/**
 * Compare a signing as proposed with a shorter, cheaper structure, the best
 * other free agent at the position, and passing.
 */
export function signingComparison(state: GameState, id: string, terms: OfferTerms): Comparison {
  const us = state.userTeam;
  const p = PLAYER_BY_ID[id];
  const capNow = salaryCap(state, leagueYear(state.date) + 1);
  const short: OfferTerms = { ...terms, years: Math.max(1, terms.years - 1), total: Math.round((terms.total / terms.years) * 1.08 * Math.max(1, terms.years - 1)), guaranteed: Math.round(terms.guaranteed * 0.7), signingBonus: Math.round(terms.signingBonus * 0.7) };
  const alt = Object.values(market(state))
    .filter((f) => f.status === "open" && f.player !== id && PLAYER_BY_ID[f.player]?.position === p.position)
    .map((f) => ({ f, w: winsAdded(state, us, f.player, "coach").wins }))
    .sort((a, b) => b.w - a.w)[0];
  const altTerms: OfferTerms | null = alt ? { years: Math.max(1, alt.f.askYears), total: Math.round(alt.f.ask * Math.max(1, alt.f.askYears)), signingBonus: Math.round(alt.f.ask * alt.f.askGuarantee * 0.5), guaranteed: Math.round(alt.f.ask * Math.max(1, alt.f.askYears) * alt.f.askGuarantee), injuryGuaranteed: 0, voidYears: 0, shape: "flat" } : null;
  const plans = [
    { label: "Sign as proposed", t: terms, who: id },
    { label: `Shorter deal (${short.years} yr)`, t: short, who: id, note: "Less guaranteed; the agent is less likely to take it." },
    ...(alt && altTerms ? [{ label: `Sign ${PLAYER_BY_ID[alt.f.player].name} instead`, t: altTerms, who: alt.f.player, note: "At his agent's current ask." }] : []),
    { label: "Pass", t: null as OfferTerms | null, who: null as string | null },
  ];
  const sch = plans.map((o) => (o.t && o.who ? schedule(state, us, o.who, o.t) : null));
  const read = plans.map((o) => (o.who ? winsRange(state, o.who) : null));
  const years = Math.max(...sch.map((s) => s?.cash.length ?? 0));
  const rows: Comparison["rows"] = [
    { label: "Average a year", cells: plans.map((o) => (o.t ? money(o.t.total / o.t.years) : "-")) },
    { label: "Share of next year's cap", cells: sch.map((s) => (s ? `${((s.cap[0] / capNow) * 100).toFixed(1)}%` : "-")) },
    { label: "Guaranteed", cells: plans.map((o) => (o.t ? money(o.t.guaranteed) : "-")) },
  ];
  for (let i = 0; i < Math.min(years, 4); i++) {
    const yr = sch.find((s) => s)?.first ?? leagueYear(state.date);
    rows.push({ label: `Cash ${yr + i}`, cells: sch.map((s) => (s && s.cash[i] !== undefined ? money(s.cash[i]) : "-")) });
    rows.push({ label: `Cap hit ${yr + i}`, cells: sch.map((s) => (s && s.cap[i] !== undefined ? money(s.cap[i]) : "-")) });
  }
  rows.push({ label: "If cut after one season", cells: sch.map((s) => (s?.cut ? `${money(s.cut.cashOwed)} owed, ${money(s.cut.thisYear + s.cut.nextYear)} dead` : s ? "Deal ends" : "-")) });
  rows.push({ label: "Roster role (coaches)", cells: read.map((r) => (r ? roleWords(r.delta) : "No change")) });
  rows.push({ label: "Wins a season (staff range)", cells: read.map((r) => (r ? range(r.f, (n) => n.toFixed(1)) : "0")) });
  const main = read[0]!;
  const spread = main.f.high - main.f.low;
  return {
    kind: "signing", title: `Signing ${p.name}`,
    options: plans.map((o) => ({ label: o.label, note: o.note })),
    rows,
    assumptions: [
      `Cap for next year: ${money(capNow)}.`,
      "Wins come from how much better each evaluator thinks the player is than our weakest starter at the position.",
      "Cash follows the contract's shape; the signing bonus is paid in the first year.",
    ],
    views: [...main.views, ...(spread >= 0.8 ? [{ who: "Front office", text: "The staff are split on this player; treat the middle of the range with caution." }] : [])],
    forecasts: read.map((r) => r?.f ?? { metric: "Wins added", unit: "wins", low: 0, mid: 0, high: 0, attribution: "weak" }),
  };
}

// ---- Coach dismissal ----

/** Compare keeping the head coach (or GM), firing now and firing after the season. */
export function dismissalComparison(state: GameState, role: Extract<StaffRole, "HC" | "GM"> = "HC"): Comparison | null {
  const s = staff(state);
  const us = state.userTeam;
  const c = Object.values(s.people).find((x) => x.team === us && x.role === role);
  if (!c) return null;
  const owedNow = severanceOwed(state, c.id);
  const salary = c.contract?.salary ?? 0;
  const inSeason = state.date >= RULES.keyDates.regularSeasonStart && state.date <= RULES.keyDates.regularSeasonEnd;
  const owedLater = Math.max(0, inSeason ? owedNow - Math.round(salary * (c.contract?.guaranteed ?? 1)) : owedNow);
  const pool = candidates(state, us, role).slice(0, 12).map((id) => s.people[id]);
  const strong = pool.filter((x) => reputation(state, x) >= 60).length;
  const sameScheme = c.scheme ? pool.filter((x) => x.scheme === c.scheme).length : 0;
  // People on our staff who came up under this coach tend to follow him out.
  const tree = Object.values(s.people).filter((x) => x.team === us && x.id !== c.id && x.mentor === c.id && x.role && canHold(x, x.role));
  const r = standings(state)[us];
  const played = r ? r.w + r.l + r.t : 0;
  const pace = (played ? winPct(r.w, r.l, r.t) : 0.5) * FORMAT.games;
  const left = FORMAT.games - played;
  // Firing mid-season rarely turns a team: an interim steadies or slips. The range is wide on purpose.
  const keep: Forecast = { metric: "Wins next season", unit: "wins", low: Math.max(0, pace - 2.5), mid: pace, high: Math.min(FORMAT.games, pace + 2.5), attribution: "weak" };
  const change: Forecast = { ...keep, low: Math.max(0, pace - 3.5 - (sameScheme ? 0 : 1)), mid: pace - (sameScheme ? 0.3 : 0.8), high: Math.min(FORMAT.games, pace + 3) };
  const relation = regard(state, c.name);
  const f = (x: Forecast) => `${x.low.toFixed(0)} to ${x.high.toFixed(0)}`;
  return {
    kind: "dismissal", title: `${role === "HC" ? "Head coach" : "General manager"} ${c.name}`,
    options: [{ label: "Keep" }, { label: "Fire now" }, { label: inSeason ? "Fire after the season" : "Decide after next season" }],
    rows: [
      { label: "Severance owed", cells: ["-", money(owedNow), money(owedLater)] },
      { label: "Coaches who may follow him out", cells: ["-", `${tree.length}`, `${tree.length}`] },
      { label: "Candidates on the market", cells: ["-", `${pool.length} considered, ${strong} well regarded`, `${pool.length}+ (more after other teams' firings)`] },
      { label: "Same scheme as now", cells: ["Yes", `${sameScheme} of ${pool.length} candidates`, `${sameScheme} of ${pool.length} candidates`] },
      { label: "Interim for the rest of the year", cells: ["-", inSeason ? `${left} games under an interim` : "None needed", "-"] },
      { label: "Wins next season (staff range)", cells: [f(keep), f(change), f(change)] },
    ],
    assumptions: [
      `Contract: ${money(salary)} a year through ${c.contract?.through ?? "?"}, ${Math.round((c.contract?.guaranteed ?? 1) * 100)}% owed if fired.`,
      "A new scheme means players learn a new system; most of the cost lands in the first season.",
      "Win ranges are wide: a change of coach moves results less than it moves headlines.",
    ],
    views: [
      { who: "Football operations", text: relation >= 0.5 ? "The building backs him; a firing would surprise the locker room." : relation <= -0.5 ? "Relations are strained; the staff expect a change." : "The staff are split on him." },
      ...(tree.length ? [{ who: "Personnel", text: `${tree.map((x) => x.name).slice(0, 3).join(", ")} came up under him.` }] : []),
    ],
    forecasts: [keep, change, change],
  };
}

// ---- Stadium renovation ----

/** Last twelve months of the revenue lines a project can lift. */
function revenueLines(state: GameState): Record<string, number> {
  const from = addDays(state.date, -365);
  const out: Record<string, number> = { tickets: 0, premium: 0, concessions: 0, sponsorship: 0 };
  for (const e of business(state).ledger) if (e.date > from && e.cat in out) out[e.cat] += e.amount;
  // Before a full year of books, the budget's yearly figures stand in.
  if (out.tickets <= 0) {
    const mk = MARKETS[state.userTeam];
    out.tickets = mk.ticket * 65_000 * 10;
    out.premium = out.tickets * 0.4;
    out.concessions = out.tickets * 0.2;
    out.sponsorship = 60 * M;
  }
  return out;
}

/** Compare paying cash, borrowing, deferring a year, and the downside case for a stadium or facility project. */
export function renovationComparison(state: GameState, projectId: string): Comparison {
  const def = PROJECT_BY_ID[projectId];
  const t = projectTerms(state, projectId);
  const lines = revenueLines(state);
  const e = def.effect;
  const lift = lines.tickets * (e.demand ?? 0) + lines.premium * (e.premium ?? 0) + lines.concessions * (e.perCap ?? 0) + lines.sponsorship * (e.sponsor ?? 0);
  const upkeep = Math.round(t.ours * 0.015);
  const rate = marketRate(state) + 0.0125;
  const years = 10;
  // A level payment over ten years.
  const pay = Math.round((t.ours * rate) / (1 - (1 + rate) ** -years));
  const interest = pay * years - t.ours;
  const deferCost = Math.round(t.ours * 1.04);
  const net = (l: number, cost: number) => (l - upkeep > 0 ? `${(cost / (l - upkeep)).toFixed(1)} years` : "Doesn't pay back on revenue");
  const lo = lift * 0.6, hi = lift * 1.3;
  // Downside: a 20% overrun while a recession takes a third off the lift.
  const badCost = Math.round(t.ours * 1.2), badLift = lift * 0.65;
  const fc = (m: number): Forecast => ({ metric: `Yearly revenue lift from ${def.title.toLowerCase()}`, unit: "money", low: Math.round(lo * m), mid: Math.round(lift * m), high: Math.round(hi * m), attribution: "partial" });
  return {
    kind: "renovation", title: def.title,
    options: [{ label: "Pay cash now" }, { label: "Borrow over 10 years" }, { label: "Wait a year" }, { label: "Downside case", note: "Cash now, 20% over budget, in a recession." }],
    rows: [
      { label: "Cost to us", cells: [money(t.ours), money(t.ours), `About ${money(deferCost)}`, money(badCost)] },
      { label: "Cash out this year", cells: [money(t.ours), money(Math.round(t.ours * 0.05)), "0", money(badCost)] },
      { label: "Loan payments a year", cells: ["-", `${money(pay)} (${(rate * 100).toFixed(2)}%)`, "-", "-"] },
      { label: "Interest over the loan", cells: ["-", money(interest), "-", "-"] },
      { label: "Revenue lift a year (staff range)", cells: [range(fc(1), money), range(fc(1), money), `None for a year, then ${money(lift)}`, money(badLift)] },
      { label: "Upkeep a year", cells: [money(upkeep), money(upkeep), money(upkeep), money(upkeep)] },
      { label: "Payback", cells: [net(lift, t.ours), net(lift - pay, t.ours * 0.05), net(lift, deferCost), net(badLift, badCost)] },
      { label: "Construction", cells: [`${def.build} offseason${def.build > 1 ? "s" : ""}`, `${def.build} offseason${def.build > 1 ? "s" : ""}`, `Starts next spring`, `${def.build + 1} offseasons`] },
      { label: "Cash left after", cells: [money(cashBalance(state) - t.ours), money(cashBalance(state)), money(cashBalance(state)), money(cashBalance(state) - badCost)] },
    ],
    assumptions: [
      `Lift priced on the last twelve months: tickets ${money(lines.tickets)}, suites ${money(lines.premium)}, concessions ${money(lines.concessions)}, sponsors ${money(lines.sponsorship)}.`,
      "Upkeep runs about 1.5% of the cost a year.",
      `Borrowing at the market rate plus 1.25 points; construction costs rise about 4% a year.`,
      ...(t.payer ? [`${t.payer}.`] : []),
    ],
    views: [
      { who: "Chief revenue officer", text: lift > upkeep * 3 ? "The lift is real; fans and sponsors will pay for it." : "The lift is modest; this is more about keeping up than making money." },
      { who: "Chief financial officer", text: cashBalance(state) - t.ours < 20 * M ? "Paying cash leaves us thin; borrow or wait." : "We can pay cash and keep a cushion." },
    ],
    forecasts: [fc(1), fc(1), fc(1), { ...fc(0.65), low: Math.round(badLift * 0.8), mid: Math.round(badLift), high: Math.round(badLift * 1.2) }],
  };
}

// ---- Ticket prices ----

/** Compare season-ticket price changes: renewals, holders, revenue and the fans' reaction. */
export function ticketComparison(state: GameState, changes: number[]): Comparison {
  const b = business(state);
  const us = state.userTeam;
  const r = standings(state)[us];
  const wp = r && r.w + r.l + r.t ? winPct(r.w, r.l, r.t) : 0.5;
  const playoffs = !!state.seeds?.[TEAM_BY_ID[us].conference]?.includes(us);
  const annual = MARKETS[us].ticket * (b.index?.season ?? 1) * 10;
  const runs = changes.map((ch) => {
    const mid = planRenewals(state, ch, wp, playoffs);
    // The ticket office's range: the same model with the mood of a better or worse offseason.
    const lo = planRenewals(state, ch, Math.max(0, wp - 0.12), playoffs);
    const hi = planRenewals(state, ch, Math.min(1, wp + 0.12), playoffs);
    const rev = (h: number) => Math.round(h * annual * (1 + ch));
    return { ch, mid, lo, hi, rev };
  });
  const base = runs.find((x) => x.ch === 0) ?? runs[0];
  const trust = fanBase(state).trust;
  return {
    kind: "tickets", title: `${RULES.season + 1} season-ticket prices`,
    options: runs.map((x) => ({ label: x.ch === 0 ? "Hold prices" : `${pct(x.ch)}` })),
    rows: [
      { label: "Renewal rate", cells: runs.map((x) => `${Math.round(x.lo.rate * 100)}-${Math.round(x.hi.rate * 100)}%`) },
      { label: "Season-ticket holders", cells: runs.map((x) => `${x.mid.holders.toLocaleString("en-US")} (${x.lo.holders.toLocaleString("en-US")}-${x.hi.holders.toLocaleString("en-US")})`) },
      { label: "From the waiting list", cells: runs.map((x) => x.mid.fromWaitlist.toLocaleString("en-US")) },
      { label: "Season-ticket revenue", cells: runs.map((x) => money(x.rev(x.mid.holders))) },
      { label: "Versus holding prices", cells: runs.map((x) => money(x.rev(x.mid.holders) - base.rev(base.mid.holders))) },
      { label: "Fan mood", cells: runs.map((x) => (x.ch > 0 ? `-${Math.round(x.ch * 100 * 0.35)} points` : x.ch < 0 ? `+${Math.round(-x.ch * 100 * 0.2)} points` : "No change")) },
      { label: "Fan trust", cells: runs.map((x) => (x.ch > 0.05 ? `Hit (${Math.round((x.ch * 100 - 5) * 0.6)} points), remembered` : "Unaffected")) },
    ],
    assumptions: [
      `Today: ${b.holders.toLocaleString("en-US")} holders, ${tix(state).waitlist.toLocaleString("en-US")} on the waiting list, fan trust ${Math.round(trust)}.`,
      `Revenue counts about ${money(annual)} a seat a season before the change.`,
      "The range spans a better or worse offseason mood; a playoff run or a collapse would move it further.",
    ],
    views: [
      { who: "Ticket office", text: base.mid.rate > 0.9 ? "Demand is strong; holders will absorb a modest rise." : "Renewals are already soft; a rise costs seats." },
      { who: "Fan engagement", text: trust < 50 ? "Fans don't trust us right now; a big rise will be remembered." : "Fans will grumble at a rise but stay." },
    ],
    forecasts: runs.map((x) => ({ metric: "Season-ticket holders next season", unit: "holders", low: x.lo.holders, mid: x.mid.holders, high: x.hi.holders, attribution: "partial" })),
  };
}

// ---- Debt financing ----

/** Year-by-year interest and principal on loan terms at today's rates (or rates `bump` higher for floating debt). */
function loanSchedule(state: GameState, o: LoanOffer, bump = 0): { first: number; interest: number } {
  let bal = o.amount;
  let interest = 0;
  let first = 0;
  const r = loanRate(state, o) + (o.kind === "floating" ? bump : 0);
  for (let y = 0; y < o.years; y++) {
    const i = bal * r;
    const p = o.amort === "amortizing" ? o.amount / o.years : y === o.years - 1 ? bal : 0;
    if (y === 0) first = i + p;
    interest += i;
    bal -= p;
  }
  return { first: Math.round(first), interest: Math.round(interest) };
}

/** Compare loan offers: payments, rate exposure, covenant room today and in a recession. */
export function financingComparison(state: GameState, offers: LoanOffer[]): Comparison {
  const earn = earningsBase(state);
  const runs = offers.map((o) => {
    const s = loanSchedule(state, o);
    const up = loanSchedule(state, o, 0.02);
    const cov = coverage(state, o);
    const lev = leverage(state, o.refinances ? 0 : o.amount);
    // A recession: a quarter off operating income, floating rates down a point.
    const ds = debtService(state, o);
    const recCov = ds > 0 ? (earn * 0.75) / ds : 99;
    return { o, s, up, cov, lev, recCov };
  });
  const words = (x: number, min: number) => (x >= 99 ? "No debt service" : `${x.toFixed(2)}x (needs ${min.toFixed(2)}x)${x < min ? ", would breach" : ""}`);
  return {
    kind: "financing", title: "Loan offers",
    options: runs.map((x) => ({ label: `${x.o.lender}`, note: `${x.o.years} yr, ${x.o.kind}, ${x.o.amort}` })),
    rows: [
      { label: "Rate today", cells: runs.map((x) => `${(loanRate(state, x.o) * 100).toFixed(2)}%${x.o.kind === "floating" ? ` (market ${(marketRate(state) * 100).toFixed(2)}% + ${(x.o.rate * 100).toFixed(2)})` : ""}`) },
      { label: "Fee", cells: runs.map((x) => money(x.o.amount * x.o.fee)) },
      { label: "Payments in year one", cells: runs.map((x) => money(x.s.first)) },
      { label: "Interest over the term", cells: runs.map((x) => money(x.s.interest)) },
      { label: "If rates rise 2 points", cells: runs.map((x) => (x.o.kind === "floating" ? `+${money(x.up.interest - x.s.interest)} interest` : "No change (fixed)")) },
      { label: "Repayment", cells: runs.map((x) => (x.o.amort === "amortizing" ? "Paid down every month" : `${money(x.o.amount)} due at the end`)) },
      { label: "Coverage today", cells: runs.map((x) => words(x.cov, x.o.minCoverage)) },
      { label: "Leverage", cells: runs.map((x) => `${x.lev.toFixed(1)}x (limit ${x.o.maxLeverage}x)`) },
      { label: "Coverage in a recession", cells: runs.map((x) => words(x.recCov, x.o.minCoverage)) },
    ],
    assumptions: [
      `Operating income lenders count: ${money(earn)} over the last twelve months.`,
      "The recession case takes a quarter off operating income; covenants are tested every quarter.",
      "Floating loans move with the market rate; a two-point rise is a stress case, not a forecast.",
    ],
    views: [
      { who: "Chief financial officer", text: runs.some((x) => x.recCov < x.o.minCoverage) ? "At least one offer would break its covenants in a downturn; I'd weigh that above the rate." : "Every offer holds up in a downturn." },
    ],
    forecasts: runs.map((x) => ({ metric: `Interest paid to ${x.o.lender}, first year`, unit: "money", low: Math.round(x.s.first * 0.95), mid: x.s.first, high: x.o.kind === "floating" ? Math.round(loanSchedule(state, x.o, 0.01).first) : x.s.first, attribution: "direct" })),
  };
}

// ---- Forecasts kept with a decision ----

/** A forecast saved with the decision, and what to measure it against later (causes.ts). */
export interface TrackedForecast extends Forecast {
  option: string;
  measure: "teamWins" | "holders" | "interest" | "revenue";
  /** The number before the decision: last season's wins, today's holders, the revenue lines. */
  baseline: number;
  /** The lender, for interest. */
  key?: string;
}

/** Last twelve months of the lines a project can lift, added up. */
export function revenueBase(state: GameState): number {
  const l = revenueLines(state);
  return Math.round(l.tickets + l.premium + l.concessions + l.sponsorship);
}

function lastWins(state: GameState): number {
  const r = standings(state)[state.userTeam];
  const played = r ? r.w + r.l + r.t : 0;
  if (played >= 4) return r.w + r.t / 2;
  const last = state.history?.seasons.at(-1)?.records[state.userTeam];
  return last ? last[0] + (last[2] ?? 0) / 2 : FORMAT.games / 2;
}

export function track(state: GameState, c: Comparison, option: number): TrackedForecast | null {
  const f = c.forecasts[option];
  if (!f) return null;
  const label = c.options[option]?.label ?? "";
  if (c.kind === "signing" || c.kind === "dismissal") return { ...f, option: label, measure: "teamWins", baseline: lastWins(state) };
  if (c.kind === "tickets") return { ...f, option: label, measure: "holders", baseline: business(state).holders };
  if (c.kind === "renovation") return { ...f, option: label, measure: "revenue", baseline: revenueBase(state) };
  return { ...f, option: label, measure: "interest", baseline: 0, key: label };
}

// ---- Memos ----

/** The comparison behind a decision memo, worked out by the system the decision belongs to. */
export function memoComparison(state: GameState, memoId: string): Comparison | null {
  const m = state.office?.memos.find((x) => x.id === memoId);
  if (!m) return null;
  const pl = m.payload ?? {};
  try {
    if (m.kind === "signing" && typeof pl.player === "string" && pl.terms) return signingComparison(state, pl.player, pl.terms as OfferTerms);
    if (m.kind === "street" && typeof pl.player === "string") {
      const price = Number(pl.price ?? 0);
      return signingComparison(state, pl.player, { years: 1, total: price, signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0, voidYears: 0, shape: "flat" });
    }
    if (m.kind === "pricing" && Array.isArray(pl.prices)) {
      const opts = (pl.prices as [number, number][]).map((x) => Math.round((x[0] - 1) * 100) / 100);
      return ticketComparison(state, [opts[0], 0, opts[2] ?? opts[0] + 0.04]);
    }
    if (m.kind === "refinance" && typeof pl.loan === "string") {
      const offers = (state.debt?.offers ?? []).filter((o) => o.refinances === pl.loan);
      return offers.length ? financingComparison(state, offers) : null;
    }
    if (m.kind === "coachReview") return dismissalComparison(state, "HC");
  } catch {
    // A comparison is advice; if a system can't answer, the memo stands on its own.
    return null;
  }
  return null;
}

/** The second-best option in words: what a genuinely different choice would do. */
export function alternativeText(c: Comparison, recommend: number): string {
  const alt = c.options.findIndex((_, i) => i !== recommend && !/downside/i.test(c.options[i].label));
  if (alt < 0) return "";
  const cells = c.rows.slice(0, 4).map((r) => `${r.label.toLowerCase()} ${r.cells[alt]}`).join("; ");
  const f = c.forecasts[alt];
  return `${c.options[alt].label}: ${cells}.${f ? ` ${f.metric}: ${f.low === f.high ? f.mid : `${fmt(f, f.low)} to ${fmt(f, f.high)}`}.` : ""}`;
}

/** What happens if the staff's assumptions are wrong: the range edges for the recommended option. */
export function sensitivityText(c: Comparison, recommend: number): string {
  const f = c.forecasts[recommend];
  const views = c.views.map((v) => `${v.who}: ${v.text}`).join(" ");
  return `${f ? `${f.metric}: low case ${fmt(f, f.low)}, middle ${fmt(f, f.mid)}, high case ${fmt(f, f.high)}. ` : ""}It rests on: ${c.assumptions.join(" ")} ${views}`.trim();
}

export function fmt(f: Forecast, n: number): string {
  return f.unit === "money" ? money(n) : f.unit === "wins" ? n.toFixed(1) : f.unit === "pct" ? `${Math.round(n * 100)}%` : Math.round(n).toLocaleString("en-US");
}

/** The forecast to keep with a memo decision: the comparison's column for the option chosen. */
export function memoForecast(state: GameState, memoId: string, choice: number): TrackedForecast | null {
  const m = state.office?.memos.find((x) => x.id === memoId);
  const c = m && memoComparison(state, memoId);
  if (!m || !c) return null;
  let col = choice;
  if (m.kind === "signing" || m.kind === "street") col = choice === 0 ? 0 : c.options.length - 1;
  else if (m.kind === "coachReview") col = choice === 2 ? 2 : 0;
  else if (m.kind === "refinance") {
    if (choice !== 0) return null;
    const best = (state.debt?.offers ?? []).filter((o) => o.refinances === m.payload?.loan).findIndex((o) => o.id === m.payload?.offer);
    col = Math.max(0, best);
  }
  return track(state, c, col);
}

// ---- The owner's own calls outside memos, with their forecasts kept ----

/** Start a project, keeping the staff's revenue forecast with the decision. */
export function startProjectTracked(state: GameState, id: string): string {
  const f = track(state, renovationComparison(state, id), 0);
  const out = startProject(state, id);
  if (out.startsWith("Work starts")) cause(state, "projects", `Started ${PROJECT_BY_ID[id].title.toLowerCase()}.`, [out], undefined, f ?? undefined);
  return out;
}

/** Set next season's ticket prices, keeping the ticket office's renewal forecast. */
export function setPricesTracked(state: GameState, season: number, premium: number): string | null {
  const change = Math.round((season - 1) * 100) / 100;
  const f = track(state, ticketComparison(state, [change]), 0);
  const err = setNextSeasonPrices(state, season, premium);
  if (!err) cause(state, "pricing", `Set ${RULES.season + 1} season tickets ${pct(change)}.`, [], undefined, f ?? undefined);
  return err;
}

/** Sign a loan, keeping the first year's expected interest. */
export function acceptLoanTracked(state: GameState, id: string): string | null {
  const o = state.debt?.offers.find((x) => x.id === id);
  const f = o ? track(state, financingComparison(state, [o]), 0) : null;
  const err = acceptLoan(state, id);
  if (!err && o) cause(state, "financing", `Borrowed ${money(o.amount)} from ${o.lender}.`, [], undefined, f ?? undefined);
  return err;
}
