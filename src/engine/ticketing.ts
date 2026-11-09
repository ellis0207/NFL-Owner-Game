// The ticket office. General seats are split into four price zones, each with
// its own price spread and its own buyers' sensitivity to price; about 1% of
// every zone is accessible seating held for fans who need it. Each home game
// falls in a tier (marquee, standard, value) by opponent, rivalry, kickoff and
// weather, and the owner can price the tiers apart, or turn on dynamic
// pricing, which reprices the unsold seats through the week as demand shows.
// Group sales and promotions fill seats, at a discount, and a promotion that
// runs when the game would have sold anyway only gives money away. Holders
// who can't go list their seats on the resale market; seats nobody buys there
// are the bulk of the no-shows. Suites, club seats and loges are leased by
// the year; how many are used each game drives whether they're renewed.
// Seat licenses raise cash once and cost trust. The waiting list refills the
// season-ticket base when holders drop.
import { business, businessChief, gateForecast, inflation, post, PRICING_OPENS } from "./business";
import { leagueYear } from "./contracts";
import { fanBase, trustHit } from "./fans";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { money, send } from "./inbox";
import { RULES, SCHEDULE, TEAM_BY_ID } from "./league";
import { rivalryHeat } from "./records";
import { standings, winPct } from "./standings";
import { DRAW, MARKETS, STADIUM_BY_TEAM } from "./stadiums";
import type { GameState, GameTier, Promo, ScheduledGame, TicketingState, Zone } from "./types";

export const ZONES: Record<Zone, { label: string; share: number; price: number; e: number }> = {
  lowerSide: { label: "Lower bowl, sideline", share: 0.22, price: 1.65, e: 0.6 },
  lowerEnd: { label: "Lower bowl, end zone", share: 0.26, price: 1.05, e: 1.0 },
  upperSide: { label: "Upper deck, sideline", share: 0.24, price: 0.85, e: 1.1 },
  upperEnd: { label: "Upper deck, end zone", share: 0.28, price: 0.58, e: 1.25 },
};
export const TIER_LABEL: Record<GameTier, string> = { marquee: "Marquee", standard: "Standard", value: "Value" };
export const PROMO_LABEL: Record<Promo, string> = { none: "No promotion", family: "Family four-packs (20% off)", young: "Under-30 nights (30% off)" };
const PROMO: Record<Exclude<Promo, "none">, { share: number; off: number; cannibal: number }> = {
  family: { share: 0.06, off: 0.2, cannibal: 0.4 },
  young: { share: 0.05, off: 0.3, cannibal: 0.3 },
};
/** Premium seat products: share of the premium money and normal use on game day. */
export const PREMIUM: Record<string, { label: string; share: number; use: number }> = {
  suites: { label: "Suites", share: 0.45, use: 0.8 },
  clubs: { label: "Club seats", share: 0.4, use: 0.9 },
  loges: { label: "Loge boxes", share: 0.15, use: 0.88 },
};
export const ACCESSIBLE = 0.01;
const COMPS = 0.006;
const RESEARCH_COST = 150_000;

export function tix(state: GameState): TicketingState {
  const b = business(state);
  if (b.tix) return b.tix;
  const pull = MARKETS[state.userTeam].pull;
  const h = b.holders;
  b.tix = {
    zones: { lowerSide: 1, lowerEnd: 1, upperSide: 1, upperEnd: 1 },
    tiers: { marquee: 1, standard: 1, value: 1 },
    dynamic: false, groups: false, promo: "none", transfers: "open", hospitality: false,
    // Strong markets carry long waiting lists; weak ones have none.
    waitlist: Math.round(h * (pull >= 1.1 ? 0.35 : pull >= 1.0 ? 0.12 : pull >= 0.95 ? 0.03 : 0)),
    tenure: { long: Math.round(h * 0.5), mid: Math.round(h * 0.32), recent: h - Math.round(h * 0.5) - Math.round(h * 0.32) },
    premiumBook: 1,
    renewals: [], acquisition: [],
  };
  return b.tix;
}

/** Marquee, standard or value: the opponent's draw, the rivalry, the kickoff and the weather. */
export function gameTier(state: GameState, team: string, g: ScheduledGame): { tier: GameTier; rivalry: number } {
  const opp = g.home === team ? g.away! : g.home!;
  const heat = rivalryHeat(state, team, opp);
  // Division games used to count 3%; the rivalry's heat now carries that, and more for the bitter ones.
  const rivalry = 1 + Math.min(0.1, heat * 0.015);
  const prime = g.weekday === "Monday" || g.weekday === "Thursday" || g.timeET >= "20:00";
  const month = Number(g.date.slice(5, 7));
  const score = (DRAW[opp] ?? 1) * rivalry * (prime ? 1.05 : 1) * (month === 12 || month === 1 ? 0.97 : 1);
  return { tier: g.type === "PRE" ? "value" : score >= 1.1 ? "marquee" : score < 0.99 ? "value" : "standard", rivalry };
}

export interface SaleInputs {
  general: number;
  holders: number;
  /** Fans who want a general seat at the market price. */
  want: number;
  /** The average single-game price before the owner's multipliers. */
  base: number;
  /** The owner's single-game price times the game's tier. */
  price: number;
  elastic: number;
  zones?: Record<Zone, number>;
  dynamic?: boolean;
  groups?: boolean;
  promo?: Promo;
  transfers?: "open" | "official";
  pre: boolean;
  cold: boolean;
  win: number;
}

export interface Sale {
  singleSeats: number;
  singleSold: number;
  singleRevenue: number;
  singlePrice: number;
  heat: number;
  dynamic: number;
  groups: number;
  groupRevenue: number;
  promo: number;
  promoNew: number;
  zones: { sold: number; seats: number; price: number }[];
  resale: { listed: number; sold: number; price: number };
  resaleFee: number;
  noShow: number;
  comps: number;
}

/** Single-game sales zone by zone, then groups, promotions, the resale market and who actually shows up. */
export function sellGeneral(x: SaleInputs): Sale {
  const singleSeats = Math.max(0, x.general - x.holders);
  const run = (d: number) => {
    let sold = 0, revenue = 0, want = 0;
    const zones: Sale["zones"] = [];
    for (const [z, def] of Object.entries(ZONES) as [Zone, (typeof ZONES)[Zone]][]) {
      const m = x.zones?.[z] ?? 1;
      const seats = Math.max(0, (x.general - x.holders) * def.share);
      const p = x.price * m * d;
      const w = Math.max(0, x.want - x.holders) * def.share * Math.pow(p, -1.5 * def.e * x.elastic);
      const s = Math.min(seats, w);
      const price = x.base * def.price * p;
      zones.push({ sold: Math.round(s), seats: Math.round(seats), price: Math.round(price) });
      sold += s; revenue += s * price; want += w;
    }
    return { sold, revenue, want, zones };
  };
  let d = 1;
  let r = run(1);
  if (x.dynamic) {
    // Prices follow demand through the week, inside limits the club sets.
    d = Math.max(0.85, Math.min(1.3, Math.pow(singleSeats ? r.want / singleSeats : 2, 0.35)));
    r = run(d);
  }
  const heat = singleSeats ? r.want / singleSeats : 2;
  let singleSold = r.sold;
  let singleRevenue = r.revenue;
  const avg = singleSold ? singleRevenue / singleSold : x.base * x.price * d;
  let left = Math.max(0, singleSeats - singleSold);
  // Promotions: some of the buyers would have paid full price anyway.
  let promo = 0, promoNew = 0;
  if (x.promo && x.promo !== "none" && !x.pre) {
    const p = PROMO[x.promo];
    const buyers = singleSeats * p.share * Math.min(1.4, Math.max(0.5, heat));
    const cannibal = Math.min(singleSold, buyers * p.cannibal);
    promoNew = Math.min(left, buyers - cannibal);
    promo = cannibal + promoNew;
    singleSold += promoNew;
    singleRevenue += promoNew * avg * (1 - p.off) - cannibal * avg * p.off;
    left -= promoNew;
  }
  // Group sales: churches, youth teams, companies, at a quarter off, into seats that would sit empty.
  let groups = 0, groupRevenue = 0;
  if (x.groups && !x.pre) {
    groups = Math.min(left, x.general * 0.04 * Math.min(1.3, Math.max(0.4, heat + 0.3)));
    groupRevenue = groups * x.base * x.price * 0.75;
    left -= groups;
  }
  const comps = Math.min(left, x.general * COMPS);
  // Holders who can't go list their seats; how many sell depends on demand.
  const listRate = 0.1 + Math.max(0, 1 - heat) * 0.25 + Math.max(0, 1 - x.win) * 0.5 + (x.cold ? 0.04 : 0) + (x.pre ? 0.05 : 0);
  const listed = x.holders * listRate * (x.transfers === "official" ? 0.85 : 1);
  const resaleSold = listed * Math.max(0.2, Math.min(1, 0.25 + 0.6 * heat));
  const resalePrice = avg * Math.max(0.45, Math.min(3, Math.pow(heat, 0.7)));
  // The team's exchange keeps a fee on the resales that go through it.
  const official = x.transfers === "official" ? 0.85 : 0.45;
  const resaleFee = resaleSold * resalePrice * official * 0.1;
  const paid = x.holders + singleSold + groups;
  const unsoldListings = listed - resaleSold;
  const noShow = Math.min(0.4, 0.05 + (paid ? unsoldListings / paid : 0) * 0.6 + (x.cold ? 0.03 : 0) + (x.pre ? 0.05 : 0) + Math.max(0, 0.95 - x.win) * 0.3);
  return {
    singleSeats: Math.round(singleSeats), singleSold: Math.round(singleSold), singleRevenue, singlePrice: Math.round(avg), heat, dynamic: Math.round(d * 100) / 100,
    groups: Math.round(groups), groupRevenue, promo: Math.round(promo), promoNew: Math.round(promoNew), zones: r.zones,
    resale: { listed: Math.round(listed), sold: Math.round(resaleSold), price: Math.round(resalePrice) }, resaleFee, noShow, comps: Math.round(comps),
  };
}

/** Share of suites, club seats and loges in use at a game. */
export function premiumUse(win: number, tier: GameTier, pre: boolean, hospitality: boolean, sat = 62): number {
  let use = 0;
  for (const p of Object.values(PREMIUM)) use += p.share * p.use;
  use *= (0.9 + 0.2 * (win - 0.88) / 0.24) * (tier === "marquee" ? 1.05 : tier === "value" ? 0.96 : 1) * (1 + (sat - 62) / 400) * (pre ? 0.7 : 1);
  // Hospitality packages put companies and their clients in suites that would sit empty.
  if (hospitality) use += (1 - use) * PREMIUM.suites.share * 0.5;
  return Math.max(0.3, Math.min(1, use));
}

/** What corporate hospitality packages bring in at a game: unused suite nights sold to companies. */
export function hospitalityRevenue(perGamePremium: number, useWithout: number): number {
  return perGamePremium * PREMIUM.suites.share * (1 - useWithout) * 0.5 * 0.6;
}

// ---- After a home game ----

export function afterHomeGame(state: GameState, g: ScheduledGame, sale: Sale): void {
  const t = tix(state);
  const f = fanBase(state);
  if (g.type !== "REG") return;
  // Sellouts with buyers left over put names on the waiting list; groups and promotions bring in first-timers.
  t.waitlist += Math.round(Math.max(0, sale.heat - 1.05) * sale.singleSeats * 0.04 + sale.groups * 0.02 + sale.promoNew * 0.03);
  f.crm.newBuyers += Math.round(sale.singleSold * 0.08 + sale.groups * 0.5 + sale.promoNew * 0.6);
  if (sale.dynamic > 1.15) trustHit(state, -0.15);
  if (t.promo === "family") f.sat.families = Math.min(100, f.sat.families + 0.3);
  if (t.promo === "young") {
    f.sat.casual = Math.min(100, f.sat.casual + 0.2);
    f.core = Math.min(95, f.core + 0.02);
  }
  if (t.groups) f.sat.families = Math.min(100, f.sat.families + 0.1);
}

// ---- Renewals ----

export interface RenewalPlan {
  rate: number;
  long: number;
  mid: number;
  recent: number;
  kept: number;
  fromWaitlist: number;
  added: number;
  holders: number;
  premiumRate: number;
  premiumBook: number;
  pslBuyers: number;
}

/** What the season's numbers say about next season's tickets, at a price change. */
export function planRenewals(state: GameState, change: number, wp: number, playoffs: boolean, pslPrice = 0): RenewalPlan {
  const b = business(state);
  const t = tix(state);
  const f = fanBase(state);
  const us = state.userTeam;
  const mk = MARKETS[us];
  const s = STADIUM_BY_TEAM[us];
  const base = 0.9 + (mk.pull - 1) * 0.3 + (wp - 0.5) * 0.12 + (playoffs ? 0.02 : 0) + (state.pressure.fans - 50) / 600 - Math.max(0, change) * 0.6 + Math.max(0, -change) * 0.2 +
    (f.sat.subscribers - 62) / 400 + (f.trust - 60) / 500 + (f.core - f.core0) / 400 + (t.psl ? 0.03 : 0);
  // A new seat license costs holders real money to keep their seats.
  const annual = mk.ticket * (b.index?.season ?? 1) * 10;
  const pslHit = pslPrice ? Math.min(0.3, 0.12 * (pslPrice / annual)) : 0;
  const clamp = (x: number) => Math.max(0.5, Math.min(0.99, x - pslHit));
  const long = clamp(base + 0.04), mid = clamp(base), recent = clamp(base - 0.07);
  const kept = Math.round(t.tenure.long * long + t.tenure.mid * mid + t.tenure.recent * recent);
  const general = s.capacity - Math.round(s.capacity * 0.12);
  const room = Math.max(0, Math.round(general * 0.97) - kept);
  const lost = Math.max(0, b.holders - kept);
  // The waiting list goes first; some on it pass when their turn comes.
  const fromWaitlist = Math.min(room, lost, Math.round(t.waitlist * 0.85 * (pslPrice ? 0.7 : 1)));
  // Then the sales staff works the single-game buyers, harder with a bigger marketing budget.
  const heat = avgHeat(state);
  const acq = Math.max(0, Math.min(0.6, 0.15 + (heat - 0.8) * 0.5 + (b.budget.marketing - 1) * 0.05 + (f.trust - 60) / 400));
  const added = Math.round(Math.min(room - fromWaitlist, (lost - fromWaitlist) * acq) * (pslPrice ? 0.7 : 1));
  const holders = kept + fromWaitlist + Math.max(0, added);
  const rate = b.holders ? kept / b.holders : 1;
  // Suites and clubs: companies renew when they used them and liked the service.
  const use = seasonPremiumUse(state) ?? 0.85;
  const premiumChange = (b.next?.premium ?? 1.03) - 1;
  const premiumRate = Math.max(0.7, Math.min(0.99, 0.9 + (use - 0.85) * 0.6 + ((f.sat.corporate + f.sat.premium) / 2 - 62) / 300 - Math.max(0, premiumChange - 0.03) * 0.5 + (wp - 0.5) * 0.05));
  const fill = Math.max(0.2, Math.min(0.98, 0.9 + (mk.pull - 1) * 1.5 + (heat - 1) * 0.3 + (b.budget.marketing - 1) * 0.02));
  const premiumBook = Math.min(1, t.premiumBook * premiumRate + (1 - t.premiumBook * premiumRate) * fill);
  return { rate, long, mid, recent, kept, fromWaitlist, added: Math.max(0, added), holders, premiumRate, premiumBook, pslBuyers: pslPrice ? holders : 0 };
}

/** Called on renewal day: the new base, by tenure, and what's left on the waiting list. */
export function applyRenewals(state: GameState, p: RenewalPlan): void {
  const t = tix(state);
  const f = fanBase(state);
  const b = business(state);
  const tn = t.tenure;
  const long = Math.round(tn.long * p.long + tn.mid * p.mid / 6);
  const mid = Math.round(tn.mid * p.mid * 5 / 6 + tn.recent * p.recent / 3);
  t.tenure = { long, mid, recent: Math.max(0, p.holders - long - mid) };
  t.waitlist = Math.max(0, Math.round((t.waitlist - p.fromWaitlist) * 0.85));
  t.renewals.unshift({ season: RULES.season + 1, long: p.long, mid: p.mid, recent: p.recent, premium: p.premiumRate, waitlist: p.fromWaitlist, added: p.added });
  t.renewals.length = Math.min(t.renewals.length, 12);
  t.premiumBook = p.premiumBook;
  f.crm.newSubs += p.fromWaitlist + p.added;
  f.crm.upgrades += Math.round(p.kept * 0.04 * (1 + (f.sat.subscribers - 62) / 100));
  f.crm.contacts += b.holders * 3;
  // What it cost to bring in new ticket buyers: about a third of the marketing budget goes to finding them.
  const spend = Math.round(marketingSpend(state) * 0.35);
  t.acquisition.unshift({ season: RULES.season, spend, added: f.crm.newSubs + f.crm.newBuyers });
  t.acquisition.length = Math.min(t.acquisition.length, 12);
  if (t.psl?.season === RULES.season + 1) {
    const revenue = Math.round(p.pslBuyers * t.psl.price);
    t.psl.holders = p.pslBuyers;
    t.psl.revenue = revenue;
  }
}

/** The marketing budget spent in the season's league year. */
function marketingSpend(state: GameState): number {
  const year = RULES.season;
  return -business(state).ledger.filter((e) => e.year === year && e.cat === "marketing").reduce((a, e) => a + e.amount, 0);
}

/** Seat license money comes in with the deposits. */
export function pslCash(state: GameState): void {
  const t = tix(state);
  if (t.psl?.season === RULES.season + 1 && t.psl.revenue && !business(state).ledger.some((e) => e.cat === "seatLicenses" && e.year === leagueYear(state.date))) {
    post(state, "seatLicenses", t.psl.revenue, `Personal seat licenses: ${t.psl.holders.toLocaleString("en-US")} seats at ${money(t.psl.price)}`);
  }
}

export function avgHeat(state: GameState): number {
  const regs = business(state).gates.filter((g) => g.type === "REG" && g.date >= `${RULES.season}-08-01`);
  return regs.length ? regs.reduce((a, g) => a + g.heat, 0) / regs.length : 1;
}

export function seasonPremiumUse(state: GameState): number | null {
  const regs = business(state).gates.filter((g) => g.type === "REG" && g.date >= `${RULES.season}-08-01` && g.premiumUse != null);
  return regs.length ? regs.reduce((a, g) => a + g.premiumUse!, 0) / regs.length : null;
}

/** The business staff's suggestion for next season's season-ticket price change. */
export function recommendedIncrease(state: GameState): number {
  const b = business(state);
  const t = tix(state);
  const r = standings(state)[state.userTeam];
  const wp = r && r.w + r.l + r.t ? winPct(r.w, r.l, r.t) : 0.5;
  const x = 0.03 + (Math.min(1.5, avgHeat(state)) - 1) * 0.08 + Math.min(0.03, (t.waitlist / Math.max(1, b.holders)) * 0.05) - (wp < 0.4 ? 0.03 : 0) + (fanBase(state).economy - 1) * 0.5;
  return Math.round(Math.max(-0.03, Math.min(0.08, x)) * 100) / 100;
}

/** The holders likely to drop at the current prices, before renewals come in. */
export function churnForecast(state: GameState): { rate: number; atRisk: number; plan: RenewalPlan } {
  const b = business(state);
  const r = standings(state)[state.userTeam];
  const wp = r && r.w + r.l + r.t ? winPct(r.w, r.l, r.t) : 0.5;
  const playoffs = !!state.seeds?.[TEAM_BY_ID[state.userTeam].conference].includes(state.userTeam);
  const plan = planRenewals(state, (b.next?.season ?? 1 + recommendedIncrease(state)) - 1, wp, playoffs);
  return { rate: plan.rate, atRisk: Math.max(0, b.holders - plan.kept), plan };
}

// ---- Seat licenses ----

export const PSL_PRICES = [1_500, 3_000, 6_000];

/**
 * A personal seat license: a one-time charge for the right to buy season
 * tickets in a seat, which the holder owns and can sell. It's set with next
 * season's prices, before renewals.
 */
export function launchPSL(state: GameState, price: number): string | null {
  const b = business(state);
  const t = tix(state);
  if (t.psl) return "We already sell seat licenses.";
  if (state.date < PRICING_OPENS || b.renewal) return "Seat licenses are announced with next season's prices, after the regular season and before renewals.";
  t.psl = { season: RULES.season + 1, price, holders: 0, revenue: 0 };
  trustHit(state, -12, 5, `Announced personal seat licenses at ${money(price)} a seat`);
  const f = fanBase(state);
  f.sat.subscribers = Math.max(0, f.sat.subscribers - 8);
  const us = state.userTeam;
  addStory(state, {
    outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "owner", teams: [us],
    headline: `${TEAM_BY_ID[us].name} will charge ${money(price)} seat licenses`,
    body: `Season-ticket holders will have to buy a personal seat license to keep their seats in ${RULES.season + 1}. "People who sat there for thirty years get a bill for the privilege," one longtime holder said.`,
  });
  return null;
}

// ---- Settings ----

export function setZonePrice(state: GameState, z: Zone, mult: number): void {
  tix(state).zones[z] = Math.max(0.6, Math.min(1.8, Math.round(mult * 100) / 100));
}
export function setTierPrice(state: GameState, tier: GameTier, mult: number): void {
  tix(state).tiers[tier] = Math.max(0.7, Math.min(1.5, Math.round(mult * 100) / 100));
}
export function setTicketOption(state: GameState, key: "dynamic" | "groups" | "hospitality", on: boolean): void {
  tix(state)[key] = on;
  if (key === "dynamic" && on) send(state, "business", businessChief(state), "Dynamic pricing is on",
    "Unsold seats will be repriced through the week as demand shows: up for the big games, down when they're slow. Fans notice when a seat costs a lot more than the one next to it.");
}
export function setPromo(state: GameState, p: Promo): void {
  tix(state).promo = p;
}
export function setTransfers(state: GameState, policy: "open" | "official"): void {
  const t = tix(state);
  if (t.transfers === policy) return;
  t.transfers = policy;
  if (policy === "official") trustHit(state, -3, 1, "Limited ticket transfers to the team's own exchange");
}

/** A study of what fans will pay: demand curves by zone and game, and what sponsors and premium buyers would pay. */
export function buyResearch(state: GameState): string | null {
  const t = tix(state);
  if (t.research?.season === RULES.season) return "We already have this season's study.";
  t.research = { season: RULES.season, date: state.date };
  post(state, "research", -RESEARCH_COST * inflation(leagueYear(state.date), 0.03), "Market pricing study");
  return null;
}

/** Revenue per available seat: ticket and premium money over every seat at every home game this season. */
export function revPAS(state: GameState, season = RULES.season): number | null {
  const regs = business(state).gates.filter((g) => g.type === "REG" && g.date >= `${season}-08-01` && g.date < `${season + 1}-03-01`);
  if (!regs.length) return null;
  const seats = regs.reduce((a, g) => a + g.capacity, 0);
  return Math.round(regs.reduce((a, g) => a + g.revenue, 0) / seats);
}

/** What single-game sales and money would look like at other prices, for the next home game. */
export function demandCurve(state: GameState, g: ScheduledGame): { mult: number; sold: number; revenue: number }[] {
  return [0.7, 0.85, 1, 1.15, 1.3, 1.5].map((m) => {
    const f = gateForecast(state, g, m);
    return { mult: m, sold: f.sold, revenue: f.tickets };
  });
}

export function nextHomeGame(state: GameState): ScheduledGame | undefined {
  const us = state.userTeam;
  return SCHEDULE.find((g) => g.home === us && !g.neutral && (g.type === "PRE" || g.type === "REG") && g.date >= state.date && !state.results[g.id]);
}

