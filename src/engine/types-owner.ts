import type { LedgerCat } from "./types-media";
// The owner's side: books, ownership, deals, succession, wealth, the office, culture, honors. Re-exported from types.ts; import from there.

// ---- Club books, borrowing and the owner (books.ts, debt.ts, ownership.ts) ----

/** A league year once it is over: what was planned and what happened. */
export interface YearClose {
  year: number;
  revenue: number;
  /** Operating income before depreciation, interest and owner taxes (cash basis by category). */
  operating: number;
  depreciation: number;
  interest: number;
  /** Net income on the accrual basis. */
  net: number;
  cashEnd: number;
  debtEnd: number;
  /** What the budget approved at the start of the year expected. */
  planRevenue: number;
  planOperating: number;
  /** The outside auditors' opinion. */
  audit: "clean" | "qualified";
}

export interface BooksState {
  /** The league year the books are open for. */
  year: number;
  /** Approved budgets by league year: each ledger category's planned amount (signed like the ledger). */
  plan: Record<number, Partial<Record<LedgerCat, number>>>;
  closed: YearClose[];
  /** Months of operating costs and debt service the club keeps on hand before paying the owner anything. */
  reserveMonths: number;
}

export type LoanKind = "fixed" | "floating";

export interface LoanTerms {
  lender: string;
  amount: number;
  years: number;
  kind: LoanKind;
  /** Fixed loans: the all-in rate. Floating loans: the margin over the market rate. */
  rate: number;
  /** Paid down monthly over the term, or all at the end. */
  amort: "amortizing" | "bullet";
  /** Arrangement fee, a share of the amount. */
  fee: number;
  /** Lowest allowed debt-service coverage (trailing operating income over debt service). */
  minCoverage: number;
  /** Most debt allowed against trailing operating income. */
  maxLeverage: number;
  security: string;
}

export interface LoanOffer extends LoanTerms {
  id: string;
  date: string;
  expires: string;
  purpose: "general" | "refinance" | "projects";
  /** The loan this offer would pay off. */
  refinances?: string;
  /** The owner already pushed this lender once. */
  pushed?: boolean;
}

export interface Loan extends LoanTerms {
  id: string;
  start: string;
  maturity: string;
  balance: number;
  /** Extra margin after a covenant waiver. */
  stepUp: number;
  /** Covenant tests failed in a row. */
  breaches: number;
  /** The lender demanded repayment by this date. */
  accelerated?: string;
  repaid?: string;
  purpose: string;
}

export interface CreditFacility {
  lender: string;
  limit: number;
  /** Margin over the market rate on what's drawn. */
  spread: number;
  /** Yearly fee on the unused part. */
  commitment: number;
  matures: string;
}

export interface DebtState {
  /** The market's base lending rate by month, "2026-08". */
  rates: Record<string, number>;
  facility: CreditFacility;
  loans: Loan[];
  offers: LoanOffer[];
  /** How lenders see the club and its owner, 0-100 (engine only; shown in words). */
  trust: number;
  /** Covenant tests: the date, the loan, the coverage and leverage seen, and whether it passed. */
  tests: { date: string; loan: string; coverage: number; leverage: number; ok: boolean }[];
  /** Lenders' warnings and actions, newest first. */
  log: { date: string; text: string }[];
}

export type OwnerGoal = "titles" | "profit" | "value" | "community" | "reputation" | "stability";
export type OwnerBackground = "finance" | "realEstate" | "industry" | "family" | "exPlayer";

export interface ScoreSeason {
  season: number;
  /** The club the season was with, once the owner has had more than one. */
  team?: string;
  record: string;
  playoffs?: string;
  revenue: number;
  operating: number;
  value: number;
  equity: number;
  scores: Record<OwnerGoal, number>;
  overall: number;
  coachTarget?: { goal: string; met: boolean };
}

export interface OwnerState {
  background: OwnerBackground;
  /** The owner's money outside the team: cash on hand, other holdings and personal debt. */
  liquid: number;
  outside: number;
  personalDebt: number;
  style: "handsOff" | "collaborative" | "handsOn";
  spending: "aggressive" | "moderate" | "conservative";
  /** Seasons the owner gives a rebuild before expecting to contend. */
  patience: number;
  weights: Record<OwnerGoal, number>;
  /** What the owner paid for the team and when. */
  purchase: number;
  since: string;
  /** Capital put in and distributions taken since the purchase. */
  putIn: number;
  takenOut: number;
  /** The owner's own equity at the purchase, and the club's equity then (price less debt), when bought with partners or debt in play. */
  equityIn?: number;
  clubEquityIn?: number;
  /** Pass-through taxes the owner paid on the club's income, and losses carried forward. */
  taxesPaid: number;
  carryforward: number;
  coachTarget?: { season: number; goal: "playoffs" | "winning" | "develop" | "none"; set: string };
  legacy: ScoreSeason[];
  /** New priorities suggested by how things have gone, for the owner to take or leave. */
  suggestion?: { weights: Record<OwnerGoal, number>; why: string; date: string };
  log: { date: string; text: string }[];
}

// ---- The ownership group (investors.ts) ----

/** Terms in an investor agreement: who can sell to whom, and what a partner can force. */
export type StakeTerms = "owner" | "standard" | "investor";

/** A limited partner in the club (made-up people and funds). */
export interface Partner {
  id: string;
  name: string;
  kind: "individual" | "family" | "fund" | "celebrity";
  /** Share of the club, 0 to 1. */
  pct: number;
  since: string;
  /** What they paid for the stake, capital calls met, and distributions received. */
  paid: number;
  calls: number;
  distributions: number;
  /** How the partner feels about the club, 0 to 100. The owner hears it in words, from calls and meetings. */
  mood: number;
  board: boolean;
  terms: StakeTerms;
  /** When a put right lets the partner make the group buy them out (investor-friendly terms). */
  putFrom?: string;
  complaints: number;
  background: string;
  /** The value of the club when they came in, for their own return. */
  entryValue: number;
}

export interface StakeBid {
  id: string;
  name: string;
  kind: Partner["kind"];
  background: string;
  price: number;
  board: boolean;
}

/** Selling part of the club: marketing, bids, the league's review, closing. */
export interface StakeSale {
  id: string;
  opened: string;
  /** Secondary: the seller's own shares (money to the seller). Primary: new shares (money into the club). */
  kind: "primary" | "secondary";
  pct: number;
  terms: StakeTerms;
  /** A partner selling out, when the stake is theirs. */
  seller?: string;
  stage: "marketing" | "bids" | "league" | "closed" | "failed";
  bidsDue: string;
  bids: StakeBid[];
  chosen?: string;
  closes?: string;
}

export interface InvestorsState {
  partners: Partner[];
  former: { name: string; pct: number; left: string; how: string }[];
  sale?: StakeSale;
  sales: { date: string; kind: string; pct: number; price: number; buyer: string }[];
  /** How much the quarterly report tells the partners. */
  disclosure: "full" | "standard" | "minimal";
  reports: { date: string; period: string; lines: string[] }[];
  minutes: { date: string; matter: string; yes: number; passed: boolean; text: string }[];
  reviews: { date: string; what: string; amount: number; outcome: string }[];
  /** What happens to control if the owner can no longer run the club. */
  succession: "trust" | "named" | "sale";
  /** Money the owner received from selling shares, and capital-gains tax paid on it. */
  proceeds: number;
  gainsTax: number;
  calls: { date: string; amount: number; ours: number; why: string }[];
  /** Bridge loans from the owner to the club: the loan ids already settled with the owner. */
  bridges: { id: string; settled?: boolean }[];
  /** Capital calls less distributions of partners who have since left. */
  formerNet?: number;
  log: { date: string; text: string }[];
}

// ---- Buying clubs (franchisemarket.ts, takeover.ts) ----

/** How the player holds their club: in control, as a minority partner, or as a buyer still looking. */
export interface TenureState {
  role: "control" | "minority" | "buyer";
  /** A minority partner's share. */
  stake?: number;
  /** Who controls the club when the player doesn't. */
  controller?: string;
  /** Every club the player has owned or held a stake in. */
  clubs: { team: string; from: string; to?: string; how: string; price?: number; proceeds?: number; share?: number }[];
  /** Names a club kept after the player rebranded it and left. */
  brands?: Record<string, string>;
}

/** A club up for sale. */
export interface Listing {
  team: string;
  since: string;
  reason: "estate" | "family" | "liquidity" | "governance" | "offer";
  seller: string;
  ask: number;
  status: "open" | "sold" | "withdrawn";
  closes: string;
  buyer?: string;
  price?: number;
}

export interface Finding {
  kind: "debt" | "lawsuit" | "lease" | "guarantees" | "capex" | "books";
  text: string;
  /** Extra debt or claims the buyer takes on, cash the club will need, and the hit to what it's worth. */
  assumed: number;
  cashNeed: number;
  valueHit: number;
}

export interface RivalBid { name: string; price: number; cash: boolean; note: string }

/** The player's purchase of a club, from interest to closing. */
export interface ClubDeal {
  id: string;
  team: string;
  opened: string;
  stage: "diligence" | "bidding" | "exclusive" | "league" | "closed" | "failed";
  /** When the current stage resolves. */
  due: string;
  costs: number;
  findings: Finding[];
  bid?: { price: number; financingOut: boolean; date: string };
  rivals: RivalBid[];
  financing?: { lp: number; pe: number; debt: number; trust: number; terms: StakeTerms };
  vote?: { yes: number; needed: number };
  failed?: string;
  /** The closing statement, once it closes. */
  closing?: { price: number; assumedDebt: number; claims: number; cash: number; equityPrice: number; costs: number; ownerEquity: number; partners: number; debt: number; trust: number; proceeds: number; share: number };
}

export interface FranchiseMarketState {
  listings: Listing[];
  deal?: ClubDeal;
  deals: { team: string; opened: string; outcome: string }[];
  /** Comparable sales: a few real ones and every sale in this league. */
  sales: { team: string; date: string; price: number; pct: number; buyer: string; real?: boolean }[];
  /** Who controls each club now, where it has changed hands. */
  control: Record<string, string>;
  log: { date: string; text: string }[];
}

// ---- Cause and effect, and versioned records (causes.ts, archive.ts) ----

export interface CauseEntry {
  id: string;
  date: string;
  system: string;
  text: string;
  effects: { date: string; text: string }[];
  /** What to follow into later seasons. */
  ref?: { kind: "player" | "trade" | "coach" | "club"; id: string };
  followed?: number[];
  /** What the staff expected (compare.ts), checked against what happened. */
  forecast?: {
    metric: string; unit: "wins" | "money" | "holders" | "pct" | "games"; low: number; mid: number; high: number;
    attribution: "direct" | "partial" | "weak"; option: string; measure: "teamWins" | "holders" | "interest" | "revenue"; baseline: number; key?: string;
  };
  /** The forecast against the result, once a season has played out. */
  outcome?: { season: number; observed: number; within: boolean; text: string };
}

/** One league year as it closed: our contracts, cap, statement and the rules in force. */
export interface YearRecord {
  year: number;
  team: string;
  owner: string;
  taken: string;
  season: number;
  contracts: { player: string; apy: number; through: number; hit: number }[];
  cap: { limit: number; used: number; dead: number };
  statement?: { revenue: number; operating: number; net: number; cashEnd: number; debtEnd: number };
  rules: string[];
}

// ---- The other clubs as organizations (rivals.ts) ----

/** A CPU club: its owner's style, who runs football, its money and its reputation (made up from the seed). */
export interface ClubProfile {
  team: string;
  style: "winNow" | "builder" | "profit" | "steady";
  governance: "owner" | "president" | "gm" | "coach";
  /** Seasons the owner gives a coach, 1-5, and how freely the owner spends (about 1). */
  patience: number;
  spend: number;
  /** Management reputation and pull with candidates, 0-100 (shown in words). */
  rep: number;
  hiring: number;
  /** Engine only: the club's cash, and whether it's short. */
  cash: number;
  tight: boolean;
  saleLooked?: string;
  meddles: { date: string; text: string }[];
  /** What the club remembers: big decisions and dealings with us. */
  memory: { date: string; text: string; weight: number }[];
  /** Head coach and GM searches that dragged on (role and opening date). */
  slow: string[];
  since: string;
  owner: string;
  hc?: string;
  gm?: string;
}

export interface RivalsState {
  clubs: Record<string, ClubProfile>;
  reviewed?: number;
  log: { date: string; text: string }[];
}

// ---- Succession and the end of a tenure (succession.ts) ----

/** A possible heir (made up). The owner sees them only through reports; the numbers are engine only. */
export interface Heir {
  id: string;
  name: string;
  relation: "child" | "spouse" | "niece or nephew";
  age: number;
  /** Engine only, 0 to 1: wanting to run the club, business sense, football sense, steadiness. */
  interest: number;
  acumen: number;
  football: number;
  temper: number;
  /** Working at the club: learning, and seen more clearly. */
  role: boolean;
  /** Engine only, 0-100: resentment at being passed over. */
  grudge: number;
}

/** The player's sale of the whole club. */
export interface OwnerSale {
  stage: "marketing" | "bids" | "league" | "closed" | "failed";
  opened: string;
  due: string;
  bids: { name: string; price: number; cash: boolean }[];
  chosen?: string;
  failed?: string;
  net?: { price: number; debt: number; cash: number; fees: number; partners: number; tax: number; net: number; paidIn: number; out: number; multiple: number; annual: number; years: number };
}

export interface LegacyReview {
  date: string;
  owner: string;
  clubs: string[];
  overall: number;
  parts: { area: string; score: number; text: string }[];
  verdict: string;
}

export interface SuccessionState {
  /** The controlling owner's birth year and health (0-100, shown in words). */
  born: number;
  health: number;
  involvement: "full" | "chair" | "retired";
  heirs: Heir[];
  successor?: string;
  trustee?: string;
  /** The league's pre-approval of the successor, and a pending review's date. */
  approved?: boolean;
  review?: string;
  /** Engine only, 0-100: how united the family is. */
  cohesion: number;
  /** Life insurance held for estate taxes (face amount). */
  insurance: number;
  generation: number;
  sale?: OwnerSale;
  /** The estate being settled after a death or hand-over. */
  estate?: { date: string; tax: number; paid: number; short: number; owner: string };
  /** A tenure that just ended, waiting on the player's choice. */
  pending?: { date: string; why: "death" | "sale" | "stepdown" };
  /** The game's end, with its legacy review. */
  ended?: LegacyReview;
  history: { date: string; text: string }[];
}

// ---- The owner's own wealth (wealth.ts) ----

export type Holding = "stocks" | "bonds" | "realEstate" | "business";

export interface WealthState {
  /** The owner's outside holdings by kind; together they make up `owner.outside`. */
  holdings: Record<Holding, number>;
  /** Sales of slow assets waiting to close: the cash lands on the date. */
  pending: { kind: Holding; amount: number; proceeds: number; date: string }[];
  /** A stock-market index since the owner took over (1 = then). */
  index: number;
  lastRealEstate?: number;
  /** What the owner's money would be worth in the stock market instead, and the flows already counted. */
  alt: number;
  seen: { putIn: number; takenOut: number; proceeds: number };
  /** A family office managing the holdings, and money moved into a family trust (no longer the owner's to spend). */
  familyOffice: boolean;
  trust: number;
  /** The owner's own foundation, separate from the club's. */
  foundation: { endowment: number; focus: "education" | "health" | "city" | "arts"; givenThisYear: number; granted: number };
  /** How public the owner is, and the public's sense of them (0-100). */
  visibility: "private" | "engaged" | "spotlight";
  profile: number;
  conflicts: { date: string; what: string; outcome: string }[];
  /** Monthly net worth readings. */
  history: { month: string; worth: number; team: number }[];
  log: { date: string; text: string }[];
}

// ---- Executives, delegation and decision memos (executives.ts, delegation.ts, memos.ts) ----

export type ExecRole = "PRES" | "FOPS" | "CFO" | "CRO" | "COO" | "GC" | "SOD" | "MKT" | "CTO";

/** A business or football-operations executive (made-up people). */
export interface Exec {
  id: string;
  name: string;
  born: number;
  background: "sports" | "finance" | "consulting" | "tech" | "media" | "law" | "hospitality";
  /** Earlier jobs, newest first, as a resume reads. */
  resume: string[];
  /** Years in senior jobs. */
  years: number;
  style: "cautious" | "steady" | "bold";
  role: ExecRole | null;
  /** The number two in a department, ready to step in. */
  deputyOf?: ExecRole;
  hired?: string;
  contract?: { through: number; salary: number; guaranteed: boolean };
  /** Engine only: ability, leadership and ambition, 0-100, and yearly growth. */
  hidden: { skill: number; leadership: number; ambition: number; growth: number };
  /** Engine only: how happy they are in the job, 0-100. */
  satisfaction: number;
  /** Season-by-season reviews, newest first. */
  reviews: { year: number; score: number; text: string }[];
}

export interface ExecSearch {
  role: ExecRole;
  opened: string;
  firm: string;
  pool: string[];
  /** What the owner learned in interviews, by candidate: the topics asked and the answers. */
  asked: Record<string, { topic: string; answer: string }[]>;
  /** The search firm's read on each candidate, 0-100. */
  read: Record<string, number>;
  /** Candidates who turned the job down. */
  declined: string[];
}

export interface ExecState {
  people: Record<string, Exec>;
  chart: Partial<Record<ExecRole, string>>;
  reportsTo: Record<ExecRole, ExecRole | "owner">;
  searches: ExecSearch[];
  /** Fired executives still being paid. */
  owed: { id: string; salary: number; through: number }[];
  /** How the job market sees the club as an employer, 0-100 (engine only; shown in words). */
  reputation: number;
  log: { date: string; text: string }[];
  /** Departures and their cost: fees and severance. */
  departures: { date: string; role: ExecRole; why: "fired" | "left" | "retired"; cost: number }[];
  reorgs: number;
}

export type DecisionArea = "signings" | "trades" | "coaching" | "pricing" | "events" | "sponsors" | "financing";
export type DecisionMode = "owner" | "approve" | "delegate";

export interface MemoOption {
  label: string;
  effect: string;
  evidence?: "confirmed" | "estimate" | "opinion";
}

/** A decision memo: the proposal, who's responsible, the case, the money and the deadline. */
export interface Memo {
  id: string;
  kind: "signing" | "street" | "trade" | "pricing" | "retain" | "overrun" | "refinance" | "coachReview" | "execReview" | "complaint" | "dispute" | "incident" | "general";
  date: string;
  area?: DecisionArea;
  from: string;
  title: string;
  problem: string;
  proposal: string;
  amount?: number;
  /** When the money actually goes out. */
  cash?: { when: string; amount: number }[];
  cap?: string;
  comparables?: string[];
  options: MemoOption[];
  risks: string[];
  budget: string;
  /** The option the executive recommends, and the conditions on it. */
  recommend: number;
  conditions?: string;
  deadline: string;
  ifLate: string;
  status: "open" | "researching" | "decided" | "lapsed";
  /** Back on the desk on this date after more research. */
  until?: string;
  choice?: number;
  decided?: string;
  notes: string[];
  payload?: Record<string, unknown>;
}

export interface OfficeTask {
  id: string;
  title: string;
  kind: string;
  who: ExecRole | "GM";
  set: string;
  due: string;
  status: "open" | "done";
  result?: string;
}

export interface OfficeState {
  modes: Record<DecisionArea, DecisionMode>;
  /** Deals above these need the owner's sign-off even when delegated. */
  /** Dollar limits on what the staff may commit without the owner: average per year and guaranteed money on a contract, and borrowing. */
  limits: { contractApy: number; debt: number; guaranteed?: number; areas?: Partial<Record<DecisionArea, number>> };
  /** Reports the owner saved to run again: a name, a report type and its settings. */
  reports?: { id: string; name: string; kind: string; params: Record<string, string> }[];
  /** How each area reports what it did: every action, a weekly summary, or only exceptions. */
  alerts: Record<DecisionArea, "every" | "weekly" | "exceptions">;
  /** Every consequential decision: who proposed it, who approved it and why. */
  trail: { date: string; area: string; what: string; by: string; approved: "owner" | "delegated" | "policy"; amount?: number; why?: string }[];
  /** Delegated actions waiting for the weekly summary. */
  digest: { date: string; area: DecisionArea; text: string }[];
  memos: Memo[];
  meetings: { date: string; topics: string[]; minutes: string[]; tasks: string[] }[];
  tasks: OfficeTask[];
  /** Compliance and operations incidents. */
  incidents: { date: string; kind: "compliance" | "operations" | "systems"; text: string; cost: number }[];
  /** Month by month: fans, press, head coach and staff confidence. */
  trends: { month: string; fans: number; media: number; coach: number; staff: number }[];
  /** A cost-savings drive running to the end of the league year. */
  savings?: { year: number; rate: number };
  /** Extra stadium bookings the operations staff is chasing, until a date. */
  bookingPush?: string;
  /** A compliance review that lowers the chance of trouble, until a date. */
  compliance?: string;
  /** The league year the office last closed out (reviews run when it changes). */
  year?: number;
  /** Trade offers the GM has already written up. */
  seen?: string[];
  /** The owner has looked over the staff's delegated decisions up to this date (queue.ts). */
  reviewed?: string;
}

// ---- Culture and relationships (culture.ts) ----

export type CultureIndicator = "trust" | "stability" | "fairness" | "accountability" | "communication" | "morale";

export interface CultureState {
  /** Engine only: how much the GM trusts the owner, 0-100. */
  gmTrust: number;
  /** Engine only: how well the GM and the head coach work together, 0-100, and the pair it was measured for. */
  cooperation: number;
  pair: string;
  /** Engine only: how fairly the staff thinks it is treated, 0-100 (moves with how complaints are handled). */
  fairness: number;
  /** The staff development budget, 0 (none) to 3 (top of the league). */
  development: number;
  /** Engine only: relationships outside the building, 0-100: reporters' sources inside the club, sponsors' confidence, the community. */
  rel: { sources: number; sponsors: number; community: number };
  /** Month by month readings of the six culture indicators. */
  history: ({ month: string } & Record<CultureIndicator, number>)[];
  leaks: { date: string; text: string }[];
  log: { date: string; text: string }[];
  /** Authority the owner took back from someone who wants it, waiting to be raised. */
  disputes?: { who: ExecRole; area: DecisionArea; from: DecisionMode; date: string }[];
}

// ---- Honors and records (see engine/honors.ts, engine/records.ts) ----

export type Award = "MVP" | "OPOY" | "DPOY" | "OROY" | "DROY" | "CPOY" | "COY";

export interface AwardResult { award: Award; winner: string; team: string; name: string; finalists: string[] }

export interface HonorsState {
  /** Pro Bowl selections by season (the original ballot, which is what the CBA counts). */
  proBowl: Record<number, string[]>;
  allPro: Record<number, { first: string[]; second: string[] }>;
  awards: Record<number, AwardResult[]>;
  /**
   * Hall of Fame classes elected in this save (halloffame.ts) by class year, and
   * each year's modern-era finalists. Real classes before the save live in
   * data/hof. Ids are player ids, or "hof:<key>" for people from the data.
   */
  hof: {
    classes: Record<number, string[]>;
    finalists: Record<number, string[]>;
    /** The full ballot of each vote: who reached which round and how the panel voted. Absent in older saves. */
    ballots?: Record<number, HofBallot>;
    /** Marks against a player's name from discipline cases in this save: [conduct, things said in public]. */
    rep?: Record<string, [number, number]>;
    /** The last discipline case read into `rep`. */
    seen?: string;
  };
}

/** One candidate on a Hall of Fame ballot. */
export interface HofEntry {
  id: string;
  /** How far he got: 25 semifinalist, 15 finalist, 10 and 5 the reduction votes; 1 a senior or coach/contributor finalist. */
  stage: 25 | 15 | 10 | 5 | 1;
  /** Share of the panel that voted yes in the final vote, 0-100. */
  share?: number;
  elected?: boolean;
  /** His year on the ballot (1 = first year eligible). */
  year: number;
  /** What held him back, in the papers' words. */
  why?: string;
}

/** A year's Hall of Fame vote by the panel of Hall of Famers. */
export interface HofBallot {
  /** The voters: Hall of Fame players drawn for this year. */
  panel: string[];
  modern: HofEntry[];
  seniors: HofEntry[];
  builders: HofEntry[];
}

/** A best mark: who, for whom, how much, and when. */
export interface Mark { player: string; team: string; value: number; season: number; date: string }

export interface RecordsState {
  /** The best single-game and single-season marks set in this save, by stat. */
  game: Record<string, Mark>;
  season: Record<string, Mark>;
  /** NFL records broken in this save, newest first. */
  broken: { date: string; text: string }[];
  /** Every meeting between two teams in this save, by pair ("ARI-ATL", sorted). */
  h2h: Record<string, { games: number; wins: Record<string, number>; close: number; playoff: number; last: string }>;
  /** Each club's valuation at the end of each league year. */
  values: Record<number, Record<string, number>>;
  /** Career milestones and records already marked, by player ("passYds:50000", "rec:record"). */
  career?: Record<string, string[]>;
}
