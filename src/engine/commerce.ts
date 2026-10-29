// Local sponsors and local radio and TV: the team's own deals, apart from the
// league's national money. Each category (the jersey patch, the official bank,
// the flagship radio station...) has one partner on a multi-year deal that
// rises 3% a year. Deals that run out come up for renewal each February, when
// the incumbent and rival companies make offers; what they'll pay depends on
// how the team is doing, how fans feel and what the building offers. The
// partner companies and stations are made up.
import { inflation, business, businessChief, sponsorship } from "./business";
import { leagueYear, leagueYearStart } from "./contracts";
import { addDays, shortDate } from "./dates";
import { money, news, send } from "./inbox";
import { BASE_SEASON, TEAM_BY_ID } from "./league";
import { projectEffects } from "./projects";
import { gaussian, rngFor, type Rng } from "./rng";
import { standings, winPct } from "./standings";
import type { GameState, LocalDeal, LocalDeals, LocalOffer } from "./types";

interface Category {
  label: string;
  /** Share of the team's local sponsorship and media money a typical deal brings. */
  share: number;
  media?: boolean;
  partners: string[];
}

export const LOCAL_CATS: Record<string, Category> = {
  patch: { label: "Jersey patch", share: 0.12, partners: ["Corvex Software", "Brightpath Energy", "Ironclad Logistics", "Helix Pharmacy", "Vantage Cloud", "Meridian Payments"] },
  bank: { label: "Official bank", share: 0.1, partners: ["First Harbor Bank", "Keystone Federal", "Summit Trust", "Union Ridge Bank", "Pioneer Savings"] },
  beer: { label: "Official beer", share: 0.09, partners: ["Copper Kettle Lager", "Northfield Brewing", "Old Anchor Beer", "Redline Brewing"] },
  auto: { label: "Official vehicle", share: 0.08, partners: ["Meridian Motors", "Atlas Auto Group", "Velo Trucks", "Crestline Motors"] },
  wireless: { label: "Official wireless carrier", share: 0.08, partners: ["Beacon Wireless", "Skyline Mobile", "Apex Telecom"] },
  health: { label: "Official health system", share: 0.08, partners: ["St. Augustine Medical", "Riverbend Health", "Lakeshore Health System", "Mercy Ridge Hospitals"] },
  sportsbook: { label: "Official sportsbook", share: 0.08, partners: ["LuckyLine Sportsbook", "GoalPost Bet", "Ace Wager", "BetHarbor"] },
  airline: { label: "Official airline", share: 0.06, partners: ["Bluewing Airlines", "Northstar Air", "Coastal Jet"] },
  drink: { label: "Official soft drink", share: 0.06, partners: ["Fizz Cola", "Sparkwater", "Peak Soda"] },
  insurance: { label: "Official insurance partner", share: 0.05, partners: ["Shieldline Insurance", "Harborview Mutual", "Cornerstone Insurance"] },
  radio: { label: "Flagship radio station", share: 0.06, media: true, partners: [] },
  tv: { label: "Preseason TV and team shows", share: 0.02, media: true, partners: [] },
};
/** Dozens of smaller partners, signed by the sales staff: what the marketing budget and the fans' mood drive. */
const SMALL_PARTNERS = 0.12;
/** Deals rise this much a year. */
const ESCALATOR = 0.03;

const WEST = new Set(["KC", "MIN", "DAL", "HOU", "DEN", "LV", "LAC", "LA", "SF", "SEA", "ARI"]);

function partners(state: GameState, cat: string): string[] {
  const c = LOCAL_CATS[cat];
  if (c.partners.length) return c.partners;
  // Made-up stations, with call letters the way the FCC hands them out (K west of the Mississippi, W east).
  const rng = rngFor(state.seed, `stations:${state.userTeam}`);
  const call = () => (WEST.has(state.userTeam) ? "K" : "W") + Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPRSTWXZ"[Math.floor(rng() * 20)]).join("");
  return cat === "radio"
    ? [`${call()} 1050 The Fan`, `${call()} 97.1 FM`, `${call()} Sports Radio 680`]
    : [`${call()}-TV Channel 4`, `${call()}-TV Channel 9`, `${call()}-TV Channel 11`];
}

function par(state: GameState, cat: string, year: number): number {
  return sponsorship(state.userTeam) * inflation(year, 0.05) * LOCAL_CATS[cat].share;
}

/** What a deal pays in a league year (zero outside its term). */
export function dealValue(d: LocalDeal, year: number): number {
  return year >= d.start && year < d.start + d.years ? d.value * Math.pow(1 + ESCALATOR, year - d.start) : 0;
}

export function localDeals(state: GameState): LocalDeals {
  const b = business(state);
  if (b.local) return b.local;
  // The deals in place when the owner takes over: staggered terms, so a few come up every year.
  const deals: LocalDeal[] = [];
  for (const cat of Object.keys(LOCAL_CATS)) {
    const rng = rngFor(state.seed, `local:${state.userTeam}:${cat}`);
    const years = 2 + Math.floor(rng() * 5);
    const end = BASE_SEASON + Math.floor(rng() * Math.min(5, years));
    const start = end - years + 1;
    const list = partners(state, cat);
    // Priced near today's market, less the raises it has already had.
    const value = (par(state, cat, BASE_SEASON) * (0.92 + 0.12 * rng())) / Math.pow(1 + ESCALATOR, BASE_SEASON - start);
    deals.push({ cat, partner: list[Math.floor(rng() * list.length)], start, years, value: Math.round(value) });
  }
  b.local = { deals, offers: [], vacant: [] };
  return b.local;
}

/** This league year's local money: named sponsors and the small partners, and radio and TV. */
export function localIncome(state: GameState, year = leagueYear(state.date)): { sponsors: number; media: number } {
  const l = localDeals(state);
  const b = business(state);
  let sponsors = 0;
  let media = 0;
  for (const d of l.deals) {
    const v = dealValue(d, year);
    if (LOCAL_CATS[d.cat].media) media += v;
    else sponsors += v;
  }
  const mood = 0.9 + state.pressure.fans / 500;
  sponsors += sponsorship(state.userTeam) * inflation(year, 0.05) * SMALL_PARTNERS * [0.94, 1, 1.03, 1.05][b.budget.marketing] * mood;
  return { sponsors, media };
}

/** The deal a category has in a league year, if any. */
export function dealFor(state: GameState, cat: string, year = leagueYear(state.date)): LocalDeal | undefined {
  return localDeals(state).deals.find((d) => d.cat === cat && dealValue(d, year) > 0);
}

/** How hot the team is to sponsors right now: winning, the fans, the sales staff and the building. */
export function sponsorHeat(state: GameState): number {
  const r = standings(state)[state.userTeam];
  const played = r ? r.w + r.l + r.t : 0;
  const wp = played >= 4 ? winPct(r.w, r.l, r.t) : 0.5;
  const playoff = state.seeds && [...state.seeds.AFC, ...state.seeds.NFC].includes(state.userTeam) ? 0.04 : 0;
  return 0.78 + state.pressure.fans / 400 + 0.2 * wp + playoff + [-0.03, 0, 0.02, 0.04][business(state).budget.marketing] + projectEffects(state).sponsor;
}

/** Renewal season opens February 1 for every deal that ends with the league year. */
function windowDates(year: number): { opens: string; closes: string } {
  return { opens: `${year + 1}-02-01`, closes: addDays(leagueYearStart(year + 1), -1) };
}

function makeOffers(state: GameState, year: number): void {
  const l = localDeals(state);
  const heat = sponsorHeat(state);
  const next = year + 1;
  for (const cat of Object.keys(LOCAL_CATS)) {
    const current = dealFor(state, cat, year);
    const renewing = current && current.start + current.years - 1 === year;
    const empty = !dealFor(state, cat, next);
    if (!renewing && !(empty && !current)) continue;
    const rng = rngFor(state.seed, `offers:${year}:${cat}`);
    const base = par(state, cat, next) * heat;
    const list = partners(state, cat).filter((p) => p !== current?.partner);
    const offer = (partner: string, incumbent: boolean, r: Rng): LocalOffer => ({
      id: `${next}:${cat}:${partner}`, cat, partner, incumbent,
      years: incumbent ? 3 + Math.floor(r() * 3) : 2 + Math.floor(r() * 5),
      value: Math.round(base * (incumbent ? 0.98 + gaussian(r) * 0.04 : 0.97 + gaussian(r) * 0.08) / 1000) * 1000,
    });
    if (renewing) l.offers.push(offer(current!.partner, true, rng));
    const rivals = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < rivals && list.length; i++) l.offers.push(offer(list.splice(Math.floor(rng() * list.length), 1)[0], false, rng));
  }
}

/** The owner takes an offer: it starts with the new league year. */
export function signLocalOffer(state: GameState, id: string): string | null {
  const l = localDeals(state);
  const o = l.offers.find((x) => x.id === id);
  if (!o || !l.window) return "That offer is no longer on the table.";
  const start = l.window.year + 1;
  l.deals = l.deals.filter((d) => !(d.cat === o.cat && d.start >= start));
  l.deals.push({ cat: o.cat, partner: o.partner, start, years: o.years, value: o.value });
  l.offers = l.offers.filter((x) => x.cat !== o.cat);
  l.vacant = l.vacant.filter((c) => c !== o.cat);
  news(state, `${TEAM_BY_ID[state.userTeam].name} ${o.incumbent ? "renew" : "sign"} ${o.partner} as ${LOCAL_CATS[o.cat].label.toLowerCase()} (${o.years} years)`);
  return null;
}

/** The owner turns every offer in a category down; it sits empty for a year unless someone better comes along. */
export function passLocalCategory(state: GameState, cat: string): void {
  const l = localDeals(state);
  l.offers = l.offers.filter((x) => x.cat !== cat);
  if (!l.vacant.includes(cat)) l.vacant.push(cat);
}

/** When the window closes, the business staff takes the best offer left in every category the owner didn't decide. */
function closeWindow(state: GameState): void {
  const l = localDeals(state);
  const cats = [...new Set(l.offers.map((o) => o.cat))];
  const signed: string[] = [];
  for (const cat of cats) {
    const best = l.offers.filter((o) => o.cat === cat).sort((a, b) => b.value * Math.min(b.years, 4) - a.value * Math.min(a.years, 4))[0];
    signLocalOffer(state, best.id);
    signed.push(`${LOCAL_CATS[cat].label}: ${best.partner}, ${best.years} years at ${money(best.value)} a year`);
  }
  if (signed.length) send(state, "business", businessChief(state), "Sponsor deals we closed", `You hadn't picked in these categories, so we took the best offer:\n\n${signed.join("\n")}`);
  l.window = undefined;
}

export function commerceDaily(state: GameState): void {
  const l = localDeals(state);
  const year = leagueYear(state.date);
  const w = windowDates(year);
  if (state.date === w.opens && l.window?.year !== year) {
    l.offers = [];
    l.vacant = [];
    makeOffers(state, year);
    l.window = { year, closes: w.closes };
    const cats = [...new Set(l.offers.map((o) => o.cat))];
    if (cats.length) {
      send(state, "business", businessChief(state), `${cats.length} sponsor and media deals are up`,
        `These deals end with the league year: ${cats.map((c) => LOCAL_CATS[c].label.toLowerCase()).join(", ")}. The offers are on the Business page under Sponsors. ` +
        `What companies will pay moves with how the team is doing and how fans feel, so a long deal locks in today's price. If you haven't chosen by ${shortDate(w.closes)}, we'll take the best offer in each.`);
    }
  }
  if (l.window && state.date >= l.window.closes) closeWindow(state);
}
