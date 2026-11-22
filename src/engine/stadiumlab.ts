// Stadium renovations designed in 3D on the Stadium page. The design tool is
// Stadium Lab (src/lab: the models, the 2026 estimating rules, real parking
// inventories and land scenarios); the game owns the money, the calendar and
// what the work does. A design is priced from the Lab's line items in 2026
// dollars, then in the game's terms: the year's construction prices, the
// city's building market, who pays by who owns the building (as projects.ts
// does), the lease's renovation fund and a public authority's sign-off. Work
// starts in the February-May building window, is paid down monthly, shuts
// part of the bowl in any season it runs through, and settles over or under
// its contingency the day it opens. Then the new bowl, roof and surface are
// laid over the stadium (labstate.ts), premium seats, parking and land go into
// the grounds model, and the rest moves the gate like the matching project
// would, counted once: a project already done here adds nothing twice.
import { baseline, estimate, type LabEstimate } from "../lab/economics.js";
import { venues } from "../lab/data.js";
import { parkingProfiles } from "../lab/parking-data.js";
import { normalizeParking, parkingPlan } from "../lab/parking.js";
import { parcelPlan } from "../lab/parcels.js";
import type { LabConfig, LabProfile, LabVenue } from "../lab/types";
import { businessChief, cashBalance, inflation, pnl, post } from "./business";
import { leagueYear } from "./contracts";
import { addDays, daysBetween, shortDate } from "./dates";
import { creditLimit } from "./debt";
import { constructionFactor } from "./economy";
import { facilities, partDefs } from "./facilities";
import { groundsModel, PREMIUM_SHARE, siteOf, type SiteKind } from "./grounds";
import { nextId } from "./ids";
import { money, news, send } from "./inbox";
import { bindStadiumLab, builtAt, stadiumLab, underWay } from "./labstate";
import { bindLeases, drawFund, leaseFund } from "./leases";
import { RULES, TEAM_BY_ID } from "./league";
import { byline } from "./media/corps";
import { addStory } from "./outlets";
import { rngFor } from "./rng";
import { MARKETS, STADIUM_BY_TEAM, STADIUMS } from "./stadiums";
import { TEAM_COLORS } from "./teamColors";
import type { GameState, LabDesign, LabRenovation } from "./types";


/** The 2026 buildings by club, read before any save renames or replaces them. */
const BASE_NAME: Record<string, string> = Object.fromEntries(STADIUMS.map((s) => [s.team, s.name]));
/** The Lab's venues by game club id (the Lab calls the Rams LAR). */
const LAB_BY_TEAM: Record<string, LabVenue> = Object.fromEntries(venues.map((v) => [v.id === "LAR" ? "LA" : v.id, v]));
/** The real parking inventories as the Lab ships them; a save's own lots are laid over a copy. */
const BASE_PROFILES: Record<string, LabProfile> = { ...parkingProfiles };

/** What a city's construction market adds to the Lab's national hard costs, and land per acre in 2026 millions. */
const MARKET: Record<SiteKind, number> = { downtown: 1.12, urban: 1.04, suburban: 0.95 };
const LAND_RATE: Record<SiteKind, number> = { downtown: 4.5, urban: 2.2, suburban: 0.9 };
/** Premium seats per added suite (the Lab's rule: they replace general seats one for one). */
export const SUITE_SEATS = 20;

export interface LabView {
  team: string;
  building: string;
  /** The Lab's model of the building as it first stood (a made-up model for a building the Lab doesn't know), drawn with any design. */
  model: LabVenue;
  /** The building as it stands now, which a new design is priced against. */
  venue: LabVenue;
  /** The building as it stands, as a design (what the viewer draws for "as built"). */
  built: LabConfig;
  /** A real 2026 building the Lab modeled (photo, district map, real parking), or a made-up one. */
  known: boolean;
  /** Key for the photo and the map survey (the Lab's id). */
  labId?: string;
  renovations: LabRenovation[];
  site: SiteKind;
}

function labRoof(roof: string): string {
  return roof === "dome" ? "fixed" : roof === "retractable" ? "retractable" : "open";
}

function labIdFor(team: string, building: string): string | undefined {
  if (BASE_NAME[team] === building && LAB_BY_TEAM[team]) return team;
  const other = Object.keys(BASE_NAME).find((t) => BASE_NAME[t] === building && LAB_BY_TEAM[t]);
  return other;
}

/** The fields of a finished design that stay with the building for the next one. */
const KEEP = ["color", "facade", "board", "plaza", "solar", "led", "wifi", "amenities", "surface", "shape", "decks", "rake"] as const;

/** Any club's building in the Lab's terms: its model, how it stands now and the renovations done to it. */
export function labVenue(state: GameState, team = state.userTeam): LabView {
  const s = STADIUM_BY_TEAM[team];
  const building = s.name;
  const done = builtAt(state, building);
  const baseCap = done[0]?.before.capacity ?? s.capacity;
  const site = siteOf(state, team).site;
  const key = labIdFor(team, building);
  const color = TEAM_COLORS[team]?.[0] ?? "#356d58";
  const model: LabVenue = key
    ? { ...LAB_BY_TEAM[key], capacity: baseCap }
    : {
      id: `G-${team}`, team: TEAM_BY_ID[team]?.name ?? team, name: building, city: TEAM_BY_ID[team]?.city ?? "", capacity: baseCap,
      opened: s.opened, roof: labRoof(s.roof), style: "game", color, facadeColor: "#a9b2b4", surface: "turf",
    };
  if (!key && done[0]) model.roof = done[0].before.roof;
  const last = done[done.length - 1]?.design;
  const roof = last ? String(last.roof) : model.roof;
  let surface = last ? String(last.surface) : model.surface;
  if (team === state.userTeam && state.facilities) surface = state.facilities.surface === "turf" ? "turf" : surface === "turf" ? "natural" : surface;
  const venue: LabVenue = { ...model, capacity: s.capacity, roof, surface, color: last ? String(last.color) : model.color };
  parkingProfiles[model.id] = profileFor(state, team, model, key, done);
  const built = baseline(venue);
  for (const k of KEEP) if (last && last[k] !== undefined) (built as Record<string, unknown>)[k] = last[k];
  Object.assign(built, {
    capacity: s.capacity, roof, surface, color: venue.color,
    // Suites run cumulative in a design (the slider starts at what's built), so the last design holds them all.
    suites: Number(last?.suites ?? 0),
    market: MARKET[site], soft: 15, contingency: 20, landRate: LAND_RATE[site], lease: 0,
  });
  return { team, building, model, venue, built: normalizeParking(venue, built), known: !!key, labId: key === "LA" ? "LAR" : key, renovations: done, site };
}

/** The parking the Lab plans around: the real inventory with the lots our renovations built added, or the game's own lots for a building the Lab doesn't know. */
function profileFor(state: GameState, team: string, model: LabVenue, key: string | undefined, done: LabRenovation[]): LabProfile {
  if (key && BASE_PROFILES[model.id]) {
    const base = BASE_PROFILES[model.id];
    const facilities = [...base.facilities];
    let used = 0;
    for (const r of done) {
      if (r.spaces - r.garage > 0) facilities.push({ id: `lab-${r.id}-s`, name: `Lots built in the ${r.title}`, control: "managed", type: "surface", spaces: r.spaces - r.garage, quality: "built" });
      if (r.garage > 0) facilities.push({ id: `lab-${r.id}-g`, name: `Garage built in the ${r.title}`, control: "managed", type: "garage", spaces: r.garage, quality: "built" });
      used += (Number(r.design.parking ?? 0) + Number(r.design.garageFoot ?? 0)) * 330 / 43560;
    }
    return { ...base, facilities, acreage: Math.max(0, Math.round((base.acreage - used) * 10) / 10) };
  }
  const m = groundsModel(state, state.date, team);
  const main = m.lots.find((l) => l.id === "main");
  return {
    context: `${m.site === "downtown" ? "Downtown" : m.site === "urban" ? "City" : "Suburban"} site (game estimate)`, source: null, sourceLabel: "Game estimate",
    notes: "Lots and land are the game's estimates for this building, not surveyed figures.", acreage: m.freeAcres, rebuildAcres: Math.round((main?.acres ?? 0) * 0.3),
    price: MARKETS[team]?.parking ?? 40, heading: 0, constraints: [],
    facilities: m.lots.filter((l) => !l.opens).map((l) => ({ id: `g-${l.id}`, name: l.name, control: l.control === "independent" ? "shared" : "managed", type: l.kind, spaces: l.spaces, quality: "estimated" })),
  };
}

/** The owner's design in progress at our building (the building as it stands when there is none). */
export function labDraft(state: GameState, view = labVenue(state)): LabConfig {
  const saved = state.stadiumLab?.drafts[view.building];
  return saved ? normalizeParking(view.venue, { ...view.built, ...saved } as LabConfig) : { ...view.built };
}

export function saveDraft(state: GameState, design: LabConfig | null): void {
  const lab = stadiumLab(state);
  const here = STADIUM_BY_TEAM[state.userTeam].name;
  if (!design) delete lab.drafts[here];
  else lab.drafts[here] = Object.fromEntries(Object.entries(design).filter(([, x]) => ["string", "number", "boolean"].includes(typeof x))) as LabDesign;
}

/** The design as the Lab should price it: only what changes from the building as it stands. */
function priced(view: LabView, d: LabConfig): LabConfig {
  const b = view.built;
  return normalizeParking(view.venue, {
    ...d, custom: false, market: MARKET[view.site], soft: 15, landRate: LAND_RATE[view.site], lease: 0,
    facade: d.facade === b.facade ? "original" : d.facade, board: d.board === b.board ? "original" : d.board,
    plaza: d.plaza && !b.plaza, solar: d.solar && !b.solar, led: d.led && !b.led, wifi: d.wifi && !b.wifi, amenities: d.amenities && !b.amenities,
    suites: Math.max(0, d.suites - b.suites),
  });
}

export interface LabEffect { demand: number; premium: number; perCap: number; sponsor: number }

export interface LabItem {
  label: string;
  /** What it does in the game, in a phrase. */
  does: string;
  /** A project here already did it, so it adds nothing to the gate. */
  already?: string;
}

export interface LabQuote {
  estimate: LabEstimate;
  /** The Lab's price scaled to this year and this city, then our share after partners and the lease fund. */
  price: number;
  cost: number;
  contingency: number;
  payer?: string;
  fund: number;
  months: number;
  starts: string;
  opens: string;
  low: number;
  high: number;
  capacity: number;
  delta: number;
  premium: number;
  closed: number;
  effect: LabEffect;
  items: LabItem[];
  covers: string[];
  renews: string[];
  upkeep: number;
  spaces: number;
  garage: number;
  acres: number;
  /** Yearly gain at last season's numbers, and years to pay back our share. */
  yearly: number;
  payback?: number;
  blocked?: string;
}

const PROJECT_FOR: Record<string, string> = { color: "seats", board: "boards", wifi: "wifi", amenities: "concourse" };

/** First August 1 at or after a date: work finishing in the summer opens for the season. */
function augustOnOrAfter(date: string): string {
  const y = Number(date.slice(0, 4));
  return date.slice(5) <= "08-01" ? `${y}-08-01` : `${y + 1}-08-01`;
}

function buildWindow(date: string): boolean {
  const md = date.slice(5);
  return md >= "02-01" && md <= "05-31";
}

/** What a design would cost, take and do, in the game's money and calendar. */
export function labQuote(state: GameState, design: LabConfig, view = labVenue(state)): LabQuote {
  const s = STADIUM_BY_TEAM[view.team];
  const c = priced(view, design);
  const e = estimate(view.venue, c);
  const year = Number(state.date.slice(0, 4));
  const scale = inflation(year, 0.04) * constructionFactor(state) * (state.owner?.background === "realEstate" ? 0.94 : 1);
  const price = Math.round(e.total * scale);
  // ---- Who pays ----
  let share = 1;
  let payer: string | undefined;
  let blocked: string | undefined;
  if (s.structure === "tenant") blocked = `We rent ${s.name}; ${s.owner} decides what gets built there.`;
  else if (s.structure === "coowned") { share = 0.5; payer = `${s.partner ? TEAM_BY_ID[s.partner]?.name ?? "Our partner" : "Our partner"} pay half`; }
  else if (s.structure === "publicTeam") { share = 0.7; payer = `${s.owner} pays 30%`; }
  else if (s.structure === "publicAuthority") { share = 0.5; payer = `${s.owner} pays half, if it signs off`; }
  const fund = view.team === state.userTeam ? Math.min(leaseFund(state), price * share) : 0;
  if (fund > 0) payer = `${payer ? `${payer}; ` : ""}${money(fund)} from the lease's renovation fund`;
  const cost = Math.max(0, Math.round(price * share - fund));
  const contingency = Math.round(e.contingency * scale * share);
  // ---- When ----
  const plan = parkingPlan(view.venue, c);
  const parcels = parcelPlan(view.venue, c);
  const months = e.months + (parcels.enabled ? parcels.approvalMonths : 0);
  const starts = buildWindow(state.date) ? state.date : `${state.date.slice(5) < "02-01" ? year : year + 1}-02-01`;
  // The last few months of work go on around the preseason's first events.
  const opens = augustOnOrAfter(addDays(starts, Math.round(months * 30.4) - 120));
  const spansSeason = opens > `${starts.slice(0, 4)}-08-01`;
  // ---- What it does ----
  const effect: LabEffect = { demand: 0, premium: 0, perCap: 0, sponsor: 0 };
  const items: LabItem[] = [];
  const covers: string[] = [];
  const renews = new Set<string>();
  const done = new Set((state.business?.projects ?? []).map((p) => p.id));
  const add = (key: string | null, label: string, does: string, fx: Partial<LabEffect>) => {
    const proj = key ? PROJECT_FOR[key] : undefined;
    if (proj && view.team === state.userTeam && done.has(proj)) { items.push({ label, does, already: "A project already did this here, so it adds nothing more to the gate." }); return; }
    if (proj) covers.push(proj);
    for (const k of Object.keys(fx) as (keyof LabEffect)[]) effect[k] += fx[k] ?? 0;
    items.push({ label, does });
  };
  const v = view.venue;
  const delta = c.capacity - v.capacity;
  if (delta) { items.push({ label: delta > 0 ? `${delta.toLocaleString("en-US")} more seats` : `${(-delta).toLocaleString("en-US")} fewer seats`, does: delta > 0 ? "More tickets to sell when demand is there" : "A tighter bowl: fewer seats, each worth a little more" }); renews.add("seats"); }
  if (c.color !== v.color) { add("color", "New seats throughout the bowl", "Ticket demand up about 4%", { demand: 0.04 }); renews.add("seats"); }
  if (c.roof !== v.roof) {
    const covered = (r: string) => r === "fixed" || r === "retractable";
    const fx = covered(c.roof) && !covered(v.roof) ? 0.03 : c.roof === "canopy" && v.roof === "open" ? 0.015 : !covered(c.roof) && covered(v.roof) ? -0.02 : 0;
    add(null, c.roof === "open" ? "Roof taken off" : c.roof === "canopy" ? "Seating canopy" : c.roof === "fixed" ? "Fixed roof" : "Retractable roof",
      covered(c.roof) ? "Games indoors: no weather, and the building can bid for Super Bowls and winter events" : c.roof === "canopy" ? "Fans stay dry; the field still plays in the weather" : "Games outdoors again", { demand: fx });
    if (covered(c.roof)) renews.add("roof");
  }
  if (c.facade !== "original") add(null, "New exterior", "Ticket demand up about 2%", { demand: 0.02 });
  if (c.board !== "original") {
    const fx = c.board === "halo" ? { demand: 0.045, sponsor: 0.06 } : c.board === "large" ? { demand: 0.03, sponsor: 0.04 } : c.board === "compact" ? { demand: -0.005 } : { demand: -0.02, sponsor: -0.03 };
    add(c.board === "halo" || c.board === "large" ? "board" : null, c.board === "halo" ? "Suspended halo video board" : c.board === "large" ? "Bigger end-zone video boards" : c.board === "compact" ? "Basic scoreboard" : "Main video board removed",
      c.board === "halo" || c.board === "large" ? "Fans like the show and sponsors pay for the screens" : "Less to look at, less for sponsors", fx);
    if (c.board !== "none") renews.add("boards");
  }
  if (c.suites > 0) items.push({ label: `${c.suites} new suites`, does: `${(c.suites * SUITE_SEATS).toLocaleString("en-US")} premium seats in place of general ones` });
  if (c.wifi) { add("wifi", "Stadium-wide Wi-Fi", "Demand up 1%; tech sponsors pay more", { demand: 0.01, sponsor: 0.025 }); renews.add("network"); }
  if (c.amenities) { add("amenities", "Bigger concourses and concessions", "Demand up 4%; fans spend a fifth more at the stands", { demand: 0.04, perCap: 0.2 }); renews.add("concourses"); }
  if (c.plaza) add(null, "Fan plaza", "Pregame crowds come early and spend", { demand: 0.015, perCap: 0.04, sponsor: 0.01 });
  if (c.led) add(null, "LED lighting", "A light show sponsors like", { demand: 0.005, sponsor: 0.01 });
  if (c.solar) items.push({ label: "Solar canopy", does: "The building costs about 3% less to run" });
  if (c.surface !== v.surface) { items.push({ label: c.surface === "turf" ? "Artificial turf" : c.surface === "hybrid" ? "Reinforced grass" : "Natural grass", does: c.surface === "turf" ? "Cheaper to keep, harder on players" : "Players prefer it; it wears and needs resodding" }); renews.add("field"); }
  const spaces = plan.added;
  const garage = plan.garage - plan.baseGarage;
  if (spaces) { items.push({ label: `${spaces > 0 ? "+" : ""}${spaces.toLocaleString("en-US")} parking spaces we run`, does: spaces > 0 ? "More cars parked in our lots, at our price" : "Land back for open space" }); renews.add("parking"); }
  const acres = parcels.enabled ? Math.round(parcels.acres * 10) / 10 : 0;
  if (acres) items.push({ label: `${acres} acres bought`, does: "Land the club owns to build on" });
  const premium = c.suites * SUITE_SEATS;
  // ---- Seats shut in a season the work runs through ----
  let closed = 0;
  if (spansSeason) {
    const cap = v.capacity;
    closed = (c.roof !== v.roof ? cap * 0.1 : 0) + (delta > 0 ? Math.min(cap * 0.08, delta * 0.6) : 0) + premium + (c.color !== v.color ? cap * 0.02 : 0);
    closed = Math.round(Math.min(cap * 0.15, closed));
  }
  // ---- Upkeep: a bigger bowl costs more to run, a roof more again, solar a little less ----
  const roofUp = (r: string) => (r === "retractable" ? 1.1 : r === "fixed" ? 1.06 : 1);
  const upkeep = Math.round(Math.sqrt(c.capacity / Math.max(1, v.capacity)) * (roofUp(c.roof) / roofUp(v.roof)) * (c.solar ? 0.97 : 1) * 1000) / 1000;
  const yearly = yearlyGain(state, view.team, { effect, premium, delta, spaces, garage, upkeep, capacity: v.capacity });
  // ---- Can we start it ----
  if (!e.lines.length) blocked ??= "Nothing in the design changes the building yet.";
  if (view.team !== state.userTeam) blocked ??= "Only our own building.";
  const busy = underWay(state, view.building);
  if (busy) blocked ??= `The ${busy.title} is under way; it opens ${shortDate(busy.opens)}.`;
  if (c.capacity < 20000) blocked ??= "An NFL stadium needs at least 20,000 seats.";
  return {
    estimate: e, price, cost, contingency, payer, fund, months, starts, opens, low: Math.round(cost * 0.85), high: Math.round(cost * 1.35),
    capacity: c.capacity, delta, premium, closed, effect, items, covers, renews: [...renews], upkeep, spaces, garage, acres, yearly,
    payback: yearly > 0 && cost > 0 ? Math.round((cost / yearly) * 10) / 10 : undefined, blocked,
  };
}

/** A year of what the work brings in at last season's numbers (this season's in a club's first), less what it costs to run. */
function yearlyGain(state: GameState, team: string, w: { effect: LabEffect; premium: number; delta: number; spaces: number; garage: number; upkeep: number; capacity: number }): number {
  if (team !== state.userTeam) return 0;
  let p = pnl(state, leagueYear(state.date) - 1);
  if (!p.revenue.some((r) => r.cat === "tickets" && r.amount)) p = pnl(state, leagueYear(state.date));
  const line = (cat: string) => p.revenue.find((r) => r.cat === cat)?.amount ?? 0;
  const e = w.effect;
  const tickets = line("tickets");
  const gate = e.demand * tickets + e.premium * line("premium") + e.perCap * (line("concessions") + line("parking") + line("merch") * 0.35) + e.sponsor * line("sponsorship");
  // Added seats sell when demand is there (about seven in ten); a smaller bowl raises what each seat fetches a little.
  const seats = tickets * (w.delta / Math.max(1, w.capacity)) * (w.delta > 0 ? 0.7 : 0.4);
  const premium = line("premium") * (w.premium / Math.max(1, w.capacity * PREMIUM_SHARE)) * 0.85;
  const parking = Math.max(0, w.spaces) * (MARKETS[team]?.parking ?? 40) * 10 * 0.5;
  const s = STADIUM_BY_TEAM[team];
  const upkeep = s.upkeep * (w.upkeep - 1) + w.premium * 600 + Math.max(0, w.garage) * 220 + Math.max(0, w.spaces - w.garage) * 60;
  return Math.round(gate + seats + premium + parking - upkeep);
}

/** What our renovations add to the club's yearly revenue in a buyer's eyes: finished ones in full, ones under way at half (projectsRevenue). */
export function labValue(state: GameState): number {
  const here = STADIUM_BY_TEAM[state.userTeam]?.name;
  let total = 0;
  for (const r of state.stadiumLab?.renovations ?? []) {
    if (r.at !== here) continue;
    const y = yearlyGain(state, state.userTeam, { effect: r.effect, premium: r.premium, delta: r.capacity - r.before.capacity, spaces: r.spaces, garage: r.garage, upkeep: r.upkeep, capacity: r.before.capacity });
    total += Math.max(0, y) * (r.opened ? 1 : 0.5);
  }
  return total;
}

/** Sign the contracts: the deposit goes out now, the rest monthly until it opens. */
export function startRenovation(state: GameState, design: LabConfig): string {
  const view = labVenue(state);
  const q = labQuote(state, design, view);
  if (q.blocked) return q.blocked;
  if (!buildWindow(state.date)) return "Construction starts between February and May, so the first summer's work is done before the preseason.";
  const deposit = Math.round(q.cost * 0.2);
  if (cashBalance(state) + creditLimit(state) < deposit) return "We can't cover the deposit, even with the credit line.";
  const s = STADIUM_BY_TEAM[state.userTeam];
  const year = Number(state.date.slice(0, 4));
  if (s.structure === "publicAuthority" && rngFor(state.seed, `lab-authority:${year}`)() >= 0.6) {
    // The authority answers once a year: asking again this spring gets the same no.
    return `${s.owner} turned it down this year. We can bring it back next spring.`;
  }
  if (q.fund) drawFund(state, q.fund);
  const title = `${year} ${s.name} renovation`;
  const c = priced(view, design);
  const r: LabRenovation = {
    id: nextId(state, "reno"), team: state.userTeam, at: s.name, title,
    design: Object.fromEntries(Object.entries(design).filter(([, x]) => ["string", "number", "boolean"].includes(typeof x))) as LabDesign,
    capacity: c.capacity, roof: c.roof, before: { capacity: view.venue.capacity, roof: view.venue.roof },
    premium: q.premium, effect: q.effect, covers: q.covers, spaces: q.spaces, garage: q.garage, acres: q.acres, closed: q.closed, upkeep: q.upkeep,
    surface: c.surface !== view.venue.surface ? (c.surface === "turf" ? "turf" : "grass") : undefined, renews: q.renews,
    price: q.price, cost: q.cost, contingency: q.contingency, paid: deposit, started: state.date, opens: q.opens,
  };
  stadiumLab(state).renovations.push(r);
  delete stadiumLab(state).drafts[s.name];
  post(state, "projects", -deposit, `${title}: deposit`);
  news(state, "business", `${TEAM_BY_ID[state.userTeam].name} announce a ${money(q.price)} renovation of ${s.name}, to open ${shortDate(q.opens)}`);
  return `Work starts now and should finish by ${shortDate(q.opens)}. We paid ${money(deposit)} down; the rest goes out monthly.${q.closed ? ` About ${q.closed.toLocaleString("en-US")} seats will be closed in the seasons it runs through.` : ""}`;
}

export function stadiumLabDaily(state: GameState): void {
  const list = state.stadiumLab?.renovations;
  if (!list?.length) return;
  for (const r of list) {
    if (r.opened || r.team !== state.userTeam) continue;
    if (state.date.endsWith("-01") && r.paid < r.cost && state.date < r.opens) {
      const months = Math.max(1, Math.ceil(daysBetween(state.date, r.opens) / 30.4));
      const pay = Math.round((r.cost - r.paid) / months);
      r.paid += pay;
      post(state, "projects", -pay, `${r.title}: progress payment`);
    }
    if (state.date >= r.opens) open(state, r);
  }
}

function open(state: GameState, r: LabRenovation): void {
  if (r.paid < r.cost) post(state, "projects", -(r.cost - r.paid), `${r.title}: final payment`);
  r.paid = r.cost;
  // The work comes in over or under budget: the contingency covers most surprises, and what it doesn't is paid now.
  const f = 0.95 + 0.5 * Math.pow(rngFor(state.seed, `lab-overrun:${r.id}`)(), 2.2);
  const base = r.cost - r.contingency;
  const over = Math.max(-r.contingency, Math.round(base * f - r.cost));
  r.overrun = over;
  if (over) post(state, "projects", -over, over > 0 ? `${r.title}: cost overrun` : `${r.title}: unused contingency`);
  r.opened = true;
  // The building changes: seats, roof and upkeep for every club that plays there.
  bindLeases(state);
  bindStadiumLab(state);
  if (r.surface || r.renews.length) {
    const fac = facilities(state);
    if (r.surface) fac.surface = r.surface;
    const defs = partDefs(state.userTeam);
    if (!defs.roof) delete fac.parts.roof;
    for (const k of r.renews) if (defs[k]) fac.parts[k] = { wear: 0, replaced: RULES.season };
  }
  state.pressure.fans = Math.min(100, state.pressure.fans + 3);
  const money_ = over > 0 ? ` It ran ${money(over)} over budget after the contingency.` : over < 0 ? ` It came in under budget; ${money(-over)} of the contingency is back.` : "";
  send(state, "business", businessChief(state), `${r.title}: finished`, `The renovation of ${r.at} is done: ${r.capacity.toLocaleString("en-US")} seats.${money_}`);
  addStory(state, {
    outlet: "sideline", by: byline(state, "sideline", "reporter"), kind: "owner", teams: [state.userTeam],
    headline: `${TEAM_BY_ID[state.userTeam].name} open the renovated ${r.at}`,
    body: `The ${TEAM_BY_ID[state.userTeam].name} showed off the finished renovation of ${r.at} today: ${r.capacity.toLocaleString("en-US")} seats, at ${money(r.price)} all in.`,
  });
}
