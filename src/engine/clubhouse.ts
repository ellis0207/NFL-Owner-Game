// The locker room: who the players are as people, and how they get along.
//
// Every player has a few lasting traits nobody sees as numbers: how quickly
// he learns, how professional he is, how much the room listens to him, and
// how easily he carries himself in public. They come from the save's world
// seed, so the same player is the same person in every save.
//
// Chemistry is the team's working familiarity: how many of the key players
// were here last year, whether there are veterans the room follows, whether
// people are happy and present. It moves slowly and matters a little: a close
// team plays a fraction cleaner, never enough to cover a talent gap.
//
// Veterans mentor young players at their position, which helps them grow.
// Coaches build trust in the players they work with: good play, showing up
// and the head coach's own leadership raise it, sulking and holdouts cost it,
// and a new head coach starts everyone over. Players the coaches trust get
// the benefit of the doubt in depth chart calls. Players who were paid or
// drafted to start notice when they don't, and say so.
import { agentFor, changeMorale } from "./agents";
import { dealOf } from "./contracts";
import { addDays, weekday } from "./dates";
import { send } from "./inbox";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { rngFor } from "./rng";
import { depthChart } from "./roster";
import { teamPlayerIds } from "./cap";
import { staffEffects, teamStaff } from "./staff";
import { stat } from "./stats";
import type { GameState, Position } from "./types";
import type { DevPlan, Programs } from "./training";
import type { Policy } from "./medical";
import { liveIds } from "./live";

/** The world seed: a player's character does not depend on the save. */
const WORLD = 20260728;

export interface Personality {
  /** How fast he picks up coaching and concepts, 0 to 1 (0.5 is typical). */
  learning: number;
  /** Preparation, discipline and how well he takes coaching. */
  work: number;
  /** How much the room follows him once he has the standing. */
  leadership: number;
  /** Ease in public: interviews, endorsements, a following. */
  presence: number;
}

export interface ClubhouseState {
  /** Team chemistry, 0 to 100, by team. */
  chem: Record<string, number>;
  /** The key players each team had at the end of last season, for continuity. */
  core: Record<string, string[]>;
  /** How much each player's coaches trust him, 0 to 100 (50 is a fresh start). */
  trust: Record<string, number>;
  /** The head coach each team's trust was built under. */
  trustHc: Record<string, string>;
  /** Our players' weeks in a row out of the role they expect, and who has spoken up this season. */
  roleWeeks: Record<string, number>;
  roleSpoke: string[];
  /** Our training and medical programs (training.ts). */
  programs: Programs;
  /** Individual development plans for our players (training.ts). */
  plans: Record<string, DevPlan>;
  /** Injury insurance on our players' salaries (medical.ts). */
  policies: Record<string, Policy>;
  log: { date: string; text: string }[];
}

export function clubhouse(state: GameState): ClubhouseState {
  return (state.clubhouse ??= {
    chem: {}, core: {}, trust: {}, trustHc: {}, roleWeeks: {}, roleSpoke: [],
    programs: { strength: 1, nutrition: true, mental: true, equipment: 0, field: 0, workload: "normal", restVets: false },
    plans: {}, policies: {}, log: [],
  });
}

export function ensureClubhouse(state: GameState): void {
  const c = clubhouse(state);
  c.policies ??= {};
  c.plans ??= {};
  for (const t of Object.keys(TEAM_BY_ID)) c.chem[t] ??= baseChemistry(state, t);
}

export function clubNote(state: GameState, text: string): void {
  const c = clubhouse(state);
  c.log.unshift({ date: state.date, text });
  if (c.log.length > 80) c.log.length = 80;
}

const personalities = new Map<string, Personality>();

/** A player's lasting character (engine only; the owner hears it as words from the staff). */
export function personality(id: string): Personality {
  let p = personalities.get(id);
  if (p) return p;
  const rng = rngFor(WORLD, `person:${id}`);
  // Sums of uniforms: most people are near the middle, a few far from it.
  const v = () => (rng() + rng() + rng()) / 3;
  const pos = PLAYER_BY_ID[id]?.position;
  p = { learning: v(), work: v(), leadership: Math.min(1, v() + (pos === "QB" ? 0.08 : pos === "C" || pos === "LB" ? 0.04 : 0)), presence: v() };
  personalities.set(id, p);
  return p;
}

function experience(state: GameState, id: string): number {
  return state.players[id]?.exp ?? PLAYER_BY_ID[id]?.yearsExp ?? 0;
}

/** The position a player lines up at, after any move by the coaches. */
export function posOf(state: GameState, id: string): Position {
  return state.players[id]?.pos ?? PLAYER_BY_ID[id].position;
}

// ---- Leaders and mentors ----

/** Players the room follows: veterans with standing and the character for it, best first. */
export function leaders(state: GameState, team: string): string[] {
  const out: { id: string; v: number }[] = [];
  for (const id of teamPlayerIds(state, team)) {
    const ps = state.players[id];
    if (ps.status !== "active" && ps.status !== "ir") continue;
    const yrs = experience(state, id);
    if (yrs < 4) continue;
    const v = personality(id).leadership + Math.min(0.15, yrs * 0.015) + (ps.holdout ? -0.3 : 0) + ((ps.morale ?? 70) < 45 ? -0.15 : 0);
    if (v >= 0.66) out.push({ id, v });
  }
  return out.sort((a, b) => b.v - a.v).slice(0, 6).map((x) => x.id);
}

const GROUP: Record<Position, string> = {
  QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", OT: "OL", OG: "OL", C: "OL",
  EDGE: "DL", IDL: "DL", LB: "LB", CB: "DB", S: "DB", K: "ST", P: "ST", LS: "ST",
};

/** Young players paired with a veteran in their position room: [mentor, pupil]. */
export function mentors(state: GameState, team: string): [string, string][] {
  const ids = teamPlayerIds(state, team).filter((id) => state.players[id].status === "active");
  const vets = ids.filter((id) => experience(state, id) >= 5 && personality(id).leadership + personality(id).work >= 1.2 && !state.players[id].holdout);
  const out: [string, string][] = [];
  const used = new Map<string, number>();
  for (const id of ids) {
    if (experience(state, id) > 1) continue;
    const g = GROUP[posOf(state, id)];
    const m = vets.find((v) => GROUP[posOf(state, v)] === g && !used.has(v));
    if (!m) continue;
    used.set(m, (used.get(m) ?? 0) + 1);
    out.push([m, id]);
  }
  return out;
}

/** Whether a young player has a veteran looking after him. */
export function mentorOf(state: GameState, id: string): string | undefined {
  const p = state.players[id];
  if (!p?.team) return undefined;
  return mentors(state, p.team).find(([, y]) => y === id)?.[0];
}

// ---- Chemistry ----

/** Starters by the coaches' depth chart, for continuity and roles. */
const STARTERS: [Position, number][] = [["QB", 1], ["RB", 1], ["WR", 3], ["TE", 1], ["OT", 2], ["OG", 2], ["C", 1], ["EDGE", 2], ["IDL", 2], ["LB", 2], ["CB", 3], ["S", 2]];

export function starters(state: GameState, team: string): string[] {
  const c = depthChart(state, team);
  return STARTERS.flatMap(([pos, n]) => c[pos].slice(0, n));
}

/** A new save: rosters are as they are, so continuity is about average. */
function baseChemistry(state: GameState, team: string): number {
  const rng = rngFor(state.seed, `chem0:${team}`);
  return Math.round(52 + rng() * 16);
}

/** What the room should settle toward this week. */
function targetChemistry(state: GameState, team: string): number {
  const c = clubhouse(state);
  const core = c.core[team];
  const now = starters(state, team);
  const continuity = core?.length ? now.filter((id) => core.includes(id)).length / Math.max(1, now.length) : 0.7;
  const lead = leaders(state, team);
  const roster = teamPlayerIds(state, team).filter((id) => state.players[id].status === "active");
  const mood = roster.reduce((s, id) => s + (state.players[id].morale ?? 70), 0) / Math.max(1, roster.length);
  const holdouts = roster.filter((id) => state.players[id].holdout).length;
  const hc = staffEffects(team).leadership;
  return Math.max(15, Math.min(95,
    30 + 30 * continuity + Math.min(4, lead.length) * 3.5 + (mood - 65) * 0.6 + (hc - 70) * 0.25 - holdouts * 5));
}

/** A word for the room's chemistry. */
export function chemistryWord(v: number): string {
  return v >= 75 ? "Close-knit" : v >= 62 ? "Together" : v >= 48 ? "Ordinary" : v >= 35 ? "Fraying" : "Divided";
}

/** The snap-by-snap edge chemistry gives a team in the sim: small by design. */
export function chemistryEdge(state: GameState, team: string): number {
  const v = state.clubhouse?.chem[team];
  if (v === undefined) return 0;
  return Math.max(-0.4, Math.min(0.4, (v - 60) / 40 * 0.35));
}

// ---- Coach trust ----

export function trustOf(state: GameState, id: string): number {
  return state.clubhouse?.trust[id] ?? 50;
}

/** What the coaches' trust adds to their read of a player for depth chart calls. */
export function trustNudge(state: GameState, id: string): number {
  const t = state.clubhouse?.trust[id];
  return t === undefined ? 0 : (t - 50) * 0.04;
}

export function trustWord(v: number): string {
  return v >= 75 ? "The coaches lean on him" : v >= 60 ? "Trusted by the coaches" : v >= 42 ? "Still earning the coaches' trust" : "In the coaches' doghouse";
}

function bump(c: ClubhouseState, id: string, d: number): void {
  c.trust[id] = Math.max(0, Math.min(100, Math.round(((c.trust[id] ?? 50) + d) * 10) / 10));
}

/** Last week's snaps and play value by player. */
function lastWeek(state: GameState): Map<string, { snaps: number; epa: number; to: number }> {
  const out = new Map<string, { snaps: number; epa: number; to: number }>();
  for (let i = 1; i <= 7; i++) {
    for (const g of GAMES_BY_DATE[addDays(state.date, -i)] ?? []) {
      const box = state.box[g.id];
      if (!box || g.type === "PRE") continue;
      for (const side of ["away", "home"] as const) {
        for (const [id, v] of Object.entries(box.players[side])) {
          const snaps = stat(v, "offSnaps") + stat(v, "defSnaps");
          out.set(id, { snaps, epa: 0, to: stat(v, "int") + stat(v, "fumLost") });
        }
      }
      for (const [key, [, epa]] of Object.entries(box.pe ?? {})) {
        const r = out.get(key.slice(2));
        if (r) r.epa += epa;
      }
    }
  }
  return out;
}

function weeklyTrust(state: GameState): void {
  const c = clubhouse(state);
  const week = lastWeek(state);
  for (const team of Object.keys(TEAM_BY_ID)) {
    const hc = teamStaff(team).HC?.id ?? "";
    const fresh = c.trustHc[team] !== hc;
    c.trustHc[team] = hc;
    const hcLead = (staffEffects(team).leadership - 70) / 100;
    for (const id of teamPlayerIds(state, team)) {
      const ps = state.players[id];
      if (fresh) c.trust[id] = 50 + ((c.trust[id] ?? 50) - 50) * 0.25;
      let d = ((c.trust[id] ?? 50) - 50) * -0.02;
      const w = week.get(id);
      if (w && w.snaps >= 10) d += 0.6 + Math.max(-2, Math.min(2, w.epa * 0.25)) - w.to * 0.8;
      if (ps.holdout) d -= 2.5;
      if ((ps.morale ?? 70) < 40) d -= 0.6;
      d += (personality(id).work - 0.5) * 0.8 + hcLead * 0.5;
      bump(c, id, d);
    }
  }
}

// ---- Roles ----

/** Whether a player came here expecting to start: a big contract or a first-round pick early in his deal. */
export function expectsToStart(state: GameState, id: string): boolean {
  const p = PLAYER_BY_ID[id];
  const deal = dealOf(state, id);
  if ((deal?.apy ?? 0) >= 0.025 * RULES.salaryCap) return true;
  return p.draft.round === 1 && p.draft.team === state.players[id].team && experience(state, id) >= 1 && experience(state, id) <= 3;
}

function weeklyRoles(state: GameState): void {
  const c = clubhouse(state);
  const team = state.userTeam;
  const start = new Set(starters(state, team));
  for (const id of teamPlayerIds(state, team)) {
    const ps = state.players[id];
    if (ps.status !== "active" || ps.injury || [posOf(state, id)].some((p) => p === "K" || p === "P" || p === "LS")) {
      delete c.roleWeeks[id];
      continue;
    }
    if (!expectsToStart(state, id) || start.has(id)) {
      delete c.roleWeeks[id];
      continue;
    }
    const n = (c.roleWeeks[id] = (c.roleWeeks[id] ?? 0) + 1);
    if (n >= 2) changeMorale(state, id, -1.5);
    if (n === 3 && !c.roleSpoke.includes(id)) {
      c.roleSpoke.push(id);
      const p = PLAYER_BY_ID[id];
      send(state, "staff", `${agentFor(id).name}, agent`, `${p.name} wants a bigger role`,
        `${p.name} came here to start and has been a backup for three weeks. He isn't asking to leave, but he wants to know where he stands. ` +
        "The coaches make the depth chart; if he stays behind someone, expect his mood to slide.");
      clubNote(state, `${p.name} asked about his role.`);
    }
  }
}

// ---- Marketability ----

/** How much outside interest a player draws: from his position, his pay and play, and how he carries himself. */
export function marketability(state: GameState, id: string): number {
  const p = PLAYER_BY_ID[id];
  if (!p) return 0;
  const posWeight = { QB: 1, WR: 0.75, RB: 0.7, TE: 0.6, EDGE: 0.6, CB: 0.5, S: 0.45, LB: 0.45, IDL: 0.45 }[p.position as string] ?? 0.3;
  const apy = dealOf(state, id)?.apy ?? 0;
  const fame = Math.min(1, apy / (0.12 * RULES.salaryCap));
  const vet = Math.min(1, experience(state, id) / 8);
  const conduct = state.players[id]?.suspended ? -0.2 : 0;
  return Math.max(0, Math.min(1, 0.3 * posWeight + 0.35 * fame + 0.15 * vet + 0.2 * personality(id).presence + conduct));
}

export function marketWord(v: number): string {
  return v >= 0.7 ? "A national name" : v >= 0.52 ? "Known around the league" : v >= 0.35 ? "A local favorite" : "Little outside interest";
}

/** Our stars sell jerseys: a multiplier on the team store, about 0.96 to 1.10. */
export function merchLift(state: GameState): number {
  const top = teamPlayerIds(state, state.userTeam).map((id) => marketability(state, id)).sort((a, b) => b - a).slice(0, 3);
  const s = top.reduce((a, b) => a + b, 0);
  return Math.max(0.96, Math.min(1.1, 0.9 + s * 0.1));
}

// ---- Personal matters ----

/**
 * Now and then a player steps away for a family or personal matter. The club
 * says only that and asks for privacy; nobody is told more, and nothing
 * about it shows up anywhere else.
 */
function personalLeave(state: GameState): void {
  const rng = rngFor(state.seed, `leave:${state.date}`);
  for (const id of liveIds(state)) {
    const ps = state.players[id];
    if (ps.status !== "active" || ps.injury || !ps.team) continue;
    if (rng() > 0.0012) continue;
    const days = rng() < 0.75 ? 6 : 13;
    ps.injury = { type: "Personal matter", date: state.date, returnDate: addDays(state.date, days), seasonEnding: false, nonFootball: true };
    if (ps.team === state.userTeam) {
      const p = PLAYER_BY_ID[id];
      send(state, "staff", `${teamStaff(ps.team).HC?.name ?? "The head coach"}, head coach`, `${p.name} excused for a personal matter`,
        `${p.name} has been excused from the team for a personal matter and will miss ${days > 7 ? "about two weeks" : "this week"}. ` +
        "We've told the media only that and asked them to respect his privacy." +
        (clubhouse(state).programs.mental ? " Our player support staff is in touch with him and his family." : ""));
      clubNote(state, `${p.name} excused for a personal matter.`);
    }
  }
}

// ---- The daily hook ----

/** Locks in each team's key players at the end of the regular season, for next year's continuity. */
function snapshotCore(state: GameState): void {
  const c = clubhouse(state);
  for (const t of Object.keys(TEAM_BY_ID)) c.core[t] = starters(state, t);
}

export function lockerDaily(state: GameState): void {
  const c = clubhouse(state);
  const K = RULES.keyDates;
  if (state.date === K.regularSeasonEnd) snapshotCore(state);
  if (state.date === K.regularSeasonStart) c.roleSpoke = [];
  if (weekday(state.date) !== "Tuesday") return;
  const inSeason = state.date > K.regularSeasonStart && state.date <= addDays(K.superBowl, 2);
  if (state.date >= addDays(K.rosterCutdown, -35) && state.date <= K.superBowl) {
    for (const t of Object.keys(TEAM_BY_ID)) {
      const now = c.chem[t] ?? baseChemistry(state, t);
      c.chem[t] = Math.round((now + (targetChemistry(state, t) - now) * 0.15) * 10) / 10;
    }
  }
  if (inSeason) {
    weeklyTrust(state);
    weeklyRoles(state);
    personalLeave(state);
  }
}
