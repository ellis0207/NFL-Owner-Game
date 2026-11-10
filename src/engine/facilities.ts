// Stadium and training-complex upkeep. Every building is a set of parts with
// a useful life and a replacement cost: the roof, heating and cooling, seats,
// the playing surface, video boards, concourses and the building's network at
// the stadium; the indoor and outdoor fields, locker rooms, weight room, film
// rooms, kitchen, video systems and the equipment room at the team facility.
// Parts wear every month, faster when maintenance is put off. The standard
// plan (what the stadium upkeep line and the facility budget already pay
// for) replaces a part when it wears out; deferring saves money and grows a
// backlog that breaks more on game days and that players notice; spending
// ahead keeps everything newer. The owner sees the operations director's
// read of each part unless an engineering study measures it. Only a club
// that runs its stadium maintains it; a tenant lives with the landlord's
// choices. Surfaces are the 2025 ones (approximate); training complexes are
// approximated where public data is thin. Roof changes and new buildings are
// a construction question for later.
import { business, businessChief, inflation, pnl, post } from "./business";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { execBoost, execRole } from "./executives";
import { money, send } from "./inbox";
import { RULES } from "./league";
import { PROJECT_BY_ID, projectEffects, projects } from "./projects";
import { gaussian, rngFor } from "./rng";
import { servicesScore } from "./community";
import { STADIUM_BY_TEAM, type Stadium } from "./stadiums";
import type { FacilitiesState, GameState } from "./types";

const M = 1_000_000;

export interface PartDef {
  label: string;
  site: "stadium" | "complex";
  /** Useful life in years, and the replacement cost in 2026 dollars. */
  life: number;
  cost: number;
}

/** Natural grass in 2025; the rest play on artificial turf (approximate). */
const GRASS = new Set(["BUF", "MIA", "BAL", "CLE", "PIT", "JAX", "DEN", "KC", "LV", "PHI", "WAS", "CHI", "GB", "CAR", "TB", "ARI", "SF"]);
/** Open-air grass in a cold winter wears fast late in the season. */
const COLD = new Set(["BUF", "NE", "NYJ", "NYG", "BAL", "CIN", "CLE", "PIT", "DEN", "KC", "PHI", "WAS", "CHI", "GB", "SEA"]);

export function partDefs(team: string): Record<string, PartDef> {
  const s = STADIUM_BY_TEAM[team];
  const out: Record<string, PartDef> = {};
  if (s.roof !== "open") out.roof = { label: s.roof === "retractable" ? "Retractable roof and its machinery" : "Roof membrane and structure", site: "stadium", life: 30, cost: (s.roof === "retractable" ? 90 : 60) * M };
  Object.assign(out, {
    hvac: { label: s.roof === "open" ? "Heating and cooling in the suites, clubs and offices" : "Heating, cooling and ventilation", site: "stadium", life: 25, cost: (s.roof === "open" ? 12 : 30) * M },
    seats: { label: "Seats in the bowl", site: "stadium", life: 25, cost: Math.round(s.capacity * 450) },
    field: { label: "Playing surface", site: "stadium", life: 8, cost: 1.6 * M },
    boards: { label: "Video boards and sound", site: "stadium", life: 12, cost: 25 * M },
    concourses: { label: "Concourses, restrooms and concession stands", site: "stadium", life: 20, cost: 35 * M },
    network: { label: "Wi-Fi, ticket scanners and the payment network", site: "stadium", life: 8, cost: 10 * M },
    parking: { label: "Parking lots, garages and access roads", site: "stadium", life: 25, cost: 20 * M },
    indoor: { label: "Indoor practice field", site: "complex", life: 30, cost: 40 * M },
    outdoor: { label: "Outdoor practice fields", site: "complex", life: 8, cost: 1.5 * M },
    lockers: { label: "Locker rooms and players' lounge", site: "complex", life: 15, cost: 12 * M },
    weight: { label: "Weight room and conditioning equipment", site: "complex", life: 10, cost: 4 * M },
    film: { label: "Film and meeting rooms", site: "complex", life: 12, cost: 5 * M },
    kitchen: { label: "Kitchen, dining and nutrition", site: "complex", life: 15, cost: 3 * M },
    digital: { label: "Playbook, practice video and tracking systems", site: "complex", life: 6, cost: 3 * M },
    equipment: { label: "Helmets, pads, uniforms and the equipment room", site: "complex", life: 3, cost: 1.5 * M },
  });
  return out;
}

/** The club maintains the building it runs; a tenant's landlord does. */
export function maintainsStadium(team: string): boolean {
  return ["owned", "coowned", "publicTeam"].includes(STADIUM_BY_TEAM[team].structure);
}

export function facilities(state: GameState): FacilitiesState {
  if (state.facilities) return state.facilities;
  const team = state.userTeam;
  const s = STADIUM_BY_TEAM[team];
  const rng = rngFor(state.seed, `facilities:${team}`);
  const parts: FacilitiesState["parts"] = {};
  for (const [k, d] of Object.entries(partDefs(team))) {
    // Each part was last replaced some time in its life, never before the building opened.
    const age = Math.min(Math.max(0, RULES.season - (d.site === "stadium" ? s.opened : 2000)), Math.floor(rng() * d.life));
    parts[k] = { wear: Math.min(95, (age / d.life) * 85), replaced: RULES.season - age };
  }
  state.facilities = { parts, plan: "standard", surface: GRASS.has(team) ? "grass" : "turf", surveys: [], log: [] };
  return state.facilities;
}

export function condition(state: GameState, key: string): number {
  return Math.round(100 - (facilities(state).parts[key]?.wear ?? 0));
}

/** What the owner is told about a part: the study's number this year, or the director's read. */
export function readOf(state: GameState, key: string): { value: number; measured: boolean } {
  const f = facilities(state);
  const year = leagueYear(state.date);
  const real = condition(state, key);
  if (f.study === year) return { value: real, measured: true };
  const rng = rngFor(state.seed, `read:${key}:${year}`);
  const sd = 12 * (1 - 0.4 * execBoost(state, "SOD"));
  return { value: Math.max(0, Math.min(100, Math.round(real + gaussian(rng) * sd))), measured: false };
}

export function word(c: number): string {
  return c >= 80 ? "Like new" : c >= 60 ? "Good" : c >= 40 ? "Fair" : c >= 20 ? "Worn" : "Failing";
}

function avg(state: GameState, site: "stadium" | "complex"): number {
  const defs = partDefs(state.userTeam);
  const keys = Object.keys(defs).filter((k) => defs[k].site === site);
  return keys.reduce((a, k) => a + condition(state, k), 0) / Math.max(1, keys.length);
}
export function stadiumCondition(state: GameState): number {
  return avg(state, "stadium");
}
export function complexCondition(state: GameState): number {
  return avg(state, "complex");
}

/**
 * How much the team facility helps recovery: a well-kept complex and a
 * recovery center make a good rehab outcome a little likelier and a setback
 * a little rarer. No skill comes from it, only better odds of getting back.
 */
export function recoveryEdge(state: GameState): number {
  if (!state.facilities) return 0;
  const built = projectEffects(state);
  return Math.max(-0.04, Math.min(0.05, (complexCondition(state) - 60) / 600 + 0.012 * (built.facilities + built.medical)));
}

/** Worn-out parts still in service: what it would cost to catch up. */
export function backlog(state: GameState): { cost: number; parts: string[] } {
  const defs = partDefs(state.userTeam);
  const year = leagueYear(state.date);
  let cost = 0;
  const parts: string[] = [];
  for (const k of Object.keys(defs)) {
    if (condition(state, k) >= 15) continue;
    cost += defs[k].cost * inflation(year);
    parts.push(defs[k].label);
  }
  return { cost, parts };
}

// ---- What wear does ----

/** Game-day faults in the venue model: 1 for a building in typical shape, more as it runs down. */
export function faultFactor(state: GameState): number {
  if (!state.facilities) return 1;
  return Math.max(0.6, Math.min(1.8, (100 - stadiumCondition(state)) / 40));
}
/** Payment and scanner outages follow the network's condition. */
export function networkFactor(state: GameState): number {
  if (!state.facilities) return 1;
  return Math.max(0.6, Math.min(2, (100 - condition(state, "network")) / 40));
}
/** A fan-survey nudge for clean, modern concourses or tired ones. */
export function concourseNudge(state: GameState): number {
  if (!state.facilities) return 0;
  return Math.max(-0.4, Math.min(0.3, (condition(state, "concourses") - 60) / 100));
}

/**
 * How players see the team's buildings, as a pull in free agency: nothing for
 * a complex in ordinary shape, a little either way for a new or a neglected
 * one, and a small edge for natural grass, which most players prefer.
 */
export function facilityPull(state: GameState): number {
  if (!state.facilities) return 0;
  const c = complexCondition(state);
  const dead = c > 70 ? c - 70 : c < 45 ? c - 45 : 0;
  return dead / 30 * 0.02 + (state.facilities.surface === "grass" ? 0.005 : 0);
}

// ---- The owner's choices ----

export const PLAN_LABEL: Record<FacilitiesState["plan"], string> = {
  defer: "Put off maintenance (saves a fifth of the upkeep line, parts wear faster and aren't replaced)",
  standard: "Maintain on schedule (replace parts as they wear out, inside the upkeep line)",
  ahead: "Stay ahead (a fifth more, slower wear, parts replaced early)",
};
const PLAN_COST: Record<FacilitiesState["plan"], number> = { defer: -0.2, standard: 0, ahead: 0.2 };

export function setPlan(state: GameState, plan: FacilitiesState["plan"]): string | null {
  if (!maintainsStadium(state.userTeam)) return `${STADIUM_BY_TEAM[state.userTeam].owner} maintains the stadium.`;
  facilities(state).plan = plan;
  return null;
}

/** The stadium upkeep line split into what it pays for, with the plan's change. Used by the business office's monthly run. */
export function upkeepLines(state: GameState, s: Stadium, year: number): { note: string; amount: number }[] {
  const total = s.upkeep * inflation(year);
  const plan = state.facilities && maintainsStadium(state.userTeam) ? PLAN_COST[state.facilities.plan] : 0;
  const ours = s.structure === "owned" ? "" : " (our share)";
  return [
    { note: `Utilities${ours}`, amount: total * 0.3 },
    { note: `Inspections, insurance and service contracts${ours}`, amount: total * 0.2 },
    { note: `Maintenance, repairs and scheduled replacements${ours}${plan ? (plan > 0 ? ", ahead of schedule" : ", deferred") : ""}`, amount: total * (0.5 + plan) },
  ];
}

/** Replace a part now: paid as a capital project. */
export function replacePart(state: GameState, key: string): string | null {
  const defs = partDefs(state.userTeam);
  const d = defs[key];
  if (!d) return "No such part.";
  if (d.site === "stadium" && !maintainsStadium(state.userTeam)) return `${STADIUM_BY_TEAM[state.userTeam].owner} decides what's replaced at the stadium.`;
  if (key === "roof") return "Replacing the roof is a construction project for later.";
  const cost = d.cost * inflation(leagueYear(state.date));
  doReplace(state, key, cost, false);
  return null;
}

function doReplace(state: GameState, key: string, cost: number, auto: boolean): void {
  const f = facilities(state);
  const d = partDefs(state.userTeam)[key];
  f.parts[key] = { wear: 0, replaced: RULES.season };
  f.log.unshift({ date: state.date, key, cost: Math.round(cost), auto });
  f.log.length = Math.min(f.log.length, 40);
  if (cost) post(state, "projects", -cost, `Replaced: ${d.label.toLowerCase()}`);
}

/** Natural grass or turf, put in during the offseason. A dome needs a roll-out tray for grass, which is a construction project. */
export function switchSurface(state: GameState, to: FacilitiesState["surface"]): string | null {
  const f = facilities(state);
  const us = state.userTeam;
  const s = STADIUM_BY_TEAM[us];
  if (f.surface === to) return "That's what we play on now.";
  if (!maintainsStadium(us)) return `${s.owner} decides the surface.`;
  if (to === "grass" && s.roof === "dome") return "Grass under a fixed roof needs a roll-out tray, a construction project for later.";
  const md = state.date.slice(5);
  if (md > "07-15" && md < "02-15") return "The surface can only be changed in the offseason (February 15 to July 15).";
  const cost = (to === "grass" ? 3 : 2) * M * inflation(leagueYear(state.date));
  f.surface = to;
  f.parts.field = { wear: 0, replaced: RULES.season };
  post(state, "projects", -cost, to === "grass" ? "New natural grass field and drainage" : "New artificial turf field");
  return null;
}

export function commissionStudy(state: GameState): string | null {
  const f = facilities(state);
  const year = leagueYear(state.date);
  if (f.study === year) return "This year's study is done.";
  f.study = year;
  post(state, "professional", -0.3 * M * inflation(year), "Engineering study of the stadium and team facility");
  const worst = Object.keys(f.parts).sort((a, b) => condition(state, a) - condition(state, b)).slice(0, 3).map((k) => `${partDefs(state.userTeam)[k].label.toLowerCase()} (${condition(state, k)})`);
  send(state, "business", businessChief(state), "Engineering study results",
    `The engineers measured every part of the stadium and the team facility. Stadium average ${Math.round(stadiumCondition(state))}, team facility ${Math.round(complexCondition(state))} out of 100. Worst: ${worst.join(", ")}.`);
  return null;
}

/** What a stadium we own would sell for apart from the team (rough: replacement value, age and condition). */
export function stadiumValue(state: GameState): number | null {
  const s = STADIUM_BY_TEAM[state.userTeam];
  if (s.structure !== "owned" && s.structure !== "coowned") return null;
  const year = leagueYear(state.date);
  const age = Math.max(0, year - s.opened);
  const share = s.structure === "coowned" ? 0.5 : 1;
  return Math.round(s.capacity * 28_000 * inflation(year) * Math.max(0.35, 1 - age / 50) * (0.8 + 0.4 * stadiumCondition(state) / 100) * share);
}

/** A project's yearly gain at last year's numbers, and the years to pay it back. */
export function projectPayback(state: GameState, id: string): { yearly: number; years: number | null } {
  const def = PROJECT_BY_ID[id];
  // Last year's numbers, or this year's in a club's first season.
  let p = pnl(state, leagueYear(state.date) - 1);
  if (!p.revenue.some((r) => r.cat === "tickets" && r.amount)) p = pnl(state, leagueYear(state.date));
  const line = (cat: string) => p.revenue.find((r) => r.cat === cat)?.amount ?? 0;
  const e = def.effect;
  // Ticket demand turns into price and fewer empty seats, worth roughly its size times the ticket line.
  const yearly = (e.demand ?? 0) * 2 * line("tickets") + (e.premium ?? 0) * line("premium") + (e.perCap ?? 0) * (line("concessions") + line("merch") + line("parking"))
    + (e.sponsor ?? 0) * line("sponsorship") + ((e.facilities ?? 0) + (e.medical ?? 0)) * 3 * M;
  return { yearly, years: yearly > 0 ? Math.round((def.cost / yearly) * 10) / 10 : null };
}

/** Opened projects: what they cost and what they've brought in since, on the same estimate. */
export function builtReport(state: GameState): { id: string; title: string; cost: number; opened: string; earned: number }[] {
  return projects(state).filter((p) => p.opened).map((p) => {
    const years = Math.max(0, (Date.parse(state.date) - Date.parse(p.opens)) / (365 * 86_400_000));
    return { id: p.id, title: PROJECT_BY_ID[p.id].title, cost: p.cost, opened: p.opens, earned: Math.round(projectPayback(state, p.id).yearly * years) };
  });
}

// ---- The months ----

function monthly(state: GameState): void {
  const f = facilities(state);
  const us = state.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const defs = partDefs(us);
  const b = business(state);
  const month = Number(state.date.slice(5, 7));
  const offseason = month >= 2 && month <= 7;
  const plan = maintainsStadium(us) ? f.plan : "standard";
  const care = { defer: 1.35, standard: 1, ahead: 0.8 }[plan];
  const complexCare = [1.3, 1, 0.85, 0.7][b.budget.facilities];
  for (const [k, d] of Object.entries(defs)) {
    const p = f.parts[k] ?? (f.parts[k] = { wear: 0, replaced: RULES.season });
    let rate = (100 / d.life / 12) * (d.site === "stadium" ? care : complexCare);
    // Grass in a cold open-air stadium takes a beating in December and January.
    if (k === "field" && f.surface === "grass" && s.roof === "open" && COLD.has(us) && (month === 12 || month === 1)) rate *= 2.5;
    if (k === "field" && f.surface === "grass") rate *= 2.5; // resodded every few seasons
    p.wear = Math.min(100, p.wear + rate);
    // Roofs aren't replaced on a schedule, but routine repairs keep them sound unless maintenance is put off.
    if (k === "roof" && plan !== "defer") p.wear = Math.min(p.wear, 70);
    // The scheduled plan replaces what's worn out, out of the upkeep line or the facility budget; big jobs wait for the offseason.
    const due = d.site === "stadium" ? (plan === "defer" ? 101 : plan === "ahead" ? 65 : 80) : [101, 80, 70, 65][b.budget.facilities];
    const quick = d.cost < 5 * M;
    if (p.wear >= due && k !== "roof" && (quick || offseason) && (d.site === "complex" || maintainsStadium(us) || p.wear >= 80)) doReplace(state, k, 0, true);
  }
  if (plan === "defer" && month === 9) {
    const bl = backlog(state);
    if (bl.parts.length) send(state, "business", sodName(state), "The maintenance backlog",
      `With maintenance put off, ${bl.parts.length} part${bl.parts.length > 1 ? "s are" : " is"} past due: ${bl.parts.slice(0, 4).join(", ").toLowerCase()}. Catching up would cost about ${money(bl.cost)}. Expect more breakdowns on game days.`);
  }
}

function sodName(state: GameState): string {
  const e = execRole(state, "SOD");
  return e ? `${e.name}, stadium operations` : businessChief(state);
}

/** The yearly facilities survey of players and staff: it informs, it doesn't decide. */
function survey(state: GameState): void {
  const f = facilities(state);
  const rng = rngFor(state.seed, `fsurvey:${RULES.season}`);
  const score = (c: number) => Math.max(1, Math.min(10, Math.round((3 + c / 15 + gaussian(rng) * 0.6) * 10) / 10));
  const scores: Record<string, number> = {
    "Locker rooms": score(condition(state, "lockers")),
    "Weight room": score(condition(state, "weight")),
    "Practice fields": score((condition(state, "indoor") + condition(state, "outdoor")) / 2),
    "Meeting and film rooms": score((condition(state, "film") + condition(state, "digital")) / 2),
    "Food and nutrition": score(condition(state, "kitchen")),
    "Game-day field": score(condition(state, "field") + (f.surface === "grass" ? 12 : -8)),
    "Player services": Math.max(1, Math.min(10, Math.round((servicesScore(state) + gaussian(rng) * 0.5) * 10) / 10)),
  };
  const low = Object.entries(scores).filter(([, v]) => v < 5.5).map(([k]) => k.toLowerCase());
  const notes = [
    low.length ? `Players flagged ${low.join(", ")}.` : "No area scored badly.",
    f.surface === "turf" ? "Several players asked again about natural grass." : "Players like playing on grass at home.",
  ];
  f.surveys.unshift({ year: RULES.season, scores, notes });
  f.surveys.length = Math.min(f.surveys.length, 6);
  send(state, "staff", sodName(state), "Players' and staff facilities survey", `${Object.entries(scores).map(([k, v]) => `${k}: ${v.toFixed(1)}`).join("; ")}.\n${notes.join(" ")}`);
}

export function facilitiesDaily(state: GameState): void {
  if (state.date.endsWith("-01")) monthly(state);
  if (state.date === addDays(RULES.keyDates.regularSeasonStart, -90)) survey(state);
}
