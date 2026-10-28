// The business side: the team's books, the gate, the stadium calendar and the
// departments the owner funds.
//
// Money comes in from the league (national TV, licensing and the shared gate
// pool, split 32 ways), from home games (season and single-game tickets,
// suites and clubs, concessions, parking, the team store), from local
// sponsors and naming rights, and from whatever else the stadium hosts. How
// much of the stadium money the team keeps depends on who owns and runs the
// building (see stadiums.ts). Money goes out to players (the cash ledger in
// finance.ts, which is not the cap), staff, the building, travel, the league
// and the bank.
//
// Gate sharing follows the league's rule: 34% of general ticket receipts, after
// a 15% deduction for stadium costs, goes into a pool split evenly among all
// 32 teams. Suites and the premium part of club seats aren't shared. Playoff
// gates go to the league, and teams that give up a home game to play abroad
// are made whole by the league.
import { addDays, daysBetween, shortDate, weekday } from "./dates";
import { dealOf, dealYear, leagueYear, leagueYearStart, salaryCap } from "./contracts";
import { cfbDate, COLLEGE_SCHEDULE, COLLEGE_TEAM, COLLEGE_TEAMS } from "./collegeData";
import { money, news, send } from "./inbox";
import { BASE_SEASON, onSeasonChange, RULES, SCHEDULE, TEAM_BY_ID, TEAMS, teamLabel } from "./league";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { addStory, MEDIA_BY_ID, mediaState } from "./outlets";
import { rngFor, type Rng } from "./rng";
import { controlOf, DRAW, MARKETS, STADIUM_BY_TEAM, type Stadium } from "./stadiums";
import { standings, winPct } from "./standings";
import { teamStaff } from "./staff";
import type { BusinessState, ConcessionTier, Dept, EventKind, GameResult, GameState, LedgerCat, ScheduledGame, StadiumEvent } from "./types";

const KEY = RULES.keyDates;
const M = 1_000_000;

/** Each team's share of national revenue (TV, NFL Ventures, licensing) by league year: it moves with the cap, which is built on it. */
export function nationalRevenue(year: number): number {
  if (year <= BASE_SEASON) return 472 * M;
  return Math.round(472 * M * salaryCap(undefined, year) / salaryCap(undefined, BASE_SEASON));
}

/** Prices and costs that rise with the years, about 4% a year from the first season. */
function inflation(year: number, rate = 0.04): number {
  return Math.pow(1 + rate, Math.max(0, year - BASE_SEASON));
}

/** Gate sharing: 34% of general ticket money after a 15% stadium deduction. */
const GATE_SHARE = 0.34 * 0.85;
/** Share of seats that are suites and club seats. */
const PREMIUM_SEATS = 0.12;
const OPENING_CASH = 100 * M;
/** How far the team can draw on its credit line before the owner has to put money in. */
export const CREDIT_LINE = 300 * M;
const INTEREST = 0.075;
/** The stadium calendar runs a season at a time, to the eve of the draft. */
let CALENDAR_END = "";
/** The window to set next season's season-ticket and premium prices: after the regular season, before renewals. */
export let PRICING_OPENS = "";
export let RENEWAL_DEADLINE = "";
let DEPOSITS_DUE = "";
let VALUATIONS_DAY = "";
onSeasonChange(() => {
  CALENDAR_END = addDays(KEY.draftStart, -1);
  PRICING_OPENS = addDays(KEY.regularSeasonEnd, 1);
  RENEWAL_DEADLINE = `${RULES.season + 1}-03-31`;
  DEPOSITS_DUE = `${RULES.season + 1}-04-15`;
  VALUATIONS_DAY = addDays(KEY.regularSeasonStart, -7);
});
const COLD = new Set(["BUF", "NE", "NYJ", "NYG", "CLE", "PIT", "CIN", "BAL", "CHI", "GB", "DEN", "KC", "PHI", "WAS", "SEA", "TEN"]);

// ---- Departments ----

export const BUDGET_LEVELS = ["Lean", "League average", "Above average", "Top of the league"] as const;

export const DEPTS: Record<Dept, { label: string; what: string; cost: number[]; perGame?: boolean }> = {
  marketing: { label: "Marketing and ticket sales", what: "Advertising, the ticket sales staff and the team's brand. Fills seats and keeps sponsors happy.", cost: [8 * M, 14 * M, 22 * M, 32 * M] },
  gameday: { label: "Game-day experience", what: "Staffing, entertainment, cleanliness and service at home games. Fans notice.", cost: [0.8 * M, 1.3 * M, 1.9 * M, 2.6 * M], perGame: true },
  community: { label: "Community relations", what: "The foundation, youth football, hospital visits and the team's name in town.", cost: [2 * M, 5 * M, 9 * M, 14 * M] },
  medical: { label: "Medical and training", what: "Trainers, physical therapists, sports science and recovery equipment.", cost: [6 * M, 10 * M, 15 * M, 21 * M] },
  facilities: { label: "Training facility", what: "The practice facility, weight room, meeting rooms and players' lounge. Coaches and players live there.", cost: [10 * M, 17 * M, 26 * M, 36 * M] },
};

/** Football staff (coaches, scouts, the front office) and business staff, by team per year. */
const FOOTBALL_STAFF = 85 * M;
const BENEFITS = 50 * M;
const LEAGUE_DUES = 8 * M;
function businessOps(team: string): number {
  // Sales, finance, legal, IT, insurance and the rest of running a company.
  return Math.round(MARKETS[team].target * 0.12 + 15 * M);
}

const CONCESSIONS: Record<ConcessionTier, { label: string; perCap: number; fans: number; demand: number }> = {
  value: { label: "Value menu", perCap: 18 * 1.35, fans: 0.6, demand: 1.02 },
  standard: { label: "Market prices", perCap: 27, fans: 0, demand: 1 },
  premium: { label: "Premium prices", perCap: 33 * 0.9, fans: -0.4, demand: 0.99 },
};
export const CONCESSION_LABEL: Record<ConcessionTier, string> = { value: CONCESSIONS.value.label, standard: CONCESSIONS.standard.label, premium: CONCESSIONS.premium.label };
/** The team's commission on concession sales. */
const CONCESSION_COMMISSION = 0.42;

export const CATEGORY: Record<LedgerCat, { label: string; side: "in" | "out" }> = {
  national: { label: "National revenue (TV, licensing)", side: "in" },
  gatePool: { label: "Shared gate pool", side: "in" },
  tickets: { label: "Tickets", side: "in" },
  premium: { label: "Suites and club seats", side: "in" },
  concessions: { label: "Concessions", side: "in" },
  parking: { label: "Parking", side: "in" },
  merch: { label: "Team store", side: "in" },
  sponsorship: { label: "Local sponsorship and media", side: "in" },
  naming: { label: "Stadium naming rights", side: "in" },
  events: { label: "Stadium events", side: "in" },
  intl: { label: "League compensation for home games abroad", side: "in" },
  deposits: { label: "Season-ticket deposits for next season", side: "in" },
  capital: { label: "Capital from the owner", side: "in" },
  gateShare: { label: "Gate receipts sent to the league pool", side: "out" },
  players: { label: "Player salaries and bonuses (cash)", side: "out" },
  staff: { label: "Coaches, scouts and front office", side: "out" },
  businessOps: { label: "Business operations staff", side: "out" },
  marketing: { label: DEPTS.marketing.label, side: "out" },
  gameday: { label: DEPTS.gameday.label, side: "out" },
  community: { label: DEPTS.community.label, side: "out" },
  medical: { label: DEPTS.medical.label, side: "out" },
  facilities: { label: DEPTS.facilities.label, side: "out" },
  scouting: { label: "Draft scouting trips", side: "out" },
  stadium: { label: "Stadium operations and upkeep", side: "out" },
  rent: { label: "Stadium rent", side: "out" },
  debt: { label: "Stadium debt service", side: "out" },
  travel: { label: "Team travel", side: "out" },
  benefits: { label: "Player benefits (league plans)", side: "out" },
  league: { label: "League dues and assessments", side: "out" },
  fines: { label: "League fines", side: "out" },
  interest: { label: "Interest on the credit line", side: "out" },
  distribution: { label: "Distributions to the owner", side: "out" },
};

/** Below-the-line items: they move cash but aren't operating income. */
const FINANCING: LedgerCat[] = ["capital", "distribution", "deposits"];

// ---- Setup ----

function premiumSeats(s: Stadium): number {
  return Math.round(s.capacity * PREMIUM_SEATS);
}
function generalSeats(s: Stadium): number {
  return s.capacity - premiumSeats(s);
}
function defaultHolders(team: string): number {
  return Math.round(generalSeats(STADIUM_BY_TEAM[team]) * MARKETS[team].stShare);
}

export function business(state: GameState): BusinessState {
  return (state.business ??= newBusiness(state));
}

function newBusiness(state: GameState): BusinessState {
  const us = state.userTeam;
  const b: BusinessState = {
    opening: OPENING_CASH,
    ledger: [],
    prices: { single: 1, concessions: us === "ATL" ? "value" : "standard", parking: 1 },
    holders: defaultHolders(us),
    budget: { marketing: 1, gameday: 1, community: 1, medical: 1, facilities: 1 },
    gates: [],
    events: [],
    pool: 0,
    months: [],
    seen: { paid: { ...Object.fromEntries(Object.entries(state.finance[us]?.paid ?? {})) }, scouting: state.college?.scouting.spent ?? 0, fines: state.media?.fines.length ?? 0 },
    sellouts: 0,
    priceLog: [],
  };
  b.events = standingCalendar(state, us);
  state.business = b;
  openBooks(state);
  return b;
}

/**
 * A new season on the books, the day after the draft: renewed season-ticket
 * holders and the new prices take over, and the stadium calendar fills in
 * through next spring.
 */
export function newBusinessSeason(state: GameState): void {
  const b = business(state);
  const idx = b.index ?? { season: 1, premium: 1 };
  b.index = { season: idx.season * (b.next?.season ?? 1.03), premium: idx.premium * (b.next?.premium ?? 1.03) };
  b.holders = b.renewal?.holders ?? b.holders;
  delete b.renewal;
  delete b.next;
  delete b.ask;
  const year = leagueYear(state.date);
  // Older years leave the ledger; their net stays in the opening balance.
  const old = b.ledger.filter((e) => e.year < year - 2);
  b.opening += old.reduce((t, e) => t + e.amount, 0);
  b.ledger = b.ledger.filter((e) => e.year >= year - 2);
  b.gates = b.gates.slice(0, 60);
  b.priceLog = b.priceLog.slice(0, 30);
  const cutoff = addDays(state.date, -365);
  b.events = [...b.events.filter((e) => e.date >= cutoff), ...standingCalendar(state, state.userTeam)];
}

/** Saves from before the business side get the books opened today. */
export function ensureBusiness(state: GameState): void {
  if (!state.business) state.business = newBusiness(state);
}

/** The made-up head of the business side. */
export function businessChief(state: GameState): string {
  const rng = rngFor(state.seed, `bizchief:${state.userTeam}`);
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return `${first} ${last}, president of business operations`;
}

// ---- The ledger ----

function post(state: GameState, cat: LedgerCat, amount: number, note?: string, year = leagueYear(state.date)): void {
  if (!amount) return;
  business(state).ledger.push({ date: state.date, year, cat, amount: Math.round(amount), note });
}

export function cashBalance(state: GameState): number {
  const b = business(state);
  return b.opening + b.ledger.reduce((s, e) => s + e.amount, 0);
}

export interface PnL {
  year: number;
  revenue: { cat: LedgerCat; amount: number }[];
  expenses: { cat: LedgerCat; amount: number }[];
  financing: { cat: LedgerCat; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  operating: number;
}

export function pnl(state: GameState, year: number): PnL {
  const sums = new Map<LedgerCat, number>();
  for (const e of business(state).ledger) if (e.year === year) sums.set(e.cat, (sums.get(e.cat) ?? 0) + e.amount);
  const order = Object.keys(CATEGORY) as LedgerCat[];
  const rows = order.filter((c) => sums.has(c)).map((cat) => ({ cat, amount: sums.get(cat)! }));
  const revenue = rows.filter((r) => !FINANCING.includes(r.cat) && CATEGORY[r.cat].side === "in");
  const expenses = rows.filter((r) => !FINANCING.includes(r.cat) && CATEGORY[r.cat].side === "out" && r.cat !== "gateShare");
  // Gate shared out reduces ticket revenue rather than counting as an expense.
  const shared = sums.get("gateShare") ?? 0;
  if (shared) revenue.push({ cat: "gateShare", amount: shared });
  const financing = rows.filter((r) => FINANCING.includes(r.cat));
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = -expenses.reduce((s, r) => s + r.amount, 0);
  return { year, revenue, expenses, financing, totalRevenue, totalExpenses, operating: totalRevenue - totalExpenses };
}

// ---- Public estimates for every team ----

function homeDates(team: string): string[] {
  return SCHEDULE.filter((g) => g.home === team && !g.neutral && (g.type === "PRE" || g.type === "REG")).map((g) => g.date);
}

/** The stadium's yearly event income at a typical calendar, before the team's share. */
function typicalEvents(s: Stadium): number {
  const base = { owned: 16 * M, coowned: 14 * M, publicTeam: 12 * M, publicAuthority: 10 * M, tenant: 0 }[s.structure];
  return base + s.fixed.reduce((t, e) => t + e.net, 0) + (s.collegeTenant ? 6 * 0.6 * M : 0) + (s.mls ? 10 * 0.35 * M : 0);
}

/** Local sponsorship and media: what a typical season needs to reach the team's revenue estimate. */
const SPONSORSHIP: Record<string, number> = {};
function sponsorship(team: string): number {
  if (SPONSORSHIP[team] !== undefined) return SPONSORSHIP[team];
  const s = STADIUM_BY_TEAM[team];
  const mk = MARKETS[team];
  const games = SCHEDULE.filter((g) => g.home === team && !g.neutral && (g.type === "PRE" || g.type === "REG"));
  let gate = 0;
  for (const g of games) {
    const r = gateModel(team, g, { mood: 1, win: 1, marketing: 1, price: 1, concessions: team === "ATL" ? "value" : "standard", parking: 1, noise: 1, ticketIdx: 1, premiumIdx: 1 });
    gate += r.tickets * (1 - GATE_SHARE) + r.premium + r.concessions + r.parking + r.merch;
  }
  const abroad = SCHEDULE.filter((g) => g.home === team && g.neutral && g.type === "REG").length;
  gate += abroad * (gate / Math.max(1, games.length));
  // The shared pool comes back about even for a typical team.
  const landlord = team === "LA" ? 30 * M : 0;
  const baseline = nationalRevenue(BASE_SEASON) + s.naming * s.namingShare + typicalEvents(s) * s.eventShare + gate + landlord;
  SPONSORSHIP[team] = Math.max(30 * M, mk.target - baseline);
  return SPONSORSHIP[team];
}

/** A public estimate of a team's revenue this league year, the way business reporters build them. */
export function revenueEstimate(state: GameState, team: string): number {
  const rec = standings(state)[team];
  const played = rec ? rec.w + rec.l + rec.t : 0;
  const wp = played ? winPct(rec.w, rec.l, rec.t) : 0.5;
  return Math.round(MARKETS[team].target * (0.97 + 0.06 * wp) * inflation(leagueYear(state.date), 0.06));
}

/** A franchise value estimate: a revenue multiple, richer for teams that control their building and markets that pay. */
export function valuation(state: GameState, team: string): number {
  const s = STADIUM_BY_TEAM[team];
  const mult = 8.0 + { owned: 1.1, coowned: 0.9, publicTeam: 0.35, publicAuthority: 0, tenant: -0.3 }[s.structure] + (MARKETS[team].pull >= 1.15 ? 0.6 : 0) + (MARKETS[team].target >= 850 * M ? 0.5 : 0);
  return Math.round(revenueEstimate(state, team) * mult / (50 * M)) * 50 * M;
}

/** Rough yearly operating income at league-average budgets (for the league table). */
export function operatingEstimate(state: GameState, team: string): number {
  const s = STADIUM_BY_TEAM[team];
  const players = 300 * M * salaryCap(state, leagueYear(state.date)) / salaryCap(state, BASE_SEASON);
  const depts = (Object.keys(DEPTS) as Dept[]).reduce((t, d) => t + DEPTS[d].cost[1] * (DEPTS[d].perGame ? homeDates(team).length : 1), 0);
  const costs = players + FOOTBALL_STAFF + BENEFITS + LEAGUE_DUES + businessOps(team) + depts + s.upkeep + s.rent + s.debt + 4 * M;
  return revenueEstimate(state, team) - Math.round(costs);
}

// ---- The gate ----

interface GateInputs {
  mood: number;
  win: number;
  marketing: number;
  price: number;
  concessions: ConcessionTier;
  parking: number;
  noise: number;
  /** Season-ticket and premium prices against the 2026 market prices. */
  ticketIdx: number;
  premiumIdx: number;
}

interface GateResult {
  sold: number;
  attendance: number;
  holders: number;
  singleSeats: number;
  singleSold: number;
  singlePrice: number;
  heat: number;
  tickets: number;
  premium: number;
  concessions: number;
  parking: number;
  merch: number;
}

/** Ticket demand and money for one home game. */
function gateModel(team: string, g: ScheduledGame, x: GateInputs, holders = defaultHolders(team)): GateResult {
  const s = STADIUM_BY_TEAM[team];
  const mk = MARKETS[team];
  const general = generalSeats(s);
  const opp = g.home === team ? g.away! : g.home!;
  const pre = g.type === "PRE";
  const month = Number(g.date.slice(5, 7));
  const prime = g.weekday === "Monday" || g.weekday === "Thursday" || g.timeET >= "20:00";
  const cold = s.roof === "open" && COLD.has(team) && (month === 12 || month === 1);
  const index = mk.pull * x.mood * x.win * x.marketing * (DRAW[opp] ?? 1) * (g.divisionGame ? 1.03 : 1) * (prime ? 1.05 : 1) *
    (cold ? 0.95 : 1) * (pre ? 0.8 : 1) * CONCESSIONS[x.concessions].demand * x.noise;
  const want = general * index * 1.05;
  const singleSeats = Math.max(0, general - holders);
  const singlePrice = mk.ticket * x.ticketIdx * 1.2 * x.price * (pre ? 0.6 : 1);
  const singleWant = Math.max(0, want - holders) * Math.pow(x.price, -1.5);
  const singleSold = Math.round(Math.min(singleSeats, singleWant));
  const sold = holders + singleSold + premiumSeats(s);
  const attendance = Math.round((holders + singleSold) * (pre ? 0.82 : 0.93) + premiumSeats(s) * 0.9);
  const regHome = SCHEDULE.filter((x2) => x2.type === "REG" && x2.home === team && !x2.neutral).length;
  const preHome = SCHEDULE.filter((x2) => x2.type === "PRE" && x2.home === team && !x2.neutral).length;
  const tickets = holders * mk.ticket * x.ticketIdx * (pre ? 0.6 : 1) + singleSold * singlePrice;
  // Suite and club money is spread over the home schedule; preseason games count half.
  const premium = (mk.premium * x.premiumIdx / Math.max(1, regHome + 0.5 * preHome)) * (pre ? 0.5 : 1);
  const concessions = attendance * CONCESSIONS[x.concessions].perCap * CONCESSION_COMMISSION * s.gameDayShare;
  const parking = (attendance / 2.9) * mk.parking * x.parking * Math.pow(x.parking, -0.4) * s.gameDayShare;
  const merch = attendance * 11 * 0.45;
  return {
    sold, attendance, holders, singleSeats, singleSold, singlePrice: Math.round(singlePrice), heat: singleSeats ? singleWant / singleSeats : 2,
    tickets: Math.round(tickets), premium: Math.round(premium), concessions: Math.round(concessions), parking: Math.round(parking), merch: Math.round(merch),
  };
}

function inputs(state: GameState, team: string, rng?: Rng): GateInputs {
  const ours = team === state.userTeam;
  const b = state.business;
  const rec = standings(state)[team];
  const played = rec ? rec.w + rec.l + rec.t : 0;
  const win = played >= 2 ? 0.88 + 0.24 * winPct(rec.w, rec.l, rec.t) : 1;
  return {
    mood: ours ? 0.8 + state.pressure.fans / 250 : 1,
    win,
    marketing: ours && b ? [0.95, 1, 1.04, 1.07][b.budget.marketing] * [0.98, 1, 1.01, 1.02][b.budget.gameday] : 1,
    price: ours && b ? b.prices.single : 1,
    concessions: ours && b ? (controlOf(STADIUM_BY_TEAM[team]).concessions ? b.prices.concessions : "standard") : team === "ATL" ? "value" : "standard",
    parking: ours && b && controlOf(STADIUM_BY_TEAM[team]).parking ? b.prices.parking : 1,
    noise: rng ? 0.96 + rng() * 0.08 : 1,
    ticketIdx: ours && b?.index ? b.index.season : inflation(RULES.season, 0.035),
    premiumIdx: ours && b?.index ? b.index.premium : inflation(RULES.season, 0.035),
  };
}

/** What the business staff expects at a home game, for the Business page. */
export function gateForecast(state: GameState, g: ScheduledGame): { sold: number; capacity: number; heat: number; singlePrice: number } {
  const team = state.userTeam;
  const r = gateModel(team, g, inputs(state, team), business(state).holders);
  return { sold: r.sold, capacity: STADIUM_BY_TEAM[team].capacity, heat: r.heat, singlePrice: r.singlePrice };
}

export function billions(n: number): string {
  return `$${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`;
}

function fans(state: GameState, delta: number): void {
  state.pressure.fans = Math.max(0, Math.min(100, state.pressure.fans + delta));
}

/** A game was played: the gate, the shared pool, travel, and how our fans took it. */
export function businessGame(state: GameState, g: ScheduledGame, r: GameResult): void {
  const b = business(state);
  const us = state.userTeam;
  const home = r.home;
  const rng = rngFor(state.seed, `gate:${g.id}`);
  // Every regular-season and preseason gate feeds the league pool.
  if (!g.neutral && (g.type === "PRE" || g.type === "REG")) {
    const gr = gateModel(home, g, inputs(state, home, rng), home === us ? b.holders : defaultHolders(home));
    b.pool += gr.tickets * GATE_SHARE;
    if (home === us) homeGate(state, g, gr);
    // The Rams' owner is the Chargers' landlord.
    if (home === STADIUM_BY_TEAM[us].partner && STADIUM_BY_TEAM[us].structure === "owned") {
      const share = (gr.concessions + gr.parking) / STADIUM_BY_TEAM[home].gameDayShare * (1 - STADIUM_BY_TEAM[home].gameDayShare);
      post(state, "events", share + 1 * M, `Chargers home game vs ${opp(g, home)}: stadium fees and our share of concessions and parking`);
    }
  }
  if (r.home !== us && r.away !== us) return;
  const oppTeam = r.home === us ? r.away : r.home;
  // Playoff gates go to the league; the home team keeps what's sold inside the building.
  if (g.type === "POST" && r.home === us && g.round !== "SB") {
    const gr = gateModel(us, g, { ...inputs(state, us, rng), price: 1 }, b.holders);
    const stadium = STADIUM_BY_TEAM[us];
    post(state, "concessions", gr.concessions * 1.15, `${label(g)} vs ${teamLabel(oppTeam)}`);
    post(state, "parking", gr.parking * 1.2, `${label(g)} vs ${teamLabel(oppTeam)}`);
    post(state, "merch", gr.merch * 2, `${label(g)}: playoff merchandise`);
    post(state, "gameday", -DEPTS.gameday.cost[b.budget.gameday], `${label(g)}`);
    b.gates.unshift({ game: g.id, date: g.date, opp: oppTeam, type: "POST", capacity: stadium.capacity, sold: stadium.capacity, seasonHolders: b.holders, singleSeats: 0, singleSold: 0, price: 0, heat: 3, revenue: Math.round(gr.concessions * 1.15 + gr.parking * 1.2 + gr.merch * 2) });
  }
  if (g.neutral && g.home === us && g.type === "REG") {
    const avg = averageHomeGate(state);
    post(state, "intl", avg, `${g.stadium}: the league makes up the home gate we gave up`);
  }
  if (r.away === us || g.neutral) {
    const abroad = g.neutral && !!g.stadium && !(g.city ?? "").match(/, [A-Z]{2}$/);
    post(state, "travel", -(abroad ? 1.4 * M : g.type === "PRE" ? 0.35 * M : 0.45 * M), `${label(g)} ${g.neutral ? `in ${g.stadium}` : `at ${teamLabel(r.home)}`}`);
  }
  if (g.type !== "PRE") {
    const ours = r.home === us ? r.homeScore : r.awayScore;
    const theirs = r.home === us ? r.awayScore : r.homeScore;
    fans(state, ours > theirs ? 0.5 : ours < theirs ? -0.5 : 0);
  }
}

function opp(g: ScheduledGame, team: string): string {
  return g.home === team ? g.away! : g.home!;
}
function label(g: ScheduledGame): string {
  if (g.type === "PRE") return `Preseason Week ${g.week}`;
  if (g.type === "REG") return `Week ${g.week}`;
  return { WC: "Wild Card", DIV: "Divisional Round", CONF: "Conference Championship", SB: "Super Bowl" }[g.round!] ?? "Playoffs";
}

function averageHomeGate(state: GameState): number {
  const regs = business(state).gates.filter((x) => x.type === "REG");
  if (regs.length) return Math.round(regs.reduce((t, x) => t + x.revenue, 0) / regs.length);
  const g = SCHEDULE.find((x) => x.home === state.userTeam && !x.neutral && x.type === "REG")!;
  const r = gateModel(state.userTeam, g, inputs(state, state.userTeam), business(state).holders);
  return r.tickets + r.premium;
}

function homeGate(state: GameState, g: ScheduledGame, gr: GateResult): void {
  const b = business(state);
  const us = state.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const o = opp(g, us);
  const what = `${label(g)} vs ${teamLabel(o)}`;
  post(state, "tickets", gr.tickets, what);
  post(state, "premium", gr.premium, what);
  post(state, "concessions", gr.concessions, what);
  post(state, "parking", gr.parking, what);
  post(state, "merch", gr.merch, what);
  post(state, "gateShare", -gr.tickets * GATE_SHARE, `${what}: 34% of the gate after the stadium deduction`);
  post(state, "gameday", -DEPTS.gameday.cost[b.budget.gameday], what);
  const revenue = gr.tickets + gr.premium + gr.concessions + gr.parking + gr.merch;
  b.gates.unshift({
    game: g.id, date: g.date, opp: o, type: g.type === "PRE" ? "PRE" : "REG", capacity: s.capacity, sold: gr.sold, seasonHolders: gr.holders,
    singleSeats: gr.singleSeats, singleSold: gr.singleSold, price: gr.singlePrice, heat: Math.round(gr.heat * 100) / 100, revenue,
  });
  if (g.type === "PRE") return;
  // How the crowd feels about the prices and the building.
  const ctrl = controlOf(s);
  fans(state, [-0.6, 0, 0.4, 0.7][b.budget.gameday] + (ctrl.concessions ? CONCESSIONS[b.prices.concessions].fans : 0) -
    Math.max(0, b.prices.single - 1.2) * 4 - (ctrl.parking ? Math.max(0, b.prices.parking - 1.3) * 3 : 0));
  const full = gr.sold >= s.capacity * 0.985;
  if (full) {
    b.sellouts++;
    if (b.sellouts === 8) {
      addStory(state, {
        outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "league", teams: [us],
        headline: `${TEAM_BY_ID[us].name} sell out again`,
        body: `${s.name} was full again against the ${TEAM_BY_ID[o].name}, the team's eighth straight sellout. The secondary market is running ${gr.heat >= 1.2 ? "well above" : "close to"} face value.`,
      });
    }
    return;
  }
  const pct = gr.sold / s.capacity;
  if (b.sellouts >= 3) {
    addStory(state, {
      outlet: "capspace", by: MEDIA_BY_ID.capspace.columnist, kind: "league", teams: [us],
      headline: `${TEAM_BY_ID[us].name}' sellout streak ends at ${b.sellouts}`,
      body: `The ${TEAM_BY_ID[us].name} announced ${gr.sold.toLocaleString("en-US")} tickets sold against the ${TEAM_BY_ID[o].name}, ${Math.round(pct * 100)}% of capacity.` +
        (b.prices.single > 1.1 ? " Single-game prices went up this year, and buyers noticed." : ""),
    });
  }
  b.sellouts = 0;
  if (pct < 0.9) {
    fans(state, -1);
    addStory(state, {
      outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "league", teams: [us],
      headline: `Empty seats at ${s.name}`,
      body: `"You could hear the vendors," Big Lou Marchetti said of the ${TEAM_BY_ID[us].name}' game against the ${TEAM_BY_ID[o].name}, which drew ${gr.sold.toLocaleString("en-US")} paid in a ${s.capacity.toLocaleString("en-US")}-seat stadium. ` +
        (b.prices.single > 1.1 ? `"Charge that much for that product? Fans aren't dumb."` : `"Win some games and they'll come back."`),
    });
    if (!b.ask || daysBetween(b.ask.date, state.date) > 30) {
      b.ask = { kind: "attendance", date: state.date, context: `We sold ${Math.round(pct * 100)}% of the seats against the ${TEAM_BY_ID[o].name}.` };
    }
  }
}

// ---- The stadium calendar ----

const PROMOTERS = ["Summit Live", "Bluewater Presents", "Ironclad Promotions", "Meridian Sports Properties", "Crestline Events", "Northstar Motorsports", "Grand Slam Productions", "Keystone Entertainment"];
const ARTISTS = ["The Velvet Static", "Marisol Reyes", "Kingsley Avenue", "Harlow Jet", "Ozark Lights", "Juniper Rose", "DJ Sable", "The Midnight Charter", "Cole Brannigan", "Nova Kane", "Saint Augustine Drive", "Lena Marquette"];
const NATIONS = ["Mexico", "the United States", "Colombia", "Brazil", "Argentina", "Portugal", "Japan", "Morocco", "Ecuador", "Ghana", "Uruguay", "Canada"];

interface Kind {
  label: string;
  net: [number, number];
  /** Months it can run, by roof: open air or covered. */
  open: number[];
  covered: number[];
  /** Cold-weather open-air stadiums lose these months. */
  coldNot?: number[];
  saturday?: boolean;
  weight: number;
  coldOnly?: boolean;
}

const KINDS: Partial<Record<EventKind, Kind>> = {
  concert: { label: "Stadium concert", net: [1.6 * M, 4.2 * M], open: [4, 5, 8, 9, 10], covered: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], coldNot: [4, 10], weight: 4 },
  college: { label: "Neutral-site college game", net: [1.2 * M, 2.6 * M], open: [8, 9, 10, 11], covered: [8, 9, 10, 11], saturday: true, weight: 2 },
  soccer: { label: "International soccer friendly", net: [0.8 * M, 2.2 * M], open: [3, 4, 5, 8, 9], covered: [3, 4, 5, 8, 9, 10], coldNot: [3, 4], weight: 2 },
  motorsports: { label: "Supercross or monster trucks", net: [0.5 * M, 1.2 * M], open: [], covered: [1, 2, 3, 4], weight: 2 },
  hockey: { label: "Outdoor NHL game", net: [2 * M, 3.5 * M], open: [1, 2, 3], covered: [], coldOnly: true, weight: 1 },
  combat: { label: "Boxing or wrestling card", net: [1.2 * M, 3.8 * M], open: [4, 5, 9], covered: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], coldNot: [4], weight: 1 },
  highschool: { label: "High school state championships", net: [0.1 * M, 0.3 * M], open: [11, 12], covered: [11, 12], coldNot: [12], weight: 1 },
  private: { label: "Corporate event", net: [0.05 * M, 0.25 * M], open: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], covered: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], weight: 1 },
};

function eventName(kind: EventKind, rng: Rng): { name: string; promoter: string } {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const promoter = pick(PROMOTERS);
  switch (kind) {
    case "concert": return { name: `${pick(ARTISTS)}: stadium tour`, promoter };
    case "college": {
      const power = COLLEGE_TEAMS.filter((t) => ["SEC", "B1G", "B12", "ACC"].includes(t.conference));
      const a = pick(power);
      let c = pick(power);
      while (c.id === a.id) c = pick(power);
      return { name: `${a.school} vs. ${c.school}`, promoter };
    }
    case "soccer": {
      const a = pick(NATIONS);
      let c = pick(NATIONS);
      while (c === a) c = pick(NATIONS);
      return { name: `${a[0].toUpperCase()}${a.slice(1)} vs. ${c[0].toUpperCase()}${c.slice(1)}`, promoter };
    }
    case "motorsports": return { name: rng() < 0.5 ? "Supercross round" : "Monster truck tour", promoter: "Northstar Motorsports" };
    case "hockey": return { name: "NHL outdoor game", promoter: "The National Hockey League" };
    case "combat": return { name: rng() < 0.5 ? "Heavyweight title fight" : "Pro wrestling stadium show", promoter };
    case "highschool": return { name: "High school state championships", promoter: "The state high school association" };
    default: return { name: pick(["Company sales kickoff", "Charity gala on the field", "Trade show in the concourses", "Corporate field day"]), promoter: pick(["A regional bank", "A tech company", "A hospital system", "An auto dealer group"]) };
  }
}

/** Dates the building has an NFL game: ours, and a partner's or tenant's. */
function nflDates(team: string): Set<string> {
  const s = STADIUM_BY_TEAM[team];
  const teams = [team, ...(s.partner ? [s.partner] : [])];
  return new Set(SCHEDULE.filter((g) => !g.neutral && teams.includes(g.home ?? "")).map((g) => g.date));
}

function dateFree(state: GameState, team: string, date: string, events: StadiumEvent[], nfl = nflDates(team)): boolean {
  if (date <= state.date || date > CALENDAR_END) return false;
  if (nfl.has(date) || nfl.has(addDays(date, -1)) || nfl.has(addDays(date, 1))) return false;
  // Playoff weekends stay open, as every lease requires.
  if (date >= KEY.wildCardWeekend && date <= addDays(KEY.conferenceChampionships, 1)) return false;
  const s = STADIUM_BY_TEAM[team];
  if (s.blackout?.some((x) => date >= x.from && date <= x.to)) return false;
  return !events.some((e) => (e.status === "booked" || e.status === "offered") && Math.abs(daysBetween(e.date, date)) <= 1);
}

function allowed(kind: Kind, team: string, month: number): boolean {
  const s = STADIUM_BY_TEAM[team];
  const covered = s.roof !== "open";
  const cold = COLD.has(team);
  if (kind.coldOnly && (!cold || covered)) return false;
  const months = covered ? kind.covered : kind.open;
  return months.includes(month) && !(cold && !covered && kind.coldNot?.includes(month));
}

function pickDate(state: GameState, team: string, kind: Kind, rng: Rng, events: StadiumEvent[], from = 14, to = 70): string | null {
  for (let tries = 0; tries < 12; tries++) {
    let d = addDays(state.date, from + Math.floor(rng() * (to - from)));
    if (kind.saturday) while (weekday(d) !== "Saturday") d = addDays(d, 1);
    else if (rng() < 0.6) while (!["Friday", "Saturday"].includes(weekday(d))) d = addDays(d, 1);
    if (!allowed(kind, team, Number(d.slice(5, 7)))) continue;
    if (dateFree(state, team, d, events)) return d;
  }
  return null;
}

function rollKind(team: string, month: number, rng: Rng): EventKind | null {
  const options = (Object.entries(KINDS) as [EventKind, Kind][]).filter(([, k]) => allowed(k, team, month));
  const total = options.reduce((t, [, k]) => t + k.weight, 0);
  let x = rng() * total;
  for (const [id, k] of options) if ((x -= k.weight) <= 0) return id;
  return null;
}

/** The events on a stadium's calendar from the start: bowl games, the college and MLS tenants, and what the landlord or co-owner books. */
function standingCalendar(state: GameState, team: string): StadiumEvent[] {
  const s = STADIUM_BY_TEAM[team];
  const out: StadiumEvent[] = [];
  const mk = (e: Omit<StadiumEvent, "id" | "status">): StadiumEvent => ({ ...e, id: `ev-${e.date}-${out.length}`, status: "booked" });
  // The fixed events (bowls, title games) come back each year in the same week.
  for (const f0 of s.fixed) {
    const f = { ...f0, date: cfbDate(f0.date), net: f0.net * inflation(RULES.season) };
    if (f.date > state.date && f.date <= CALENDAR_END) out.push(mk({ date: f.date, kind: "bowl", name: f.name, by: "fixed", low: f.net * 0.85, high: f.net * 1.15 }));
  }
  if (s.collegeTenant) {
    for (const g of COLLEGE_SCHEDULE) {
      if (g.home !== s.collegeTenant || (g as { site?: string }).site || g.date <= state.date) continue;
      out.push(mk({ date: g.date, kind: "tenant", name: `${COLLEGE_TEAM[g.home].school} vs. ${COLLEGE_TEAM[g.away]?.school ?? g.away}`, by: "tenant", low: 0.5 * M, high: 0.7 * M }));
    }
  }
  const nfl = nflDates(team);
  if (s.mls) {
    const windows: [string, string][] = [[`${RULES.season}-08-01`, `${RULES.season}-10-31`], [`${RULES.season + 1}-02-27`, CALENDAR_END]];
    for (const [from, to] of windows) {
      for (let d = from; d <= to; d = addDays(d, 14)) {
        let day = d;
        while (weekday(day) !== "Saturday") day = addDays(day, 1);
        if (day > state.date && !nfl.has(day) && !nfl.has(addDays(day, -1)) && !nfl.has(addDays(day, 1))) {
          out.push(mk({ date: day, kind: "tenant", name: `${s.mls} home match`, by: "tenant", low: 0.3 * M, high: 0.4 * M }));
        }
      }
    }
  }
  // Events booked by whoever controls the calendar when it isn't us.
  const ctrl = controlOf(s);
  if (ctrl.booking === "none" || s.structure === "coowned") {
    const rng = rngFor(state.seed, `landlord:${team}`);
    const by = s.structure === "coowned" ? "partner" : "landlord";
    const fake = { ...state, date: state.date } as GameState;
    for (let d = state.date; d < CALENDAR_END; d = addDays(d, 7)) {
      fake.date = d;
      const month = Number(d.slice(5, 7));
      if (rng() > (s.roof === "open" && COLD.has(team) && [11, 12, 1, 2, 3].includes(month) ? 0.12 : s.structure === "coowned" ? 0.2 : 0.32)) continue;
      const k = rollKind(team, month, rng);
      if (!k || k === "private") continue;
      const kind = KINDS[k]!;
      const date = pickDate(fake, team, kind, rng, out, 1, 7);
      if (!date) continue;
      const { name, promoter } = eventName(k, rng);
      out.push(mk({ date, kind: k, name, by, promoter, low: kind.net[0], high: kind.net[1] }));
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** What our share of an event at our stadium will be. */
export function eventShare(state: GameState): number {
  return STADIUM_BY_TEAM[state.userTeam].eventShare;
}

function offerEvents(state: GameState): void {
  const us = state.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const b = business(state);
  if (controlOf(s).booking === "none" || weekday(state.date) !== "Monday") return;
  const rng = rngFor(state.seed, `offers:${state.date}`);
  const month = Number(state.date.slice(5, 7));
  const open = b.events.filter((e) => e.status === "offered").length;
  const chance = s.roof === "open" && COLD.has(us) && [11, 12, 1, 2].includes(month) ? 0.3 : 0.65;
  if (open >= 3 || rng() > chance) return;
  const target = addDays(state.date, 30);
  const k = rollKind(us, Number(target.slice(5, 7)), rng);
  if (!k) return;
  const kind = KINDS[k]!;
  const date = pickDate(state, us, kind, rng, b.events);
  if (!date) return;
  const { name, promoter } = eventName(k, rng);
  const scale = s.capacity >= 75_000 ? 1.12 : s.capacity < 50_000 ? 0.7 : 1;
  const low = Math.round(kind.net[0] * scale * (0.9 + rng() * 0.2) / 10_000) * 10_000;
  const high = Math.round(Math.max(low * 1.2, kind.net[1] * scale * (0.85 + rng() * 0.3)) / 10_000) * 10_000;
  const ev: StadiumEvent = { id: `ev-${state.date}-${b.events.length}`, date, kind: k, name, by: "offer", status: "offered", promoter, low, high, expires: addDays(state.date, 7) };
  b.events.push(ev);
  b.events.sort((a, c) => a.date.localeCompare(c.date));
  const share = s.eventShare;
  send(state, "business", businessChief(state), `Booking request: ${KINDS[k]!.label.toLowerCase()}`,
    `${promoter} wants ${s.name} on ${weekday(date)}, ${shortDate(date)} for ${name}. They estimate the stadium nets ${money(low)} to ${money(high)} after costs` +
    (share < 1 ? `, and under our ${s.structure === "coowned" ? "partnership" : "lease"} we keep ${Math.round(share * 100)}% of that` : "") + ". " +
    (s.structure === "coowned" ? `The ${TEAM_BY_ID[s.partner!].name} have to sign off too. ` : s.structure === "publicTeam" ? `${s.owner} has to approve the date. ` : "") +
    `We need an answer by ${shortDate(ev.expires!)}. It's on the Business page under Stadium.`);
}

/** The owner says yes or no to a booking request. */
export function answerOffer(state: GameState, id: string, accept: boolean): string | null {
  const b = business(state);
  const ev = b.events.find((e) => e.id === id);
  if (!ev || ev.status !== "offered") return "That offer isn't open anymore.";
  if (!accept) {
    ev.status = "declined";
    return null;
  }
  const s = STADIUM_BY_TEAM[state.userTeam];
  if (!dateFree(state, state.userTeam, ev.date, b.events.filter((e) => e.id !== id))) {
    ev.status = "expired";
    return "That date isn't free anymore.";
  }
  const rng = rngFor(state.seed, `approve:${id}`);
  const weeknight = !["Friday", "Saturday"].includes(weekday(ev.date));
  if (s.curfew && ev.kind === "concert" && weeknight) {
    ev.status = "refused";
    ev.note = `${s.owner} turned it down: the city's curfew rules out a weeknight concert.`;
    return ev.note;
  }
  if ((s.structure === "coowned" && rng() > 0.85) || (s.structure === "publicTeam" && rng() > 0.92)) {
    ev.status = "refused";
    ev.note = s.structure === "coowned" ? `The ${TEAM_BY_ID[s.partner!].name} wouldn't sign off on the date.` : `${s.owner} declined to approve the date.`;
    return ev.note;
  }
  ev.status = "booked";
  ev.note = s.structure === "coowned" ? `The ${TEAM_BY_ID[s.partner!].name} signed off.` : s.structure === "publicTeam" ? `${s.owner} approved the date.` : undefined;
  addStory(state, {
    outlet: "sideline", by: MEDIA_BY_ID.sideline.reporter, kind: "league", teams: [state.userTeam],
    headline: `${s.name} lands ${ev.name}`,
    body: `${ev.name} is coming to ${s.name} on ${weekday(ev.date)}, ${shortDate(ev.date)}. ${ev.promoter} is promoting the event.`,
  });
  return null;
}

function runEvents(state: GameState): void {
  const b = business(state);
  const s = STADIUM_BY_TEAM[state.userTeam];
  for (const ev of b.events) {
    if (ev.status === "offered" && ev.expires && ev.expires < state.date) ev.status = "expired";
    if (ev.status !== "booked" || ev.date !== state.date) continue;
    const rng = rngFor(state.seed, `event:${ev.id}`);
    const net = Math.round(ev.low + (ev.high - ev.low) * rng());
    const share = ev.by === "partner" ? 0.5 : s.eventShare;
    ev.status = "held";
    ev.net = net;
    ev.ours = Math.round(net * share);
    post(state, "events", ev.ours, ev.name);
    // Concerts tear up a grass field, and whoever runs the building pays to fix it.
    if (ev.kind === "concert" && TEAM_BY_ID[state.userTeam].surface === "grass" && s.roof === "open" && share > 0) {
      post(state, "stadium", -0.35 * M * share, `Field repair after ${ev.name}`);
    }
    if (ev.kind === "highschool") fans(state, 0.8);
  }
}

// ---- Monthly books ----

function monthly(state: GameState): void {
  const b = business(state);
  const month = state.date.slice(0, 7);
  if (state.date.slice(8) !== "01" || b.months.includes(month)) return;
  b.months.push(month);
  monthItems(state);
  const bal = cashBalance(state);
  if (bal < 0) post(state, "interest", bal * INTEREST / 12, `${money(-bal)} drawn on the credit line`);
  creditCheck(state);
}

/** One month of the steady items: league money, sponsors, staff, departments and the building. */
function monthItems(state: GameState, note?: string): void {
  const b = business(state);
  const us = state.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const year = leagueYear(state.date);
  const grow = inflation(year, 0.05);
  const m = (x: number) => x / 12;
  post(state, "national", m(nationalRevenue(year)), note ?? "Monthly distribution from the league");
  post(state, "sponsorship", m(sponsorship(us) * grow * [0.97, 1, 1.02, 1.03][b.budget.marketing]), note);
  if (s.naming && s.namingShare) post(state, "naming", m(s.naming * s.namingShare), note ?? `${s.name}${s.namingShare < 1 ? `, our ${Math.round(s.namingShare * 100)}% share` : ""}`);
  post(state, "staff", -m(FOOTBALL_STAFF * grow), note);
  post(state, "businessOps", -m(businessOps(us) * grow), note);
  for (const d of ["marketing", "community", "medical", "facilities"] as Dept[]) post(state, d, -m(DEPTS[d].cost[b.budget[d]]), note ?? BUDGET_LEVELS[b.budget[d]]);
  post(state, "benefits", -m(BENEFITS * grow), note);
  post(state, "league", -m(LEAGUE_DUES), note);
  if (s.upkeep) post(state, "stadium", -m(s.upkeep), note ?? (s.structure === "owned" ? "Operations, maintenance, insurance and capital repairs" : "Our share of operations and capital repairs"));
  if (s.rent >= 100) post(state, "rent", -m(s.rent), note ?? `To ${s.owner}`);
  if (s.debt) post(state, "debt", -m(s.debt), note);
}

/**
 * The books when the owner takes over: the league year's months so far and
 * the bonuses already paid to players, so the year's statement is complete.
 * Cash in the bank is the opening balance after all of it.
 */
function openBooks(state: GameState): void {
  const b = business(state);
  const year = leagueYear(state.date);
  const note = "Before you took over";
  for (let d = addMonth(leagueYearStart(year).slice(0, 7) + "-01"); d.slice(0, 7) <= state.date.slice(0, 7); d = addMonth(d)) {
    b.months.push(d.slice(0, 7));
    monthItems(state, note);
  }
  let bonuses = 0;
  for (const [id, p] of Object.entries(state.players)) {
    if (p.team !== state.userTeam) continue;
    const deal = dealOf(state, id);
    if (!deal) continue;
    if (leagueYear(deal.signed) === year) bonuses += deal.signingBonus;
    bonuses += Math.max(0, dealYear(deal, year)?.bonus ?? 0);
  }
  post(state, "players", -bonuses, `${note}: signing, roster and workout bonuses already paid this league year`);
  b.opening = OPENING_CASH - b.ledger.reduce((t, e) => t + e.amount, 0);
}

function addMonth(d: string): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function creditCheck(state: GameState): void {
  const bal = cashBalance(state);
  if (bal >= -CREDIT_LINE) return;
  // Past the credit line, the owner covers it.
  const need = Math.ceil((-bal - CREDIT_LINE * 0.5) / (5 * M)) * 5 * M;
  post(state, "capital", need, state.settings.finances === "relaxed" ? "Automatic top-up" : "Capital call to stay inside the credit line");
  if (state.settings.finances === "relaxed") return;
  send(state, "business", businessChief(state), "We had to call capital",
    `We ran through our ${money(CREDIT_LINE)} credit line, so ${money(need)} of your own money went into the team to keep the bills paid. ` +
    "The league watches club debt closely. Big signing bonuses are paid in cash up front, so that's usually where the money goes.");
  fans(state, -1);
  addStory(state, {
    outlet: "capspace", by: MEDIA_BY_ID.capspace.insider, kind: "owner", teams: [state.userTeam],
    headline: `${TEAM_BY_ID[state.userTeam].name} owner puts ${money(need)} into the team`,
    body: `People familiar with the team's finances say ${state.ownerName} made a capital contribution after the club tapped out its credit line. Bonus-heavy contracts are paid in cash up front.`,
  });
}

/** Picks up money that other systems moved: player cash, scouting trips and league fines. */
function sync(state: GameState): void {
  const b = business(state);
  const us = state.userTeam;
  const paid = state.finance[us]?.paid ?? {};
  for (const [y, total] of Object.entries(paid)) {
    const year = Number(y);
    const delta = total - (b.seen.paid[year] ?? 0);
    if (delta) post(state, "players", -delta, undefined, year);
    b.seen.paid[year] = total;
  }
  const spent = state.college?.scouting.spent ?? 0;
  if (spent > b.seen.scouting) post(state, "scouting", -(spent - b.seen.scouting));
  b.seen.scouting = spent;
  const fines = state.media?.fines ?? [];
  for (const f of fines.slice(b.seen.fines)) post(state, "fines", -f.amount, f.reason);
  b.seen.fines = fines.length;
}

// ---- Next season's tickets ----


export function setNextSeasonPrices(state: GameState, season: number, premium: number): string | null {
  const b = business(state);
  if (state.date < PRICING_OPENS) return "Next season's prices are set after the regular season.";
  if (b.renewal) return "Renewals are already in.";
  b.next = { season: Math.round(season * 100) / 100, premium: Math.round(premium * 100) / 100, announced: state.date };
  const pct = Math.round((season - 1) * 100);
  b.priceLog.unshift({ date: state.date, text: `${RULES.season + 1} season tickets ${pct > 0 ? `up ${pct}%` : pct < 0 ? `down ${-pct}%` : "unchanged"}, suites and clubs ${Math.round((premium - 1) * 100)}%` });
  if (pct > 0) fans(state, -pct * 0.35);
  if (pct < 0) fans(state, -pct * 0.2);
  addStory(state, {
    outlet: "capspace", by: MEDIA_BY_ID.capspace.columnist, kind: "league", teams: [state.userTeam],
    headline: pct > 0 ? `${TEAM_BY_ID[state.userTeam].name} raise ${RULES.season + 1} season-ticket prices ${pct}%` : pct < 0 ? `${TEAM_BY_ID[state.userTeam].name} cut ${RULES.season + 1} season-ticket prices` : `${TEAM_BY_ID[state.userTeam].name} hold season-ticket prices`,
    body: `Renewal notices went out to about ${b.holders.toLocaleString("en-US")} season-ticket holders. ` +
      (pct >= 8 ? "It's one of the bigger increases in the league this year." : pct > 0 ? "Most teams raise prices a few percent a year." : "Holders will take it."),
  });
  if (pct >= 5) b.ask = { kind: "tickets", date: state.date, context: `We raised ${RULES.season + 1} season-ticket prices ${pct}%.` };
  return null;
}

function renewals(state: GameState): void {
  const b = business(state);
  const us = state.userTeam;
  if (state.date === RENEWAL_DEADLINE && !b.renewal) {
    const rec = standings(state)[us];
    const wp = winPct(rec.w, rec.l, rec.t);
    const playoffs = !!state.seeds?.[TEAM_BY_ID[us].conference].includes(us);
    const change = (b.next?.season ?? 1.03) - 1;
    const mk = MARKETS[us];
    const rate = Math.max(0.6, Math.min(0.99, 0.9 + (mk.pull - 1) * 0.3 + (wp - 0.5) * 0.12 + (playoffs ? 0.02 : 0) + (state.pressure.fans - 50) / 600 - Math.max(0, change) * 0.6 + Math.max(0, -change) * 0.2));
    // Waiting lists refill seats in the strongest markets.
    const waitlist = mk.pull >= 1.1 ? 0.6 : mk.pull >= 1.0 ? 0.3 : 0;
    const general = generalSeats(STADIUM_BY_TEAM[us]);
    const kept = Math.round(b.holders * rate);
    const holders = Math.min(Math.round(general * 0.97), kept + Math.round((b.holders - kept) * waitlist));
    b.renewal = { rate, holders, date: state.date };
    send(state, "business", businessChief(state), `${RULES.season + 1} season-ticket renewals are in`,
      `${Math.round(rate * 100)}% of our season-ticket holders renewed` + (waitlist ? ", and the waiting list filled part of the rest" : "") +
      `. We'll have about ${holders.toLocaleString("en-US")} season-ticket holders next season, ${holders >= b.holders ? "up" : "down"} from ${b.holders.toLocaleString("en-US")}. Deposits are due ${shortDate(DEPOSITS_DUE)}.`);
  }
  if (state.date === DEPOSITS_DUE && b.renewal) {
    const mk = MARKETS[us];
    const games = 9;
    const idx = b.index ?? { season: 1, premium: 1 };
    const season = b.renewal.holders * mk.ticket * idx.season * (b.next?.season ?? 1.03) * games;
    const premium = mk.premium * idx.premium * (b.next?.premium ?? 1.03) * (b.renewal.rate + 0.03);
    post(state, "deposits", (season + premium) * 0.35, `${RULES.season + 1} season tickets and suites: 35% deposits`);
  }
}

// ---- The day ----

export function businessDaily(state: GameState): void {
  const b = business(state);
  sync(state);
  monthly(state);
  runEvents(state);
  offerEvents(state);
  renewals(state);
  const wd = weekday(state.date);
  // The league pays out the shared gate weekly in the season.
  if (wd === "Tuesday" && b.pool > 0) {
    post(state, "gatePool", b.pool / TEAMS.length, "Our 1/32 share of the visiting-team gate pool");
    b.pool = 0;
  }
  if (wd === "Tuesday") {
    fans(state, [-0.25, 0, 0.15, 0.25][b.budget.community]);
    const m = mediaState(state);
    m.coach = Math.max(0, Math.min(100, m.coach + [-0.4, 0, 0.2, 0.35][b.budget.facilities]));
  }
  if (state.date === VALUATIONS_DAY) valuationsStory(state);
  creditCheck(state);
}

function valuationsStory(state: GameState): void {
  const values = TEAMS.map((t) => [t.id, valuation(state, t.id)] as const).sort((a, c) => c[1] - a[1]);
  const us = state.userTeam;
  const rank = values.findIndex(([t]) => t === us) + 1;
  const avg = values.reduce((t, [, v]) => t + v, 0) / values.length;
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.columnist, kind: "trend", teams: [values[0][0], us],
    headline: `The Ledger's franchise values: the ${TEAM_BY_ID[values[0][0]].name} top the list at ${billions(values[0][1])}`,
    body: `Our annual estimates put the average NFL team at ${billions(avg)}. Top five: ${values.slice(0, 5).map(([t, v]) => `${TEAM_BY_ID[t].name} ${billions(v)}`).join(", ")}. ` +
      `The ${TEAM_BY_ID[us].name} rank ${rank}${["st", "nd", "rd"][((rank + 90) % 100 - 10) % 10 - 1] ?? "th"} at ${billions(valuation(state, us))}. Teams that own and run their stadiums keep the most of what the building earns, and it shows.`,
  });
  news(state, `The Gridiron Ledger values the ${teamLabel(values[0][0])} at ${billions(values[0][1])}, the most in the league`);
}

// ---- Owner decisions ----

export function setSinglePrice(state: GameState, mult: number): void {
  const b = business(state);
  const before = b.prices.single;
  const next = Math.max(0.6, Math.min(1.8, Math.round(mult * 100) / 100));
  if (next === before) return;
  b.prices.single = next;
  const pct = Math.round((next / before - 1) * 100);
  b.priceLog.unshift({ date: state.date, text: `Single-game prices ${pct > 0 ? `up ${pct}%` : `down ${-pct}%`}` });
  if (pct <= -10) fans(state, 1);
  if (pct >= 15 && next > 1.1) {
    fans(state, -1);
    addStory(state, {
      outlet: "capspace", by: MEDIA_BY_ID.capspace.columnist, kind: "league", teams: [state.userTeam],
      headline: `${TEAM_BY_ID[state.userTeam].name} raise single-game ticket prices`,
      body: `Single-game tickets for the rest of the season went up about ${pct}%, the team confirmed. Season-ticket prices are locked for the year.`,
    });
    b.ask = { kind: "tickets", date: state.date, context: `We raised single-game ticket prices about ${pct}%.` };
  }
}

export function setConcessions(state: GameState, tier: ConcessionTier): string | null {
  if (!controlOf(STADIUM_BY_TEAM[state.userTeam]).concessions) return "The stadium's operator sets concession prices.";
  const b = business(state);
  if (b.prices.concessions === tier) return null;
  b.prices.concessions = tier;
  b.priceLog.unshift({ date: state.date, text: `Concessions: ${CONCESSIONS[tier].label.toLowerCase()}` });
  if (tier === "value") {
    fans(state, 2);
    addStory(state, {
      outlet: "ledger", by: MEDIA_BY_ID.ledger.reporter, kind: "league", teams: [state.userTeam],
      headline: `${TEAM_BY_ID[state.userTeam].name} roll out a value menu`,
      body: "Hot dogs, sodas and popcorn at a fraction of the usual stadium prices, the model Atlanta made famous. Teams that have tried it say fans buy more and complain less.",
    });
  }
  return null;
}

export function setParking(state: GameState, mult: number): string | null {
  if (!controlOf(STADIUM_BY_TEAM[state.userTeam]).parking) return "The stadium's operator controls parking.";
  const b = business(state);
  b.prices.parking = Math.max(0.5, Math.min(1.8, Math.round(mult * 100) / 100));
  return null;
}

export function setBudget(state: GameState, dept: Dept, level: number): void {
  const b = business(state);
  const before = b.budget[dept];
  b.budget[dept] = Math.max(0, Math.min(3, Math.round(level)));
  if (b.budget[dept] === 0 && before > 0 && (dept === "facilities" || dept === "medical")) {
    const who = dept === "medical" ? `${teamStaff(state.userTeam).TRN?.name ?? "Our head athletic trainer"}, head athletic trainer` : `${teamStaff(state.userTeam).HC?.name ?? "Head Coach"}, head coach`;
    send(state, "staff", who, dept === "medical" ? "The medical budget" : "The building",
      dept === "medical"
        ? "I understand the budget cut, but I want you to know what it means: fewer hands in the training room and older recovery equipment. Players get back slower when we're stretched."
        : "The players notice when the building gets neglected, and so do free agents on their visits. I'd ask you to reconsider the facility budget.");
  }
}

/** The owner moves money in or out of the team. */
export function ownerCash(state: GameState, amount: number): string | null {
  if (amount < 0 && cashBalance(state) + amount < 0) return "The team doesn't have that much cash.";
  post(state, amount > 0 ? "capital" : "distribution", amount, amount > 0 ? "From the owner" : "To the owner");
  return null;
}
