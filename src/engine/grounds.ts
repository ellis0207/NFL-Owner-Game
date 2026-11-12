// The stadium and its grounds as one model: the seating bowl in sections
// (general, club, suites, end-zone party decks), sections closed while work
// goes on, the land around the building, the parking on it and near it (who
// owns, leases or independently runs each lot, surface or garage), transit,
// and what it all costs to run. The game-day money (business.ts gateModel),
// the Stadium tab's plan drawing and any later 3D view all read this one
// model, so a change to parking, premium seats or a construction phase moves
// the picture and the books together.
//
// Site facts (how downtown a stadium is, how much land, transit share) are
// rough estimates for each real stadium; lot layouts are made up.
import { cashBalance, inflation, post } from "./business";
import { constructionFactor } from "./economy";
import { addDays, shortDate } from "./dates";
import { nextId } from "./ids";
import { RULES } from "./league";
import { controlOf, MARKETS, STADIUM_BY_TEAM } from "./stadiums";
import { rngFor } from "./rng";
import type { GameState, GroundsState } from "./types";

/** Fans per car on game day. */
export const PER_CAR = 2.9;
/** Share of the bowl in suites and clubs before any conversion (PREMIUM_SEATS in business.ts). */
export const PREMIUM_SHARE = 0.12;
/** The "clubs" stadium project (projects.ts) turns this share of the bowl into club seats; the "parking" project adds a garage. */
const CLUBS_PROJECT_SHARE = 0.025;
const PARKING_PROJECT_SPACES = 2500;
/** Surface parking: cars per acre. A garage holds about four times as many on the same land. */
const PER_ACRE = 140;
const GARAGE_PER_ACRE = 560;

export type SiteKind = "downtown" | "urban" | "suburban";
export type LotControl = "owned" | "leased" | "operator" | "independent";

export interface Lot {
  id: string;
  name: string;
  kind: "surface" | "garage";
  spaces: number;
  control: LotControl;
  /** Share of the parking money the club keeps from this lot. */
  share: number;
  /** Acres of land it uses (owned and leased lots). */
  acres: number;
  /** Minutes' walk to the gates. */
  walk: number;
  /** Not open yet: being built until this date. */
  opens?: string;
}

export interface Section {
  id: string;
  kind: "lower" | "upper" | "club" | "suite" | "deck";
  seats: number;
  premium: boolean;
  /** Closed for work from and to these dates. */
  closed?: { from: string; to: string; why: string };
}

export interface GroundsModel {
  team: string;
  stadium: string;
  site: SiteKind;
  /** Acres the club controls around the building, and how many are free to build on. */
  acres: number;
  freeAcres: number;
  /** Share of fans who come by train, bus or on foot rather than driving. */
  transit: number;
  /** How fans get there, as shares. */
  modes: { drive: number; rideshare: number; transit: number; walk: number };
  sections: Section[];
  lots: Lot[];
  /** Seats open on a date, general and premium. */
  capacity: number;
  /** Yearly running cost of the parking and the premium areas the club added. */
  upkeep: number;
  /** Construction and leases under way, in words. */
  notes: string[];
}

/** Rough site facts for each stadium: how central it is, the land the club controls, and how many fans arrive without a car. */
const SITES: Record<string, { site: SiteKind; acres: number; transit: number }> = {
  BUF: { site: "suburban", acres: 200, transit: 0.05 }, MIA: { site: "suburban", acres: 160, transit: 0.08 }, NE: { site: "suburban", acres: 220, transit: 0.08 },
  NYJ: { site: "suburban", acres: 180, transit: 0.28 }, NYG: { site: "suburban", acres: 180, transit: 0.28 }, BAL: { site: "downtown", acres: 45, transit: 0.35 },
  CIN: { site: "downtown", acres: 35, transit: 0.25 }, CLE: { site: "downtown", acres: 40, transit: 0.3 }, PIT: { site: "urban", acres: 60, transit: 0.3 },
  HOU: { site: "urban", acres: 130, transit: 0.18 }, IND: { site: "downtown", acres: 30, transit: 0.15 }, JAX: { site: "downtown", acres: 60, transit: 0.1 },
  TEN: { site: "downtown", acres: 70, transit: 0.2 }, DEN: { site: "urban", acres: 90, transit: 0.3 }, KC: { site: "suburban", acres: 190, transit: 0.03 },
  LV: { site: "urban", acres: 62, transit: 0.12 }, LAC: { site: "urban", acres: 120, transit: 0.15 }, LA: { site: "urban", acres: 120, transit: 0.15 },
  DAL: { site: "suburban", acres: 140, transit: 0.03 }, PHI: { site: "urban", acres: 90, transit: 0.3 }, WAS: { site: "suburban", acres: 200, transit: 0.15 },
  CHI: { site: "downtown", acres: 40, transit: 0.35 }, DET: { site: "downtown", acres: 30, transit: 0.25 }, GB: { site: "urban", acres: 80, transit: 0.05 },
  MIN: { site: "downtown", acres: 25, transit: 0.45 }, ATL: { site: "downtown", acres: 35, transit: 0.38 }, CAR: { site: "downtown", acres: 33, transit: 0.25 },
  NO: { site: "downtown", acres: 52, transit: 0.3 }, TB: { site: "urban", acres: 100, transit: 0.06 }, ARI: { site: "suburban", acres: 160, transit: 0.06 },
  SF: { site: "suburban", acres: 70, transit: 0.3 }, SEA: { site: "downtown", acres: 35, transit: 0.45 },
};

export function grounds(state: GameState): GroundsState {
  return (state.grounds ??= { garages: [], leases: [], premium: [] });
}

/** The stadium's footprint takes about 20 acres; the rest of the club's land is parking or open. */
const FOOTPRINT = 20;

/** The stadium and its grounds as they stand on a date (today by default). */
export function groundsModel(state: GameState, date = state.date, team = state.userTeam): GroundsModel {
  const s = STADIUM_BY_TEAM[team];
  const site = SITES[team] ?? { site: "urban" as SiteKind, acres: 80, transit: 0.15 };
  const ctrl = controlOf(s);
  const ours = team === state.userTeam;
  const g = ours ? grounds(state) : { garages: [], leases: [], premium: [] };
  const r = rngFor(1, `grounds:${team}`);
  const proj = ours ? (state.business?.projects ?? []) : [];
  const clubsProject = proj.find((p) => p.id === "clubs");
  const parkingProject = proj.find((p) => p.id === "parking");
  const notes: string[] = [];
  // ---- The bowl ----
  const added = g.premium.filter((p) => p.opens <= date).reduce((t, p) => t + p.seats, 0);
  const projectSeats = clubsProject && clubsProject.opens <= date ? Math.round(s.capacity * CLUBS_PROJECT_SHARE) : 0;
  const premium = Math.round(s.capacity * PREMIUM_SHARE) + added + projectSeats;
  const general = s.capacity - premium;
  const sections: Section[] = [
    { id: "lower", kind: "lower", seats: Math.round(general * 0.46), premium: false },
    { id: "upper", kind: "upper", seats: general - Math.round(general * 0.46), premium: false },
    { id: "club", kind: "club", seats: Math.round(premium * 0.82), premium: true },
    { id: "suite", kind: "suite", seats: premium - Math.round(premium * 0.82), premium: true },
  ];
  // Seats being rebuilt during a season: the section is shut while the work goes on.
  const lower = sections[0];
  for (const p of g.premium) {
    if (p.opens > date && p.phased && p.started <= date) {
      const n = Math.min(p.seats, lower.seats);
      lower.seats -= n;
      sections.push({ id: `work-${p.id}`, kind: "lower", seats: n, premium: false, closed: { from: p.started, to: p.opens, why: "Being rebuilt as club seats" } });
    }
  }
  // The clubs project builds over two offseasons; in the season between, its sideline section is closed.
  if (clubsProject && clubsProject.opens > date && date >= `${clubsProject.started.slice(0, 4)}-08-01`) {
    const n = Math.min(Math.round(s.capacity * CLUBS_PROJECT_SHARE), lower.seats);
    lower.seats -= n;
    sections.push({ id: "work-clubs", kind: "lower", seats: n, premium: false, closed: { from: clubsProject.started, to: clubsProject.opens, why: "Field-level clubs under construction" } });
  }
  const capacity = sections.filter((x) => !x.closed).reduce((t, x) => t + x.seats, 0);
  // ---- Land and parking ----
  const garageAcres = g.garages.reduce((t, x) => t + x.acres, 0) + (parkingProject && parkingProject.started <= date ? 5 : 0);
  const lotAcres = Math.max(0, site.acres - FOOTPRINT) * (site.site === "suburban" ? 0.8 : 0.7);
  const free = Math.max(0, site.acres - FOOTPRINT - lotAcres);
  const surfaceAcres = Math.max(0, lotAcres - garageAcres);
  const control: LotControl = ctrl.parking ? "owned" : "operator";
  const share = s.gameDayShare;
  const lots: Lot[] = [
    { id: "main", name: "Stadium lots", kind: "surface", spaces: Math.round(surfaceAcres * PER_ACRE), control, share, acres: Math.round(surfaceAcres), walk: 8 },
  ];
  if (site.site !== "suburban") lots.push({ id: "deck", name: "Stadium garage", kind: "garage", spaces: Math.round(1500 + r() * 1500), control, share, acres: 3, walk: 5 });
  if (parkingProject && parkingProject.started <= date) {
    const open = parkingProject.opens <= date;
    lots.push({ id: "project-garage", name: "Garage and rideshare plaza", kind: "garage", spaces: PARKING_PROJECT_SPACES, control: "owned", share: 1, acres: 5, walk: 3, opens: open ? undefined : parkingProject.opens });
    if (!open) notes.push(`The parking garage project opens ${shortDate(parkingProject.opens)}.`);
  }
  for (const x of g.garages) lots.push({ id: x.id, name: "New garage", kind: "garage", spaces: x.spaces, control: "owned", share: 1, acres: x.acres, walk: 4, opens: x.opens > date ? x.opens : undefined });
  for (const x of g.leases) if (x.through >= RULES.season) lots.push({ id: x.id, name: x.name, kind: "surface", spaces: x.spaces, control: "leased", share: 1, acres: Math.round(x.spaces / PER_ACRE), walk: 15 });
  // Lots nobody at the club runs: city garages downtown, private lots and lawns out by the highway.
  // A stadium that's open today gets its crowd parked, so between them they hold about a sellout's cars.
  const transitShare = site.transit, walkShare = site.site === "downtown" ? 0.06 : site.site === "urban" ? 0.03 : 0.01;
  const driveShare = Math.max(0.3, 1 - transitShare - walkShare - (0.07 + (site.site === "suburban" ? 0 : 0.03)));
  const sellout = (s.capacity * 0.95 / PER_CAR) * (driveShare / 0.8);
  const baseClub = lots.filter((l) => !l.id.startsWith("garage") && !l.id.startsWith("lease") && l.id !== "project-garage").reduce((t, l) => t + l.spaces, 0);
  const nearby = Math.max(site.site === "downtown" ? 9000 + r() * 6000 : site.site === "urban" ? 4000 + r() * 3000 : 1500 + r() * 1500, (sellout - baseClub) * (1.02 + r() * 0.05));
  lots.push({ id: "independent", name: site.site === "downtown" ? "City and private garages nearby" : "Private lots nearby", kind: site.site === "downtown" ? "garage" : "surface", spaces: Math.round(nearby), control: "independent", share: 0, acres: 0, walk: site.site === "downtown" ? 12 : 20 });
  // ---- How fans arrive ----
  const transit = transitShare;
  const modes = { transit, walk: walkShare, rideshare: 0.07 + (site.site === "suburban" ? 0 : 0.03), drive: driveShare };
  // ---- Running costs ----
  const garageUpkeep = g.garages.reduce((t, x) => t + x.spaces * 220, 0);
  const leaseRent = g.leases.filter((x) => x.through >= RULES.season).reduce((t, x) => t + x.rent, 0);
  const premiumUpkeep = added * 600;
  for (const x of g.garages) if (x.opens > date) notes.push(`Garage of ${x.spaces.toLocaleString("en-US")} spaces opens ${shortDate(x.opens)}.`);
  for (const x of g.premium) if (x.opens > date) notes.push(`${x.seats.toLocaleString("en-US")} club seats open ${shortDate(x.opens)}${x.phased ? "; the section is closed until then" : ""}.`);
  return {
    team, stadium: s.name, site: site.site, acres: site.acres, freeAcres: Math.round(free * 10) / 10,
    transit, modes, sections, lots, capacity, upkeep: Math.round(garageUpkeep + leaseRent + premiumUpkeep), notes,
  };
}

/** Seats on sale on a date: general and premium, after closures. */
export function seatsOn(m: GroundsModel): { general: number; premium: number } {
  let general = 0, premium = 0;
  for (const x of m.sections) if (!x.closed) (x.premium ? (premium += x.seats) : (general += x.seats));
  return { general: Math.max(0, general), premium };
}

export interface ParkingDay {
  /** Cars that want to park. */
  cars: number;
  /** Cars in lots the club runs or leases, and in the independent lots. */
  club: number;
  independent: number;
  /** Cars that found nowhere close: fans who come late, give up or don't come. */
  short: number;
  /** The club's parking money for the game. */
  revenue: number;
}

/**
 * Game-day parking: the drivers among the crowd fill the club's lots first
 * (nearest first), then the independent ones. The club is paid only for the
 * cars in its own and leased lots, at its share. A higher price sends some
 * drivers to the independent lots or to transit.
 */
export function parkingDay(m: GroundsModel, attendance: number, basePrice: number, priceMult = 1): ParkingDay {
  const want = (attendance / PER_CAR) * (m.modes.drive / 0.8);
  const open = m.lots.filter((l) => !l.opens);
  const clubLots = open.filter((l) => l.control !== "independent").sort((a, b) => a.walk - b.walk);
  const indep = open.filter((l) => l.control === "independent").reduce((t, l) => t + l.spaces, 0);
  // Pricier club parking pushes drivers elsewhere.
  let toClub = want * Math.pow(priceMult, -0.6);
  let club = 0, revenue = 0;
  for (const l of clubLots) {
    const n = Math.min(l.spaces, toClub);
    club += n;
    toClub -= n;
    revenue += n * basePrice * priceMult * l.share;
  }
  const rest = want - club;
  const independent = Math.min(indep, rest);
  const short = Math.max(0, rest - independent);
  return { cars: Math.round(want), club: Math.round(club), independent: Math.round(independent), short: Math.round(short), revenue: Math.round(revenue) };
}

/** How much a parking shortage holds down demand: drivers who can't park near the stadium buy fewer tickets. */
export function accessFactor(m: GroundsModel, attendance: number): number {
  const p = parkingDay(m, attendance, 1);
  return 1 - Math.min(0.08, (p.short / Math.max(1, p.cars)) * 0.25);
}

/** What the gate model needs from the grounds for one game (business.ts): seats on sale, how much premium inventory the owner has added, and the parking. */
export function gateGrounds(state: GameState, date: string): { general: number; premium: number; premiumScale: number; parking: (attendance: number, priceMult: number) => ParkingDay; access: number } {
  const m = groundsModel(state, date);
  const seats = seatsOn(m);
  const base = Math.round(STADIUM_BY_TEAM[state.userTeam].capacity * PREMIUM_SHARE);
  // The clubs project's own money comes through its premium effect (projects.ts); only the owner's conversions scale suite and club income here.
  const added = (state.grounds?.premium ?? []).filter((p) => p.opens <= date).reduce((t, p) => t + p.seats, 0);
  const price = MARKETS[state.userTeam].parking;
  return {
    general: seats.general, premium: seats.premium, premiumScale: (base + added) / Math.max(1, base),
    parking: (attendance, mult) => parkingDay(m, attendance, price, mult), access: accessFactor(m, m.capacity),
  };
}

// ---- What the owner can change ----

const buildSeason = (d: string) => d.slice(5) >= "02-01" && d.slice(5) <= "05-31";
/** Work started in the offseason building window opens for the season; otherwise it opens the next August. */
function opensFor(date: string): string {
  const y = Number(date.slice(0, 4));
  return buildSeason(date) || date.slice(5) < "02-01" ? `${y}-08-01` : `${y + 1}-08-01`;
}

export function garageCost(state: GameState, spaces: number): number {
  return Math.round(spaces * 28_000 * constructionFactor(state) * inflation(Number(state.date.slice(0, 4)), 0.04));
}

/** Build a garage on part of the surface lots: four times the cars on the same land, opening for the next season. */
export function buildGarage(state: GameState, spaces: number): string | null {
  const s = STADIUM_BY_TEAM[state.userTeam];
  if (!controlOf(s).parking) return `${s.operator} runs the parking at ${s.name}; we can't build on its lots.`;
  const m = groundsModel(state);
  const acres = Math.ceil(spaces / GARAGE_PER_ACRE);
  const surface = m.lots.find((l) => l.id === "main");
  if (!surface || surface.acres < acres) return `A ${spaces.toLocaleString("en-US")}-space garage needs ${acres} acres of our surface lots; we have ${surface?.acres ?? 0}.`;
  const cost = garageCost(state, spaces);
  if (cashBalance(state) < cost * 0.25) return "We don't have the cash for the deposit.";
  const opens = opensFor(state.date);
  const g = grounds(state);
  g.garages.push({ id: nextId(state, "garage"), spaces, acres, cost, started: state.date, opens });
  post(state, "projects", -cost, `Parking garage, ${spaces.toLocaleString("en-US")} spaces`);
  return null;
}

/** Lease a nearby lot for the season: the club runs it and keeps the money, for a yearly rent. */
/** A season's rent for a nearby lot, by its spaces and what parking fetches in the market. */
export function leaseCost(state: GameState, spaces: number): number {
  return Math.round(spaces * 95 * (MARKETS[state.userTeam].parking / 40) * inflation(RULES.season, 0.03));
}

export function leaseLot(state: GameState, spaces: number): string | null {
  const rent = leaseCost(state, spaces);
  const g = grounds(state);
  g.leases.push({ id: nextId(state, "lease"), name: `Leased lot (${spaces.toLocaleString("en-US")} spaces)`, spaces, rent, through: RULES.season + 2 });
  return null;
}

export function premiumCost(state: GameState, seats: number): number {
  return Math.round(seats * 16_000 * constructionFactor(state) * inflation(Number(state.date.slice(0, 4)), 0.04));
}

/**
 * Convert general seats in the lower bowl to club seats. Started in the
 * February-May building window, it's done for the season. Started later, the
 * owner chooses: close the section now and build through the season (phased),
 * or wait and build next spring.
 */
export function convertToPremium(state: GameState, seats: number, phased: boolean): string | null {
  const s = STADIUM_BY_TEAM[state.userTeam];
  if (s.structure === "tenant") return `We rent ${s.name}; ${s.owner} decides what gets built.`;
  const m = groundsModel(state);
  const lower = m.sections.find((x) => x.id === "lower")!;
  if (seats > lower.seats * 0.3) return "That's more of the lower bowl than a conversion can take at once.";
  const cost = premiumCost(state, seats);
  if (cashBalance(state) < cost * 0.25) return "We don't have the cash for the deposit.";
  const now = buildSeason(state.date);
  const started = now || phased ? state.date : `${Number(state.date.slice(0, 4)) + (state.date.slice(5) < "02-01" ? 0 : 1)}-02-01`;
  // A phased job on one section takes about five months with the section shut.
  const opens = now ? `${state.date.slice(0, 4)}-08-01` : phased ? addDays(state.date, 150) : `${started.slice(0, 4)}-08-01`;
  const g = grounds(state);
  g.premium.push({ id: nextId(state, "clubseats"), seats, cost, started, opens, phased: !now && phased });
  post(state, "projects", -cost, `Club seat conversion, ${seats.toLocaleString("en-US")} seats`);
  return null;
}

/** Monthly: upkeep of what the owner added, and each lease's rent at the start of a quarter. */
export function groundsDaily(state: GameState): void {
  const g = state.grounds;
  if (!g || state.date.slice(8) !== "01") return;
  const live = g.leases.filter((x) => x.through >= RULES.season);
  const upkeep = groundsModel(state).upkeep - live.reduce((t, x) => t + x.rent, 0);
  if (upkeep > 0) post(state, "stadium", -upkeep / 12, "Upkeep: garages and club areas we added");
  if (["01", "04", "07", "10"].includes(state.date.slice(5, 7))) for (const x of live) post(state, "stadium", -x.rent / 4, `${x.name}: quarterly rent`);
}
