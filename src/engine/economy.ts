// The economy around the league: a national economy that moves month by
// month (output, unemployment, household income, corporate earnings,
// consumer confidence, inflation, construction prices and real estate) and
// a local economy for each club's metro area. Recessions come out of these
// conditions, not on a timer: confidence can fall before incomes do, and a
// shock can tip a soft economy over. Household income moves ticket and
// merchandise demand, corporate earnings move sponsor and suite budgets,
// the labor market moves staff wages, and rates and confidence move
// franchise values. Starting values are approximate 2026 conditions; the
// paths after that are made up from the save's seed.
import { laborDrag } from "./labor";
import { BASE_SEASON, TEAMS } from "./league";
import { gaussian, rngFor } from "./rng";
import type { GameState } from "./types";

export interface EconomyMonth {
  month: string;
  /** Output against its trend, in percent. */
  gap: number;
  /** Real growth over the last year, in percent. */
  growth: number;
  unemployment: number;
  /** 100 is a normal reading. */
  confidence: number;
  /** Prices over the last year, in percent. */
  inflation: number;
  /** Consumer prices since the start of the 2026 season (1 = then). */
  cpi: number;
  /** Building costs and real estate against their usual path (1 = usual). */
  construction: number;
  realEstate: number;
  recession: boolean;
}

export interface MetroEconomy {
  /** How strongly the metro follows the national cycle. */
  sens: number;
  /** The metro's own gap against the nation, in percent. */
  local: number;
  /** Population against the long-run projection (1 = on track), drifting with jobs. */
  pop: number;
  /** Long-run drift in local income and companies, a year. */
  drift: number;
}

export interface EconomyState {
  now: EconomyMonth;
  history: EconomyMonth[];
  metros: Record<string, MetroEconomy>;
  recessions: { start: string; end?: string; depth: number }[];
  /** Extra shocks handed in from elsewhere (an inflation spike, a financial panic), applied next month. */
  pending: { gap?: number; inflation?: number; confidence?: number }[];
  log: { date: string; text: string }[];
}

export const VOLATILITY: Record<string, { label: string; what: string; sd: number }> = {
  calm: { label: "Calm", what: "Mild cycles; recessions are rare and shallow.", sd: 0.55 },
  normal: { label: "Normal", what: "Cycles like the last few decades: a recession every seven to ten years.", sd: 1 },
  volatile: { label: "Volatile", what: "Sharper booms and busts, under the same rules.", sd: 1.55 },
};

function vol(state: GameState): number {
  return VOLATILITY[state.settings.economy ?? "normal"]?.sd ?? 1;
}

const START: Omit<EconomyMonth, "month"> = { gap: 0.3, growth: 1.9, unemployment: 4.3, confidence: 98, inflation: 2.8, cpi: 1, construction: 1, realEstate: 1, recession: false };

export function economy(state: GameState): EconomyState {
  if (state.economy) return state.economy;
  const metros: Record<string, MetroEconomy> = {};
  for (const t of TEAMS) {
    const rng = rngFor(state.seed, `metro:${t.id}`);
    metros[t.id] = { sens: Math.round((0.7 + rng() * 0.6) * 100) / 100, local: Math.round(gaussian(rng) * 0.5 * 100) / 100, pop: 1, drift: Math.round(gaussian(rng) * 0.004 * 10000) / 10000 };
  }
  const month = state.date.slice(0, 7);
  state.economy = { now: { month, ...START }, history: [], metros, recessions: [], pending: [], log: [] };
  return state.economy;
}

/** Read without creating: old states and quick estimates see a normal economy. */
function current(state: GameState): EconomyMonth | undefined {
  return state.economy?.now;
}

export function inRecession(state: GameState): boolean {
  return !!current(state)?.recession;
}

// ---- What the economy does to the club ----

function metroGap(state: GameState, team: string): number {
  const e = state.economy;
  if (!e) return 0;
  const m = e.metros[team];
  return e.now.gap * (m?.sens ?? 1) + (m?.local ?? 0);
}

/** Household spending power and mood in a metro: ticket and merchandise demand (1 = normal). */
export function demandFactor(state: GameState, team: string): number {
  const e = current(state);
  if (!e) return 1;
  const income = 0.006 * metroGap(state, team);
  const mood = 0.0015 * (e.confidence - 100);
  const pop = state.economy!.metros[team]?.pop ?? 1;
  // A slump in the market's appetite for games (shocks.ts).
  const slump = team === state.userTeam ? state.shocks?.slump?.mult ?? 1 : 1;
  // Labor trouble (labor.ts) keeps some buyers waiting.
  return Math.max(0.85, Math.min(1.12, (1 + 0.8 * income + mood + 0.5 * (pop - 1)) * slump * (1 - 0.5 * laborDrag(state))));
}

/** Corporate earnings in a metro: sponsor, suite and hospitality budgets (1 = normal). */
export function corporateFactor(state: GameState, team: string): number {
  if (!current(state)) return 1;
  return Math.max(0.82, Math.min(1.15, (1 + 0.6 * 0.022 * metroGap(state, team)) * (1 - laborDrag(state))));
}

/** Staff pay against the budget's usual raises: tight labor markets and surprise inflation push it up. */
export function wageFactor(state: GameState): number {
  const e = current(state);
  if (!e) return 1;
  const expected = Math.pow(1.025, Math.max(0, monthsSince(e.month) / 12));
  return Math.max(0.95, Math.min(1.12, 1 + 0.008 * (4.3 - e.unemployment) + 0.5 * (e.cpi / expected - 1)));
}

/** Where the base rate is headed: the central bank leans against inflation and the cycle. */
export function rateLean(state: GameState): number {
  const e = current(state);
  if (!e) return 0;
  return Math.max(-0.02, Math.min(0.025, 0.0035 * (e.inflation - 2.5) + 0.002 * e.gap));
}

/** Building costs for stadium and facility work against their usual path. */
export function constructionFactor(state: GameState): number {
  return current(state)?.construction ?? 1;
}

/** Investors pay more for teams when money is cheap and confidence is high: a change in the revenue multiple. */
export function multipleShift(state: GameState, rate: number): number {
  const e = current(state);
  if (!e) return 0;
  return Math.round(((0.0375 - rate) * 25 + 0.03 * (e.confidence - 100) + 0.3 * (e.realEstate - 1) * 10) * 100) / 100;
}

/** How the advertising market leans for the next TV deals. */
export function broadcastLean(state: GameState): number {
  const e = current(state);
  if (!e) return 0;
  return 0.022 * e.gap * 0.3 + 0.001 * (e.confidence - 100);
}

function monthsBetween(a: string, b: string): number {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

function monthsSince(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return (y - BASE_SEASON) * 12 + (m - 8);
}

// ---- Real dollars ----

/** Average consumer prices in a league year against 2026 (1 = 2026 dollars). */
export function cpiFor(state: GameState, year: number): number {
  const e = state.economy;
  if (!e) return Math.pow(1.025, Math.max(0, year - BASE_SEASON));
  const rows = [...e.history, e.now].filter((h) => h.month >= `${year}-03` && h.month <= `${year + 1}-02`);
  if (rows.length) return rows.reduce((t, h) => t + h.cpi, 0) / rows.length;
  // Years ahead: today's prices carried forward at today's inflation.
  const last = e.now;
  const ahead = year - Number(last.month.slice(0, 4));
  return ahead > 0 ? last.cpi * Math.pow(1 + last.inflation / 100, ahead) : 1;
}

/** An amount from a league year in 2026 dollars. */
export function realDollars(state: GameState, amount: number, year: number): number {
  return Math.round(amount / cpiFor(state, year));
}

// ---- Forecast ranges and scenarios ----

/** How wide revenue could land a number of years out, as a share: wider when the economy is shaky. */
export function forecastBand(state: GameState, yearsOut: number): number {
  const e = current(state);
  const shaky = e ? Math.max(0, -e.gap) * 0.006 + Math.max(0, 100 - e.confidence) * 0.0006 : 0;
  return (0.02 + 0.015 * yearsOut + shaky) * vol(state) ** 0.5;
}

export interface Scenario { growth: number; rate: number; price: number; attendance: number }

/**
 * Next year's revenue and operating income under a scenario: growth is the
 * output gap in percent, rate the base rate, price the change in ticket
 * prices (0.05 = 5% higher) and attendance the change in crowds. A rough
 * model on this year's budget lines, for testing plans.
 */
export function scenario(_state: GameState, s: Scenario, lines: { tickets: number; premium: number; sponsorship: number; concessions: number; merch: number; other: number; costs: number; floatingDebt: number }): { revenue: number; operating: number; notes: string[] } {
  const income = 0.006 * s.growth;
  const corp = 0.6 * 0.022 * s.growth;
  // Higher prices lose some buyers: about half the price change comes back as lost seats.
  const ticketMult = (1 + s.price) * (1 + s.attendance) * (1 - 0.5 * s.price) * (1 + 0.8 * income);
  const crowd = (1 + s.attendance) * (1 - 0.5 * s.price) * (1 + 0.8 * income);
  const revenue = lines.tickets * ticketMult + lines.premium * (1 + corp) + lines.sponsorship * (1 + corp) + lines.concessions * crowd + lines.merch * (1 + 0.8 * income) + lines.other;
  const interest = lines.floatingDebt * (s.rate - 0.035);
  const operating = revenue - lines.costs - interest;
  const notes = [
    `Tickets ${Math.round((ticketMult - 1) * 100)}%, suites and sponsors ${Math.round(corp * 100)}%, concessions and parking ${Math.round((crowd - 1) * 100)}%`,
    interest ? `Floating-rate interest ${interest > 0 ? "up" : "down"} ${Math.round(Math.abs(interest) / 100_000) / 10}M` : "No floating-rate debt",
  ];
  return { revenue: Math.round(revenue), operating: Math.round(operating), notes };
}

// ---- The month ----

/** Another system hands the economy a shock for next month. */
export function shockEconomy(state: GameState, s: EconomyState["pending"][number]): void {
  economy(state).pending.push(s);
}

function step(state: GameState): void {
  const e = economy(state);
  const p = e.now;
  const month = state.date.slice(0, 7);
  if (p.month === month) return;
  const v = vol(state);
  const rng = rngFor(state.seed, `economy:${month}`);
  const extra = e.pending.splice(0);
  const shock = (k: "gap" | "inflation" | "confidence") => extra.reduce((t, x) => t + (x[k] ?? 0), 0);
  // Now and then a financial panic or a jolt to confidence hits all at once.
  const panic = rng() < 0.0045 * v ? -(1 + rng() * 1.5) * v : 0;
  const confidence = Math.max(55, Math.min(120, 0.82 * p.confidence + 0.18 * (100 + 5 * p.gap) + gaussian(rng) * 2.6 * v + panic * 6 + shock("confidence")));
  // Output follows its own momentum, mood and shocks; a boom cools by itself.
  const cool = p.gap > 1.8 ? -0.06 * (p.gap - 1.8) : 0;
  const gap = Math.max(-7, Math.min(4, (p.gap < 0 ? 0.9 : 0.93) * p.gap + 0.012 * (confidence - 100) + gaussian(rng) * 0.22 * v + panic + cool - 0.025 + shock("gap")));
  const yearAgo = e.history.length >= 11 ? e.history[e.history.length - 11].gap : START.gap;
  const growth = Math.round((1.9 + (gap - yearAgo)) * 10) / 10;
  const unemployment = Math.max(3, Math.min(12, p.unemployment + 0.12 * ((4.3 - 0.45 * gap) - p.unemployment) + gaussian(rng) * 0.04 * v));
  const inflation = Math.max(-1, Math.min(9, p.inflation + 0.08 * ((2.5 + 0.35 * gap) - p.inflation) + gaussian(rng) * 0.12 * v + shock("inflation")));
  const construction = Math.max(0.85, Math.min(1.3, p.construction + 0.05 * ((1 + 0.015 * gap) - p.construction) + gaussian(rng) * 0.006 * v + 0.004 * (inflation - 2.5)));
  const realEstate = Math.max(0.8, Math.min(1.25, p.realEstate + 0.04 * ((1 + 0.02 * gap) - p.realEstate) + gaussian(rng) * 0.005 * v));
  // A recession: output well below trend and still falling. It ends after a run of recovery.
  const falling = gap < p.gap;
  const last = e.recessions[e.recessions.length - 1];
  let recession = p.recession;
  const cooled = !last?.end || monthsBetween(last.end, month) >= 30;
  if (!recession && cooled && gap < -1.6 && falling && e.history.slice(-2).every((h) => h.gap > gap)) {
    recession = true;
    e.recessions.push({ start: month, depth: gap });
    e.log.unshift({ date: state.date, text: `Economists say the economy has tipped into recession: output is ${Math.abs(gap).toFixed(1)}% below trend and unemployment is ${unemployment.toFixed(1)}%.` });
  } else if (recession && last) {
    last.depth = Math.min(last.depth, gap);
    const recovering = [...e.history.slice(-1), p].every((h, i, a) => i === 0 || h.gap > a[i - 1].gap) && gap > p.gap;
    if ((recovering && gap > last.depth + 0.4) || gap > -0.8) {
      recession = false;
      last.end = month;
      e.log.unshift({ date: state.date, text: "The recession is over: output has grown for several months running." });
    }
  }
  e.history.push(p);
  e.history = e.history.slice(-72);
  const r = (x: number, d = 100) => Math.round(x * d) / d;
  e.now = {
    month, gap: r(gap), growth, unemployment: r(unemployment), confidence: r(confidence, 10), inflation: r(inflation),
    cpi: r(p.cpi * (1 + inflation / 1200), 10000), construction: r(construction, 1000), realEstate: r(realEstate, 1000), recession,
  };
  // Each metro has its own story: some grow, some lose jobs and people.
  for (const t of TEAMS) {
    const m = e.metros[t.id];
    const mr = rngFor(state.seed, `metro:${t.id}:${month}`);
    m.local = r(0.97 * m.local + gaussian(mr) * 0.12 * v);
    m.pop = r(m.pop * (1 + m.drift / 12 + 0.00004 * metroGap(state, t.id)), 10000);
  }
  e.log.length = Math.min(e.log.length, 40);
}

export function economyDaily(state: GameState): void {
  if (!state.date.endsWith("-01")) return;
  step(state);
  // The fan base's reading of the local economy (fans.ts) follows the metro.
  if (state.fans) state.fans.economy = Math.round(demandFactor(state, state.userTeam) * 1000) / 1000;
}

/** The headline numbers for the business pages. */
export function outlook(state: GameState): { label: string; value: string }[] {
  const e = economy(state).now;
  return [
    { label: "Growth over the year", value: `${e.growth.toFixed(1)}%` },
    { label: "Unemployment", value: `${e.unemployment.toFixed(1)}%` },
    { label: "Inflation", value: `${e.inflation.toFixed(1)}%` },
    { label: "Consumer confidence", value: `${Math.round(e.confidence)}` },
    { label: "Building costs", value: `${e.construction >= 1 ? "+" : ""}${Math.round((e.construction - 1) * 100)}% against normal` },
    { label: "Commercial real estate", value: `${e.realEstate >= 1 ? "+" : ""}${Math.round((e.realEstate - 1) * 100)}% against normal` },
    { label: "Economy", value: e.recession ? "In recession" : e.gap > 1 ? "Running hot" : e.gap < -0.5 ? "Soft" : "Steady" },
  ];
}
