// Tactics the game sim reads on top of schemes and game plans: protection
// calls against the blitz, defenses keying on what an offense has shown,
// poise in the moments that decide games, each club's special teams plan,
// and the ideas teams invent that the league later copies.
//
// Every effect here is centered so a league of average teams scores the
// same as before: a good protection call costs the rush what a busted one
// gives it, a defense that guesses right gains what one that guesses wrong
// gives up, and poise runs both ways around zero.
import { rngFor, gaussian } from "./rng";
import { PLAYER_BY_ID, RULES, TEAMS } from "./league";
import { staffEffects } from "./staff";
import type { GameState } from "./types";

// ---- Tendencies ----

/** Situations an offense is scouted by: down and distance, and personnel. */
export function tendencyBucket(down: number, dist: number, personnel: string): string {
  const dd = down === 1 ? "1" : down === 2 ? (dist <= 3 ? "2s" : dist >= 8 ? "2l" : "2m") : dist <= 3 ? "3s" : "3l";
  return `${dd}:${personnel}`;
}

/** Share of passes an offense has called in a situation, and how many plays it has shown there. */
export function tendency(seen: Record<string, [number, number]>, bucket: string): { pass: number; n: number } {
  const [p, n] = seen[bucket] ?? [0, 0];
  return { pass: n ? p / n : 0.5, n };
}

/**
 * The offensive coordinator's self-scout: when he's become predictable in a
 * situation, a good one breaks the tendency a little. Returns the change to
 * the pass probability.
 */
export function selfScout(seen: Record<string, [number, number]>, bucket: string, offCalling: number): number {
  const t = tendency(seen, bucket);
  if (t.n < 6) return 0;
  const lean = t.pass - 0.5;
  if (Math.abs(lean) < 0.2) return 0;
  const k = Math.max(0, Math.min(0.25, (offCalling - 55) / 120));
  return -lean * k;
}

/**
 * Whether the defense keys on the tendency this snap, and if so whether it
 * guessed right: -1 the defense sat on the play (bad for the offense), +1 it
 * guessed wrong, 0 it played it straight. Better defensive play-callers key
 * more often, once there are enough plays to read.
 */
export function defensiveRead(seen: Record<string, [number, number]>, bucket: string, defCalling: number, isPass: boolean, roll: number, roll2: number): -1 | 0 | 1 {
  const t = tendency(seen, bucket);
  if (t.n < 5) return 0;
  const lean = Math.abs(t.pass - 0.5);
  if (lean < 0.12) return 0;
  const keyP = Math.max(0.08, Math.min(0.5, 0.22 + (defCalling - 65) * 0.01)) * Math.min(1, (t.n - 4) / 10);
  if (roll >= keyP) return 0;
  // A defense that keys takes the side the offense has favored; mixing the two keeps it honest.
  const guessPass = roll2 < 0.5 + lean * 0.8 ? t.pass >= 0.5 : t.pass < 0.5;
  return guessPass === isPass ? -1 : 1;
}

// ---- Protection ----

/**
 * The protection call against a blitz: the quarterback and center identify
 * the extra rusher and the backs pick him up, or they miss and he comes free.
 * Returns the chance the call is right.
 */
export function pickupChance(qbDecisions: number, centerBlock: number, backBlock: number, offCalling: number): number {
  return Math.max(0.25, Math.min(0.85, 0.55 + (qbDecisions - 80) * 0.012 + (centerBlock - 80) * 0.004 + (backBlock - 75) * 0.003 + (offCalling - 70) * 0.004));
}

/** Pressure added by a blitz: little when it's picked up, a lot when a rusher comes free. Averages the old flat 9%. */
export function blitzPressure(pickedUp: boolean): number {
  return pickedUp ? 0.035 : 0.16;
}

/** Chance the line slides toward its weakest matchup, or a back chips the best rusher. */
export function slideChance(offCalling: number): number {
  return Math.max(0.15, Math.min(0.6, 0.35 + (offCalling - 70) * 0.01));
}

// ---- Poise ----

/**
 * How a player handles the moments that decide games, around zero: a little
 * temperament (engine only, fixed for the career), plenty of experience, and
 * the week's preparation. Never shown; it only moves results in those moments.
 */
export function poise(state: GameState, id: string, prep = 0): number {
  const temperament = gaussian(rngFor(state.seed, `poise:${id}`)) * 0.6;
  const exp = Math.min(1, (state.players[id]?.exp ?? PLAYER_BY_ID[id]?.yearsExp ?? 0) / 8);
  return temperament + exp * 0.5 - 0.22 + prep * 0.25;
}

/** A moment that decides games: the last five minutes of a one-score game, overtime, or a late playoff game. */
export function bigMoment(q: number, clock: number, lead: number, ot: boolean, playoff: boolean): boolean {
  if (ot) return true;
  if (q >= 4 && clock < 300 && Math.abs(lead) <= 8) return true;
  return playoff && q >= 4 && Math.abs(lead) <= 10;
}

// ---- Special teams plans ----

export type ReturnPlan = "aggressive" | "balanced" | "safe";
export type PuntPlan = "distance" | "directional";
export interface StPlan { returns: ReturnPlan; punts: PuntPlan }

export const RETURN_LABEL: Record<ReturnPlan, string> = {
  aggressive: "Attack: return everything and hunt for the big one (more fumbles)",
  balanced: "Balanced",
  safe: "Ball security: fair catches and safe returns",
};
export const PUNT_LABEL: Record<PuntPlan, string> = {
  distance: "Hit it for distance",
  directional: "Directional: shorter, aimed at the sideline to limit returns",
};

/** A club's special teams plan: the owner's coaches set ours (coachroom.ts); others follow their coordinator. */
export function stPlan(state: GameState, team: string): StPlan {
  if (team === state.userTeam && state.coachRoom?.st) return state.coachRoom.st;
  const rng = rngFor(state.seed, `st:${RULES.season}:${team}`);
  const st = staffEffects(team).specialTeams;
  const r = rng();
  const returns: ReturnPlan = st >= 78 && r < 0.4 ? "aggressive" : st < 62 && r < 0.4 ? "safe" : "balanced";
  return { returns, punts: rng() < 0.35 + (st - 70) * 0.01 ? "directional" : "distance" };
}

/** Return yards, big-play and fumble multipliers for a return plan. */
export function returnShape(p: ReturnPlan): { yards: number; burst: number; fumble: number } {
  return p === "aggressive" ? { yards: 2, burst: 1.3, fumble: 1.5 } : p === "safe" ? { yards: -1.5, burst: 0.7, fumble: 0.65 } : { yards: 0, burst: 1, fumble: 1 };
}

// ---- Innovation ----

export interface Innovation { team: string; kind: "pass" | "run"; season: number; edge: number; idea: string }

const IDEAS = {
  pass: ["a condensed-formation passing game with constant motion", "a quick-game system built on option routes", "two-tight-end play action from under center", "a spread attack with an empty backfield"],
  run: ["a gap-scheme run game with pulling tackles", "a quarterback-run package with a sixth lineman", "wide-zone runs from pistol sets", "a duo-and-counter run game out of heavy sets"],
};

/**
 * At each rollover a few clubs with inventive offensive coaches come up with
 * something new: a real edge in its first season, smaller as defenses study
 * it and other offenses copy it, gone after three seasons.
 */
export function innovate(state: GameState, season: number): Innovation[] {
  const list = (state.analytics?.innovations ?? []).filter((x) => season - x.season < 3);
  const rng = rngFor(state.seed, `innovate:${season}`);
  const ranked = TEAMS.map((t) => ({ id: t.id, v: staffEffects(t.id).offCalling + rng() * 25 })).sort((a, b) => b.v - a.v);
  for (const t of ranked.slice(0, 3)) {
    if (list.some((x) => x.team === t.id) || rng() > 0.6) continue;
    const kind = rng() < 0.6 ? "pass" : "run";
    const ideas = IDEAS[kind];
    list.push({ team: t.id, kind, season, edge: 1.2 + rng() * 1.3, idea: ideas[Math.floor(rng() * ideas.length)] });
  }
  return list;
}

/** The edge an innovation still gives in a season, against a given defense (good coordinators solve it sooner). */
export function innovationEdge(state: GameState, team: string, kind: "pass" | "run", defCalling: number): number {
  let edge = 0;
  for (const x of state.analytics?.innovations ?? []) {
    if (x.team !== team || x.kind !== kind) continue;
    const age = RULES.season - x.season;
    if (age < 0 || age > 2) continue;
    edge += x.edge * [1, 0.5, 0.2][age] * Math.max(0.3, 1 - (defCalling - 60) / 60);
  }
  return edge;
}
