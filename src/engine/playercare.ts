// Players as individuals in the building: learning a new playbook, how each
// body answers the training programs, the wear of playing every snap, what a
// player weighs when he thinks about retiring, how players see the owner and
// the franchise, the club's named doctors, and a tool to compare a player
// with his contemporaries and with careers on file.
//
// Playbook: a player who joins a club starts part of the way into its
// playbook (faster learners and veterans further) and gains with each day of
// practice; until he knows it, he plays a little below himself, most at the
// positions that carry the most assignments. Fatigue: snaps pile up game to
// game and fade over the week; a player near every snap for weeks plays a
// shade worse and gets hurt a bit more. Both are small, and never shown.
// The physicians are made up, named from the shared lists.
import { careerLines } from "./careerstats";
import { personality } from "./clubhouse";
import { servicesScore } from "./community";
import { addDays, ageOn } from "./dates";
import { facilityPull } from "./facilities";
import { send } from "./inbox";
import { post } from "./business";
import { GAMES_BY_DATE, HIDDEN_RATINGS, PLAYER_BY_ID, RULES } from "./league";
import { changeMorale } from "./agents";
import { adopted } from "./analysts";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { gaussian, rngFor } from "./rng";
import { teamStaff } from "./staff";
import { ELITE, production } from "./honors";
import { cutQuality, invested } from "./treasury";
import type { GameState, Position } from "./types";

export interface Physician { name: string; role: "physician" | "orthopedist" | "trainer" | "rehab"; skill: number; since: number }

export interface CareState {
  /** Playbook knowledge for players new to their club: team and share learned (absent: knows it). */
  playbook: Record<string, { team: string; know: number }>;
  /** Snap load from recent games (1 = about a full game's snaps, fading over the week). */
  load: Record<string, number>;
  /** Our medical staff by name. */
  doctors: Physician[];
  /** Last team seen for each player, to notice arrivals. */
  seen: Record<string, string>;
}

const ROLE_LABEL: Record<Physician["role"], string> = { physician: "Head team physician", orthopedist: "Orthopedic surgeon", trainer: "Head athletic trainer", rehab: "Director of rehabilitation" };
export { ROLE_LABEL as DOCTOR_ROLE };

function doctor(state: GameState, role: Physician["role"], n = 0): Physician {
  const rng = rngFor(state.seed, `doctor:${role}:${n}`);
  return { name: `Dr. ${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`.replace(/^Dr\. (.*)$/, role === "trainer" || role === "rehab" ? "$1" : "Dr. $1"), role, skill: Math.round(50 + rng() * 35), since: RULES.season - Math.floor(rng() * 10) };
}

export function care(state: GameState): CareState {
  return (state.care ??= { playbook: {}, load: {}, doctors: (["physician", "orthopedist", "trainer", "rehab"] as const).map((r) => doctor(state, r)), seen: {} });
}

// ---- Playbook ----

/** How much of a playbook each position has to carry. */
const ASSIGNMENTS: Partial<Record<Position, number>> = { QB: 1, C: 0.8, OG: 0.6, OT: 0.6, LB: 0.8, S: 0.8, CB: 0.5, WR: 0.6, TE: 0.7, RB: 0.4, FB: 0.4, EDGE: 0.35, IDL: 0.3 };

/** Where a newcomer starts: quicker learners and veterans who have seen more systems start further in. */
function startingKnow(id: string, exp: number): number {
  return Math.min(0.85, 0.35 + 0.3 * personality(id).learning + 0.1 * Math.min(1, exp / 6));
}

/** Rating points a player plays below himself, from a playbook he hasn't learned and from fatigue (engine only). */
export function careDrag(state: GameState, id: string): number {
  const c = state.care;
  if (!c) return 0;
  let d = 0;
  const pb = c.playbook[id];
  if (pb) d += (1 - pb.know) * 6 * (ASSIGNMENTS[PLAYER_BY_ID[id]?.position ?? "K"] ?? 0);
  const load = c.load[id] ?? 0;
  if (load > 1.2) d += (load - 1.2) * 4;
  return d;
}

/** Injury risk from piled-up snaps (1 = none). */
export function fatigueRisk(state: GameState, id: string): number {
  const load = state.care?.load[id] ?? 0;
  return load > 1.2 ? 1 + (load - 1.2) * 0.3 : 1;
}

/** Words for the owner's view: how far into the playbook, and whether the snaps are piling up. */
export function careNote(state: GameState, id: string): string | null {
  const c = state.care;
  if (!c) return null;
  const bits: string[] = [];
  const pb = c.playbook[id];
  if (pb && pb.team === state.players[id]?.team) bits.push(pb.know < 0.6 ? "Still learning the playbook; the coaches keep his assignments simple." : "Getting comfortable in the playbook.");
  if ((c.load[id] ?? 0) > 1.25) bits.push("Has played almost every snap for weeks; the trainers want to manage his load.");
  return bits.length ? bits.join(" ") : null;
}

// ---- Training response ----

/**
 * How a player's body answers the strength and conditioning work, around 1
 * (engine only). Some gain fast from the same program; others barely move.
 */
export function trainingResponse(state: GameState, id: string): number {
  return Math.max(0.7, Math.min(1.3, 1 + gaussian(rngFor(state.seed, `response:${id}`)) * 0.12));
}

/** The strength coach's line on a player's response, once he has had a few weeks with him. */
export function responseNote(state: GameState, id: string): string {
  const r = trainingResponse(state, id);
  return r >= 1.12 ? "Responds well to the program: gains faster than most." : r <= 0.88 ? "Slow to respond to the program; the staff is trying a different plan." : "Responds to the program about as expected.";
}

// ---- Retirement ----

/** Whether he has a young family at home, by age (engine only, fixed for the career). */
function family(state: GameState, id: string, age: number): boolean {
  return rngFor(state.seed, `family:${id}`)() < Math.min(0.85, Math.max(0.1, (age - 22) * 0.08));
}

/** Career earnings, roughly: the contracts on file and those signed in this save. */
function earnings(state: GameState, id: string): number {
  const c = PLAYER_BY_ID[id]?.contract;
  const before = (c?.apy ?? 0) * Math.max(1, (PLAYER_BY_ID[id]?.yearsExp ?? 1) * 0.7);
  return before + state.signings.filter((s) => s.player === id).reduce((t, s) => t + s.total, 0);
}

/**
 * What a player weighs when he thinks about retiring, beyond age, health and
 * ability: money in the bank (secure players walk away sooner; those without
 * it hang on), a young family, and how much football is who he is.
 */
export function retirementLean(state: GameState, id: string, age: number): { factor: number; reasons: string[] } {
  const reasons: string[] = [];
  let f = 1;
  const money = earnings(state, id);
  if (money >= 60_000_000) { f *= 1.2; reasons.push("financially secure"); }
  else if (money < 5_000_000) { f *= 0.8; reasons.push("needs the paychecks"); }
  if (age >= 29 && family(state, id, age)) { f *= 1.15; reasons.push("a young family at home"); }
  const me = personality(id);
  if (me.work >= 0.62) { f *= 0.85; reasons.push("football is who he is"); }
  return { factor: f, reasons };
}

// ---- How players see the owner and the club ----

/**
 * The owner's standing with players, 0 to 100: the buildings, the services,
 * how players are treated (fines and public criticism hurt), and how often
 * the owner reaches into football decisions.
 */
let standingCache: { key: string; v: { score: number; parts: [string, number][] } } | null = null;

export function ownerStanding(state: GameState): { score: number; parts: [string, number][] } {
  const key = `${state.id}:${state.date}`;
  if (standingCache?.key === key) return standingCache.v;
  const v = computeStanding(state);
  standingCache = { key, v };
  return v;
}

function computeStanding(state: GameState): { score: number; parts: [string, number][] } {
  const facilities = 50 + facilityPull(state) * 1200;
  const services = servicesScore(state) * 10;
  const year = `${RULES.season}`;
  const trail = state.office?.trail ?? [];
  const meddling = trail.filter((t) => t.by === "Owner" && t.date >= `${Number(year) - 1}` && /coaching|roster|depth|cut|trade/i.test(t.area)).length;
  const interference = Math.max(0, 70 - meddling * 4);
  const hits = state.inbox.filter((m) => m.kind === "media" && m.date >= `${Number(year) - 1}` && /owner/i.test(m.title) && /critic|ripped|blast|questions/i.test(m.title + m.body)).length;
  const treatment = Math.max(20, 70 - hits * 6);
  const parts: [string, number][] = [["Facilities", facilities], ["Player services", services], ["Treatment", treatment], ["Leaves football to the football people", interference]];
  const score = Math.round(Math.max(0, Math.min(100, parts.reduce((t, [, v]) => t + v, 0) / parts.length)));
  return { score, parts: parts.map(([k, v]) => [k, Math.round(Math.max(0, Math.min(100, v)))]) };
}

/**
 * A franchise's reputation with players, 0 to 1: stability at head coach and
 * GM, the medical staff, the buildings, and fair treatment. Players who value
 * loyalty and stability lean toward the well-run clubs in free agency.
 */
export function franchiseReputation(state: GameState, team: string): number {
  const staff = teamStaff(team);
  const tenure = (p?: { hiredYear?: number }) => Math.min(6, Math.max(0, RULES.season - (p?.hiredYear ?? RULES.season)));
  const stability = (tenure(staff.HC as { hiredYear?: number }) + tenure(staff.GM as { hiredYear?: number })) / 12;
  if (team !== state.userTeam) return 0.4 + stability * 0.2;
  const medical = ((state.business?.budget.medical ?? 1) / 3) * 0.6 + (care(state).doctors.reduce((t, d) => t + d.skill, 0) / care(state).doctors.length - 50) / 70 * 0.4;
  const standing = ownerStanding(state).score / 100;
  return Math.max(0, Math.min(1, 0.25 + stability * 0.2 + medical * 0.2 + standing * 0.35));
}

// ---- The doctors ----

/** How much sharper our doctors make each diagnosis (multiplies the spread of first estimates). */
export function diagnosisFactor(state: GameState): number {
  const d = state.care?.doctors;
  if (!d) return 1;
  const lead = d.filter((x) => x.role === "physician" || x.role === "orthopedist");
  const skill = lead.reduce((t, x) => t + x.skill, 0) / Math.max(1, lead.length);
  return Math.max(0.65, Math.min(1.25, 1.2 - (skill - 40) / 150)) * (state.analysts?.feeds.injury ? 0.93 : 1);
}

/** Days of rehab the rehab director and trainer take off a long injury (or add), as a share. */
export function rehabFactor(state: GameState): number {
  const d = state.care?.doctors;
  if (!d) return 1;
  const r = d.filter((x) => x.role === "rehab" || x.role === "trainer");
  const skill = r.reduce((t, x) => t + x.skill, 0) / Math.max(1, r.length);
  // New equipment shortens long rehabs a little; a cut medical staff stretches them.
  return Math.max(0.9, Math.min(1.08, 1.06 - (skill - 40) / 400)) * (invested(state, "medicalEquip") ? 0.97 : 1) * (2 - cutQuality(state, "medical"));
}

export const DOCTOR_COST = 400_000;

/** Replaces one of the medical staff with a candidate from the search (costs a buyout and search fee). */
export function replaceDoctor(state: GameState, role: Physician["role"]): Physician {
  const c = care(state);
  const n = c.doctors.filter((d) => d.role === role).length + Object.keys(c.seen).length % 97 + RULES.season;
  const fresh = doctor(state, role, n);
  c.doctors = [...c.doctors.filter((d) => d.role !== role), { ...fresh, since: RULES.season }];
  if (state.business) post(state, "medical", -DOCTOR_COST, `Medical staff change: ${ROLE_LABEL[role].toLowerCase()}`);
  return fresh;
}

// ---- Comparisons ----

export interface Comparable { id: string; age: number; seasons: number; perSeason: number; note: string }

/**
 * Players like this one: contemporaries at his position within two years of
 * his age, and careers on file at the same age, by production per season.
 */
export function comparables(state: GameState, id: string, count = 5): { contemporaries: Comparable[]; pace: Comparable[] } {
  const p = PLAYER_BY_ID[id];
  if (!p) return { contemporaries: [], pace: [] };
  const age = ageOn(p.birthDate, state.date) ?? 26;
  const perSeason = (pid: string, upToAge?: number) => {
    const born = Number((PLAYER_BY_ID[pid].birthDate ?? "1995").slice(0, 4));
    const rows = careerLines(state, pid).filter((s) => Number(s.g ?? 0) > 0 && (upToAge === undefined || s.season - born <= upToAge));
    const seasons = new Set(rows.map((r) => r.season)).size;
    const v = rows.reduce((t, r) => t + Math.max(0, production(PLAYER_BY_ID[pid].position, r as unknown as Record<string, number>)), 0) / ELITE[PLAYER_BY_ID[pid].position];
    return { seasons, per: seasons ? v / seasons : 0 };
  };
  const me = perSeason(id);
  const others = Object.values(PLAYER_BY_ID).filter((x) => x.id !== id && x.position === p.position && HIDDEN_RATINGS[x.id]);
  const contemporaries = others
    .map((x) => ({ x, a: ageOn(x.birthDate, state.date) ?? 26 }))
    .filter(({ a }) => Math.abs(a - age) <= 2)
    .map(({ x, a }) => { const r = perSeason(x.id); return { id: x.id, age: a, seasons: r.seasons, perSeason: Math.round(r.per * 100) / 100, note: "" }; })
    .filter((c) => c.seasons > 0)
    .sort((a, b) => Math.abs(a.perSeason - me.per) - Math.abs(b.perSeason - me.per))
    .slice(0, count);
  const pace = others
    .map((x) => ({ x, a: ageOn(x.birthDate, state.date) ?? 26 }))
    .filter(({ a }) => a >= age + 4)
    .map(({ x, a }) => {
      const then = perSeason(x.id, age);
      const all = perSeason(x.id);
      return { id: x.id, age: a, seasons: then.seasons, perSeason: Math.round(then.per * 100) / 100, note: `then ${all.seasons} seasons at ${all.per.toFixed(2)} a season` };
    })
    .filter((c) => c.seasons >= Math.max(1, me.seasons - 1))
    .sort((a, b) => Math.abs(a.perSeason - me.per) - Math.abs(b.perSeason - me.per))
    .slice(0, count);
  return { contemporaries, pace };
}

// ---- Daily ----

export function careDaily(state: GameState): void {
  const c = care(state);
  const K = RULES.keyDates;
  // Arrivals: a player on a new club (or a rookie on his first) starts learning its playbook.
  const first = !Object.keys(c.seen).length;
  for (const [id, p] of Object.entries(state.players)) {
    if (!p.team || p.status === "fa" || p.status === "retired") continue;
    const was = c.seen[id];
    if (was !== p.team) {
      const exp = p.exp ?? PLAYER_BY_ID[id]?.yearsExp ?? 0;
      if (!first && (was || exp === 0)) c.playbook[id] = { team: p.team, know: startingKnow(id, exp) };
      c.seen[id] = p.team;
    }
  }
  // Practice days teach it: camp, the season, and the spring program.
  const practicing = state.date >= addDays(K.rosterCutdown, -35) && state.date <= K.superBowl || state.date >= addDays(K.draftStart, 20) && state.date <= addDays(K.draftStart, 55);
  if (practicing) {
    for (const [id, pb] of Object.entries(c.playbook)) {
      if (state.players[id]?.team !== pb.team) { delete c.playbook[id]; continue; }
      pb.know = Math.min(1, pb.know + 0.012 * (0.6 + personality(id).learning));
      if (pb.know >= 0.98) delete c.playbook[id];
    }
  }
  // Snap load: today's games add to it; every day it fades.
  for (const id of Object.keys(c.load)) {
    c.load[id] *= 0.93;
    if (c.load[id] < 0.05) delete c.load[id];
  }
  for (const g of GAMES_BY_DATE[state.date] ?? []) {
    const box = state.box[g.id];
    if (!box || g.type === "PRE") continue;
    for (const side of ["away", "home"] as const) {
      for (const [id, v] of Object.entries(box.players[side])) {
        const snaps = (v[0] ?? 0) + (v[1] ?? 0);
        if (snaps < 20) continue;
        c.load[id] = (c.load[id] ?? 0) * 0.5 + snaps / 65;
      }
    }
  }
  if (state.date === K.superBowl) c.load = {};
  // The doctors' yearly review lands with the owner when camp opens.
  if (state.date === addDays(K.rosterCutdown, -35)) {
    const lead = c.doctors.find((d) => d.role === "physician");
    send(state, "staff", lead ? `${lead.name}, head team physician` : "Medical staff", "Medical staff ready for camp",
      `${c.doctors.map((d) => `${ROLE_LABEL[d.role]}: ${d.name}`).join(". ")}. We're ready for camp. Players' standing with the club: ${ownerStanding(state).score} of 100 by our read of the locker room.`);
  }
  // How players feel about the owner seeps into the room, a little each week.
  if (state.date.endsWith("-01") || state.date.endsWith("-15")) {
    const drift = (ownerStanding(state).score - 55) / 100 + adopted(state, "services") * 2;
    if (Math.abs(drift) >= 0.05) for (const [id, p] of Object.entries(state.players)) if (p.team === state.userTeam && p.status === "active") changeMorale(state, id, drift * 2);
  }
}
