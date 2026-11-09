// The sponsorship business beyond signing deals: what the club has to sell
// (its commercial inventory), exclusivity and the rights that conflict with
// it, stadium naming rights where the club controls them, whether each
// partner got what it paid for (deliverables, and make-goods when it didn't),
// how each account feels about the club, and partners that fail to pay or
// get into trouble. Partner companies are made up; the naming partners come
// from the real stadium names.
import { business, businessChief, post } from "./business";
import { dealFor, dealValue, LOCAL_CATS, localDeals, sponsorHeat } from "./commerce";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { execBoost } from "./executives";
import { fanBase, trustHit } from "./fans";
import { money, news, send } from "./inbox";
import { BASE_SEASON, RULES, SCHEDULE, TEAM_BY_ID } from "./league";
import { rngFor } from "./rng";
import { controlOf, STADIUM_BY_TEAM } from "./stadiums";
import type { GameState, LocalDeal } from "./types";

/** What the club can sell, and which deals use it. */
export const INVENTORY: { asset: string; cats: string[] }[] = [
  { asset: "Jersey patch and practice-jersey marks", cats: ["patch"] },
  { asset: "Stadium signage: LED ribbons, end-zone and concourse panels", cats: ["bank", "auto", "wireless", "insurance", "airline", "sportsbook"] },
  { asset: "Pouring rights and concession menus", cats: ["beer", "drink"] },
  { asset: "Team app, newsletter, website and social channels", cats: ["digital", "wireless"] },
  { asset: "Radio and TV broadcasts, team shows", cats: ["radio", "tv"] },
  { asset: "Medical and training-room designations", cats: ["health"] },
  { asset: "Practice facility name", cats: ["practice"] },
  { asset: "Stadium name", cats: ["naming"] },
  { asset: "Suites, club nights and partner events", cats: ["bank", "auto", "beer", "airline"] },
];

/** A partner's yearly chance of failing to pay, by category. */
const RISK: Record<string, number> = { sportsbook: 0.04, airline: 0.03, digital: 0.03, patch: 0.015, auto: 0.015, beer: 0.01, drink: 0.01, bank: 0.008, health: 0.008, insurance: 0.008, wireless: 0.006, radio: 0.01, tv: 0.01, practice: 0.015, naming: 0.004 };
/** Categories where a partner's own trouble lands on the club. */
const TOUCHY = new Set(["sportsbook", "beer", "health", "digital", "patch"]);

export function controlsNaming(state: GameState): boolean {
  const s = STADIUM_BY_TEAM[state.userTeam];
  return !!s.naming && s.namingShare > 0 && (s.structure === "owned" || s.structure === "coowned" || s.structure === "publicTeam");
}

/** The company on the stadium, read off its name. */
export function namingPartner(state: GameState): string {
  return STADIUM_BY_TEAM[state.userTeam].name.replace(/ (Bank )?(Field|Stadium|Superdome|Dome|Park|Center|Coliseum)$/, (_m, bank) => (bank ? " Bank" : "")).trim();
}

/** A new deal's account fields. */
export function dealTerms(cat: string, rng: () => number): Pick<LocalDeal, "rel" | "risk"> {
  return { rel: 60, risk: Math.round((RISK[cat] ?? 0.01) * (0.6 + rng() * 0.8) * 1000) / 1000 };
}

/** Naming deals in place when the owner takes over: one long deal, partway through. */
export function initialNaming(state: GameState): LocalDeal | null {
  if (!controlsNaming(state)) return null;
  const s = STADIUM_BY_TEAM[state.userTeam];
  const rng = rngFor(state.seed, `naming:${state.userTeam}`);
  const years = 10 + Math.floor(rng() * 11);
  const end = BASE_SEASON + 1 + Math.floor(rng() * 9);
  const start = end - years + 1;
  // Priced so this year's payment is the reported deal.
  return { cat: "naming", partner: namingPartner(state), start, years, value: Math.round(s.naming / Math.pow(1.03, BASE_SEASON - start)), ...dealTerms("naming", rng) };
}

/** Our stadium naming money for a league year: the deal we manage, or our share of the operator's. */
export function namingIncome(state: GameState, year: number): number {
  const s = STADIUM_BY_TEAM[state.userTeam];
  if (!controlsNaming(state)) return s.naming * s.namingShare;
  const d = dealFor(state, "naming", year);
  return d ? dealValue(d, year) * s.namingShare : 0;
}

/**
 * Rights that can't be sold as asked: league rules on sportsbooks, pouring
 * rights the stadium operator owns, and exclusivity a current partner holds.
 */
export function rightsConflict(state: GameState, cat: string, exclusive: boolean): string | null {
  const s = STADIUM_BY_TEAM[state.userTeam];
  if (exclusive && cat === "sportsbook") return "League rules let several approved sportsbooks advertise, so no team can sell sportsbook exclusivity.";
  if ((cat === "beer" || cat === "drink") && !controlOf(s).concessions) return `Pouring rights at ${s.name} belong to ${s.operator}, so our partner gets marks and signage but not the taps.`;
  const year = leagueYear(state.date);
  const wireless = business(state).local?.deals.find((d) => d.cat === "wireless" && dealValue(d, year) > 0);
  if (exclusive && cat === "digital" && wireless?.exclusive) return "Our wireless partner's exclusivity covers the team app, so a digital partner can't be exclusive there.";
  return null;
}

/** What exclusive deals cost in smaller partners the sales staff can no longer sign around them. */
export function exclusivityDrag(state: GameState, year: number): number {
  let drag = 0;
  for (const d of localDeals(state).deals) if (d.exclusive && dealValue(d, year) > 0) drag += dealValue(d, year) * 0.08;
  return drag;
}

// ---- Deliverables ----

/**
 * After the regular season, the sales staff reports to each partner what it
 * got: crowds in front of its signs, broadcast and digital audiences,
 * hospitality nights. Falling short means make-goods: extra inventory or
 * money back.
 */
export function deliveryCheck(state: GameState): void {
  const l = localDeals(state);
  const b = business(state);
  const f = fanBase(state);
  const year = leagueYear(state.date);
  const s = STADIUM_BY_TEAM[state.userTeam];
  const regs = b.gates.filter((g) => g.type === "REG" && g.date >= `${RULES.season}-08-01`);
  if (!regs.length) return;
  const crowd = regs.reduce((a, g) => a + (g.attendance ?? g.sold * 0.93), 0) / regs.length / s.capacity;
  const prime = SCHEDULE.filter((g) => g.type === "REG" && (g.home === state.userTeam || g.away === state.userTeam) && (g.weekday === "Monday" || g.weekday === "Thursday" || g.timeET >= "20:00")).length;
  const reach = Math.pow((f.reach.national + f.reach.intl) / (f.national0 * 1.1), 0.5);
  const staff = [0.96, 1, 1.02, 1.04][b.budget.marketing] * (1 + 0.02 * execBoost(state, "CRO"));
  const shorts: string[] = [];
  let owed = 0;
  for (const d of l.deals) {
    const v = dealValue(d, year);
    if (!v || d.ended || d.delivered?.[year] != null) continue;
    const c = LOCAL_CATS[d.cat];
    const media = c?.media || d.cat === "digital";
    let x = Math.pow(crowd / 0.92, 0.6) * staff;
    if (media) x = (0.85 + prime * 0.03) * reach * staff;
    if (d.cat === "naming" || d.cat === "practice") x = 0.97 + (staff - 1);
    x = Math.round(Math.max(0.6, Math.min(1.1, x)) * 100) / 100;
    (d.delivered ??= {})[year] = x;
    if (x < 0.93) {
      const cost = Math.round(v * (0.93 - x) * 0.6);
      owed += cost;
      d.rel = Math.max(0, (d.rel ?? 60) - (0.93 - x) * 100);
      shorts.push(`${d.partner} (${LOCAL_CATS[d.cat]?.label.toLowerCase() ?? "naming rights"}): ${Math.round(x * 100)}% delivered, ${money(cost)} in make-goods`);
    } else if (x >= 1) d.rel = Math.min(100, (d.rel ?? 60) + 3);
  }
  if (owed) {
    post(state, "marketing", -owed, "Sponsor make-goods for audiences we didn't deliver");
    send(state, "business", businessChief(state), "We owe some partners make-goods",
      `Our year-end reports to partners came up short on a few deals, so we owe them extra inventory or money back:\n\n${shorts.join("\n")}\n\nEmpty seats and a thin national audience are what usually do it.`);
  }
}

// ---- Accounts, defaults and trouble ----

function accounts(state: GameState): void {
  const l = localDeals(state);
  const year = leagueYear(state.date);
  const heat = sponsorHeat(state);
  const b = business(state);
  const target = 55 + (b.budget.marketing - 1) * 3 + execBoost(state, "CRO") * 4 + (heat - 1) * 40 + (fanBase(state).trust - 60) / 4;
  for (const d of l.deals) if (dealValue(d, year) > 0 && !d.ended) d.rel = Math.round(((d.rel ?? 60) + (target - (d.rel ?? 60)) * 0.05) * 10) / 10;
}

/** The first of each month: partners that stop paying, and partners in the news for the wrong reasons. */
function monthlyRisk(state: GameState): void {
  const l = localDeals(state);
  const year = leagueYear(state.date);
  const econ = fanBase(state).economy;
  for (const d of l.deals) {
    const v = dealValue(d, year);
    if (!v || d.ended) continue;
    const rng = rngFor(state.seed, `sponsor-risk:${d.cat}:${d.partner}:${state.date}`);
    const risk = (d.risk ?? 0.01) * (econ < 0.97 ? 2 : 1);
    // Shaky partners pay late before they stop paying.
    d.overdue = risk > 0.03 && econ < 0.98 ? Math.round(v / 12) : 0;
    if (rng() < risk / 12) {
      const lost = Math.round((v / 12) * 2);
      d.ended = state.date;
      d.years = Math.max(0, year - d.start);
      post(state, "sponsorship", -lost, `${d.partner}: fees billed and never paid`);
      send(state, "business", businessChief(state), `${d.partner} has stopped paying`,
        `${d.partner} missed its payments and its lawyers say it can't pay the rest of the deal. We wrote off ${money(lost)} we had billed. ` +
        `The ${LOCAL_CATS[d.cat]?.label.toLowerCase() ?? "naming rights"} category is open; we'll shop it when the renewal window opens in February.`);
      news(state, `${d.partner} defaults on its ${TEAM_BY_ID[state.userTeam].name} sponsorship`);
      continue;
    }
    if (!d.scandal && rng() < (TOUCHY.has(d.cat) ? 0.04 : 0.015) / 12) {
      d.scandal = state.date;
      send(state, "business", businessChief(state), `${d.partner} is in the news`,
        `${d.partner} is under investigation, and reporters are asking whether we'll keep the partnership. You can end it on the Sponsors tab; the contract lets us walk away over a scandal. ` +
        "If we keep them, some fans won't like it. We'll keep them if we don't hear from you in a month.");
    }
  }
}

/** The owner ends a partnership over the partner's scandal: no fees from here, and fans approve. */
export function dropPartner(state: GameState, cat: string): string | null {
  const year = leagueYear(state.date);
  const d = dealFor(state, cat, year);
  if (!d || !d.scandal) return "Only a partner in the news can be dropped without paying to get out.";
  d.ended = state.date;
  d.years = Math.max(0, year - d.start);
  delete d.scandal;
  trustHit(state, 1, 0, `Ended the partnership with ${d.partner}`);
  news(state, `${TEAM_BY_ID[state.userTeam].name} end their partnership with ${d.partner}`);
  return null;
}

export function keepPartner(state: GameState, cat: string): void {
  const d = dealFor(state, cat, leagueYear(state.date));
  if (!d?.scandal) return;
  delete d.scandal;
  trustHit(state, -2, 0, `Stood by ${d.partner} through its scandal`);
}

/** Fees billed and not yet paid: partners pay each quarter after it ends, and some pay late. */
export function receivables(state: GameState): { partner: string; cat: string; amount: number; overdue: number }[] {
  const year = leagueYear(state.date);
  const month = Number(state.date.slice(5, 7));
  const intoQuarter = ((month - 3 + 12) % 3) + 1;
  return localDeals(state).deals.filter((d) => dealValue(d, year) > 0 && !d.ended).map((d) => ({
    partner: d.partner, cat: d.cat, amount: Math.round((dealValue(d, year) / 12) * intoQuarter), overdue: d.overdue ?? 0,
  }));
}

/** Partners renewed, by year, and how the money moved. */
export function sponsorRetention(state: GameState): { year: number; up: number; renewed: number; before: number; after: number }[] {
  return localDeals(state).retention ?? [];
}

export function sponsorsDaily(state: GameState): void {
  const l = localDeals(state);
  if (state.date.endsWith("-01")) monthlyRisk(state);
  if (state.date.endsWith("-01") || state.date.endsWith("-15")) accounts(state);
  // A month without word from the owner, and the club stands by the partner.
  for (const d of l.deals) if (d.scandal && state.date >= addDays(d.scandal, 30)) keepPartner(state, d.cat);
  if (state.date === addDays(RULES.keyDates.regularSeasonEnd, 1)) deliveryCheck(state);
}
