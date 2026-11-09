// Local sponsors and local radio and TV: the team's own deals, apart from the
// league's national money. Each category (the jersey patch, the official bank,
// the flagship radio station...) has one partner on a multi-year deal that
// rises 3% a year. Deals that run out come up for renewal each February, when
// the incumbent and rival companies make offers; what they'll pay depends on
// how the team is doing, how fans feel and what the building offers. The
// partner companies and stations are made up.
import { hostEffects } from "./hosting";
import { inflation, business, businessChief, sponsorship } from "./business";
import { leagueYear, leagueYearStart } from "./contracts";
import { addDays, shortDate } from "./dates";
import { money, news, send } from "./inbox";
import { BASE_SEASON, TEAM_BY_ID } from "./league";
import { projectEffects } from "./projects";
import { gaussian, rngFor, type Rng } from "./rng";
import { standings, winPct } from "./standings";
import { execBoost } from "./executives";
import { controlsNaming, dealTerms, exclusivityDrag, initialNaming, namingPartner, rightsConflict } from "./sponsors";
import { STADIUM_BY_TEAM } from "./stadiums";
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
  digital: { label: "Digital partner (app, newsletter, social)", share: 0.05, partners: ["Streamline Media", "Pixelforge Studios", "Northbeam Digital", "Clickwise"] },
  practice: { label: "Practice facility name", share: 0.03, partners: ["Granite Health Performance Center", "Summit Mutual Training Complex", "Harbor Freightways Practice Facility", "Ridgeway Energy Performance Center"] },
  radio: { label: "Flagship radio station", share: 0.06, media: true, partners: [] },
  tv: { label: "Preseason TV and team shows", share: 0.02, media: true, partners: [] },
  naming: { label: "Stadium naming rights", share: 0, partners: [] },
};
/** Dozens of smaller partners, signed by the sales staff: what the marketing budget and the fans' mood drive. */
const SMALL_PARTNERS = 0.04;
/** Deals rise this much a year. */
const ESCALATOR = 0.03;

const WEST = new Set(["KC", "MIN", "DAL", "HOU", "DEN", "LV", "LAC", "LA", "SF", "SEA", "ARI"]);

/** The categories this club sells: stadium naming only where the club controls it. */
export function categories(state: GameState): string[] {
  return Object.keys(LOCAL_CATS).filter((c) => c !== "naming" || controlsNaming(state));
}

function partners(state: GameState, cat: string): string[] {
  if (cat === "naming") return [namingPartner(state)];
  const c = LOCAL_CATS[cat];
  if (c.partners.length) return c.partners;
  // Made-up stations, with call letters the way the FCC hands them out (K west of the Mississippi, W east).
  const rng = rngFor(state.seed, `stations:${state.userTeam}`);
  const call = () => (WEST.has(state.userTeam) ? "K" : "W") + Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPRSTWXZ"[Math.floor(rng() * 20)]).join("");
  return cat === "radio"
    ? [`${call()} 1050 The Fan`, `${call()} 97.1 FM`, `${call()} Sports Radio 680`]
    : [`${call()}-TV Channel 4`, `${call()}-TV Channel 9`, `${call()}-TV Channel 11`];
}

/** What a category is worth on the market in a league year, before how hot the team is. */
export function par(state: GameState, cat: string, year: number): number {
  if (cat === "naming") return STADIUM_BY_TEAM[state.userTeam].naming * inflation(year, 0.03);
  return sponsorship(state.userTeam) * inflation(year, 0.05) * LOCAL_CATS[cat].share;
}

/** What a deal pays in a league year (zero outside its term). */
export function dealValue(d: LocalDeal, year: number): number {
  return year >= d.start && year < d.start + d.years ? d.value * Math.pow(1 + ESCALATOR, year - d.start) : 0;
}

export function localDeals(state: GameState): LocalDeals {
  const b = business(state);
  if (b.local) {
    // Saves from before digital, practice-facility and naming deals get them now.
    if (!b.local.deals.some((d) => d.cat === "digital")) {
      // They run at least through next league year, so none lapses before its first renewal window.
      const added = startingDeals(state, ["digital", "practice", ...(controlsNaming(state) ? ["naming"] : [])]);
      const next = leagueYear(state.date) + 1;
      for (const d of added) d.years = Math.max(d.years, next - d.start + 1);
      b.local.deals.push(...added);
    }
    return b.local;
  }
  b.local = { deals: startingDeals(state, categories(state)), offers: [], vacant: [] };
  return b.local;
}

/** The deals in place when the owner takes over: staggered terms, so a few come up every year. */
function startingDeals(state: GameState, cats: string[]): LocalDeal[] {
  const deals: LocalDeal[] = [];
  for (const cat of cats) {
    if (cat === "naming") {
      const n = initialNaming(state);
      if (n) deals.push(n);
      continue;
    }
    const rng = rngFor(state.seed, `local:${state.userTeam}:${cat}`);
    const years = 2 + Math.floor(rng() * 5);
    const end = BASE_SEASON + Math.floor(rng() * Math.min(5, years));
    const start = end - years + 1;
    const list = partners(state, cat);
    // Priced near today's market, less the raises it has already had.
    const value = (par(state, cat, BASE_SEASON) * (0.92 + 0.12 * rng())) / Math.pow(1 + ESCALATOR, BASE_SEASON - start);
    const exclusive = !rightsConflict(state, cat, true) && rng() < 0.5;
    deals.push({ cat, partner: list[Math.floor(rng() * list.length)], start, years, value: Math.round(value), exclusive, ...dealTerms(cat, rng) });
  }
  return deals;
}

/** This league year's local money: named sponsors and the small partners, and radio and TV. */
export function localIncome(state: GameState, year = leagueYear(state.date)): { sponsors: number; media: number } {
  const l = localDeals(state);
  const b = business(state);
  let sponsors = 0;
  let media = 0;
  for (const d of l.deals) {
    if (d.cat === "naming") continue;
    const v = dealValue(d, year);
    if (LOCAL_CATS[d.cat].media) media += v;
    else sponsors += v;
  }
  const mood = 0.9 + state.pressure.fans / 500;
  sponsors += sponsorship(state.userTeam) * inflation(year, 0.05) * SMALL_PARTNERS * [0.94, 1, 1.03, 1.05][b.budget.marketing] * mood;
  // The revenue chief's sales staff works the small partners harder (or not).
  sponsors *= 1 + 0.04 * execBoost(state, "CRO");
  // Partners who've lost confidence in the club spend less with it.
  sponsors *= 1 + ((state.culture?.rel.sponsors ?? 60) - 60) / 1000;
  // Exclusive partners keep their rivals out, and with them some smaller deals.
  sponsors -= exclusivityDrag(state, year);
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
  // Companies spend more in a strong economy, and on clubs fans trust.
  const f = state.fans;
  const extra = f ? (Math.pow(f.economy, 0.5) - 1) + (f.trust - 60) / 1000 : 0;
  return 0.78 + state.pressure.fans / 400 + 0.2 * wp + playoff + [-0.03, 0, 0.02, 0.04][business(state).budget.marketing] + projectEffects(state).sponsor + hostEffects(state, state.userTeam).sponsor + extra;
}

/** Renewal season opens February 1 for every deal that ends with the league year. */
function windowDates(year: number): { opens: string; closes: string } {
  return { opens: `${year + 1}-02-01`, closes: addDays(leagueYearStart(year + 1), -1) };
}

function makeOffers(state: GameState, year: number): void {
  const l = localDeals(state);
  const heat = sponsorHeat(state);
  const next = year + 1;
  const ret = { year: next, up: 0, renewed: 0, before: 0, after: 0 };
  for (const cat of categories(state)) {
    const current = dealFor(state, cat, year);
    const renewing = current && current.start + current.years - 1 === year;
    const empty = !dealFor(state, cat, next);
    if (!renewing && !(empty && !current)) continue;
    const rng = rngFor(state.seed, `offers:${year}:${cat}`);
    const naming = cat === "naming";
    // Naming partners pay for the market more than the season.
    const base = par(state, cat, next) * (naming ? Math.pow(heat, 0.4) : heat) * ((cat === "beer" || cat === "drink") && rightsConflict(state, cat, false) ? 0.75 : 1);
    const list = partners(state, cat).filter((p) => p !== current?.partner);
    const offer = (partner: string, incumbent: boolean, r: Rng): LocalOffer => {
      // A partner that liked the relationship pays to keep it; exclusivity costs a fifth more where it can be sold.
      const exclusive = incumbent ? !!current?.exclusive && !rightsConflict(state, cat, true) : !naming && !rightsConflict(state, cat, true) && r() < 0.4;
      const rel = incumbent ? 1 + ((current?.rel ?? 60) - 60) / 600 : 1;
      return {
        id: `${next}:${cat}:${partner}`, cat, partner, incumbent, exclusive,
        years: naming ? 8 + Math.floor(r() * 10) : incumbent ? 3 + Math.floor(r() * 3) : 2 + Math.floor(r() * 5),
        value: Math.round(base * rel * (exclusive ? 1.2 : 1) * (incumbent ? 0.98 + gaussian(r) * 0.04 : 0.97 + gaussian(r) * 0.08) / 1000) * 1000,
      };
    };
    if (renewing) {
      ret.up++;
      ret.before += dealValue(current!, year);
      // A partner that soured on the club doesn't come back to the table.
      if ((current!.rel ?? 60) >= 35) l.offers.push(offer(current!.partner, true, rng));
    }
    // A new name on the stadium would need the league's and the city's sign-off, so the staff deals only with the current partner.
    if (naming) {
      if (renewing && (current!.rel ?? 60) >= 35) l.offers.push({ ...offer(current!.partner, true, rng), id: `${next}:${cat}:${current!.partner}:short`, years: 5 });
      continue;
    }
    const rivals = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < rivals && list.length; i++) l.offers.push(offer(list.splice(Math.floor(rng() * list.length), 1)[0], false, rng));
  }
  if (ret.up) (l.retention ??= []).unshift(ret);
}

/** The owner takes an offer: it starts with the new league year. */
export function signLocalOffer(state: GameState, id: string): string | null {
  const l = localDeals(state);
  const o = l.offers.find((x) => x.id === id);
  if (!o || !l.window) return "That offer is no longer on the table.";
  const start = l.window.year + 1;
  l.deals = l.deals.filter((d) => !(d.cat === o.cat && d.start >= start));
  l.deals.push({ cat: o.cat, partner: o.partner, start, years: o.years, value: o.value, exclusive: o.exclusive, ...dealTerms(o.cat, rngFor(state.seed, `terms:${o.id}`)) });
  l.offers = l.offers.filter((x) => x.cat !== o.cat);
  const ret = l.retention?.find((r) => r.year === start);
  if (ret) {
    if (o.incumbent) ret.renewed++;
    ret.after += o.value;
  }
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
    signed.push(`${LOCAL_CATS[cat].label}: ${best.partner}, ${best.years} years at ${money(best.value)} a year${best.exclusive ? ", exclusive" : ""}`);
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
