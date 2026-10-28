// NFL draft prospects in the 2026 college season: generated for each save from
// its seed, so every game has its own draft class. Only the prospects are
// modeled as players; everyone else on a college roster stays in the box score
// totals we never show.
//
// The hidden half of a prospect (true NFL ability, traits, character, medical
// history) is engine only, like HIDDEN_RATINGS. The owner learns about it
// through scouting (engine/scouting.ts).
import { COLLEGE_TEAMS } from "./collegeData";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { gaussian, makeRng, type Rng } from "./rng";
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
const POSITION_SHARE: [Position, number][] = [
  ["QB", 0.05], ["RB", 0.065], ["FB", 0.006], ["WR", 0.13], ["TE", 0.06], ["OT", 0.08], ["OG", 0.07], ["C", 0.035],
  ["EDGE", 0.1], ["IDL", 0.09], ["LB", 0.08], ["CB", 0.12], ["S", 0.08], ["K", 0.012], ["P", 0.012], ["LS", 0.004],
];

// Listed size by position: [height inches, sd, weight, sd], and a 40 baseline.
const SIZE: Record<Position, [number, number, number, number, number]> = {
  QB: [74.5, 1.6, 218, 12, 4.82], RB: [70.5, 1.5, 210, 11, 4.53], FB: [72, 1.3, 240, 9, 4.75],
  WR: [72.5, 2.2, 195, 13, 4.48], TE: [76.5, 1.2, 248, 10, 4.7], OT: [77.5, 1.1, 315, 11, 5.2],
  OG: [76, 1.1, 315, 11, 5.25], C: [75, 1, 305, 9, 5.25], EDGE: [75.5, 1.3, 255, 12, 4.7],
  IDL: [75, 1.2, 300, 14, 5.0], LB: [73.5, 1.2, 233, 9, 4.65], CB: [71.5, 1.5, 190, 8, 4.46],
  S: [72, 1.3, 205, 8, 4.53], K: [72, 2, 195, 12, 5.0], P: [74, 1.8, 210, 12, 5.0], LS: [74, 1.3, 240, 9, 5.1],
};

const MEDICAL = [
  "Torn ACL in 2024; fully recovered but the knee will get a long look",
  "Two shoulder surgeries",
  "Missed most of 2025 with a broken foot",
  "Back issue that flared up in 2025",
  "Recurring hamstring strains",
  "High ankle sprain that lingered in 2025",
  "Concussion history",
  "Wrist surgery after the 2025 season",
];

const HOMETOWN_STATES = ["TX", "FL", "GA", "CA", "AL", "LA", "OH", "PA", "NC", "SC", "MS", "TN", "VA", "MD", "NJ", "MI", "IL", "AZ", "WA", "OK", "KY", "MO", "IN", "NY", "UT", "HI"];

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

const cache = new Map<number, DraftClass>();

export function draftClass(seed: number): DraftClass {
  const hit = cache.get(seed);
  if (hit) return hit;
  const dc = generate(seed);
  if (cache.size > 4) cache.clear();
  cache.set(seed, dc);
  return dc;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function generate(seed: number): DraftClass {
  const rng = makeRng(seed ^ 0x2027);
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
    const id = `cp-${rank.toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
    const classYear = weighted<ClassYear>(rng, [["SR", 0.3], ["RS SR", 0.22], ["JR", 0.3], ["RS JR", 0.13], ["RS SO", 0.05]]);
    const ageAtDraft = { SR: 22.3, "RS SR": 23.2, JR: 21.3, "RS JR": 22.2, "RS SO": 21.2 }[classYear] + gaussian(rng) * 0.45;
    const birth = new Date(Date.UTC(2027, 3, 29) - ageAtDraft * 365.25 * 86_400_000).toISOString().slice(0, 10);

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

    const age = 2026 - Number(birth.slice(0, 4));
    const college = overall * 0.75 + potential * 0.1 + gaussian(rng) * 5.5 + (age >= 23 ? 2 : 0) + 8;
    hidden[id] = {
      overall, potential,
      durability: Math.round(clamp(78 + gaussian(rng) * 10, 35, 99)),
      traits,
      character: Math.round(clamp(72 + gaussian(rng) * 14, 15, 99)),
      workEthic: Math.round(clamp(72 + gaussian(rng) * 13, 20, 99)),
      footballIq: Math.round(clamp((traits.decisions ?? overall) * 0.5 + 36 + gaussian(rng) * 9, 25, 99)),
      medical: rng() < 0.12 ? pick(rng, MEDICAL) : null,
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
  // One starter per school at QB and K/P; a second running back shares the load.
  const bySchool: Record<string, string[]> = {};
  for (const p of prospects) (bySchool[p.school] ??= []).push(p.id);
  for (const ids of Object.values(bySchool)) {
    for (const pos of ["QB", "K", "P", "LS"] as Position[]) {
      const at = ids.filter((id) => prospects.find((p) => p.id === id)!.position === pos);
      at.sort((a, b) => hidden[b].college - hidden[a].college);
      for (const id of at.slice(1)) prospects.find((p) => p.id === id)!.starter = false;
    }
  }
  const values = prospects.map((p) => hidden[p.id].value).sort((a, b) => b - a);
  const roundCuts = [32, 64, 100, 138, 176, 216, 257].map((r) => values[r - 1]);
  const byId = Object.fromEntries(prospects.map((p) => [p.id, p]));
  const index = Object.fromEntries(prospects.map((p, i) => [p.id, i]));
  return { prospects, byId, hidden, index, roundCuts, bySchool };
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
