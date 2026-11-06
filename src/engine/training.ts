// Training: how hard the team practices, the strength and performance staff,
// individual development plans, and moving players to new positions.
//
// Practice load is a trade: more full-speed work develops players a little
// faster and gets more of them hurt. Resting veterans midweek keeps older
// bodies fresher. The strength staff, nutrition, equipment and field care
// lower injury risk at the margins; none of them make anyone a better player
// outright. A development plan puts a young player's coaches on one focus
// for him; the staff can only give that attention to a handful at once.
//
// A position change takes time. The player plays below his level while he
// learns the new spot, quicker if he picks things up fast, and some players
// simply suit the new position better or worse than anyone could tell.
import { clubhouse, clubNote, personality, posOf } from "./clubhouse";
import { ageOn, weekday } from "./dates";
import { send } from "./inbox";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES } from "./league";
import { gaussian, rngFor } from "./rng";
import { teamStaff } from "./staff";
import type { GameState, Position } from "./types";

export type Workload = "light" | "normal" | "heavy";

export interface Programs {
  /** Strength and conditioning staff, 0 (bare) to 3 (top of the league). */
  strength: number;
  nutrition: boolean;
  /** Confidential mental health and player support staff. */
  mental: boolean;
  /** 0 standard, 1 the newest approved helmets and protective gear with weekly fitting. */
  equipment: number;
  /** 0 standard, 1 extra grounds crew and surface testing at the practice and game fields. */
  field: number;
  workload: Workload;
  /** Veterans 30 and over sit out a practice day each week. */
  restVets: boolean;
}

export type Focus = "technique" | "strength" | "playbook";

export interface DevPlan {
  focus: Focus;
  since: string;
  /** Where the player was when the plan began (engine only). */
  start: number;
}

export const FOCUS: Record<Focus, { label: string; what: string }> = {
  technique: { label: "Technique", what: "Extra individual work with his position coach on footwork, hands and leverage." },
  strength: { label: "Strength and speed", what: "A tailored lifting and speed program with the strength staff." },
  playbook: { label: "Playbook and reads", what: "Extra meeting time, film and walkthroughs on the scheme." },
};

export const STRENGTH_LEVELS = [
  { label: "Bare", what: "One strength coach and an assistant; the basics.", cost: 0 },
  { label: "Standard", what: "A full strength staff and a sports scientist.", cost: 1_200_000 },
  { label: "Strong", what: "Position-specific programs, GPS load tracking and recovery specialists.", cost: 2_800_000 },
  { label: "Leading", what: "A performance department with its own research, recovery center and individual programs.", cost: 5_000_000 },
];

export const PROGRAM_COSTS = { nutrition: 1_500_000, mental: 800_000, equipment: 1_000_000, field: 900_000 };

/** The most players the staff can carry on individual plans at once. */
export const MAX_PLANS = 8;

/** What our programs cost in a year, charged to the medical and training line. */
export function programsCost(state: GameState): number {
  const p = state.clubhouse?.programs;
  if (!p) return STRENGTH_LEVELS[1].cost + PROGRAM_COSTS.nutrition + PROGRAM_COSTS.mental;
  return STRENGTH_LEVELS[p.strength].cost + (p.nutrition ? PROGRAM_COSTS.nutrition : 0) + (p.mental ? PROGRAM_COSTS.mental : 0) +
    p.equipment * PROGRAM_COSTS.equipment + p.field * PROGRAM_COSTS.field;
}

export function setPrograms(state: GameState, change: Partial<Programs>): void {
  const p = clubhouse(state).programs;
  Object.assign(p, change);
  const words = Object.entries(change).map(([k, v]) => `${k} ${typeof v === "boolean" ? (v ? "on" : "off") : k === "strength" ? STRENGTH_LEVELS[v as number].label.toLowerCase() : v}`);
  clubNote(state, `Programs changed: ${words.join(", ")}.`);
}

function age(state: GameState, id: string): number {
  return ageOn(PLAYER_BY_ID[id]?.birthDate ?? null, state.date) ?? 26;
}

const ours = (state: GameState, team: string | null | undefined) => !!team && team === state.userTeam;

/**
 * How fast a player grows this week compared with a typical player in a
 * typical program: his own learning and work habits, a mentor, a plan, and
 * (for our team) the practice load and strength staff.
 */
export function growthFactor(state: GameState, id: string, mentored: boolean): number {
  const me = personality(id);
  let f = (0.8 + 0.4 * me.learning) * (0.9 + 0.2 * me.work) * (mentored ? 1.1 : 1);
  const team = state.players[id]?.team;
  if (ours(state, team)) {
    const c = state.clubhouse;
    if (c?.plans[id]) f *= 1.18;
    const p = c?.programs;
    if (p) f *= { light: 0.9, normal: 1, heavy: 1.1 }[p.workload] * [0.97, 1, 1.02, 1.04][p.strength];
  }
  return f;
}

/** The same for an offseason: character matters, practice load does not. */
export function offseasonFactor(state: GameState, id: string): number {
  const me = personality(id);
  let f = (0.88 + 0.24 * me.learning) * (0.92 + 0.16 * me.work);
  if (ours(state, state.players[id]?.team) && state.clubhouse?.plans[id]) f *= 1.08;
  return f;
}

/** How our programs change a player's injury risk, in games (practice = false) or practice. */
export function riskFactor(state: GameState, id: string, team: string, practice: boolean): number {
  let f = 1;
  const ps = state.players[id];
  if (ps?.fragile && ps.fragile > state.date) f *= 1.6;
  if (!ours(state, team)) return f;
  const p = state.clubhouse?.programs;
  if (!p) return f;
  f *= [1.05, 1, 0.97, 0.94][p.strength] * (p.nutrition ? 1 : 1.03) * (p.equipment ? 0.98 : 1) * (p.field ? 0.98 : 1);
  if (practice) f *= { light: 0.75, normal: 1, heavy: 1.25 }[p.workload];
  else f *= { light: 0.98, normal: 1, heavy: 1.03 }[p.workload];
  if (p.restVets && age(state, id) >= 30) f *= practice ? 0.75 : 0.95;
  return f;
}

/** A concussion is less likely with the newest helmets. */
export function concussionFactor(state: GameState, team: string): number {
  return ours(state, team) && state.clubhouse?.programs.equipment ? 0.85 : 1;
}

// ---- Development plans ----

export function setPlan(state: GameState, id: string, focus: Focus | null, now: number): string | null {
  const c = clubhouse(state);
  if (!focus) {
    delete c.plans[id];
    clubNote(state, `${PLAYER_BY_ID[id].name}'s development plan ended.`);
    return null;
  }
  if (state.players[id]?.team !== state.userTeam) return "Only our own players.";
  if (age(state, id) > 26) return "Plans are for young players still growing into the game.";
  if (!c.plans[id] && Object.keys(c.plans).length >= MAX_PLANS) return `The staff can carry ${MAX_PLANS} plans at once.`;
  c.plans[id] = { focus, since: state.date, start: now };
  clubNote(state, `${PLAYER_BY_ID[id].name}: development plan set (${FOCUS[focus].label.toLowerCase()}).`);
  return null;
}

/** The position coach's read on a plan, from what he has seen (moves are small; this is a word, not a number). */
export function planWord(change: number, days: number): string {
  if (days < 21) return "Just started";
  const rate = change / Math.max(1, days / 30);
  return rate >= 0.35 ? "Clear progress" : rate >= 0.1 ? "Steady" : rate > -0.1 ? "Not moving yet" : "Going backward";
}

// ---- Position changes ----

/** Moves the coaches will consider, and how naturally each one tends to go (rating points, on average). */
export const CONVERSIONS: Partial<Record<Position, Partial<Record<Position, number>>>> = {
  CB: { S: 0 }, S: { CB: -1.5, LB: -1 }, LB: { EDGE: -1, S: -2 }, EDGE: { LB: -1, IDL: -1.5 }, IDL: { EDGE: -2, OG: -4 },
  OT: { OG: 0.5 }, OG: { C: -0.5, OT: -2 }, C: { OG: 0 }, WR: { TE: -3, RB: -2.5, CB: -4 }, TE: { WR: -2, FB: -0.5, OT: -5 },
  RB: { WR: -2.5, FB: -1 }, FB: { TE: -1, RB: -1.5 },
};

export function conversionsFor(state: GameState, id: string): Position[] {
  const from = state.players[id]?.retrain?.from ?? PLAYER_BY_ID[id].position;
  return Object.keys(CONVERSIONS[from] ?? {}) as Position[];
}

/** Moves a player to a new position (or back to his own with `to` null). */
export function retrain(state: GameState, id: string, to: Position | null): string | null {
  const ps = state.players[id];
  const data = PLAYER_BY_ID[id];
  if (ps?.team !== state.userTeam) return "Only our own players.";
  if (!to || to === (ps.retrain?.from ?? data.position)) {
    if (!ps.retrain) return null;
    delete ps.pos;
    delete ps.retrain;
    clubNote(state, `${data.name} moved back to ${data.position}.`);
    return null;
  }
  const from = ps.retrain?.from ?? data.position;
  const base = CONVERSIONS[from]?.[to];
  if (base === undefined) return `The coaches won't try ${data.name} at ${to}.`;
  const rng = rngFor(state.seed, `retrain:${id}:${to}`);
  const fit = Math.round((base + gaussian(rng) * 1.8) * 10) / 10;
  const drag = Math.round((4 + rng() * 4) * 10) / 10;
  ps.pos = to;
  ps.retrain = { from, since: state.date, drag, fit };
  clubNote(state, `${data.name} moved from ${from} to ${to}.`);
  return null;
}

/** What a position change costs or gives the player right now (engine only): learning the spot, and his fit there. */
export function retrainEffect(state: GameState, id: string): number {
  const r = state.players[id]?.retrain;
  return r ? r.fit - r.drag : 0;
}

/** The coaches' word on how a move is going. */
export function retrainWord(state: GameState, id: string): string {
  const r = state.players[id]?.retrain;
  if (!r) return "";
  const learning = r.drag > 4 ? "still learning the position" : r.drag > 1.5 ? "getting comfortable" : "settled in";
  // The coaches see how he suits the spot only once he has played it a while.
  const settled = r.drag <= 2.5;
  const fit = !settled ? "too early to judge the fit" : r.fit >= 1 ? "looks made for it" : r.fit >= -1 ? "a reasonable fit" : "not a natural fit";
  return `${learning}; ${fit}`;
}

/** Each week a player learning a new position gets a little more comfortable in it. */
function learnPositions(state: GameState): void {
  for (const [id, ps] of Object.entries(state.players)) {
    const r = ps.retrain;
    if (!r || r.drag <= 0) continue;
    const me = personality(id);
    const playbook = state.clubhouse?.plans[id]?.focus === "playbook" ? 0.05 : 0;
    r.drag = Math.max(0, Math.round(r.drag * (0.88 - 0.12 * me.learning - playbook) * 100) / 100);
  }
}

/** Once a month the position coaches report on the players with plans. */
function planReport(state: GameState): void {
  const c = clubhouse(state);
  const ids = Object.keys(c.plans).filter((id) => state.players[id]?.team === state.userTeam);
  for (const id of Object.keys(c.plans)) if (!ids.includes(id)) delete c.plans[id];
  if (!ids.length) return;
  const lines = ids.map((id) => {
    const plan = c.plans[id];
    const days = Math.round((Date.parse(state.date) - Date.parse(plan.since)) / 86_400_000);
    return `${PLAYER_BY_ID[id].name} (${posOf(state, id)}, ${FOCUS[plan.focus].label.toLowerCase()}): ${planWord(grownTo(state, id) - plan.start, days).toLowerCase()}.`;
  });
  const moved = Object.keys(state.players).filter((id) => state.players[id].team === state.userTeam && state.players[id].retrain)
    .map((id) => `${PLAYER_BY_ID[id].name} at ${posOf(state, id)}: ${retrainWord(state, id)}.`);
  send(state, "staff", `${teamStaff(state.userTeam).HC?.name ?? "Head coach"}, head coach`, "Development plans this month",
    [...lines, ...(moved.length ? ["", "Position changes:", ...moved] : [])].join("\n"));
}

/** Where a player is now, without the day-to-day of mood or rust (engine only). */
export function grownTo(state: GameState, id: string): number {
  return (HIDDEN_RATINGS[id]?.overall ?? 45) + (state.players[id]?.dev ?? 0);
}

export function trainingDaily(state: GameState): void {
  if (weekday(state.date) === "Tuesday") learnPositions(state);
  const K = RULES.keyDates;
  if (state.date.endsWith("-01") && state.date >= K.rosterCutdown && state.date <= K.superBowl) planReport(state);
}
