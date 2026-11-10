// The owner: who they are, what they want from the team, and how each season
// measured up.
//
// The owner sets up a profile when taking over: a background, how much money
// they have outside the team, how hands-on they mean to be, how freely they
// spend and how long they'll give a rebuild. They weight six goals; every
// season is scored on all six regardless of the weights, so the tradeoffs
// stay visible and there's no single way to win. The owner's own money is
// real: capital calls come out of it, distributions go into it, and the
// owner pays the taxes on the club's income (NFL clubs are pass-through
// entities, so the club itself pays no income tax).
import { late } from "./late";
import { communityScore } from "./community";
import { billions, business, businessChief, cashBalance, pnl, valuation } from "./business";
import { leagueYear } from "./contracts";
import { daysBetween } from "./dates";
import { acquisitionLoan, debt, marketRate, totalDebt } from "./debt";
import { money, send } from "./inbox";
import { RULES, TEAM_BY_ID } from "./league";
import { owners, changeRapport } from "./owners";
import { mediaState } from "./outlets";
import { standings } from "./standings";
import type { GameState, OwnerBackground, OwnerGoal, OwnerState, ScoreSeason, SeasonRecord } from "./types";

const M = 1_000_000;

export const GOALS: Record<OwnerGoal, { label: string; what: string }> = {
  titles: { label: "Win championships", what: "Wins, playoff runs and Super Bowls, judged against how long you said you'd give a rebuild." },
  profit: { label: "Make money", what: "Operating margin: what the club keeps from each dollar it brings in." },
  value: { label: "Grow the franchise's value", what: "How fast the club's value grows, and how much of it is yours rather than the lenders'." },
  community: { label: "Serve the community", what: "Community spending, fan goodwill and what the club builds for its town." },
  reputation: { label: "Earn respect", what: "Standing with the other owners, the press, lenders and your own head coach." },
  stability: { label: "Run a stable club", what: "Cash on hand, no capital calls, no broken loan covenants." },
};
export const GOAL_KEYS = Object.keys(GOALS) as OwnerGoal[];

export const BACKGROUNDS: Record<OwnerBackground, { label: string; what: string }> = {
  finance: { label: "Finance", what: "You made your money in private equity. Lenders know you: better loan terms." },
  realEstate: { label: "Real estate", what: "You build things. Stadium and facility projects cost you about 6% less." },
  industry: { label: "Built a company", what: "You ran a big business. The front office runs about 5% leaner." },
  family: { label: "Old football family", what: "Your family has been around the league for decades. The other owners start out warmer." },
  exPlayer: { label: "Former player", what: "You played in the league. Coaches and players give you the benefit of the doubt." },
};

/** Money outside the team: cash on hand and holdings that take time to sell. */
export const WEALTH = [
  { label: "Wealthy", what: "About $2.5 billion outside the team, $300 million of it in cash.", liquid: 300 * M, outside: 2200 * M },
  { label: "Very wealthy", what: "About $7 billion outside the team, $800 million of it in cash.", liquid: 800 * M, outside: 6200 * M },
  { label: "Among the richest people alive", what: "About $25 billion outside the team, $3 billion of it in cash.", liquid: 3000 * M, outside: 22000 * M },
] as const;

export const STYLES: Record<OwnerState["style"], string> = {
  handsOff: "Hands off: hire good people and let them work.",
  collaborative: "Collaborative: in the big decisions, out of the daily ones.",
  handsOn: "Hands on: in the draft room and the film room.",
};
export const SPENDING: Record<OwnerState["spending"], string> = {
  aggressive: "Aggressive: spend to win and grow, keep a thin cushion.",
  moderate: "Moderate: league-average budgets and a normal cushion.",
  conservative: "Conservative: lean budgets and a deep cash reserve.",
};

/** How the club's finances stand when the owner takes over. */
export const SCENARIOS = {
  healthy: { label: "Sound finances", what: "$100 million in the bank and a $300 million credit line." },
  tight: { label: "Cash-strapped", what: "$15 million in the bank and a $150 million credit line: every bonus counts." },
  leveraged: { label: "Bought with debt", what: "$50 million in the bank and $450 million of floating-rate acquisition debt due in seven years." },
  custom: { label: "Custom", what: "Set the club's cash, its acquisition debt, your own cash and the quality of the front office yourself." },
} as const;

/** A made-up starting position for the custom scenario. */
export interface CustomStart {
  cash: number;
  debt: number;
  liquid: number;
  staff: "weak" | "average" | "strong";
}
export const DEFAULT_CUSTOM: CustomStart = { cash: 100 * M, debt: 0, liquid: 300 * M, staff: "average" };
export type Scenario = keyof typeof SCENARIOS;

export interface OwnerSetup {
  background: OwnerBackground;
  wealth: 0 | 1 | 2;
  style: OwnerState["style"];
  spending: OwnerState["spending"];
  patience: number;
  weights: Record<OwnerGoal, number>;
  scenario: Scenario;
  custom?: CustomStart;
}

export const DEFAULT_SETUP: OwnerSetup = {
  background: "industry", wealth: 1, style: "collaborative", spending: "moderate", patience: 3, scenario: "healthy",
  weights: { titles: 3, profit: 2, value: 2, community: 1, reputation: 1, stability: 1 },
};

export function owner(state: GameState): OwnerState {
  return (state.owner ??= newOwner(state, DEFAULT_SETUP));
}

function newOwner(state: GameState, s: OwnerSetup): OwnerState {
  const w = WEALTH[s.wealth];
  const purchase = valuation(state, state.userTeam);
  return {
    background: s.background, liquid: w.liquid, outside: w.outside, personalDebt: 0,
    style: s.style, spending: s.spending, patience: s.patience, weights: { ...s.weights },
    purchase, since: state.date, putIn: 0, takenOut: 0, taxesPaid: 0, carryforward: 0, legacy: [], log: [],
  };
}

/** Saves from before the owner profile get the default owner, bought at today's value. */
export function ensureOwner(state: GameState): void {
  owner(state);
}

/**
 * A new owner takes over: the profile, the club's finances at the takeover,
 * and the first impressions the profile makes on the coach and the other owners.
 */
export function setupOwner(state: GameState, s: OwnerSetup): void {
  state.owner = newOwner(state, s);
  const o = state.owner;
  const b = business(state);
  const d = debt(state);
  if (s.background === "finance") d.trust += 10;
  if (s.background === "family") d.trust += 5;
  if (s.scenario === "tight") {
    b.opening -= 85 * M;
    d.facility.limit = 150 * M;
  } else if (s.scenario === "leveraged") {
    b.opening -= 50 * M;
    acquisitionLoan(state, 450 * M);
  } else if (s.scenario === "custom") {
    const c = s.custom ?? DEFAULT_CUSTOM;
    b.opening += c.cash - 100 * M;
    if (c.debt > 0) acquisitionLoan(state, Math.min(c.debt, 1000 * M));
    o.liquid = c.liquid;
    // A weak or strong front office: every executive and deputy starts ten points off the ordinary.
    const shift = { weak: -10, average: 0, strong: 10 }[c.staff];
    if (shift && state.execs) for (const e of Object.values(state.execs.people)) e.hidden.skill = Math.max(5, Math.min(99, e.hidden.skill + shift));
  }
  // Spending philosophy sets the first budgets and the cash cushion.
  if (s.spending === "aggressive") Object.assign(b.budget, { marketing: 2, medical: 2, facilities: 2, scouts: 2 });
  if (s.spending === "conservative") Object.assign(b.budget, { marketing: 0, community: 1, scouts: 1 });
  const books = state.books;
  if (books) books.reserveMonths = { aggressive: 1, moderate: 2, conservative: 4 }[s.spending];
  // First impressions.
  const m = mediaState(state);
  m.coach = Math.max(0, Math.min(100, m.coach + (s.background === "exPlayer" ? 6 : 0) + { handsOff: 4, collaborative: 1, handsOn: -4 }[s.style] + (s.patience >= 4 ? 4 : s.patience <= 1 ? -4 : 0)));
  if (s.background === "family") for (const t of Object.keys(owners(state).relations)) changeRapport(state, t, 6);
  o.log.unshift({ date: state.date, text: `Took over the ${TEAM_BY_ID[state.userTeam].name} at a value of about ${billions(o.purchase)}.` });
}

/** What the owner's own money bought at the takeover: the price less any acquisition debt. */
export function equityAtPurchase(state: GameState): number {
  const o = owner(state);
  const acq = debt(state).loans.find((l) => l.id.startsWith("L0-"));
  return o.purchase - (acq?.amount ?? 0);
}

/** The owner's stake today: the club's value less its debt, plus the cash in it. */
export function ownerEquity(state: GameState): number {
  return valuation(state, state.userTeam) - totalDebt(state) + Math.max(0, cashBalance(state));
}

// ---- The owner's own money ----

/** Money between the owner and the club: positive into the owner's pocket. */
export function ownerMoney(state: GameState, amount: number, real = true): void {
  const o = owner(state);
  if (amount > 0) o.takenOut += amount;
  else o.putIn += -amount;
  if (real) o.liquid += amount;
}

/** A capital call: from the owner's cash, then outside holdings sold in a hurry, then a personal loan. Returns how it was paid, in a sentence. */
export function fundCapitalCall(state: GameState, need: number): string {
  const o = owner(state);
  o.putIn += need;
  if (o.liquid >= need) {
    o.liquid -= need;
    return `It came out of your cash; you have ${money(o.liquid)} left on hand.`;
  }
  let short = need - o.liquid;
  o.liquid = 0;
  // A forced sale takes a 10% haircut.
  const sold = Math.min(o.outside, short / 0.9);
  o.outside -= sold;
  short -= sold * 0.9;
  o.log.unshift({ date: state.date, text: `Sold ${money(sold)} of outside holdings to meet a capital call.` });
  if (short > 0) {
    o.personalDebt += short;
    o.log.unshift({ date: state.date, text: `Borrowed ${money(short)} personally to meet a capital call.` });
    return `Your cash ran out, so ${money(sold)} of outside holdings were sold at a discount and ${money(short)} was borrowed against your name.`;
  }
  return `Your cash ran out, so ${money(sold)} of outside holdings were sold in a hurry, at a 10% discount.`;
}

/** Sell outside holdings for cash, calmly: a 3% cost. */
export function sellHoldings(state: GameState, amount: number): string | null {
  const o = owner(state);
  const sell = Math.min(o.outside, Math.round(amount));
  if (sell <= 0) return "Nothing left to sell.";
  o.outside -= sell;
  o.liquid += sell * 0.97;
  o.log.unshift({ date: state.date, text: `Sold ${money(sell)} of outside holdings.` });
  return null;
}

/** Pay down personal debt from the owner's cash. */
export function repayPersonal(state: GameState): string | null {
  const o = owner(state);
  const pay = Math.min(o.personalDebt, o.liquid);
  if (pay <= 0) return o.personalDebt ? "No cash on hand to pay it with." : "You don't owe anything.";
  o.personalDebt -= pay;
  o.liquid -= pay;
  return null;
}

/** Rough federal and state rate on pass-through income at the top bracket. */
const TAX_RATE = 0.4;
/** A buyer writes off most of the purchase price (the franchise and player contracts) over 15 years. */
const AMORTIZED_SHARE = 0.85;

/**
 * The owner's year, run when the club's books close: outside holdings earn a
 * return, personal debt costs interest, and the owner pays tax on the club's
 * income after the purchase-price write-off.
 */
export function closeOwnerYear(state: GameState, year: number, clubIncome: number): { tax: number; taxable: number; writeOff: number } {
  const o = owner(state);
  const years = daysBetween(o.since, state.date) / 365;
  const writeOff = years <= 15.5 ? o.purchase * AMORTIZED_SHARE / 15 : 0;
  let taxable = clubIncome - writeOff;
  // Losses carry forward to shelter later years.
  if (taxable < 0) {
    o.carryforward += -taxable;
    taxable = 0;
  } else {
    const used = Math.min(o.carryforward, taxable);
    o.carryforward -= used;
    taxable -= used;
  }
  const tax = Math.round(taxable * TAX_RATE);
  o.taxesPaid += tax;
  o.outside = Math.round(o.outside * 1.05);
  o.liquid += Math.round(o.liquid * 0.03) - tax - Math.round(o.personalDebt * (marketRate(state) + 0.025));
  if (o.liquid < 0) {
    o.personalDebt += -o.liquid;
    o.liquid = 0;
  }
  if (tax) o.log.unshift({ date: state.date, text: `Paid ${money(tax)} in taxes on the club's ${year} income.` });
  o.log.splice(40);
  return { tax, taxable, writeOff };
}

// ---- Goals and the scorecard ----

export function setWeights(state: GameState, weights: Record<OwnerGoal, number>): void {
  const o = owner(state);
  for (const g of GOAL_KEYS) o.weights[g] = Math.max(0, Math.min(5, Math.round(weights[g] ?? 0)));
  if (GOAL_KEYS.every((g) => !o.weights[g])) o.weights.titles = 1;
}

export function setPatience(state: GameState, years: number): void {
  const o = owner(state);
  const before = o.patience;
  o.patience = Math.max(1, Math.min(6, Math.round(years)));
  // Shortening the clock is noticed in the building.
  if (o.patience < before) mediaState(state).coach = Math.max(0, mediaState(state).coach - 2 * (before - o.patience));
}

const PLAYOFF_POINTS: Record<string, number> = { WC: 10, DIV: 18, CONF: 24, SB: 28, CHAMP: 32 };
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/** Seasons since the takeover, counting this one. */
function tenure(state: GameState, season: number): number {
  return season - leagueYear(owner(state).since) + 1;
}

/** The six scores for a season: this one so far, or a finished one from its record. */
export function scorecard(state: GameState, rec?: SeasonRecord): { scores: Record<OwnerGoal, number>; overall: number; record: string; playoffs?: string } {
  const o = owner(state);
  const us = state.userTeam;
  const season = rec?.season ?? RULES.season;
  const st = rec ? rec.records[us] : (() => { const r = standings(state)[us]; return [r?.w ?? 0, r?.l ?? 0, r?.t ?? 0]; })();
  const [w, l, t] = st;
  const played = w + l + t;
  const playoffs = rec ? rec.playoffs[us] : state.champion === us ? "CHAMP" : [...(state.seeds?.AFC ?? []), ...(state.seeds?.NFC ?? [])].includes(us) ? "WC" : undefined;
  // Championships: the record and the playoff run; inside the rebuild window, progress counts too.
  const wp = played ? (w + t / 2) / played : 0.5;
  let titles = 15 + wp * 65 + (playoffs ? PLAYOFF_POINTS[playoffs] ?? 10 : 0);
  const hist = state.history?.seasons ?? [];
  const prev = hist.filter((h) => h.season < season).at(-1)?.records[us];
  if (prev && tenure(state, season) <= o.patience && played >= 8) titles = Math.max(titles, 45 + (w - prev[0]) * 4);
  // Money: the operating margin of the league year the season was played in.
  // A season in progress is judged on the business office's projection for the full year.
  const p = !rec && leagueYear(state.date) === season ? late.projected(state) : pnl(state, season);
  const pRev = "totalRevenue" in p ? p.totalRevenue : p.revenue;
  const margin = pRev > 0 ? p.operating / pRev : 0;
  const profit = pRev > 0 ? 50 + (margin - 0.18) * 220 : 50;
  // Value: growth since last season (or the purchase), less a charge for leverage.
  const value = valuation(state, us);
  // Growth is judged against about 6% for each new league year since the last scorecard (or the purchase): values are re-estimated once a year.
  const last = o.legacy.filter((x) => x.season < season).at(-1);
  const before = last?.value ?? o.purchase;
  const from = last ? `${last.season + 1}-04-30` : o.since;
  const years = Math.max(0, leagueYear(state.date) - leagueYear(from));
  const growth = before > 0 ? value / before - 1 : 0;
  const lev = totalDebt(state) / Math.max(1, value);
  const valueScore = 50 + (growth - 0.06 * years) * 400 / Math.max(1, years) - lev * 60;
  // Community: the community budget, fan goodwill and projects built.
  const b = business(state);
  const built = (b.projects ?? []).filter((x) => x.opened).length;
  const community = 38 + b.budget.community * 12 + (state.pressure.fans - 50) * 0.8 + built * 3 + communityScore(state);
  // Reputation: the other owners, the press, lenders and the head coach.
  const rel = Object.values(owners(state).relations);
  const rapport = rel.length ? rel.reduce((s, r) => s + r.rapport, 0) / rel.length : 0;
  const m = mediaState(state);
  const reputation = 50 + rapport * 0.8 + (state.pressure.media - 50) * 0.4 + (debt(state).trust - 50) * 0.3 + (m.coach - 50) * 0.25;
  // Stability: capital calls and covenant breaches this season, and cash against the reserve policy.
  const year = season;
  const calls = b.ledger.filter((e) => e.year === year && e.cat === "capital" && e.note?.startsWith("Capital call")).length;
  const broke = debt(state).tests.filter((x) => !x.ok && leagueYear(x.date) === year).length;
  const called = debt(state).loans.some((x) => x.accelerated && leagueYear(x.accelerated) >= year);
  const reserve = state.books ? late.reserve(state) : 0;
  const stability = 70 - calls * 15 - broke * 8 - (called ? 20 : 0) + (cashBalance(state) >= reserve ? 10 : -10) - (o.personalDebt > 0 ? 10 : 0);
  const scores: Record<OwnerGoal, number> = {
    titles: clamp(titles), profit: clamp(profit), value: clamp(valueScore), community: clamp(community), reputation: clamp(reputation), stability: clamp(stability),
  };
  const total = GOAL_KEYS.reduce((s, g) => s + o.weights[g], 0) || 1;
  const overall = clamp(GOAL_KEYS.reduce((s, g) => s + scores[g] * o.weights[g], 0) / total);
  return { scores, overall, record: `${w}-${l}${t ? `-${t}` : ""}`, playoffs };
}


export function scoreWord(x: number): string {
  return x >= 80 ? "Outstanding" : x >= 62 ? "Strong" : x >= 45 ? "Solid" : x >= 30 ? "Disappointing" : "Poor";
}

/**
 * The owner's return on the club against the alternative: what the stake is
 * worth now plus what came out, against what went in, a year at a time, next
 * to a stock-market average of about 7% (an assumption).
 */
export function ownerReturn(state: GameState): { annual: number; years: number; benchmark: number; leverage: number } {
  const o = owner(state);
  const years = Math.max(0.25, daysBetween(o.since, state.date) / 365);
  const start = equityAtPurchase(state) + o.putIn;
  const end = ownerEquity(state) + o.takenOut;
  const annual = start > 0 && end > 0 ? Math.pow(end / start, 1 / years) - 1 : -1;
  return { annual, years, benchmark: 0.07, leverage: totalDebt(state) / Math.max(1, valuation(state, state.userTeam)) };
}

// ---- The head coach's target ----

export const COACH_TARGETS = {
  none: "No target",
  develop: "Develop the young players",
  winning: "A winning record",
  playoffs: "Make the playoffs",
} as const;

/** The owner tells the head coach what this season has to look like. An unrealistic target costs the coach's faith. */
export function setCoachTarget(state: GameState, goal: keyof typeof COACH_TARGETS): string {
  const o = owner(state);
  const m = mediaState(state);
  const expect = state.review?.expect && state.review.season === RULES.season ? state.review.expect.wins : 8.5;
  const changed = o.coachTarget?.season === RULES.season && o.coachTarget.goal !== goal;
  o.coachTarget = { season: RULES.season, goal, set: state.date };
  let delta = changed && state.date >= RULES.keyDates.regularSeasonStart ? -3 : 0;
  if (goal === "playoffs") delta += expect < 8 ? -5 : expect < 9.5 ? -1 : 1;
  if (goal === "winning") delta += expect < 6 ? -3 : 1;
  if (goal === "develop") delta += 3;
  m.coach = Math.max(0, Math.min(100, m.coach + delta));
  return delta < -2 ? "The coach took it as a target nobody could reasonably hit." : delta > 0 ? "The coach took it well." : "The coach understood.";
}

function targetMet(goal: string, rec: SeasonRecord, us: string): boolean {
  const [w, l] = rec.records[us];
  if (goal === "playoffs") return !!rec.playoffs[us];
  if (goal === "winning") return w > l;
  return true;
}

// ---- The season on the record ----

/** At the rollover: the season's scorecard goes on the owner's record, and the owner may rethink priorities. */
export function recordOwnerSeason(state: GameState, rec: SeasonRecord): void {
  const o = owner(state);
  const us = state.userTeam;
  const card = scorecard(state, rec);
  const p = pnl(state, rec.season);
  const row: ScoreSeason = {
    season: rec.season, record: card.record, playoffs: card.playoffs, revenue: p.totalRevenue, operating: p.operating,
    value: valuation(state, us), equity: ownerEquity(state), scores: card.scores, overall: card.overall,
  };
  const t = o.coachTarget;
  if (t && t.season === rec.season && t.goal !== "none") {
    const met = targetMet(t.goal, rec, us);
    row.coachTarget = { goal: COACH_TARGETS[t.goal], met };
    const m = mediaState(state);
    m.coach = Math.max(0, Math.min(100, m.coach + (met ? 5 : o.patience <= 2 ? -6 : -2)));
  }
  o.legacy.push(row);
  suggestAmbitions(state, row);
}

/** Priorities move with what happens: a title, a run of losing, money trouble, the years. */
function suggestAmbitions(state: GameState, row: ScoreSeason): void {
  const o = owner(state);
  const w = { ...o.weights };
  let why = "";
  const recent = o.legacy.slice(-3);
  if (row.playoffs === "CHAMP") {
    w.community = Math.min(5, w.community + 1);
    w.stability = Math.min(5, w.stability + 1);
    why = "You have your ring. Owners who win one usually turn to protecting it: a stable club and a bigger place in the town.";
  } else if (row.scores.stability < 40 || o.personalDebt > 0) {
    w.stability = Math.min(5, w.stability + 2);
    w.titles = Math.max(0, w.titles - 1);
    why = "The money got tight this year. Your family office wants the club on a steadier footing before anything else.";
  } else if (row.operating < 0) {
    w.profit = Math.min(5, w.profit + 1);
    why = "The club lost money this year. Your advisers want the business side to carry more weight.";
  } else if (recent.length === 3 && recent.every((x) => !x.playoffs) && w.titles >= 2) {
    w.titles = Math.min(5, w.titles + 1);
    w.profit = Math.max(0, w.profit - 1);
    why = "Three years without the playoffs. The losing has worn on you; winning matters more than the margins now.";
  } else if (o.legacy.length === 5) {
    w.reputation = Math.min(5, w.reputation + 1);
    w.community = Math.min(5, w.community + 1);
    why = "Five years in. Owners start to think about what they'll be remembered for.";
  }
  if (!why || GOAL_KEYS.every((g) => w[g] === o.weights[g])) return;
  o.suggestion = { weights: w, why, date: state.date };
  send(state, "business", businessChief(state), "Looking back on the year", `${why} Your priorities are on the Owner page if you want to change them.`);
}

export function takeSuggestion(state: GameState, accept: boolean): void {
  const o = owner(state);
  if (accept && o.suggestion) o.weights = { ...o.suggestion.weights };
  delete o.suggestion;
}
