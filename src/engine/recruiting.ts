// High school recruiting. Each year's class is the top thousand or so high
// school seniors in the country. Most of the players who will be drafted four
// or five years later are in it (they are the future draft classes from
// prospects.ts, before any school is chosen for them), and so are the ones who
// never make it: highly rated players who stall in college (made up here).
// The recruiting services rank them from what a high school kid shows, which
// is a noisy read of what he will become, so five-stars bust and three-stars
// go in the first round, at about the real rates.
//
// From the spring a class opens, recruits commit through the summer visits,
// the season and the December early signing period; the rest sign on National
// Signing Day in February. A recruit picks the program that pulls him hardest:
// its brand, how good it is now, its head coach, how close it is to home and
// how crowded it is at his position, with his own tastes on top. Commitments
// aren't binding until he signs, so a few flip, more of them when the coach
// who recruited him is fired. On signing day the class is final: future
// prospects play where they signed, and the class's true talent feeds the
// program's roster (cfbworld.ts).
import { COLLEGE_TEAM, COLLEGE_TEAMS, CONFERENCES, miles } from "./collegeData";
import { addDays, daysBetween, weekday } from "./dates";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { news } from "./inbox";
import { enrollYear, HOMETOWN_STATES, POSITION_SHARE, rawClass, SIZE } from "./prospects";
import { gaussian, makeRng, rngFor, type Rng } from "./rng";
import { headCoach, recruiter } from "./cfbcoaches";
import { cfbFact, powerSchool, schoolSlots, starWord } from "./cfbmedia";
import type { CfbRecruitingClass, CfbWorld, GameState, Position, Region } from "./types";

export interface Recruit {
  id: string;
  name: string;
  position: Position;
  /** Home state. */
  home: string;
  heightIn: number;
  weightLb: number;
  /** National rank and stars from the recruiting services (public). */
  rank: number;
  stars: 3 | 4 | 5;
  /** Composite rating, .8400 to .9999 (public). */
  rating: number;
  /** Engine only: what he is worth as a college player and future pro (draft value scale). */
  value: number;
  /** Engine only: a future draft prospect (his id is his prospect id) and his draft year. */
  draftYear?: number;
  /** Engine only: days after the class opens that he makes his call. */
  day: number;
}

export interface RecruitPool {
  year: number;
  recruits: Recruit[];
  byId: Record<string, Recruit>;
}

/** Recruits outside the future draft classes, per future prospect. */
const BUST_SHARE = 1.1;

// ---- The calendar ----

function firstWednesday(year: number, month: number): string {
  let d = `${year}-${String(month).padStart(2, "0")}-01`;
  while (weekday(d) !== "Wednesday") d = addDays(d, 1);
  return d;
}

/** National Signing Day for the class that enrolls in `year`: the first Wednesday of February. */
export function signingDay(year: number): string {
  return firstWednesday(year, 2);
}

/** The early signing period: the first Wednesday of December before. */
export function earlySigningDay(year: number): string {
  return firstWednesday(year - 1, 12);
}

/** The day after the last class signed. */
export function classOpens(year: number): string {
  return addDays(signingDay(year - 1), 1);
}

/** The class being recruited on a date. */
export function activeClass(date: string): number {
  const y = Number(date.slice(0, 4));
  return date <= signingDay(y) ? y : y + 1;
}

// ---- The pool ----

const pools = new Map<string, RecruitPool>();

function pick<T>(rng: Rng, xs: readonly T[]): T {
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

const RATING_BY_RANK: [number, number][] = [[1, 0.9999], [32, 0.9834], [100, 0.9580], [350, 0.8900], [700, 0.8650], [2000, 0.8400]];

function ratingAt(rank: number): number {
  for (let i = 1; i < RATING_BY_RANK.length; i++) {
    const [x0, y0] = RATING_BY_RANK[i - 1];
    const [x1, y1] = RATING_BY_RANK[i];
    if (rank <= x1) return Math.round((y0 + ((y1 - y0) * (rank - x0)) / (x1 - x0)) * 10000) / 10000;
  }
  return 0.84;
}

/** When a recruit commits: the summer of official visits, the season, the early period, signing day. */
function commitDay(rng: Rng, rank: number, esd: number, nsd: number): number {
  const elite = rank <= 40 ? 1.6 : rank <= 150 ? 1.2 : 1;
  const when = weighted(rng, [["spring", 0.15], ["summer", 0.36], ["fall", 0.2], ["early", 0.21 * elite], ["late", 0.08 * elite]] as [string, number][]);
  switch (when) {
    case "spring": return Math.floor(rng() * 115);
    case "summer": return 115 + Math.floor(rng() * 65);
    case "fall": return 180 + Math.floor(rng() * Math.max(1, esd - 185));
    case "early": return esd - Math.floor(rng() * 4);
    default: return rng() < 0.55 ? nsd : esd + 1 + Math.floor(rng() * Math.max(1, nsd - esd - 1));
  }
}

/** The high school class that enrolls in `year`, the same for every save with this seed. */
export function recruitPool(seed: number, year: number): RecruitPool {
  const key = `${seed}:${year}`;
  const hit = pools.get(key);
  if (hit) return hit;
  const rng = makeRng(seed ^ (0x5ec7 + year * 7919));
  const list: Recruit[] = [];
  // The future draft classes: everyone from them who starts college this fall.
  for (let y = year + 3; y <= year + 5; y++) {
    const dc = rawClass(seed, y);
    for (const p of dc.prospects) {
      if (enrollYear(p.classYear, y) !== year) continue;
      const h = dc.hidden[p.id];
      list.push({
        id: p.id, name: p.name, position: p.position, home: p.hometown,
        heightIn: p.heightIn - (rng() < 0.4 ? 1 : 0), weightLb: Math.round(p.weightLb - 12 - rng() * 14),
        rank: 0, stars: 3, rating: 0, value: h.value, draftYear: y, day: 0,
      });
    }
  }
  // The ones who don't make it to the draft (made up).
  const busts = Math.round(list.length * BUST_SHARE);
  const tag = `hs${year % 100}`;
  for (let i = 0; i < busts; i++) {
    const position = weighted(rng, POSITION_SHARE.filter(([p]) => p !== "LS"));
    const [h, hsd, w, wsd] = SIZE[position];
    const heightIn = Math.round(h + gaussian(rng) * hsd);
    list.push({
      id: `${tag}-${i.toString(36)}`, name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`, position,
      home: rng() < 0.75 ? pick(rng, HOMETOWN_STATES.slice(0, 12)) : pick(rng, HOMETOWN_STATES),
      heightIn, weightLb: Math.round(w - 15 + gaussian(rng) * wsd + (heightIn - h) * 5),
      rank: 0, stars: 3, rating: 0, value: 52 + gaussian(rng) * 5, day: 0,
    });
  }
  // The services' read: the true phenoms are hard to miss, everyone below them is a guess. Tuned so
  // about 60% of five-stars and 45% of the next 70 get drafted, and half of each draft class was a three-star.
  const grade = new Map<string, number>();
  for (const r of list) {
    const g = gaussian(rngFor(seed, `hs-grade:${r.id}`));
    grade.set(r.id, r.draftYear
      ? r.value + g * (6 + 0.2 * Math.max(0, 85 - r.value))
      : r.value + 12 + g * 10 + (["QB", "WR", "EDGE", "CB"].includes(r.position) ? 1 : 0));
  }
  list.sort((a, b) => grade.get(b.id)! - grade.get(a.id)!);
  const esd = daysBetween(classOpens(year), earlySigningDay(year));
  const nsd = daysBetween(classOpens(year), signingDay(year));
  list.forEach((r, i) => {
    r.rank = i + 1;
    r.stars = i < 32 ? 5 : i < 350 ? 4 : 3;
    r.rating = ratingAt(i + 1);
    r.day = commitDay(rngFor(seed, `hs-day:${r.id}`), r.rank, esd, nsd);
  });
  const pool = { year, recruits: list, byId: Object.fromEntries(list.map((r) => [r.id, r])) };
  if (pools.size > 6) pools.clear();
  pools.set(key, pool);
  return pool;
}

// ---- Where they go ----

let homeKey: unknown = null;
let HOME: Record<string, [number, number]> = {};
let HOME_REGION: Record<string, Region> = {};
/** A state's middle, from its FBS campuses. */
function homes(): void {
  if (homeKey === COLLEGE_TEAMS) return;
  homeKey = COLLEGE_TEAMS;
  const acc: Record<string, [number, number, number]> = {};
  for (const t of COLLEGE_TEAMS) {
    const a = (acc[t.state] ??= [0, 0, 0]);
    a[0] += t.lat;
    a[1] += t.lon;
    a[2]++;
    HOME_REGION[t.state] = t.region;
  }
  HOME = Object.fromEntries(Object.entries(acc).map(([s, [la, lo, n]]) => [s, [la / n, lo / n]]));
}

interface Board {
  /** Programs ordered by brand, best first, as a 0-1 standing. */
  standing: Record<string, number>;
  /** The part of each program's pull that is the same for every recruit today. */
  base: Record<string, number>;
  slots: Record<string, number>;
  used: Record<string, number>;
  atPos: Record<string, Partial<Record<Position, number>>>;
}

function board(state: GameState, cls: CfbRecruitingClass, pool: RecruitPool): Board {
  const w = state.cfb!;
  const order = COLLEGE_TEAMS.map((t) => t.id).sort((a, b) => w.programs[b].prestige - w.programs[a].prestige);
  const standing = Object.fromEntries(order.map((t, i) => [t, 1 - i / (order.length - 1)]));
  const weights = Object.fromEntries(order.map((t) => [t, Math.exp((w.programs[t].prestige - 64) / 10)]));
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const n = pool.recruits.length * 1.12;
  const slots = Object.fromEntries(order.map((t) => [t, Math.max(2, Math.min(22, Math.round((n * weights[t]) / total)))]));
  // Every recruit finds a home: the smaller programs take what the capped ones can't.
  let room = Object.values(slots).reduce((a, b) => a + b, 0);
  for (let i = order.length - 1; room < n; i = i > 40 ? i - 1 : order.length - 1) {
    slots[order[i]]++;
    room++;
  }
  const base: Record<string, number> = {};
  for (const t of order) {
    const p = w.programs[t];
    const seen = state.college?.rating[t];
    const now = seen === undefined ? p.strength : 0.5 * p.strength + 0.5 * seen;
    base[t] = 0.55 * (p.prestige - 64) / 7 + 0.45 * (now - 64) / 7 + 0.4 * (recruiter(headCoach(state, t)) - 66) / 6
      + (CONFERENCES[COLLEGE_TEAM[t].conference]?.power ? 0.4 : 0);
  }
  const used: Record<string, number> = {};
  const atPos: Board["atPos"] = {};
  for (const [id, c] of Object.entries(cls.commits)) {
    used[c.school] = (used[c.school] ?? 0) + 1;
    const pos = pool.byId[id]?.position;
    if (pos) (atPos[c.school] ??= {})[pos] = (atPos[c.school]![pos] ?? 0) + 1;
  }
  return { standing, base, slots, used, atPos };
}

/** How hard a program pulls on a recruit (with his own tastes, the same every time he weighs it). */
function pull(state: GameState, b: Board, r: Recruit, team: string, n: number): number {
  const t = COLLEGE_TEAM[team];
  let x = b.base[team];
  if (t.state === r.home) x += 0.9;
  else if (homeRegion(r.home) === t.region) x += 0.35;
  x -= distance(r.home, team) / 1400;
  // Big programs don't take just anyone.
  const q = 1 - (r.rank - 1) / n;
  x -= 5 * Math.max(0, b.standing[team] - q - 0.12);
  const used = b.used[team] ?? 0;
  x -= 1.4 * (used / b.slots[team]) ** 2;
  const at = b.atPos[team]?.[r.position] ?? 0;
  x -= r.position === "QB" ? 0.9 * at : 0.3 * at;
  x += taste(state.seed, r, team) * 0.75;
  return x;
}

const DIST = new Map<string, number>();
function distance(home: string, team: string): number {
  const k = `${home}:${team}`;
  let d = DIST.get(k);
  if (d === undefined) {
    homes();
    const h = HOME[home];
    const t = COLLEGE_TEAM[team];
    d = h ? miles(h, [t.lat, t.lon]) : 600;
    DIST.set(k, d);
  }
  return d;
}

function homeRegion(home: string): Region | undefined {
  homes();
  return HOME_REGION[home];
}

/** A recruit's own leaning toward each program (the same every time he weighs it). */
const TASTES = new Map<string, number>();
function taste(seed: number, r: Recruit, team: string): number {
  const k = `${seed}:${r.id}:${team}`;
  let v = TASTES.get(k);
  if (v === undefined) {
    if (TASTES.size > 400_000) TASTES.clear();
    v = gaussian(rngFor(seed, `hs-fit:${r.id}:${team}`));
    TASTES.set(k, v);
  }
  return v;
}

function open(b: Board, r: Recruit, team: string): boolean {
  const extra = r.rank <= 100 ? 4 : r.rank <= 300 ? 1 : 0;
  return (b.used[team] ?? 0) < b.slots[team] + extra;
}

function choose(state: GameState, b: Board, r: Recruit, n: number, not?: string): string {
  let best = "";
  let top = -Infinity;
  for (const t of COLLEGE_TEAMS) {
    if (t.id === not || !open(b, r, t.id)) continue;
    const x = pull(state, b, r, t.id, n);
    if (x > top) {
      top = x;
      best = t.id;
    }
  }
  return best || Object.keys(b.slots).sort((a, c) => (b.used[a] ?? 0) / b.slots[a] - (b.used[c] ?? 0) / b.slots[c])[0];
}

function commit(state: GameState, cls: CfbRecruitingClass, b: Board, r: Recruit, school: string, quiet: boolean, from?: string): void {
  if (from) {
    b.used[from]--;
    b.atPos[from]![r.position]!--;
  }
  cls.commits[r.id] = { school, date: state.date, ...(from ? { flipped: from } : {}) };
  b.used[school] = (b.used[school] ?? 0) + 1;
  (b.atPos[school] ??= {})[r.position] = (b.atPos[school]![r.position] ?? 0) + 1;
  if (quiet || r.rank > 150) return;
  const who = `${"★".repeat(r.stars)} ${r.position} ${r.name} (No. ${r.rank} nationally, ${r.home})`;
  news(state, "college", from
    ? `CFB · Flip: ${who} drops ${COLLEGE_TEAM[from].school} and commits to ${COLLEGE_TEAM[school].school}`
    : `CFB · ${who} commits to ${COLLEGE_TEAM[school].school}`);
  const R = { name: r.name, pos: r.position, stars: r.stars, word: starWord(r.stars), rank: r.rank, home: r.home };
  const value = 25 + (150 - r.rank) * 0.2 + (r.stars === 5 ? 8 : 0) + (from ? 6 : 0);
  const tags = { five: r.stars === 5, top10: r.rank <= 10, home: COLLEGE_TEAM[school].state === r.home, g5: !powerSchool(school) && r.rank <= 100, late: state.date >= addDays(signingDay(cls.year), -10) };
  if (from) cfbFact(state, "flip", value, { R, S: schoolSlots(state, school), F: schoolSlots(state, from) }, { five: tags.five, coachGone: coachChanged(state.cfb!, from, cls.commits[r.id].date) });
  else cfbFact(state, "commit", value, { R, S: schoolSlots(state, school) }, tags);
}

// ---- Each day ----

export function newClass(year: number): CfbRecruitingClass {
  return { year, commits: {} };
}

/** A coach left after the recruit committed: his pledge is up for grabs. */
function coachChanged(w: CfbWorld, team: string, since: string): boolean {
  return w.log.some((m) => m.team === team && m.date >= since && (m.kind === "fired" || m.kind === "left" || m.kind === "retired"));
}

/** Signing day: the class is final, the future prospects are bound to their schools, and the services rank the classes. */
function finalize(state: GameState, cls: CfbRecruitingClass, pool: RecruitPool, quiet: boolean): void {
  const w = state.cfb!;
  const bySchool: Record<string, Recruit[]> = {};
  for (const [id, c] of Object.entries(cls.commits)) {
    const r = pool.byId[id];
    if (!r) continue;
    c.signed = 1;
    (bySchool[c.school] ??= []).push(r);
    if (r.draftYear) (w.signed[cls.year] ??= {})[id] = c.school;
  }
  const points: Record<string, number> = {};
  const truth: Record<string, number> = {};
  for (const t of COLLEGE_TEAMS) {
    const rs = (bySchool[t.id] ?? []).slice();
    rs.sort((a, b) => b.rating - a.rating);
    points[t.id] = rs.reduce((s, r, i) => s + (r.rating * 100 - 80) * 3 * 0.9 ** i, 0);
    const vals = rs.map((r) => r.value).sort((a, b) => b - a);
    while (vals.length < 16) vals.push(44);
    truth[t.id] = vals.slice(0, 16).reduce((s, v, i) => s + v * 0.88 ** i, 0);
  }
  const order = COLLEGE_TEAMS.map((t) => t.id).sort((a, b) => points[b] - points[a]);
  // True talent on the program strength scale (mean and spread of the 2026 field).
  const vals = Object.values(truth);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  for (const t of COLLEGE_TEAMS) {
    const p = w.programs[t.id];
    p.classRank[cls.year] = order.indexOf(t.id) + 1;
    p.classTalent[cls.year] = Math.round((64 + ((truth[t.id] - mean) / sd) * 12.3) * 10) / 10;
    for (const y of Object.keys(p.classRank)) if (Number(y) < cls.year - 5) delete p.classRank[Number(y)];
    for (const y of Object.keys(p.classTalent)) if (Number(y) < cls.year - 5) delete p.classTalent[Number(y)];
  }
  cls.done = true;
  w.rev++;
  if (!quiet) {
    const top = order.slice(0, 5).map((t, i) => `${i + 1}. ${COLLEGE_TEAM[t].school}`).join(", ");
    news(state, "college", `CFB · National Signing Day: the class of ${cls.year} is in. Top classes: ${top}`);
    cfbFact(state, "signing", 70, { year: cls.year, list: top, S: schoolSlots(state, order[0]), n: Object.keys(cls.commits).length }, { national: true });
  }
}

/** Recruiting for the day: commitments due today, flips on Mondays, the two signing days. */
export function recruitingDaily(state: GameState, quiet = false): void {
  const w = state.cfb;
  if (!w) return;
  const year = activeClass(state.date);
  // A new class opens the day after signing day.
  const cls = (w.classes[year] ??= newClass(year));
  for (const y of Object.keys(w.classes)) if (Number(y) < year - 1) delete w.classes[Number(y)];
  const pool = recruitPool(state.seed, year);
  const n = pool.recruits.length;
  const b = board(state, cls, pool);
  const today = daysBetween(classOpens(year), state.date);
  const esd = earlySigningDay(year);
  const nsd = signingDay(year);
  for (const r of pool.recruits) {
    if (cls.commits[r.id]) continue;
    if (r.day === today || (r.day < today && state.date === nsd)) commit(state, cls, b, r, choose(state, b, r, n), quiet);
  }
  if (weekday(state.date) === "Monday" && state.date < nsd) {
    for (const r of pool.recruits) {
      const c = cls.commits[r.id];
      if (!c || c.signed) continue;
      const shaken = coachChanged(w, c.school, c.date);
      const rng = rngFor(state.seed, `hs-flip:${r.id}:${state.date}`);
      if (rng() > (shaken ? 0.3 : 0.035)) continue;
      const alt = choose(state, b, r, n, c.school);
      const gap = pull(state, b, r, alt, n) - pull(state, b, r, c.school, n);
      if (gap > (shaken ? 0.2 : 1.1)) commit(state, cls, b, r, alt, quiet, c.school);
    }
  }
  if (state.date === esd) {
    // Most committed players sign early; a few wait to see who the coach will be.
    for (const [id, c] of Object.entries(cls.commits)) {
      if (rngFor(state.seed, `hs-early:${id}`)() < (coachChanged(w, c.school, c.date) ? 0.4 : 0.88)) c.signed = 1;
    }
    if (!quiet) {
      const n = Object.values(cls.commits).filter((c) => c.signed).length;
      news(state, "college", `CFB · Early signing period: ${n} of the nation's top recruits sign`);
      const order = classRanking(state, year);
      const list = order.slice(0, 5).map((t, i) => `${i + 1}. ${COLLEGE_TEAM[t.team].school}`).join(", ");
      if (order.length) cfbFact(state, "signing", 60, { year, list, S: schoolSlots(state, order[0].team), n }, { early: true });
    }
  }
  if (state.date === nsd && !cls.done) finalize(state, cls, pool, quiet);
}

/** Catches a class up from the day it opened, as it would have gone (new saves start in August). */
export function catchUpRecruiting(state: GameState): void {
  const real = state.date;
  const year = activeClass(real);
  let d = classOpens(year);
  while (d < real) {
    state.date = d;
    recruitingDaily(state, true);
    d = addDays(d, 1);
  }
  state.date = real;
}

// ---- Reading the class ----

/** Points the recruiting services give a class so far, for the ranking. */
export function classPoints(state: GameState, year: number): Record<string, number> {
  const w = state.cfb;
  const out: Record<string, number> = Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, 0]));
  const cls = w?.classes[year];
  if (!cls) return out;
  const pool = recruitPool(state.seed, year);
  const by: Record<string, number[]> = {};
  for (const [id, c] of Object.entries(cls.commits)) {
    const r = pool.byId[id];
    if (r) (by[c.school] ??= []).push(r.rating);
  }
  for (const [t, rs] of Object.entries(by)) {
    rs.sort((a, b) => b - a);
    out[t] = Math.round(rs.reduce((s, x, i) => s + (x * 100 - 80) * 3 * 0.9 ** i, 0) * 10) / 10;
  }
  return out;
}

export function classRanking(state: GameState, year: number): { team: string; points: number; commits: number; five: number; four: number }[] {
  const pts = classPoints(state, year);
  const cls = state.cfb?.classes[year];
  const pool = recruitPool(state.seed, year);
  const count: Record<string, [number, number, number]> = {};
  for (const [id, c] of Object.entries(cls?.commits ?? {})) {
    const r = pool.byId[id];
    const a = (count[c.school] ??= [0, 0, 0]);
    a[0]++;
    if (r?.stars === 5) a[1]++;
    if (r?.stars === 4) a[2]++;
  }
  return COLLEGE_TEAMS.map((t) => ({ team: t.id, points: pts[t.id], commits: count[t.id]?.[0] ?? 0, five: count[t.id]?.[1] ?? 0, four: count[t.id]?.[2] ?? 0 }))
    .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team));
}

/** The recruiting story behind a prospect: his class, stars and national rank coming out of high school. */
export function recruitingProfile(seed: number, prospectId: string, classYear: Parameters<typeof enrollYear>[0], draftYear: number): Recruit | null {
  return recruitPool(seed, enrollYear(classYear, draftYear)).byId[prospectId] ?? null;
}
