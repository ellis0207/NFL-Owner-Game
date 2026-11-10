// The treasury: how the club times its money and spends its capital.
// Supplier payment terms (pay early for a discount, or stretch and strain
// the vendors), collections from sponsors and broadcasters, the float that
// money in transit costs or earns, the outside auditors' findings and the
// controls that prevent them, one finite pool of capital that every
// equipment and systems request draws from, consultants, payroll by
// department, and cuts to department staff with what they cost in morale
// and quality. Vendors, findings and consultants are made up; the amounts
// follow the ledger.
import { business, cashBalance, deferredRevenue, inflation, post } from "./business";
import { reserveTarget } from "./books";
import { culture, fairness } from "./culture";
import { addDays, shortDate } from "./dates";
import { creditLimit, debt, drawn, marketRate } from "./debt";
import { execBoost, signer } from "./executives";
import { money, send } from "./inbox";
import { leagueYear } from "./contracts";
import { RULES } from "./league";
import { rngFor } from "./rng";
import type { Dept, GameState, LedgerCat } from "./types";

const M = 1_000_000;

export type SupplierTerms = "early" | "standard" | "stretch";
export const SUPPLIER_TERMS: Record<SupplierTerms, { label: string; days: number; rate: number; what: string }> = {
  early: { label: "Pay in 10 days for a 2% discount", days: 10, rate: -0.02, what: "Vendors love it and cash leaves sooner." },
  standard: { label: "Pay in 30 days", days: 30, rate: 0, what: "The usual terms." },
  stretch: { label: "Stretch to 60 days", days: 60, rate: 0.004, what: "Keeps cash longer; vendors notice, add a little to their prices and some stop extending credit." },
};
export type Collections = "patient" | "standard" | "firm";
export const COLLECTIONS: Record<Collections, { label: string; days: number; what: string }> = {
  patient: { label: "Patient", days: 60, what: "Partners pay when they like. Relationships stay warm; some money is never collected." },
  standard: { label: "Standard", days: 40, what: "Invoices followed up after 30 days." },
  firm: { label: "Firm", days: 25, what: "Money comes in fast; sponsors and broadcasters notice the pressure." },
};
/** Internal controls: what the finance office spends a year on reconciliations, approvals and systems. */
export const CONTROLS = [
  { label: "Minimal", cost: 0 },
  { label: "Standard", cost: 0.4 * M },
  { label: "Strong", cost: 0.9 * M },
  { label: "Best in the league", cost: 1.6 * M },
];

export type Consultant = "legal" | "audit" | "strategy" | "financing";
export const CONSULTANTS: Record<Consultant, { label: string; cost: number; what: string }> = {
  legal: { label: "Outside counsel on retainer", cost: 0.6 * M, what: "Compliance trouble is rarer and cheaper to settle." },
  audit: { label: "Accounting advisers", cost: 0.45 * M, what: "Fewer audit findings and faster fixes." },
  strategy: { label: "Strategy consultants", cost: 0.9 * M, what: "Follow-up questions on memos come back the same day, with sensitivity cases." },
  financing: { label: "Financing advisers", cost: 0.5 * M, what: "Lenders quote a little tighter on new loans." },
};

export type CapitalKind = "compute" | "software" | "medicalEquip" | "trainingGear" | "techRefresh" | "concourse";
export const CAPITAL: Record<CapitalKind, { label: string; amount: number; cat: LedgerCat; who: string; what: string }> = {
  compute: { label: "Analytics computing cluster", amount: 1.5 * M, cat: "technology", who: "analytics", what: "The analysts run more models: sharper game plans." },
  software: { label: "Scouting and video software", amount: 0.6 * M, cat: "technology", who: "scouting", what: "Cleaner data on the draft board." },
  medicalEquip: { label: "Imaging and rehab equipment", amount: 2 * M, cat: "medical", who: "medical", what: "Long rehabs run a little shorter." },
  trainingGear: { label: "Sports-science and recovery gear", amount: 1.2 * M, cat: "medical", who: "strength staff", what: "Fewer soft-tissue injuries under heavy loads." },
  techRefresh: { label: "Business systems refresh", amount: 3 * M, cat: "technology", who: "technology", what: "Fewer outages and breaches." },
  concourse: { label: "Concourse and concessions upgrade", amount: 6 * M, cat: "venue", who: "stadium operations", what: "A better day at the stadium: a little more demand." },
};
/** Years an investment keeps paying off. */
const CAPITAL_LIFE = 5;

export interface AuditFinding { year: number; text: string; severity: "minor" | "significant" | "material"; cost: number; fixed?: string; repeat?: boolean }
export type CutDept = Dept | "business";

export interface TreasuryState {
  terms: SupplierTerms;
  collections: Collections;
  controls: number;
  /** Engine only: how vendors feel about us, 0-100. */
  vendors: number;
  findings: AuditFinding[];
  /** The league year last audited for findings. */
  audited: number;
  consultants: Partial<Record<Consultant, string>>;
  /** Capital approved, by kind: the league year it was bought. */
  invested: Partial<Record<CapitalKind, number>>;
  /** Department staff cut, as a share of its cost. */
  cuts: Partial<Record<CutDept, number>>;
  log: { date: string; text: string }[];
}

export function treasury(state: GameState): TreasuryState {
  return (state.treasury ??= { terms: "standard", collections: "standard", controls: 1, vendors: 60, findings: [], audited: leagueYear(state.date) - 1, consultants: {}, invested: {}, cuts: {}, log: [] });
}

function note(state: GameState, text: string): void {
  const t = treasury(state);
  t.log.unshift({ date: state.date, text });
  t.log = t.log.slice(0, 40);
}

// ---- Settings ----

export function setTerms(state: GameState, terms: SupplierTerms): void { treasury(state).terms = terms; note(state, `Supplier terms: ${SUPPLIER_TERMS[terms].label.toLowerCase()}`); }
export function setCollections(state: GameState, c: Collections): void { treasury(state).collections = c; note(state, `Collections: ${COLLECTIONS[c].label.toLowerCase()}`); }
export function setControls(state: GameState, level: number): void { treasury(state).controls = Math.max(0, Math.min(3, Math.round(level))); }

// ---- Working capital ----

const SUPPLIER_CATS = new Set<LedgerCat>(["gameday", "facilities", "venue", "stadium", "technology", "security", "travel", "marketing", "content"]);
const BILLED_CATS = new Set<LedgerCat>(["sponsorship", "localMedia", "naming", "events"]);

/** The last year of ledger lines in a set of categories, as a positive total. */
function trailing(state: GameState, cats: Set<LedgerCat>, sign: 1 | -1): number {
  const from = addDays(state.date, -365);
  return business(state).ledger.filter((e) => e.date >= from && cats.has(e.cat) && Math.sign(e.amount) === sign).reduce((t, e) => t + Math.abs(e.amount), 0);
}

export interface WorkingCapital { cash: number; receivables: number; payables: number; deferred: number; poolDue: number; net: number; dso: number; dpo: number; reserve: number }

/** Money owed to us, money we owe, and ticket money held for games not yet played. */
export function workingCapital(state: GameState): WorkingCapital {
  const t = treasury(state);
  const billed = trailing(state, BILLED_CATS, 1);
  const spend = trailing(state, SUPPLIER_CATS, -1);
  const dso = COLLECTIONS[t.collections].days;
  const dpo = SUPPLIER_TERMS[t.terms].days;
  const receivables = Math.round((billed * dso) / 365);
  const payables = Math.round((spend * dpo) / 365);
  const deferred = deferredRevenue(state);
  const poolDue = Math.round(business(state).pool / 32);
  const cash = cashBalance(state);
  return { cash, receivables, payables, deferred, poolDue, net: cash + receivables + poolDue - payables - deferred, dso, dpo, reserve: reserveTarget(state) };
}

/** On the first of each month: discounts or surcharges from the payment terms, the float, and collections. */
function monthly(state: GameState): void {
  const t = treasury(state);
  const spend = trailing(state, SUPPLIER_CATS, -1) / 12;
  const terms = SUPPLIER_TERMS[t.terms];
  if (spend && terms.rate) post(state, "businessOps", -spend * terms.rate, terms.rate < 0 ? "Early-payment discounts from vendors" : "Vendor surcharges on slow payment");
  // Money owed to us costs interest until it arrives; money we owe earns it until we pay.
  const wc = workingCapital(state);
  const rate = marketRate(state) / 12;
  const float = (wc.payables - wc.receivables) * rate;
  if (Math.abs(float) > 1000) post(state, "interest", float, "Working-capital float: receivables against payables");
  if (t.collections === "patient") post(state, "businessOps", -wc.receivables * 0.01 / 12 * 4, "Partner invoices written off as uncollectible");
  // Vendors and partners react to how they are paid.
  t.vendors = Math.max(0, Math.min(100, t.vendors + (t.terms === "early" ? 1 : t.terms === "stretch" ? -2 : (60 - t.vendors) * 0.05)));
  const c = culture(state);
  if (t.collections === "firm") c.rel.sponsors = Math.max(0, c.rel.sponsors - 0.4);
  if (t.collections === "patient") c.rel.sponsors = Math.min(100, c.rel.sponsors + 0.15);
  if (t.vendors < 25 && rngFor(state.seed, `vendors:${state.date}`)() < 0.3) {
    const cost = Math.round(spend * 0.03);
    post(state, "businessOps", -cost, "A key vendor demanded cash on delivery and raised its prices");
    send(state, "business", signer(state, "CFO"), "A vendor stopped extending credit",
      `One of our biggest game-day vendors now wants cash on delivery and has raised its prices about 3% (${money(cost)} this month). Slow payment has worn out their patience; paying in 30 days again would help.`);
    note(state, "A vendor stopped extending credit");
  }
  // Controls, cuts aside, are an ongoing cost in the finance office.
  const ctl = CONTROLS[t.controls].cost * inflation(leagueYear(state.date), 0.03) / 12;
  if (ctl) post(state, "professional", -ctl, `Internal controls (${CONTROLS[t.controls].label.toLowerCase()})`);
}

// ---- The audit ----

const FINDINGS: { severity: AuditFinding["severity"]; text: string; cost: number }[] = [
  { severity: "minor", text: "Expense approvals missing signatures on a sample of invoices", cost: 0.05 * M },
  { severity: "minor", text: "Ticketing refunds not reconciled to the bank each month", cost: 0.08 * M },
  { severity: "significant", text: "Suite revenue booked when contracts were signed instead of as games were played", cost: 0.25 * M },
  { severity: "significant", text: "Vendor master file allowed one person to add a vendor and approve its payments", cost: 0.2 * M },
  { severity: "material", text: "Season-ticket deposits counted as revenue before the games, overstating the year's income", cost: 0.6 * M },
];

/** The chance an audit turns up something, from controls, the finance chief and outside help. */
export function findingChance(state: GameState): number {
  const t = treasury(state);
  return Math.max(0.05, 0.55 - t.controls * 0.13 - 0.15 * execBoost(state, "CFO") - (consulting(state, "audit") ? 0.15 : 0));
}

function audit(state: GameState, year: number): void {
  const t = treasury(state);
  const rng = rngFor(state.seed, `audit-findings:${year}`);
  const open = t.findings.filter((f) => !f.fixed);
  const found: AuditFinding[] = [];
  // Last year's unfixed findings come back, one step worse.
  for (const f of open) {
    f.fixed = "carried";
    const severity = f.severity === "minor" ? "significant" : "material";
    found.push({ year, text: f.text, severity, cost: f.cost * 1.5, repeat: true });
  }
  const p = findingChance(state);
  for (const f of FINDINGS) {
    const odds = p * (f.severity === "minor" ? 1 : f.severity === "significant" ? 0.45 : 0.12);
    if (rng() < odds && !found.some((x) => x.text === f.text)) found.push({ year, text: f.text, severity: f.severity, cost: f.cost });
  }
  t.findings = [...found, ...t.findings].slice(0, 30);
  if (!found.length) {
    note(state, `The ${year} audit found no control problems`);
    return;
  }
  const material = found.filter((f) => f.severity === "material");
  if (material.length) {
    // A material weakness means restating the year: lenders and the league office pay attention.
    const d = debt(state);
    d.trust = Math.max(0, d.trust - 8);
    d.log.unshift({ date: state.date, text: `The auditors reported a material weakness in the ${year} books; the club restated the year.` });
  }
  send(state, "business", signer(state, "CFO"), `Audit findings for ${year}`,
    `The auditors' letter lists ${found.length} finding${found.length > 1 ? "s" : ""}: ${found.map((f) => `${f.text.toLowerCase()} (${f.severity}${f.repeat ? ", repeated" : ""})`).join("; ")}. ` +
    (material.length ? "The material weakness means restating the year; our lenders have been told. " : "") +
    "Each can be fixed on the Business page under Treasury; unfixed findings come back worse next year.");
  note(state, `${found.length} audit finding${found.length > 1 ? "s" : ""} for ${year}`);
}

/** Pay to fix a finding before the next audit. */
export function remediate(state: GameState, index: number): string | null {
  const f = treasury(state).findings[index];
  if (!f || f.fixed) return "Nothing to fix there.";
  post(state, "professional", -f.cost * (consulting(state, "audit") ? 0.8 : 1), `Fixing an audit finding: ${f.text.toLowerCase()}`);
  f.fixed = state.date;
  return null;
}

export function restatements(state: GameState): number {
  return (state.treasury?.findings ?? []).filter((f) => f.severity === "material" && f.year >= RULES.season - 2).length;
}

// ---- Consultants ----

export function consulting(state: GameState, kind: Consultant): boolean {
  const until = state.treasury?.consultants[kind];
  return !!until && until >= state.date;
}

/** Hire a firm for six months. */
export function hireConsultant(state: GameState, kind: Consultant): string | null {
  const t = treasury(state);
  if (consulting(state, kind)) return "They're already engaged.";
  const cost = CONSULTANTS[kind].cost * inflation(leagueYear(state.date), 0.03);
  post(state, "professional", -cost, CONSULTANTS[kind].label);
  t.consultants[kind] = addDays(state.date, 182);
  note(state, `Engaged ${CONSULTANTS[kind].label.toLowerCase()} through ${shortDate(t.consultants[kind]!)}`);
  return null;
}

// ---- Capital ----

/** Cash above the reserve plus half the unused credit line: the pool every capital request draws from. */
export function capitalPool(state: GameState): { cash: number; credit: number; spent: number; pool: number } {
  const year = leagueYear(state.date);
  const spent = Object.entries(state.treasury?.invested ?? {}).filter(([, y]) => y === year).reduce((t, [k]) => t + CAPITAL[k as CapitalKind].amount * inflation(year, 0.03), 0);
  const cash = Math.max(0, cashBalance(state) - reserveTarget(state));
  const credit = state.debt ? Math.max(0, creditLimit(state) - drawn(state)) * 0.5 : 0;
  return { cash: Math.round(cash), credit: Math.round(credit), spent: Math.round(spent), pool: Math.round(Math.max(0, cash + credit - spent)) };
}

/** Whether an investment is in place and still paying off. */
export function invested(state: GameState, kind: CapitalKind): boolean {
  const y = state.treasury?.invested[kind];
  return y !== undefined && RULES.season - y < CAPITAL_LIFE;
}

/** This year's requests, competing for the same pool. */
export function capitalAsks(state: GameState): { kind: CapitalKind; amount: number; done: boolean; fits: boolean }[] {
  const year = leagueYear(state.date);
  const pool = capitalPool(state).pool;
  return (Object.keys(CAPITAL) as CapitalKind[]).map((kind) => {
    const amount = Math.round(CAPITAL[kind].amount * inflation(year, 0.03));
    return { kind, amount, done: invested(state, kind), fits: amount <= pool };
  });
}

export function approveCapital(state: GameState, kind: CapitalKind): string | null {
  if (invested(state, kind)) return "That's already in place.";
  const year = leagueYear(state.date);
  const amount = Math.round(CAPITAL[kind].amount * inflation(year, 0.03));
  if (amount > capitalPool(state).pool) return `That's more than the ${money(capitalPool(state).pool)} left in this year's capital pool. Approve something smaller, raise cash, or wait for next year.`;
  post(state, CAPITAL[kind].cat, -amount, CAPITAL[kind].label);
  treasury(state).invested[kind] = year;
  note(state, `Approved ${CAPITAL[kind].label.toLowerCase()} (${money(amount)})`);
  return null;
}

// ---- Payroll by department ----

export interface PayrollRow { dept: string; amount: number; people: number; note: string }

/** What the club pays its people this league year, by department, from the ledger to date. */
export function payrollByDept(state: GameState): PayrollRow[] {
  const year = leagueYear(state.date);
  const sum = (cats: LedgerCat[], match?: RegExp) => -business(state).ledger.filter((e) => e.year === year && cats.includes(e.cat) && e.amount < 0 && (!match || match.test(e.note ?? ""))).reduce((t, e) => t + e.amount, 0);
  const coaches = (state.staff ? Object.values(state.staff.people).filter((c) => c.team === state.userTeam && (c.role || c.job)).length : 22);
  const execs = state.execs ? Object.values(state.execs.people).filter((e) => e.role).length : 6;
  const analysts = state.analysts?.staff.length ?? 0;
  const ops = sum(["businessOps"]);
  return [
    { dept: "Coaches and football front office", amount: sum(["staff"]) - sum(["staff"], /Analytics/), people: coaches + 12, note: "Head coach, coordinators, position and quality-control coaches, the GM and personnel staff." },
    { dept: "Scouting", amount: sum(["scouts", "scouting"]), people: 14 + (state.scoutOps?.pros.length ?? 2), note: "Area and national scouts, pro scouts, travel and video." },
    { dept: "Analytics", amount: sum(["staff"], /Analytics/), people: analysts, note: "Analysts and engineers above the one-analyst shop the football budget assumes." },
    { dept: "Medical and performance", amount: sum(["medical"]), people: 18, note: "Doctors, trainers, rehabilitation, strength and nutrition, and equipment." },
    { dept: "Business executives", amount: sum(["businessOps"], /Executive/), people: execs, note: "The president and department heads above the budgeted pay." },
    { dept: "Finance, legal and administration", amount: Math.round(ops * 0.28), people: 40, note: "Accounting, payroll, legal, human resources." },
    { dept: "Sales and partnerships", amount: Math.round(ops * 0.32), people: 55, note: "Tickets, suites and sponsorship sales." },
    { dept: "Marketing and content", amount: sum(["marketing", "content"]), people: 35, note: "Brand, digital, team media." },
    { dept: "Technology", amount: sum(["technology"]) + Math.round(ops * 0.1), people: 18, note: "Systems, networks and security." },
    { dept: "Stadium and game-day staff", amount: sum(["gameday", "venue", "security"]), people: 900, note: "Mostly part-time game-day workers." },
  ].map((r) => ({ ...r, amount: Math.round(r.amount) }));
}

// ---- Cuts ----

export const CUT_LABEL: Record<CutDept, string> = { business: "Business office", marketing: "Marketing", gameday: "Game-day staff", community: "Community relations", medical: "Medical and training", facilities: "Training facility staff", scouts: "College scouting" };

export function cutShare(state: GameState, dept: CutDept): number {
  return state.treasury?.cuts[dept] ?? 0;
}

/**
 * Cut a department's staff by a share of its cost. Severance is a quarter of
 * a year's savings now; the work suffers in proportion, and everyone who
 * stays notices.
 */
export function cutDepartment(state: GameState, dept: CutDept, share: number): string | null {
  const t = treasury(state);
  const now = cutShare(state, dept);
  const to = Math.max(0, Math.min(0.3, Math.round(share * 100) / 100));
  if (to === now) return null;
  const year = leagueYear(state.date);
  const base = dept === "business" ? 30 * M : ({ marketing: 9, gameday: 8, community: 3, medical: 10, facilities: 17, scouts: 6 } as Record<Dept, number>)[dept] * M;
  const annual = base * inflation(year);
  if (to > now) {
    const severance = annual * (to - now) * 0.25;
    post(state, "businessOps", -severance, `Severance: ${CUT_LABEL[dept].toLowerCase()} layoffs`);
    const c = culture(state);
    fairness(state, -(to - now) * 40);
    c.log.unshift({ date: state.date, text: `Layoffs in ${CUT_LABEL[dept].toLowerCase()} (${Math.round((to - now) * 100)}% of the department).` });
    note(state, `Cut ${CUT_LABEL[dept].toLowerCase()} by ${Math.round((to - now) * 100)}% (severance ${money(severance)})`);
  } else {
    post(state, "businessOps", -annual * (now - to) * 0.1, `Recruiting to rebuild ${CUT_LABEL[dept].toLowerCase()}`);
    note(state, `Rehired in ${CUT_LABEL[dept].toLowerCase()}`);
  }
  t.cuts[dept] = to;
  return null;
}

/** What a department's cut costs the quality of its work: 1 is full strength. */
export function cutQuality(state: GameState, dept: CutDept): number {
  return 1 - cutShare(state, dept) * 1.4;
}

// ---- Daily ----

export function treasuryDaily(state: GameState): void {
  if (!state.business) return;
  const t = treasury(state);
  if (state.date.endsWith("-01")) monthly(state);
  // The auditors' management letter follows the books closing, a few weeks into the new league year.
  const year = leagueYear(state.date);
  if (t.audited < year - 1 && state.books && state.books.year === year && state.books.closed.some((c) => c.year === year - 1)) {
    t.audited = year - 1;
    audit(state, year - 1);
  }
}
