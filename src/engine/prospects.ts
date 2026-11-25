// NFL draft prospects, one class a year: generated for each save from its seed
// and the draft year, so every game has its own classes. Underclassmen who go
// back to school join the next year's class a year older. Only the prospects
// are modeled as players; everyone else on a college roster stays in the box
// score totals we never show.
//
// The hidden half of a prospect (true NFL ability, traits, character, medical
// history) is engine only, like HIDDEN_RATINGS. The owner learns about it
// through scouting (engine/scouting.ts).
import { COLLEGE_TEAM, COLLEGE_TEAMS } from "./collegeData";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { RULES } from "./league";
import { gaussian, makeRng, rngFor, type Rng } from "./rng";
import { onClassChoice, realRows, sourceFor, LAST_REAL_DRAFT } from "./realclasses";
import { modelApplies, nflOutcome, onModelBind, tierApplies } from "./outcomes";
export { bindDraftModel } from "./outcomes";
import type { CollegeTeam, Position } from "./types";

export type ClassYear = "SR" | "RS SR" | "JR" | "RS JR" | "RS SO";

/** What anyone can know: the school's roster listing. */
export interface Prospect {
  id: string;
  name: string;
  school: string;
  position: Position;
  classYear: ClassYear;
  birthDate: string;
  /** Listed by the school; not always accurate. */
  heightIn: number;
  weightLb: number;
  jersey: number;
  hometown: string;
  /** On the depth chart as a starter (backups play less). */
  starter: boolean;
  /** Came back to school after a year ago's draft deadline: he's out of eligibility now. */
  back?: boolean;
  /** A real prospect (realclasses.ts): the draft he really went in, his pick (0 undrafted) and the club. Shown once his draft is over. */
  real?: { year: number; pick: number; team: string };
  /** On a real early board (the 2027 class): his rank there. */
  board?: number;
}

/** Engine only. */
export interface ProspectHidden {
  /** NFL ability now and at peak, on the same scale as HIDDEN_RATINGS. */
  overall: number;
  potential: number;
  durability: number;
  traits: Record<string, number>;
  character: number;
  workEthic: number;
  footballIq: number;
  /** A past injury NFL doctors will flag, if any. */
  medical: string | null;
  /** How well the player produces against college competition. */
  college: number;
  /** True measurables. */
  heightIn: number;
  weightLb: number;
  forty: number;
  /** Draft value used to order the class (higher is better). */
  value: number;
  /**
   * What he turns into in the NFL, which nobody can see on draft day (outcomes.ts). `overall`,
   * `potential` and `traits` above are the player the tape shows; this is the one who shows up.
   * Absent for classes drafted under the old model in saves from before it.
   */
  nfl?: { overall: number; potential: number; traits: Record<string, number>; prod: number };
  /** A real prospect whose career is known: `nfl` is that career and is never drawn again. */
  fixed?: boolean;
  /**
   * Real prospects: how much better (or worse) his career was than his draft slot usually becomes, in the
   * share a full scouting file can find (scouting.ts adds it to a team's read as it learns more).
   */
  edge?: number;
}

export interface DraftClass {
  prospects: Prospect[];
  byId: Record<string, Prospect>;
  hidden: Record<string, ProspectHidden>;
  /** Index of each prospect in `prospects` (for packed per-team arrays). */
  index: Record<string, number>;
  /** True value at the end of each round: ranks 32, 64, ... 257. */
  roundCuts: number[];
  bySchool: Record<string, string[]>;
}

export const CLASS_SIZE = 640;

export const POSITION_TRAITS: Record<Position, string[]> = {
  QB: ["speed", "strength", "agility", "arm", "accuracy", "mobility", "decisions"],
  RB: ["speed", "strength", "agility", "vision", "power", "receiving", "burst"],
  FB: ["speed", "strength", "agility", "blocking", "power", "receiving"],
  WR: ["speed", "strength", "agility", "deep", "routes", "hands", "yac"],
  TE: ["speed", "strength", "agility", "blocking", "receiving", "hands"],
  OT: ["speed", "strength", "agility", "passBlock", "runBlock"],
  OG: ["speed", "strength", "agility", "passBlock", "runBlock"],
  C: ["speed", "strength", "agility", "passBlock", "runBlock"],
  EDGE: ["speed", "strength", "agility", "passRush", "runStop"],
  IDL: ["speed", "strength", "agility", "passRush", "runStop"],
  LB: ["speed", "strength", "agility", "runStop", "coverage", "blitz"],
  CB: ["speed", "strength", "agility", "man", "zone", "press"],
  S: ["speed", "strength", "agility", "coverage", "range", "box"],
  K: ["speed", "strength", "agility", "kickPower", "kickAccuracy"],
  P: ["speed", "strength", "agility", "kickPower", "placement"],
  LS: ["speed", "strength", "agility"],
};

// Share of the class at each position, close to recent drafts.
export const POSITION_SHARE: [Position, number][] = [
  ["QB", 0.05], ["RB", 0.065], ["FB", 0.006], ["WR", 0.13], ["TE", 0.06], ["OT", 0.08], ["OG", 0.07], ["C", 0.035],
  ["EDGE", 0.1], ["IDL", 0.09], ["LB", 0.08], ["CB", 0.12], ["S", 0.08], ["K", 0.012], ["P", 0.012], ["LS", 0.004],
];

// Listed size by position: [height inches, sd, weight, sd], and a 40 baseline.
export const SIZE: Record<Position, [number, number, number, number, number]> = {
  QB: [74.5, 1.6, 218, 12, 4.82], RB: [70.5, 1.5, 210, 11, 4.53], FB: [72, 1.3, 240, 9, 4.75],
  WR: [72.5, 2.2, 195, 13, 4.48], TE: [76.5, 1.2, 248, 10, 4.7], OT: [77.5, 1.1, 315, 11, 5.2],
  OG: [76, 1.1, 315, 11, 5.25], C: [75, 1, 305, 9, 5.25], EDGE: [75.5, 1.3, 255, 12, 4.7],
  IDL: [75, 1.2, 300, 14, 5.0], LB: [73.5, 1.2, 233, 9, 4.65], CB: [71.5, 1.5, 190, 8, 4.46],
  S: [72, 1.3, 205, 8, 4.53], K: [72, 2, 195, 12, 5.0], P: [74, 1.8, 210, 12, 5.0], LS: [74, 1.3, 240, 9, 5.1],
};

/** Medical flags, for a class drafted in year Y ("{2}" is two seasons before the draft, "{1}" the last one before this). */
const MEDICAL = [
  "Torn ACL in {3}; fully recovered but the knee will get a long look",
  "Two shoulder surgeries",
  "Missed most of {2} with a broken foot",
  "Back issue that flared up in {2}",
  "Recurring hamstring strains",
  "High ankle sprain that lingered in {2}",
  "Concussion history",
  "Wrist surgery after the {2} season",
];

export const HOMETOWN_STATES = ["TX", "FL", "GA", "CA", "AL", "LA", "OH", "PA", "NC", "SC", "MS", "TN", "VA", "MD", "NJ", "MI", "IL", "AZ", "WA", "OK", "KY", "MO", "IN", "NY", "UT", "HI"];

function pick0<T>(rng: Rng, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

function pick<T>(rng: Rng, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

function weighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [x, w] of items) {
    r -= w;
    if (r <= 0) return x;
  }
  return items[items.length - 1][0];
}

/** Target NFL overall for a prospect by where they rank in the class (matches recent rookies by round). */
const OVERALL_BY_RANK: [number, number][] = [
  [0, 84], [10, 81], [32, 77.5], [64, 75.5], [100, 72.5], [140, 69], [180, 66], [220, 62.5], [257, 58],
  [350, 53], [450, 49], [CLASS_SIZE, 44],
];

function interp(points: [number, number][], x: number): number {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

const cache = new Map<string, DraftClass>();
const raw = new Map<string, DraftClass>();

/**
 * What the save's college world says about future classes (cfbworld.ts): the school each recruit
 * signed with in this save. Bound per seed, like the returners.
 */
interface WorldView {
  ref: object;
  rev: number;
  signed: Record<string, string>;
  /** Engine only: what a school's coaches added to a player's development from his first fall through `to`. */
  dev?: (school: string, from: number, to: number) => number;
}
const worlds = new Map<number, WorldView>();

/** Drops a seed's cached classes (outcomes.ts, when a save binds which classes use the new model). */
export function clearClasses(seed: number): void {
  for (const k of [...cache.keys()]) if (k.startsWith(`${seed}:`)) cache.delete(k);
}

onModelBind(clearClasses);
onClassChoice(clearClasses);

export function bindWorld(seed: number, view: WorldView | null): void {
  const before = worlds.get(seed);
  if (!view) {
    if (!before) return;
    worlds.delete(seed);
  } else {
    if (before && before.ref === view.ref && before.rev === view.rev) return;
    const signed = view.signed;
    worlds.set(seed, { ref: view.ref, rev: view.rev, signed, dev: view.dev });
    if (!view.dev && !before?.dev && Object.keys(signed).length === 0 && (!before || Object.keys(before.signed).length === 0)) return;
  }
  for (const k of [...cache.keys()]) if (k.startsWith(`${seed}:`)) cache.delete(k);
}

/** A class as the generator made it, before any save's recruiting (recruiting.ts reads it for the high school pool). */
export function rawClass(seed: number, year: number): DraftClass {
  const key = `${seed}:${year}`;
  let dc = raw.get(key);
  if (!dc) {
    dc = generate(seed, year);
    if (raw.size > 12) raw.clear();
    raw.set(key, dc);
  }
  return dc;
}
/** Underclassmen from each class who went back to school, by seed and draft year (set by the save). */
const carries = new Map<string, string[]>();

export function setCarry(seed: number, year: number, ids: string[]): void {
  const key = `${seed}:${year}`;
  const before = carries.get(key);
  if (before && before.length === ids.length && before.every((x, i) => x === ids[i])) return;
  carries.set(key, [...ids]);
  // The next class picks them up.
  cache.delete(`${seed}:${year + 1}`);
}

/** The class for a draft year (the coming draft by default). */
export function draftClass(seed: number, year = RULES.season + 1): DraftClass {
  const key = `${seed}:${year}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = sourceFor(seed, year);
  const dc = src ? realClass(seed, year, src) : generate(seed, year);
  if (!src) {
    applyWorld(dc, worlds.get(seed), year);
    const back = carries.get(`${seed}:${year - 1}`);
    if (back?.length) addReturners(dc, draftClass(seed, year - 1), back, seed, year);
  }
  for (const p of dc.prospects) {
    const h = dc.hidden[p.id];
    if (h.fixed) continue;
    // A returner carries last year's outcome and its trace in his production; both are drawn again.
    if (h.nfl) h.college -= h.nfl.prod;
    if (modelApplies(seed, year)) {
      h.nfl = nflOutcome(seed, p, h, tierApplies(seed, year));
      h.college += h.nfl.prod;
    } else delete h.nfl;
  }
  if (cache.size > 8) cache.clear();
  cache.set(key, dc);
  return dc;
}

/** Underclassmen back for another season: a year older and a little better, out of eligibility after it. */
function addReturners(dc: DraftClass, prev: DraftClass, ids: string[], seed: number, year: number): void {
  const rng = makeRng(seed ^ (year * 131));
  const next: Record<ClassYear, ClassYear> = { JR: "SR", "RS JR": "RS SR", "RS SO": "RS JR", SR: "SR", "RS SR": "RS SR" };
  for (const id of ids) {
    const p = prev.byId[id];
    const h0 = prev.hidden[id];
    if (!p || !h0 || dc.byId[id]) continue;
    const gain = Math.max(0, (h0.potential - h0.overall) * (0.3 + rng() * 0.3) + gaussian(rng) * 1.5);
    const overall = Math.round(clamp(h0.overall + gain, 38, 94));
    const potential = Math.max(overall, Math.round(h0.potential + gaussian(rng) * 1.5));
    const traits: Record<string, number> = {};
    for (const [k, v] of Object.entries(h0.traits)) traits[k] = Math.round(clamp(v + (overall - h0.overall), 25, 99));
    const weightLb = h0.weightLb + Math.round(gaussian(rng) * 4 + 2);
    const h: ProspectHidden = { ...h0, overall, potential, traits, weightLb, college: h0.college + (overall - h0.overall) * 0.75 + 1, value: 0.65 * overall + 0.35 * potential };
    const q: Prospect = { ...p, classYear: next[p.classYear], weightLb: p.weightLb + (weightLb - h0.weightLb), back: true, starter: true };
    dc.prospects.push(q);
    dc.byId[id] = q;
    dc.hidden[id] = h;
    dc.index[id] = dc.prospects.length - 1;
    (dc.bySchool[q.school] ??= []).push(id);
  }
  const values = dc.prospects.map((p) => dc.hidden[p.id].value).sort((a, b) => b - a);
  dc.roundCuts = [32, 64, 100, 138, 176, 216, 257].map((r) => values[r - 1]);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function generate(seed: number, year: number): DraftClass {
  // 2027 keeps the generator the first saves were built with.
  const rng = makeRng(year === 2027 ? seed ^ 0x2027 : seed ^ (0x2027 + (year - 2027) * 0x9e3779));
  const tag = year === 2027 ? "cp" : `cp${year % 100}`;
  const teams = COLLEGE_TEAMS;
  const used = new Set<string>();
  const prospects: Prospect[] = [];
  const hidden: Record<string, ProspectHidden> = {};
  // Specialists rank outside the top of the class.
  const positions: Position[] = [];
  for (let i = 0; i < CLASS_SIZE; i++) positions.push(weighted(rng, POSITION_SHARE));
  for (let rank = 0; rank < CLASS_SIZE; rank++) {
    let pos = positions[rank];
    if ((pos === "K" || pos === "P" || pos === "LS") && rank < 180) {
      // Swap with a later non-specialist.
      const j = positions.findIndex((p, k) => k > 200 && !["K", "P", "LS"].includes(p));
      if (j > 0) {
        positions[rank] = positions[j];
        positions[j] = pos;
        pos = positions[rank];
      }
    }
    const team = pickSchool(rng, teams, rank);
    let name = "";
    for (let tries = 0; tries < 20; tries++) {
      name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
      if (!used.has(name)) break;
    }
    used.add(name);
    const id = `${tag}-${rank.toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
    const classYear = weighted<ClassYear>(rng, [["SR", 0.3], ["RS SR", 0.22], ["JR", 0.3], ["RS JR", 0.13], ["RS SO", 0.05]]);
    const ageAtDraft = { SR: 22.3, "RS SR": 23.2, JR: 21.3, "RS JR": 22.2, "RS SO": 21.2 }[classYear] + gaussian(rng) * 0.45;
    const birth = new Date(Date.UTC(year, 3, 29) - ageAtDraft * 365.25 * 86_400_000).toISOString().slice(0, 10);

    const overall = Math.round(clamp(interp(OVERALL_BY_RANK, rank) + gaussian(rng) * 2.5, 38, 92));
    const young = classYear === "JR" || classYear === "RS SO" ? 2.5 : classYear === "RS JR" ? 1 : 0;
    const potential = Math.round(clamp(overall + Math.max(0, 4 + young + gaussian(rng) * 3.5), overall, 97));
    const keys = POSITION_TRAITS[pos];
    const raw = keys.map(() => gaussian(rng) * 7);
    const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
    const traits: Record<string, number> = {};
    keys.forEach((k, i) => { traits[k] = Math.round(clamp(overall + raw[i] - mean, 25, 99)); });

    const [h, hsd, w, wsd, forty] = SIZE[pos];
    const heightIn = Math.round(h + gaussian(rng) * hsd);
    const weightLb = Math.round(w + gaussian(rng) * wsd + (heightIn - h) * 5);
    const speed = traits.speed;
    const trueForty = Math.round((forty - (speed - overall) * 0.008 - (overall - 65) * 0.003 + gaussian(rng) * 0.03) * 100) / 100;
    // Schools pad their listings: an inch taller, a few pounds heavier, sometimes the other way.
    const listedHeight = heightIn + (rng() < 0.35 ? 1 : rng() < 0.08 ? -1 : 0);
    const listedWeight = weightLb + Math.round(gaussian(rng) * 6 + 3);

    const age = year - 1 - Number(birth.slice(0, 4));
    const college = overall * 0.75 + potential * 0.1 + gaussian(rng) * 5.5 + (age >= 23 ? 2 : 0) + 8;
    hidden[id] = {
      overall, potential,
      durability: Math.round(clamp(78 + gaussian(rng) * 10, 35, 99)),
      traits,
      character: Math.round(clamp(72 + gaussian(rng) * 14, 15, 99)),
      workEthic: Math.round(clamp(72 + gaussian(rng) * 13, 20, 99)),
      footballIq: Math.round(clamp((traits.decisions ?? overall) * 0.5 + 36 + gaussian(rng) * 9, 25, 99)),
      medical: rng() < 0.12 ? pick(rng, MEDICAL).replace("{3}", String(year - 3)).replace("{2}", String(year - 2)) : null,
      college,
      heightIn, weightLb, forty: trueForty,
      value: 0.65 * overall + 0.35 * potential,
    };
    prospects.push({
      id, name, school: team.id, position: pos, classYear, birthDate: birth,
      heightIn: listedHeight, weightLb: listedWeight,
      jersey: jerseyFor(rng, pos),
      hometown: rng() < 0.55 ? team.state : pick(rng, HOMETOWN_STATES),
      starter: true,
    });
  }
  const values = prospects.map((p) => hidden[p.id].value).sort((a, b) => b - a);
  const roundCuts = [32, 64, 100, 138, 176, 216, 257].map((r) => values[r - 1]);
  const byId = Object.fromEntries(prospects.map((p) => [p.id, p]));
  const index = Object.fromEntries(prospects.map((p, i) => [p.id, i]));
  const dc: DraftClass = { prospects, byId, hidden, index, roundCuts, bySchool: {} };
  depthCharts(dc);
  return dc;
}

/** Share of the gap between a real career and its draft slot that shows on tape, and that a full scouting file adds to a team's read. */
export const REAL_TAPE = 0.35;
export const REAL_EDGE = 0.4;

/**
 * A real class (realclasses.ts) for a draft year. Everyone reads him where he was really drafted: his
 * tape is the generator's level for that slot, so the media, mocks and other clubs line up about as the
 * real draft did. What he became is his real career. A part of the gap between the two shows on tape
 * and in his makeup and production, so a club that scouts him deeply can find the late-round player
 * who became a star, and sour on the first-rounder who didn't last. The 2027 board is PFF's early top
 * 150; the rest of that class comes from the generator (made up).
 */
function realClass(seed: number, year: number, src: number): DraftClass {
  const rows = realRows(src);
  const tag = `rc${src % 100}`;
  const prospects: Prospect[] = [];
  const hidden: Record<string, ProspectHidden> = {};
  const shiftYears = year - src;
  let undrafted = 0;
  rows.forEach((row, i) => {
    const [name, school, pos, birth0, ht, wt, forty0, pick, team, career, shape] = row;
    const rng = rngFor(seed, `real:${src}:${i}`);
    const id = `${tag}-${i.toString(36)}`;
    const board = src > LAST_REAL_DRAFT;
    const rank = pick ? pick - 1 : 257 + undrafted++;
    // Age at the draft: the real birth date moved by the years the class is played out of order.
    let birthDate: string;
    let classYear: ClassYear;
    if (birth0) {
      birthDate = `${Number(birth0.slice(0, 4)) + shiftYears}${birth0.slice(4)}`;
      const age = (Date.UTC(year, 3, 29) - Date.parse(birthDate)) / (365.25 * 86_400_000);
      classYear = age < 21.6 ? (rng() < 0.2 ? "RS SO" : "JR") : age < 22.4 ? (rng() < 0.4 ? "RS JR" : "SR") : age < 23 ? "SR" : "RS SR";
    } else {
      classYear = weighted<ClassYear>(rng, [["SR", 0.3], ["RS SR", 0.22], ["JR", 0.3], ["RS JR", 0.13], ["RS SO", 0.05]]);
      const ageAtDraft = { SR: 22.3, "RS SR": 23.2, JR: 21.3, "RS JR": 22.2, "RS SO": 21.2 }[classYear] + gaussian(rng) * 0.45;
      birthDate = new Date(Date.UTC(year, 3, 29) - ageAtDraft * 365.25 * 86_400_000).toISOString().slice(0, 10);
    }
    const gap = career ? career[2] : 0;
    const tapeShift = clamp(gap * REAL_TAPE, -9, 9);
    const slot = clamp(interp(OVERALL_BY_RANK, rank) + gaussian(rng) * 1.5, 38, 92);
    const young = classYear === "JR" || classYear === "RS SO" ? 2.5 : classYear === "RS JR" ? 1 : 0;
    const slotPot = slot + Math.max(0, 4 + young + gaussian(rng) * 2.5);
    const overall = Math.round(clamp(slot + tapeShift, 38, 94));
    const potential = Math.round(clamp(Math.max(overall, slotPot + tapeShift), overall, 97));
    const keys = POSITION_TRAITS[pos];
    const dev = shape && shape.length === keys.length ? shape : keys.map(() => gaussian(rng) * 7);
    const mean = shape ? 0 : dev.reduce((a, v) => a + v, 0) / dev.length;
    const traits: Record<string, number> = {};
    keys.forEach((k, j) => { traits[k] = Math.round(clamp(overall + dev[j] - mean, 25, 99)); });
    const [h0, hsd, w0, wsd, forty] = SIZE[pos];
    const heightIn = ht ?? Math.round(h0 + gaussian(rng) * hsd);
    const weightLb = wt ?? Math.round(w0 + gaussian(rng) * wsd + (heightIn - h0) * 5);
    const trueForty = forty0 ?? Math.round((forty - (traits.speed - overall) * 0.008 - (overall - 65) * 0.003 + gaussian(rng) * 0.03) * 100) / 100;
    const age = year - 1 - Number(birthDate.slice(0, 4));
    const h: ProspectHidden = {
      overall, potential,
      durability: Math.round(clamp(78 + gaussian(rng) * 10, 35, 99)),
      traits,
      // The makeup a deep file reads carries some of what his career turned out to be.
      character: Math.round(clamp(72 + gap * 0.25 + gaussian(rng) * 12, 15, 99)),
      workEthic: Math.round(clamp(72 + gap * 0.45 + gaussian(rng) * 9, 20, 99)),
      footballIq: Math.round(clamp((traits.decisions ?? overall) * 0.5 + 36 + gap * 0.35 + gaussian(rng) * 7, 25, 99)),
      medical: rng() < 0.12 ? pick0(rng, MEDICAL).replace("{3}", String(year - 3)).replace("{2}", String(year - 2)) : null,
      college: overall * 0.75 + potential * 0.1 + gaussian(rng) * 4.5 + (age >= 23 ? 2 : 0) + 8 + gap * 0.12,
      heightIn, weightLb, forty: trueForty,
      // The public's value is the slot alone.
      value: 0.65 * slot + 0.35 * slotPot,
      edge: Math.round(clamp(gap * REAL_EDGE, -10, 10) * 10) / 10,
    };
    if (career) {
      // His career on the game's scale: where he came in and where he settled, with his own trait shape.
      const [entry, settled] = career;
      const nt: Record<string, number> = {};
      keys.forEach((k, j) => { nt[k] = Math.round(clamp(entry + dev[j] - mean, 25, 99)); });
      h.nfl = { overall: entry, potential: settled, traits: nt, prod: Math.round(gap * 0.12 * 10) / 10 };
      h.fixed = true;
    }
    hidden[id] = h;
    prospects.push({
      id, name, school, position: pos, classYear, birthDate,
      heightIn: heightIn + (rng() < 0.35 ? 1 : 0), weightLb: weightLb + Math.round(gaussian(rng) * 5 + 2),
      jersey: jerseyFor(rng, pos),
      hometown: COLLEGE_TEAM[school] && COLLEGE_TEAM[school].state !== "??" ? COLLEGE_TEAM[school].state : pick0(rng, HOMETOWN_STATES),
      starter: true,
      ...(board ? { board: pick } : { real: { year: src, pick, team } }),
    });
  });
  // The 2027 board runs 150 deep: the generator's class fills in behind it.
  if (src > LAST_REAL_DRAFT) {
    const gen = generate(seed, year);
    for (const p of gen.prospects.slice(prospects.length)) {
      prospects.push(p);
      hidden[p.id] = gen.hidden[p.id];
    }
  }
  const values = prospects.map((p) => hidden[p.id].value).sort((a, b) => b - a);
  const roundCuts = [32, 64, 100, 138, 176, 216, 257].map((r) => values[r - 1]);
  const byId = Object.fromEntries(prospects.map((p) => [p.id, p]));
  const index = Object.fromEntries(prospects.map((p, i) => [p.id, i]));
  const dc: DraftClass = { prospects, byId, hidden, index, roundCuts, bySchool: {} };
  depthCharts(dc);
  return dc;
}

/** One starter per school at QB and K/P; a second running back shares the load. */
function depthCharts(dc: DraftClass): void {
  const bySchool: Record<string, string[]> = {};
  for (const p of dc.prospects) {
    p.starter = true;
    (bySchool[p.school] ??= []).push(p.id);
  }
  for (const ids of Object.values(bySchool)) {
    for (const pos of ["QB", "K", "P", "LS"] as Position[]) {
      const at = ids.filter((id) => dc.byId[id].position === pos);
      at.sort((a, b) => dc.hidden[b].college - dc.hidden[a].college);
      for (const id of at.slice(1)) dc.byId[id].starter = false;
    }
  }
  dc.bySchool = bySchool;
}

/**
 * Recruits who signed somewhere in this save (or transferred) play there, and the seasons they spent
 * with a program's coaches in this save show in what they become: a little better under good teachers,
 * a little worse under poor ones. Only seasons finished before the class's last fall count, so a class
 * is settled by the time anyone scouts it.
 */
function applyWorld(dc: DraftClass, w: WorldView | undefined, year: number): void {
  if (!w) return;
  let moved = false;
  for (const p of dc.prospects) {
    const school = w.signed[p.id];
    if (school && school !== p.school) {
      p.school = school;
      moved = true;
    }
    const d = w.dev ? w.dev(p.school, enrollYear(p.classYear, year), year - 2) : 0;
    if (Math.abs(d) < 0.5) continue;
    const h = dc.hidden[p.id];
    const step = Math.round(d);
    h.overall = Math.round(clamp(h.overall + step, 38, 94));
    h.potential = Math.max(h.overall, Math.round(h.potential + d * 0.5));
    for (const k of Object.keys(h.traits)) h.traits[k] = Math.round(clamp(h.traits[k] + step, 25, 99));
    h.college += step * 0.75;
    h.value = 0.65 * h.overall + 0.35 * h.potential;
  }
  if (moved) depthCharts(dc);
  const values = dc.prospects.map((p) => dc.hidden[p.id].value).sort((a, b) => b - a);
  dc.roundCuts = [32, 64, 100, 138, 176, 216, 257].map((r) => values[r - 1]);
}

function pickSchool(rng: Rng, teams: CollegeTeam[], rank: number): CollegeTeam {
  // The best prospects cluster at the best programs; later rounds spread out.
  const scale = rank < 60 ? 6.5 : rank < 200 ? 8.5 : 11;
  return weighted(rng, teams.map((t) => [t, Math.exp((t.strength - 60) / scale)] as [CollegeTeam, number]));
}

function jerseyFor(rng: Rng, pos: Position): number {
  const ranges: Partial<Record<Position, [number, number]>> = {
    QB: [1, 19], RB: [1, 39], WR: [0, 19], TE: [80, 89], OT: [50, 79], OG: [50, 79], C: [50, 79],
    EDGE: [1, 99], IDL: [50, 99], LB: [1, 59], CB: [0, 39], S: [0, 39], K: [10, 49], P: [10, 49], LS: [40, 69], FB: [30, 49],
  };
  const [lo, hi] = ranges[pos] ?? [1, 99];
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Prospect's age on a date. */
export function prospectAge(p: Prospect, iso: string): number {
  const [by, bm, bd] = p.birthDate.split("-").map(Number);
  const [y, m, d] = iso.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export const CLASS_LABEL: Record<ClassYear, string> = {
  SR: "Senior", "RS SR": "Redshirt senior", JR: "Junior", "RS JR": "Redshirt junior", "RS SO": "Redshirt sophomore",
};

/** The fall a prospect started college, from his class in his draft year. */
export function enrollYear(classYear: ClassYear, draftYear: number): number {
  return draftYear - ({ JR: 3, "RS SO": 3, SR: 4, "RS JR": 4, "RS SR": 5 } as const)[classYear];
}
