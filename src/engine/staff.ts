// Who works for each team, and the engine-side reading of how good they are.
import { careDrag } from "./playercare";
import { trustNudge } from "./clubhouse";
import { retrainEffect } from "./training";
import { HIDDEN_RATINGS, HIDDEN_STAFF, PLAYER_BY_ID, PLAYERS, RULES, STAFF } from "./league";
import { gaussian, rngFor } from "./rng";
import { DEFENSE, OFFENSE } from "./schemes";
import type { DefenseScheme, GameState, OffenseScheme, Position, StaffHidden, StaffPerson, StaffRole } from "./types";

let BY_TEAM: Record<string, Partial<Record<StaffRole, StaffPerson>>> = {};
const DATA_SCHEMES = structuredClone(STAFF.teamSchemes);
let SCHEMES: Record<string, { offense: OffenseScheme; defense: DefenseScheme }> = DATA_SCHEMES;
/** How far along each team is with a new scheme (1 when it's second nature). */
let INSTALL: Record<string, { offense: number; defense: number }> = {};

function index(people: StaffPerson[]): void {
  BY_TEAM = {};
  for (const p of people) if (p.team) (BY_TEAM[p.team] ??= {})[p.role] = p;
}
index(STAFF.people);

/**
 * Points the staff lookups at a save's people and schemes (coaches.ts keeps
 * them in the save). Clears everything cached from the old staff.
 */
export function bindStaffTables(people: StaffPerson[], schemes: typeof SCHEMES, install: typeof INSTALL): void {
  index(people);
  SCHEMES = schemes;
  INSTALL = install;
  clearStaffCaches();
}

/** After a hire, a firing or a scheme change. */
export function clearStaffCaches(): void {
  for (const k of Object.keys(effectsCache)) delete effectsCache[k];
  fitCache.clear();
}

export function teamStaff(team: string): Partial<Record<StaffRole, StaffPerson>> {
  return BY_TEAM[team] ?? {};
}

export function teamSchemes(team: string): { offense: OffenseScheme; defense: DefenseScheme } {
  return SCHEMES[team] ?? DATA_SCHEMES[team];
}

/** A new scheme takes a camp and part of a season to learn: until then the play calling runs below its level. */
function installDrag(team: string, side: "offense" | "defense"): number {
  const v = INSTALL[team]?.[side] ?? 1;
  return (1 - Math.max(0, Math.min(1, v))) * 9;
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
  /** The head coach's own edge on every snap, in rating points: the week's preparation, sideline calls and how the team answers him. */
  command: number;
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
    offCalling: attr(playCaller(team, "offense"), "playCalling") - installDrag(team, "offense"),
    defCalling: attr(playCaller(team, "defense"), "playCalling") - installDrag(team, "defense"),
    gameManagement: attr(s.HC, "gameManagement"),
    leadership: attr(s.HC, "leadership"),
    // A sharp, respected head coach is worth a win or more a season over a weak one: teams are
    // better prepared, waste fewer snaps and keep playing when they fall behind (centered on a typical head coach).
    command: (attr(s.HC, "gameManagement") - 72) * 0.05 + (attr(s.HC, "leadership") - 80) * 0.04,
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

/** An unhappy player plays below their level; one who is fired up plays a little above it. */
function moraleDrag(state: GameState, id: string): number {
  const m = state.players[id]?.morale;
  if (m === undefined) return 0;
  return m < 60 ? (60 - m) * 0.08 : m > 78 ? -(m - 78) * 0.04 : 0;
}

/** Back from an injury, a player can take a few weeks to look like himself; the drag fades to nothing. */
export function rustDrag(state: GameState, id: string): number {
  const r = state.players[id]?.rust;
  if (!r || state.date >= r.until) return 0;
  const left = (Date.parse(r.until) - Date.parse(state.date)) / 86_400_000;
  return r.amount * Math.min(1, left / r.days);
}

export function ability(state: GameState, id: string): number {
  return (HIDDEN_RATINGS[id]?.overall ?? 45) + (state.players[id]?.dev ?? 0) - moraleDrag(state, id) - rustDrag(state, id) + retrainEffect(state, id);
}

/** Room a player still has to grow: his ceiling (as it has moved) over where he is now. Engine only. */
export function upside(state: GameState, id: string): number {
  const r = HIDDEN_RATINGS[id];
  if (!r) return 0;
  const p = state.players[id];
  return Math.max(0, r.potential + (p?.pot ?? 0) - (r.overall + (p?.dev ?? 0)));
}

export function trait(state: GameState, id: string, name: string): number {
  const r = HIDDEN_RATINGS[id];
  if (!r) return 45;
  // A playbook not yet learned and weeks of every snap take a little off (playercare.ts).
  const p = state.players[id];
  return (r.traits[name] ?? r.overall) + (p?.dev ?? 0) + (p?.tdev?.[name] ?? 0) - moraleDrag(state, id) - rustDrag(state, id) - careDrag(state, id);
}

/** How well a player's traits match what a scheme asks for at the position, in rating points around zero. */
export function schemeFit(state: GameState, id: string, team: string): number {
  // Traits age at their own pace (aging.ts), so development clears this cache whenever it moves them.
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
  // Fit reads traits as they have aged against overall as it has moved, so a
  // receiver who lost his speed fits a vertical offense less well than he did.
  const tdev = state.players[id]?.tdev;
  const traits = tdev ? Object.fromEntries(Object.entries(r.traits).map(([t, v]) => [t, v + (tdev[t] ?? 0)])) : r.traits;
  return rawFit(wants, traits, r.overall) - baseline(wants, pos);
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
    // A read can be badly wrong, but not wildly: the error is held to about two spreads.
    z = Math.max(-2.2, Math.min(2.2, gaussian(rngFor(state.seed, `eval:${evaluatorKey}:${id}`))));
    errorCache.set(key, z);
  }
  const sd = Math.max(0.8, (100 - skill) / 7) * (evaluatorKey.endsWith(`:${state.userTeam}`) ? fogOf(state) : 1) * tapeSpread(id);
  const tape = tapeWeight(state, id);
  if (tape >= 1) return ability(state, id) + z * sd;
  // Little NFL tape yet: the read leans on where he was drafted.
  return tape * ability(state, id) + (1 - tape) * draftPrior(state, id) + z * sd;
}

/**
 * How far one evaluator can be off on a player: years of NFL tape narrow it,
 * so nobody misreads a 12-year veteran the way they can a second-year player.
 */
function tapeSpread(id: string): number {
  const p = PLAYER_BY_ID[id];
  if (!p) return 1;
  const exp = p.rookieYear != null ? RULES.season - p.rookieYear : p.yearsExp;
  return exp <= 1 ? 1 : exp <= 3 ? 0.8 : exp <= 6 ? 0.6 : 0.5;
}

/**
 * How much of a young player's level the league can see on NFL tape: a
 * rookie is judged mostly by where he was drafted, and the tape takes over
 * through his first two seasons. Veterans are fully on tape.
 */
function tapeWeight(state: GameState, id: string): number {
  const p = PLAYER_BY_ID[id];
  if (!p) return 1;
  const exp = p.rookieYear != null ? RULES.season - p.rookieYear : p.yearsExp;
  if (exp >= 2) return 1;
  const K = RULES.keyDates;
  // Through each season the games pile up: from camp to the last week of the regular season.
  const into = state.date <= K.rosterCutdown ? 0 : state.date >= K.regularSeasonEnd ? 1 : 0.5;
  return exp <= 0 ? 0.45 + 0.25 * into : 0.8 + 0.2 * into;
}

/** What players drafted in each round (0 for undrafted) are as young players in this league: what a team expects of a pick. */
// Kept for one game day: a reloaded save has to read players the same way a game left running would.
const priorCache = new WeakMap<GameState, { date: string; byRound: number[] }>();
function draftPrior(state: GameState, id: string): number {
  let c = priorCache.get(state);
  if (c?.date !== state.date) {
    const sum = Array(8).fill(0), n = Array(8).fill(0);
    for (const [pid, ps] of Object.entries(state.players)) {
      const pl = PLAYER_BY_ID[pid];
      if (!ps.team || !pl || !HIDDEN_RATINGS[pid]) continue;
      const exp = pl.rookieYear != null ? RULES.season - pl.rookieYear : pl.yearsExp;
      if (exp > 2) continue;
      const r = Math.min(7, pl.draft?.round ?? 0);
      sum[r] += HIDDEN_RATINGS[pid].overall + (ps.dev ?? 0);
      n[r]++;
    }
    const all = sum.reduce((a, b) => a + b, 0) / Math.max(1, n.reduce((a, b) => a + b, 0));
    // Thin rounds borrow from the whole group, so one player never sets his own prior.
    c = { date: state.date, byRound: sum.map((v, r) => (v + 8 * all) / (n[r] + 8)) };
    priorCache.set(state, c);
  }
  return c.byRound[Math.min(7, PLAYER_BY_ID[id].draft?.round ?? 0)];
}

/** The owner's chosen scouting precision: it widens or narrows our own staff's reads, never anyone else's. */
export function fogOf(state: GameState): number {
  return { sharp: 0.6, real: 1, foggy: 1.5 }[state.settings.scouting ?? "real"];
}

/** A team's coaching staff's view of its own player, including how well the player fits the scheme. */
export function coachView(state: GameState, team: string, id: string): number {
  return coachRead(state, team, id) + 0.35 * schemeFit(state, id, team) + trustNudge(state, id);
}

/** One practice tells the coaches only so much: the spread of a single day's work around a player's true level. */
const PRACTICE_VAR = 100;
const campNoiseCache = new Map<string, number>();

/** How a player's practices have looked this season, in units of one day's spread (engine only). */
function campNoise(state: GameState, id: string): number {
  const key = `${state.seed}:${state.program?.season}:${id}`;
  let z = campNoiseCache.get(key);
  if (z === undefined) {
    if (campNoiseCache.size > 100_000) campNoiseCache.clear();
    z = gaussian(rngFor(state.seed, `camp:${state.program?.season}:${id}`));
    campNoiseCache.set(key, z);
  }
  return z;
}

/**
 * The coaches' grade of a player: their first impression, sharpened by the
 * practices they have watched him take this season. A player who has a hot
 * camp can fool them for a while, just as a slow starter can.
 */
export function coachRead(state: GameState, team: string, id: string): number {
  const skill = staffEffects(team).coachEval;
  const prior = perceivedAbility(state, id, `coach:${team}`, skill);
  const n = state.program?.reps[`${team}:${id}`] ?? 0;
  if (n <= 0) return prior;
  const sd = Math.max(0.8, (100 - skill) / 7);
  const wPrior = 1 / (sd * sd);
  const wSeen = n / PRACTICE_VAR;
  const seen = ability(state, id) + campNoise(state, id) * Math.sqrt(PRACTICE_VAR / n);
  return (prior * wPrior + seen * wSeen) / (wPrior + wSeen);
}

/** How much the practices have moved the coaches off their first impression (engine only). */
export function campChange(state: GameState, team: string, id: string): number {
  return coachRead(state, team, id) - perceivedAbility(state, id, `coach:${team}`, staffEffects(team).coachEval);
}
