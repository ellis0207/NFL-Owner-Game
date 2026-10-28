// Who works for each team, and the engine-side reading of how good they are.
import { HIDDEN_RATINGS, HIDDEN_STAFF, PLAYER_BY_ID, PLAYERS, STAFF } from "./league";
import { gaussian, rngFor } from "./rng";
import { DEFENSE, OFFENSE } from "./schemes";
import type { DefenseScheme, GameState, OffenseScheme, Position, StaffHidden, StaffPerson, StaffRole } from "./types";

const BY_TEAM: Record<string, Partial<Record<StaffRole, StaffPerson>>> = {};
for (const p of STAFF.people) (BY_TEAM[p.team] ??= {})[p.role] = p;

export function teamStaff(team: string): Partial<Record<StaffRole, StaffPerson>> {
  return BY_TEAM[team] ?? {};
}

export function teamSchemes(team: string): { offense: OffenseScheme; defense: DefenseScheme } {
  return STAFF.teamSchemes[team];
}

/** The person calling plays for one side of the ball. */
export function playCaller(team: string, side: "offense" | "defense"): StaffPerson {
  const staff = teamStaff(team);
  return Object.values(staff).find((p) => p?.callsPlays.includes(side)) ?? staff.HC!;
}

function attr(person: StaffPerson | undefined, key: keyof StaffHidden, fallback = 65): number {
  return (person && HIDDEN_STAFF[person.id]?.[key]) ?? fallback;
}

/** Engine-only numbers for a team's staff, 0-100. */
export interface StaffEffects {
  offCalling: number;
  defCalling: number;
  gameManagement: number;
  leadership: number;
  specialTeams: number;
  /** Development, by side of the ball. */
  devOffense: number;
  devDefense: number;
  devSpecial: number;
  /** How well the coaches judge their own players (depth charts, reports). */
  coachEval: number;
  gmEval: number;
  /** The GM at the table: how cheaply deals get done, and how well they read agents. */
  gmNegotiation: number;
  capManagement: number;
  proScouting: number;
  collegeScouting: number;
  injuryPrevention: number;
  injuryRecovery: number;
}

const effectsCache: Record<string, StaffEffects> = {};

export function staffEffects(team: string): StaffEffects {
  if (effectsCache[team]) return effectsCache[team];
  const s = teamStaff(team);
  const hcDev = attr(s.HC, "development");
  const e: StaffEffects = {
    offCalling: attr(playCaller(team, "offense"), "playCalling"),
    defCalling: attr(playCaller(team, "defense"), "playCalling"),
    gameManagement: attr(s.HC, "gameManagement"),
    leadership: attr(s.HC, "leadership"),
    specialTeams: attr(s.STC, "specialTeams"),
    devOffense: 0.35 * hcDev + 0.65 * attr(s.OC ?? s.HC, "development"),
    devDefense: 0.35 * hcDev + 0.65 * attr(s.DC ?? s.HC, "development"),
    devSpecial: 0.3 * hcDev + 0.7 * attr(s.STC, "development"),
    coachEval: 0.5 * attr(s.HC, "evaluation") + 0.25 * attr(s.OC ?? s.HC, "evaluation") + 0.25 * attr(s.DC ?? s.HC, "evaluation"),
    gmEval: attr(s.GM, "evaluation"),
    gmNegotiation: attr(s.GM, "negotiation"),
    capManagement: attr(s.GM, "capManagement"),
    proScouting: attr(s.PRO, "evaluation"),
    collegeScouting: attr(s.COL, "evaluation"),
    injuryPrevention: attr(s.TRN, "prevention"),
    injuryRecovery: attr(s.TRN, "recovery"),
  };
  return (effectsCache[team] = e);
}

// ---- Player ability as the engine sees it ----

/** An unhappy player plays below their level. */
function moraleDrag(state: GameState, id: string): number {
  const m = state.players[id]?.morale;
  return m === undefined || m >= 50 ? 0 : (50 - m) * 0.06;
}

export function ability(state: GameState, id: string): number {
  return (HIDDEN_RATINGS[id]?.overall ?? 45) + (state.players[id]?.dev ?? 0) - moraleDrag(state, id);
}

export function trait(state: GameState, id: string, name: string): number {
  const r = HIDDEN_RATINGS[id];
  if (!r) return 45;
  return (r.traits[name] ?? r.overall) + (state.players[id]?.dev ?? 0) - moraleDrag(state, id);
}

/** How well a player's traits match what a scheme asks for at the position, in rating points around zero. */
export function schemeFit(state: GameState, id: string, team: string): number {
  // Traits and ability move together with development, so fit depends only on the player and the schemes.
  const key = `${team}:${id}`;
  const hit = fitCache.get(key);
  if (hit !== undefined) return hit;
  const fit = computeFit(state, id, team);
  fitCache.set(key, fit);
  return fit;
}

const fitCache = new Map<string, number>();

/** For tuning tools that change a team's schemes on the fly. */
export function clearFitCache(): void {
  fitCache.clear();
}

function rawFit(wants: Record<string, number>, traits: Record<string, number>, overall: number): number {
  let total = 0;
  let weight = 0;
  for (const [t, w] of Object.entries(wants)) {
    total += w * (traits[t] ?? overall);
    weight += w;
  }
  return weight ? total / weight - overall : 0;
}

/** League-wide average raw fit for a set of wants at a position, so fit reads relative to a typical player. */
const fitBaseline = new Map<Record<string, number>, number>();
function baseline(wants: Record<string, number>, pos: Position): number {
  let b = fitBaseline.get(wants);
  if (b === undefined) {
    // Compared with starter-level players, whose production-based traits run higher than a camp body's.
    const group = PLAYERS.filter((p) => p.team && p.position === pos && HIDDEN_RATINGS[p.id].overall >= 78);
    b = group.reduce((sum, p) => sum + rawFit(wants, HIDDEN_RATINGS[p.id].traits, HIDDEN_RATINGS[p.id].overall), 0) / Math.max(1, group.length);
    fitBaseline.set(wants, b);
  }
  return b;
}

function computeFit(state: GameState, id: string, team: string): number {
  const pos = PLAYER_BY_ID[id].position;
  const { offense, defense } = teamSchemes(team);
  const wants = OFFENSE[offense].wants[pos] ?? DEFENSE[defense].wants[pos];
  const r = HIDDEN_RATINGS[id];
  if (!wants || !r) return 0;
  void state; // development moves traits and overall together, so fit uses the base ratings
  return rawFit(wants, r.traits, r.overall) - baseline(wants, pos);
}

/**
 * An evaluator's view of a player's ability: the truth plus a steady error
 * that shrinks with the evaluator's skill. Seeded, so the same evaluator
 * keeps the same opinion instead of changing their mind every day.
 */
const errorCache = new Map<string, number>();

export function perceivedAbility(state: GameState, id: string, evaluatorKey: string, skill: number): number {
  const key = `${state.seed}:${evaluatorKey}:${id}`;
  let z = errorCache.get(key);
  if (z === undefined) {
    if (errorCache.size > 300_000) errorCache.clear();
    z = gaussian(rngFor(state.seed, `eval:${evaluatorKey}:${id}`));
    errorCache.set(key, z);
  }
  const sd = Math.max(0.8, (100 - skill) / 7);
  return ability(state, id) + z * sd;
}

/** A team's coaching staff's view of its own player, including how well the player fits the scheme. */
export function coachView(state: GameState, team: string, id: string): number {
  return perceivedAbility(state, id, `coach:${team}`, staffEffects(team).coachEval) + 0.35 * schemeFit(state, id, team);
}
