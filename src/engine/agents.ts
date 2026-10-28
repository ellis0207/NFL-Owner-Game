// Agents and the players they represent. Agents and agencies are made up; the
// players are real. Every agent has a negotiating style, hidden tendencies, and
// a client list that gives them leverage.
import { ageOn } from "./dates";
import { HIDDEN_RATINGS, PLAYER_BY_ID, PLAYERS, RULES } from "./league";
import { gaussian, makeRng, rngFor, type Rng } from "./rng";
import type { Agent, AgentStyle, GameState } from "./types";

// A fixed seed: the same agent represents the same player in every save, like the real league.
const WORLD_SEED = 20260728;

const AGENCIES = [
  "Northline Sports", "Keystone Athlete Management", "Blue Harbor Sports", "Meridian Athletes", "Ironwood Representation",
  "Crescent Sports Agency", "Lakeshore Talent Group", "Granite Peak Sports", "Silver Oak Athletes", "Union Square Sports",
  "Redline Management", "Cobalt Sports Group", "Sterling Athlete Partners", "Westgate Representation", "Harbor Point Sports",
  "Fieldhouse Partners", "Tidewater Sports", "Summit Ridge Athletes", "Lantern Sports Management", "Copperline Agency",
];

const FIRST = [
  "Marcus", "Dana", "Trevor", "Alicia", "Desmond", "Renee", "Carter", "Simone", "Grant", "Monique", "Wesley", "Tamara",
  "Victor", "Lena", "Jerome", "Priya", "Owen", "Kendra", "Malik", "Hannah", "Dominic", "Celeste", "Andre", "Brooke",
  "Raymond", "Nadia", "Elliot", "Jasmine", "Felix", "Corinne", "Isaiah", "Meredith", "Spencer", "Yolanda", "Gavin", "Tessa",
  "Rashad", "Colleen", "Bennett", "Ingrid", "Terrence", "Paige", "Darnell", "Whitney", "Quentin", "Gloria",
];
const LAST = [
  "Whitaker", "Okafor", "Brennan", "Castellano", "Holloway", "Ashford", "Pemberton", "Galloway", "Kincaid", "Thornbury",
  "Delacroix", "Abernathy", "Navarro", "Sutherland", "Mbeki", "Fairbanks", "Lindqvist", "Redmond", "Calloway", "Hartigan",
  "Ostrowski", "Prescod", "Vanterpool", "Quarles", "Emberly", "Tennyson", "Macready", "Oduya", "Stroud-Bellamy", "Harrow",
  "Kessler", "Ambrose", "Faircloth", "Langston", "Merriweather", "Dunleavy", "Okonjo", "Saldana", "Whitlock", "Barrowman",
];

const STYLES: [AgentStyle, number][] = [
  ["steady", 0.26], ["hardball", 0.17], ["relationship", 0.16], ["leaker", 0.13], ["deadline", 0.1], ["guarantees", 0.1], ["creative", 0.08],
];

export const STYLE_LABEL: Record<AgentStyle, string> = {
  steady: "Straight shooter", hardball: "Hardball", relationship: "Relationship-driven", leaker: "Media-leaker",
  deadline: "Deadline-driven", guarantees: "Guarantee-focused", creative: "Structure-creative",
};

/** Engine-only tendencies, 0-1. */
export interface AgentHidden {
  /** How far above the market they open and how slowly they come down. */
  aggression: number;
  /** Chance a round of talks ends up in the media. */
  leak: number;
  /** Rounds they'll sit through before ending talks. */
  patience: number;
  /** Weight on guaranteed money relative to APY. */
  guaranteeFocus: number;
  /** Comfort with void years and bonus-heavy structures. */
  creativity: number;
  /** How much past dealings with a front office move them. */
  memory: number;
  /** Standing in the industry: grows with the client list. */
  power: number;
}

function pickStyle(rng: Rng): AgentStyle {
  let r = rng();
  for (const [s, w] of STYLES) {
    r -= w;
    if (r <= 0) return s;
  }
  return "steady";
}

interface World {
  agents: Agent[];
  hidden: Record<string, AgentHidden>;
  agentOf: Record<string, string>;
  clients: Record<string, string[]>;
}

let world: World | null = null;

function build(): World {
  const rng = makeRng(WORLD_SEED);
  const agents: Agent[] = [];
  const hidden: Record<string, AgentHidden> = {};
  const used = new Set<string>();
  const COUNT = 64;
  for (let i = 0; i < COUNT; i++) {
    let name = "";
    do name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`; while (used.has(name));
    used.add(name);
    const style = pickStyle(rng);
    // A handful of agencies are big shops with several agents.
    const agency = AGENCIES[Math.min(AGENCIES.length - 1, Math.floor(Math.pow(rng(), 1.6) * AGENCIES.length))];
    const id = `ag${i + 1}`;
    agents.push({ id, name, agency, style, since: RULES.season - 2 - Math.floor(rng() * 26) });
    const g = () => Math.max(0, Math.min(1, 0.5 + gaussian(rng) * 0.15));
    hidden[id] = {
      aggression: style === "hardball" ? 0.8 + rng() * 0.2 : style === "relationship" ? 0.25 + rng() * 0.2 : g(),
      leak: style === "leaker" ? 0.45 + rng() * 0.3 : 0.03 + rng() * 0.08,
      patience: style === "deadline" ? 0.85 : style === "hardball" ? 0.7 : g(),
      guaranteeFocus: style === "guarantees" ? 0.85 + rng() * 0.15 : g(),
      creativity: style === "creative" ? 0.85 + rng() * 0.15 : g() * 0.7,
      memory: style === "relationship" ? 0.9 : g(),
      power: 0,
    };
  }
  // Agents with more years in the business draw more of the top players.
  const pull = agents.map((a) => Math.pow(RULES.season - a.since + 4, 1.3) * (0.6 + rng()));
  const pullTotal = pull.reduce((a, b) => a + b, 0);
  const agentOf: Record<string, string> = {};
  const clients: Record<string, string[]> = {};
  const byValue = [...PLAYERS].sort((a, b) => (HIDDEN_RATINGS[b.id]?.overall ?? 0) - (HIDDEN_RATINGS[a.id]?.overall ?? 0));
  for (const p of byValue) {
    const prng = rngFor(WORLD_SEED, `agent:${p.id}`);
    const star = (HIDDEN_RATINGS[p.id]?.overall ?? 50) >= 85;
    let r = prng() * pullTotal;
    let pick = 0;
    for (let i = 0; i < agents.length; i++) {
      // Stars concentrate with the established agents.
      r -= star ? pull[i] * pull[i] / (pullTotal / agents.length) : pull[i];
      if (r <= 0) { pick = i; break; }
      pick = i;
    }
    const id = agents[pick].id;
    agentOf[p.id] = id;
    (clients[id] ??= []).push(p.id);
  }
  for (const a of agents) {
    const list = clients[a.id] ?? [];
    const weight = list.reduce((s, id) => s + Math.max(0, (HIDDEN_RATINGS[id]?.overall ?? 50) - 70), 0);
    hidden[a.id].power = Math.min(1, weight / 400);
  }
  return { agents, hidden, agentOf, clients };
}

function w(): World {
  return (world ??= build());
}

export function allAgents(): Agent[] {
  return w().agents;
}

export function agentFor(playerId: string): Agent {
  const id = w().agentOf[playerId];
  return w().agents.find((a) => a.id === id) ?? w().agents[0];
}

export function agentHidden(agentId: string): AgentHidden {
  return w().hidden[agentId];
}

export function clientsOf(agentId: string): string[] {
  return w().clients[agentId] ?? [];
}

/** Clients an agent has on a team: leverage when one negotiation can sour the others. */
export function clientsOnTeam(state: GameState, agentId: string, team: string): string[] {
  return clientsOf(agentId).filter((id) => state.players[id]?.team === team);
}

export function trustOf(state: GameState, agentId: string, team: string): number {
  return state.trust[agentId]?.[team] ?? 0;
}

export function changeTrust(state: GameState, agentId: string, team: string, delta: number): void {
  const t = (state.trust[agentId] ??= {});
  t[team] = Math.max(-100, Math.min(100, (t[team] ?? 0) + delta));
}

// ---- What players care about ----

export interface Priorities {
  money: number;
  winning: number;
  role: number;
  city: number;
  scheme: number;
  playingTime: number;
  ego: number;
  loyalty: number;
}

const priorityCache = new Map<string, Priorities>();

/** Hidden priorities, 0-1. Young players lean toward money; veterans toward winning. */
export function priorities(playerId: string): Priorities {
  let p = priorityCache.get(playerId);
  if (p) return p;
  const rng = rngFor(WORLD_SEED, `prio:${playerId}`);
  const player = PLAYER_BY_ID[playerId];
  const age = ageOn(player?.birthDate ?? null, `${RULES.season}-09-01`) ?? 26;
  const v = (mean: number) => Math.max(0, Math.min(1, mean + gaussian(rng) * 0.2));
  const star = (HIDDEN_RATINGS[playerId]?.overall ?? 50) >= 85;
  p = {
    money: v(0.62 - (age - 27) * 0.02),
    winning: v(0.45 + (age - 27) * 0.035),
    role: v(star ? 0.6 : 0.45),
    city: v(0.35),
    scheme: v(0.4),
    playingTime: v(0.5 + (star ? 0.1 : 0)),
    ego: v(star ? 0.55 : 0.4),
    loyalty: v(0.4),
  };
  priorityCache.set(playerId, p);
  return p;
}

export const DEFAULT_MORALE = 70;

export function morale(state: GameState, id: string): number {
  return state.players[id]?.morale ?? DEFAULT_MORALE;
}

export function changeMorale(state: GameState, id: string, delta: number): void {
  const p = state.players[id];
  if (!p) return;
  p.morale = Math.max(0, Math.min(100, Math.round(((p.morale ?? DEFAULT_MORALE) + delta) * 10) / 10));
}
