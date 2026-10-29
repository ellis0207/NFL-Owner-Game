// Stadium and training-facility projects the owner can pay for. Construction
// runs through the offseason: work starts between February and May and opens
// before the preseason, one or two summers later. Who pays depends on who owns
// the building; a tenant can't renovate a landlord's stadium, and a public
// stadium authority has to sign off. Costs are rough 2026 figures from recent
// NFL renovations, scaled for later years. Relocation and new stadiums are not
// part of the game yet.
import { business, businessChief, cashBalance, CREDIT_LINE, inflation, post } from "./business";
import { shortDate } from "./dates";
import { money, news, send } from "./inbox";
import { TEAM_BY_ID } from "./league";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { rngFor } from "./rng";
import { STADIUM_BY_TEAM } from "./stadiums";
import type { GameState, Project } from "./types";

const M = 1_000_000;

interface Effect {
  /** More fans who want tickets. */
  demand?: number;
  /** More suite and club money. */
  premium?: number;
  /** More spending per fan at the stands. */
  perCap?: number;
  /** Sponsors pay more for what the building offers. */
  sponsor?: number;
  /** Counts as a budget level for the training facility or the medical staff. */
  facilities?: number;
  medical?: number;
}

export interface ProjectDef {
  id: string;
  title: string;
  what: string;
  cost: number;
  /** Offseasons of construction. */
  build: 1 | 2;
  /** Part of the stadium (needs control of the building) or the team's own facility. */
  stadium: boolean;
  effect: Effect;
}

export const PROJECTS: ProjectDef[] = [
  { id: "boards", title: "New video boards and ribbon displays", what: "Bigger, sharper screens in both end zones and ribbon boards around the bowl. Fans like the show and sponsors pay for the space.", cost: 45 * M, build: 1, stadium: true, effect: { demand: 0.015, sponsor: 0.03 } },
  { id: "wifi", title: "Stadium-wide Wi-Fi and 5G network", what: "Fans can post, stream and order from their seats. A selling point for the wireless and tech sponsors.", cost: 18 * M, build: 1, stadium: true, effect: { demand: 0.005, sponsor: 0.02 } },
  { id: "concourse", title: "Wider concourses and 40 new concession stands", what: "Shorter lines and more choices, so fans spend more and miss less of the game.", cost: 80 * M, build: 1, stadium: true, effect: { demand: 0.01, perCap: 0.08 } },
  { id: "seats", title: "New wider seats with cup holders throughout the bowl", what: "Every general seat replaced. A more comfortable afternoon helps sell tickets.", cost: 50 * M, build: 1, stadium: true, effect: { demand: 0.02 } },
  { id: "clubs", title: "New field-level clubs and upgraded suites", what: "Converts lower sideline sections into club seating and refits the suites. Premium seating is where the building's money is.", cost: 140 * M, build: 2, stadium: true, effect: { premium: 0.1 } },
  { id: "facility", title: "Training facility expansion: indoor field, weight room and meeting rooms", what: "A building the coaches want to work in every day. Counts like a bigger facility budget, for good.", cost: 110 * M, build: 2, stadium: false, effect: { facilities: 1 } },
  { id: "recovery", title: "Sports science and recovery center", what: "Hydrotherapy, cryotherapy, imaging and a bigger training room in the team facility. Counts like a bigger medical budget, for good.", cost: 45 * M, build: 1, stadium: false, effect: { medical: 1 } },
];
export const PROJECT_BY_ID: Record<string, ProjectDef> = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

export function projects(state: GameState): Project[] {
  return (business(state).projects ??= []);
}

/** Opened projects' combined effects (read without opening the books, so the sim can call it). */
export function projectEffects(state: GameState): { gate: { demand: number; premiumMult: number; perCap: number }; sponsor: number; facilities: number; medical: number } {
  const out = { gate: { demand: 1, premiumMult: 1, perCap: 1 }, sponsor: 0, facilities: 0, medical: 0 };
  for (const p of state.business?.projects ?? []) {
    if (!p.opened) continue;
    const e = PROJECT_BY_ID[p.id].effect;
    out.gate.demand += e.demand ?? 0;
    out.gate.premiumMult += e.premium ?? 0;
    out.gate.perCap += e.perCap ?? 0;
    out.sponsor += e.sponsor ?? 0;
    out.facilities += e.facilities ?? 0;
    out.medical += e.medical ?? 0;
  }
  return out;
}

/** Construction season: projects start between February 1 and May 31. */
export function buildSeason(date: string): boolean {
  const md = date.slice(5);
  return md >= "02-01" && md <= "05-31";
}

/** What a project would cost us now, and whether we can do it. */
export function projectTerms(state: GameState, id: string): { cost: number; ours: number; payer?: string; blocked?: string } {
  const def = PROJECT_BY_ID[id];
  const s = STADIUM_BY_TEAM[state.userTeam];
  const cost = Math.round(def.cost * inflation(Number(state.date.slice(0, 4)), 0.04));
  let share = 1;
  let payer: string | undefined;
  let blocked: string | undefined;
  if (def.stadium) {
    if (s.structure === "tenant") blocked = `We rent ${s.name}; ${s.owner} decides what gets built there.`;
    else if (s.structure === "coowned") { share = 0.5; payer = `${s.partner ? TEAM_BY_ID[s.partner].name : "Our partner"} pay half`; }
    else if (s.structure === "publicTeam") { share = 0.7; payer = `${s.owner} pays 30%`; }
    else if (s.structure === "publicAuthority") { share = 0.5; payer = `${s.owner} pays half, if it signs off`; }
  }
  const p = projects(state).find((x) => x.id === id);
  if (p) blocked = p.opened ? "Done." : `Under way; opens ${shortDate(p.opens)}.`;
  else if (!buildSeason(state.date)) blocked ??= "Construction starts between February and May, so the work is done before the preseason.";
  else if (projects(state).filter((x) => !x.opened).length >= 2) blocked ??= "Two projects at a time is all the construction staff can run.";
  return { cost, ours: Math.round(cost * share), payer, blocked };
}

export function startProject(state: GameState, id: string): string {
  const def = PROJECT_BY_ID[id];
  const t = projectTerms(state, id);
  if (t.blocked) return t.blocked;
  if (cashBalance(state) + CREDIT_LINE < t.ours) return "We can't cover that, even with the credit line.";
  const s = STADIUM_BY_TEAM[state.userTeam];
  if (def.stadium && s.structure === "publicAuthority" && rngFor(state.seed, `authority:${id}:${state.date.slice(0, 4)}`)() >= 0.6) {
    // The authority answers once a year: asking again this spring gets the same no.
    return `${s.owner} turned it down this year. We can bring it back next spring.`;
  }
  const y = Number(state.date.slice(0, 4));
  const opens = `${y + def.build - 1}-08-01`;
  const deposit = Math.round(t.ours * 0.2);
  projects(state).push({ id, started: state.date, opens, cost: t.ours, paid: deposit });
  post(state, "projects", -deposit, `${def.title}: deposit`);
  news(state, `${TEAM_BY_ID[state.userTeam].name} announce: ${def.title.toLowerCase()} (${money(t.cost)})`);
  return `Work starts this spring and should finish by ${shortDate(opens)}. We paid ${money(deposit)} down; the rest goes out monthly.`;
}

function monthsLeft(date: string, until: string): number {
  return Math.max(1, (Number(until.slice(0, 4)) - Number(date.slice(0, 4))) * 12 + Number(until.slice(5, 7)) - Number(date.slice(5, 7)));
}

export function projectsDaily(state: GameState): void {
  const list = state.business?.projects;
  if (!list?.length) return;
  for (const p of list) {
    if (p.opened) continue;
    const def = PROJECT_BY_ID[p.id];
    if (state.date.endsWith("-01") && p.paid < p.cost && state.date < p.opens) {
      const pay = Math.round((p.cost - p.paid) / monthsLeft(state.date, p.opens));
      p.paid += pay;
      post(state, "projects", -pay, def.title);
    }
    if (state.date >= p.opens) {
      if (p.paid < p.cost) post(state, "projects", -(p.cost - p.paid), `${def.title}: final payment`);
      p.paid = p.cost;
      p.opened = true;
      if (def.stadium) state.pressure.fans = Math.min(100, state.pressure.fans + 2);
      const where = def.stadium ? STADIUM_BY_TEAM[state.userTeam].name : "the team facility";
      send(state, "business", businessChief(state), `${def.title}: finished`, `The work at ${where} is done, on time, at ${money(p.cost)} for our share.`);
      addStory(state, {
        outlet: "sideline", by: MEDIA_BY_ID.sideline.reporter, kind: "owner", teams: [state.userTeam],
        headline: `${TEAM_BY_ID[state.userTeam].name} unveil ${def.title.charAt(0).toLowerCase()}${def.title.slice(1)}`,
        body: `The ${TEAM_BY_ID[state.userTeam].name} showed off the finished work at ${where} today. ${def.what}`,
      });
    }
  }
}
