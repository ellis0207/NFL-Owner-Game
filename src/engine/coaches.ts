// Everyone who coaches or runs a front office, kept in the save: the staffs
// from the data, the assistants and college coaches who could be hired, and
// anyone out of work. Contracts, careers (growth, decline, retirement) and
// each person's record live here; the hiring carousel is in carousel.ts.
//
// The hidden numbers stay in the engine. The owner sees what anyone could
// see: ages, jobs, records, schemes, contracts and what people say about a
// coach, which can be wrong.
import { COLLEGE_TEAM, COLLEGE_TEAMS, CONFERENCES } from "./collegeData";
import { HIDDEN_STAFF, RULES, STAFF, STAFF_BY_ID, TEAMS } from "./league";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { gaussian, rngFor, type Rng } from "./rng";
import { bindStaffTables } from "./staff";
import { standings } from "./standings";
import type {
  Coach, CoachSeason, DefenseScheme, GameState, OffenseScheme, StaffHidden, StaffPerson, StaffRole, StaffState, StaffTrack,
} from "./types";

const M = 1_000_000;
export const ROLES: StaffRole[] = ["HC", "OC", "DC", "STC", "GM", "TRN", "PRO", "COL"];
export const COACH_ROLES: StaffRole[] = ["HC", "OC", "DC", "STC"];
export const ROLE_NAME: Record<StaffRole, string> = {
  HC: "head coach", OC: "offensive coordinator", DC: "defensive coordinator", STC: "special teams coordinator",
  GM: "general manager", TRN: "head athletic trainer", PRO: "director of pro scouting", COL: "director of college scouting",
};

export const OFFENSE_SCHEMES: OffenseScheme[] = ["wideZone", "mcvay", "westCoast", "erhardtPerkins", "spread", "vertical", "gapMotion"];
export const DEFENSE_SCHEMES: DefenseScheme[] = ["fangio", "cover3", "pressure", "multiple", "macdonald"];

/** The hidden numbers each kind of job uses. */
const KEYS: Record<StaffTrack, (keyof StaffHidden)[]> = {
  coach: ["playCalling", "development", "gameManagement", "leadership", "evaluation"],
  st: ["specialTeams", "development", "gameManagement", "leadership", "evaluation"],
  exec: ["evaluation", "negotiation", "capManagement"],
  trainer: ["prevention", "recovery"],
  scout: ["evaluation", "negotiation", "capManagement"],
};

/** Which jobs a person can be hired for. */
export function canHold(c: Coach, role: StaffRole): boolean {
  switch (role) {
    case "HC": return c.track === "coach" || c.track === "st";
    case "OC": return c.track === "coach" && c.side === "offense";
    case "DC": return c.track === "coach" && c.side === "defense";
    case "STC": return c.track === "st";
    case "GM": return c.track === "exec" || c.track === "scout";
    case "PRO": case "COL": return c.track === "scout" || c.track === "exec";
    case "TRN": return c.track === "trainer";
  }
}

export function staff(state: GameState): StaffState {
  return state.staff!;
}

export function coachAge(c: Coach, season = RULES.season): number {
  return season - c.birthYear;
}

const clamp = (x: number, lo = 30, hi = 97) => Math.max(lo, Math.min(hi, Math.round(x)));

function trackOf(role: StaffRole): StaffTrack {
  return role === "STC" ? "st" : role === "GM" ? "exec" : role === "TRN" ? "trainer" : role === "PRO" || role === "COL" ? "scout" : "coach";
}

/** Fills in the numbers a person's data doesn't have (an OC's game management, a scout's negotiating). */
function completeHidden(rng: Rng, track: StaffTrack, h: StaffHidden): StaffHidden {
  const fill: Partial<Record<keyof StaffHidden, [number, number]>> = {
    playCalling: [62, 7], development: [68, 5], gameManagement: [63, 7], leadership: [67, 8], evaluation: [65, 5],
    specialTeams: [66, 6], negotiation: [62, 8], capManagement: [62, 8], prevention: [64, 8], recovery: [65, 8],
  };
  const out: StaffHidden = { ...h };
  for (const k of KEYS[track]) {
    if (out[k] === undefined) {
      const [m, sd] = fill[k]!;
      out[k] = clamp(m + gaussian(rng) * sd);
    }
  }
  return out;
}

/** How much a person still grows each year, by age: young coaches learn, older ones slip. */
function growthFor(rng: Rng, age: number): number {
  const base = age < 38 ? 1.3 : age < 45 ? 0.7 : age < 52 ? 0.2 : age < 60 ? -0.1 : -0.6;
  return Math.round((base + gaussian(rng) * 0.6) * 100) / 100;
}

/** A plausible salary for a job: the reputation sets where in the range it lands. */
export function salaryFor(role: StaffRole, rep: number, season = RULES.season): number {
  const range: Record<StaffRole, [number, number]> = {
    HC: [5 * M, 20 * M], OC: [1.4 * M, 5 * M], DC: [1.4 * M, 5 * M], STC: [0.8 * M, 2.2 * M],
    GM: [3 * M, 10 * M], TRN: [0.35 * M, 0.9 * M], PRO: [0.35 * M, 1.1 * M], COL: [0.35 * M, 1.1 * M],
  };
  const [lo, hi] = range[role];
  const t = Math.max(0, Math.min(1, (rep - 45) / 50)) ** 1.6;
  const grow = 1.04 ** Math.max(0, season - 2026);
  return Math.round(((lo + (hi - lo) * t) * grow) / 50_000) * 50_000;
}

// ---- Names ----

function uniqueName(state: GameState, rng: Rng, taken: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const n = `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
  }
  void state;
  return `Pat ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
}

function slug(name: string, year: number, salt: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${year}-${salt}`;
}

// ---- The people at the start ----

const ASSISTANT_JOBS: { title: string; side: "offense" | "defense"; age: [number, number] }[] = [
  { title: "quarterbacks coach", side: "offense", age: [32, 48] },
  { title: "passing game coordinator", side: "offense", age: [34, 52] },
  { title: "run game coordinator", side: "offense", age: [36, 55] },
  { title: "defensive backs coach", side: "defense", age: [32, 50] },
  { title: "linebackers coach", side: "defense", age: [33, 52] },
  { title: "defensive line coach", side: "defense", age: [36, 56] },
];

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng() * list.length)];
}

function randomScheme(rng: Rng, side: "offense" | "defense"): OffenseScheme | DefenseScheme {
  return side === "offense" ? pick(rng, OFFENSE_SCHEMES) : pick(rng, DEFENSE_SCHEMES);
}

function newPerson(state: GameState, rng: Rng, taken: Set<string>, o: {
  track: StaffTrack; side: "offense" | "defense" | null; age: number; salt: string; mean: number; sd: number;
  job?: Coach["job"]; background: string; scheme?: OffenseScheme | DefenseScheme | null; mentor?: string;
}): Coach {
  const name = uniqueName(state, rng, taken);
  const birthYear = RULES.season - o.age;
  const hidden: StaffHidden = {};
  for (const k of KEYS[o.track]) hidden[k] = clamp(o.mean + gaussian(rng) * o.sd);
  return {
    id: slug(name, birthYear, o.salt), name, birthYear, track: o.track, side: o.side,
    scheme: o.scheme ?? (o.side ? randomScheme(rng, o.side) : null), background: o.background,
    team: null, role: null, job: o.job, hiredYear: RULES.season, callsPlays: [], generated: true,
    hidden, growth: growthFor(rng, o.age), record: [], ...(o.mentor ? { mentor: o.mentor } : {}),
  };
}

/** The staffs from the data, with contracts, plus everyone who could be hired. */
export function initStaff(state: GameState): StaffState {
  const people: Record<string, Coach> = {};
  const taken = new Set<string>(STAFF.people.map((p) => p.name));
  const season = RULES.season;
  for (const p of STAFF.people) {
    const rng = rngFor(state.seed, `staff-init:${p.id}`);
    const track = trackOf(p.role);
    const hidden = completeHidden(rng, track, HIDDEN_STAFF[p.id] ?? {});
    const rep = reputationFromHidden(track, p.role, hidden);
    // Contracts run four or five years for head coaches and GMs, two or three for everyone else; most have been extended.
    const length = p.role === "HC" || p.role === "GM" ? 4 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
    let through = p.hiredYear + length - 1;
    while (through < season) through += p.role === "HC" || p.role === "GM" ? 3 : 2;
    const hc = STAFF.people.find((q) => q.team === p.team && q.role === "HC");
    const gm = STAFF.people.find((q) => q.team === p.team && q.role === "GM");
    people[p.id] = {
      id: p.id, name: p.name, birthYear: p.birthYear, ...(p.birthYearEstimated ? { birthYearEstimated: true } : {}),
      track, side: p.side, scheme: p.scheme, background: p.background,
      team: p.team, role: p.role, hiredYear: p.hiredYear, callsPlays: [...p.callsPlays],
      contract: { through, salary: salaryFor(p.role, rep, season) },
      ...(p.generated ? { generated: true } : {}),
      ...(COACH_ROLES.includes(p.role) && p.role !== "HC" && hc ? { mentor: hc.id } : {}),
      ...((p.role === "PRO" || p.role === "COL") && gm ? { mentor: gm.id } : {}),
      hidden, growth: growthFor(rng, season - p.birthYear), record: [],
    };
  }
  // NFL assistants: the next coordinators and head coaches.
  for (const t of TEAMS) {
    const hc = Object.values(people).find((c) => c.team === t.id && c.role === "HC");
    for (const [i, job] of ASSISTANT_JOBS.entries()) {
      const rng = rngFor(state.seed, `staff-asst:${t.id}:${i}`);
      if (rng() < 0.35) continue;
      const age = job.age[0] + Math.floor(rng() * (job.age[1] - job.age[0]));
      const c = newPerson(state, rng, taken, {
        track: "coach", side: job.side, age, salt: `a${t.id}${i}`, mean: 63, sd: 6,
        job: { kind: "assistant", title: job.title, team: t.id }, background: `${t.name} ${job.title}`,
        scheme: job.side === "offense" ? STAFF.teamSchemes[t.id].offense : STAFF.teamSchemes[t.id].defense, mentor: hc?.id,
      });
      people[c.id] = c;
    }
    // Special teams assistants and front-office lieutenants.
    const rng = rngFor(state.seed, `staff-asst:${t.id}:st`);
    if (rng() < 0.5) {
      const c = newPerson(state, rng, taken, {
        track: "st", side: null, age: 33 + Math.floor(rng() * 14), salt: `s${t.id}`, mean: 62, sd: 6,
        job: { kind: "assistant", title: "assistant special teams coach", team: t.id }, background: `${t.name} assistant special teams coach`,
      });
      people[c.id] = c;
    }
    const gm = Object.values(people).find((c) => c.team === t.id && c.role === "GM");
    const r2 = rngFor(state.seed, `staff-front:${t.id}`);
    const c = newPerson(state, r2, taken, {
      track: "exec", side: null, age: 36 + Math.floor(r2() * 16), salt: `f${t.id}`, mean: 66, sd: 6,
      job: { kind: "front", title: r2() < 0.5 ? "assistant general manager" : "director of player personnel", team: t.id },
      background: `${t.name} front office`, mentor: gm?.id,
    });
    c.background = `${t.name} ${c.job!.title}`;
    people[c.id] = c;
    if (r2() < 0.4) {
      const tr = newPerson(state, r2, taken, {
        track: "trainer", side: null, age: 34 + Math.floor(r2() * 14), salt: `t${t.id}`, mean: 63, sd: 7,
        job: { kind: "assistant", title: "assistant athletic trainer", team: t.id }, background: `${t.name} assistant athletic trainer`,
      });
      people[tr.id] = tr;
    }
  }
  // College head coaches at the bigger programs, and their coordinators.
  for (const ct of COLLEGE_TEAMS) {
    const power = CONFERENCES[ct.conference]?.power;
    if (!ct.coach || (!power && ct.strength < 70)) continue;
    const rng = rngFor(state.seed, `staff-college:${ct.id}`);
    const age = 40 + Math.floor(rng() * 22);
    const side: "offense" | "defense" = rng() < 0.55 ? "offense" : "defense";
    const name = ct.coach;
    taken.add(name);
    const hidden: StaffHidden = {
      playCalling: clamp(67 + gaussian(rng) * 8), development: clamp(72 + gaussian(rng) * 5), gameManagement: clamp(67 + gaussian(rng) * 7),
      leadership: clamp(75 + gaussian(rng) * 7), evaluation: clamp(69 + gaussian(rng) * 6),
    };
    const id = slug(name, season - age, `c${ct.id}`);
    people[id] = {
      id, name, birthYear: season - age, birthYearEstimated: true, track: "coach", side,
      scheme: randomScheme(rng, side), background: `${ct.school} head coach since ${ct.coachSince}`,
      team: null, role: null, job: { kind: "college", title: "head coach", team: ct.id }, hiredYear: ct.coachSince ?? season,
      callsPlays: [], hidden, growth: growthFor(rng, age), record: [],
    };
    if (power && rng() < 0.6) {
      const s2: "offense" | "defense" = rng() < 0.5 ? "offense" : "defense";
      const c = newPerson(state, rng, taken, {
        track: "coach", side: s2, age: 33 + Math.floor(rng() * 14), salt: `cc${ct.id}`, mean: 64, sd: 6,
        job: { kind: "college", title: s2 === "offense" ? "offensive coordinator" : "defensive coordinator", team: ct.id },
        background: `${ct.school} ${s2 === "offense" ? "offensive" : "defensive"} coordinator`, mentor: id,
      });
      people[c.id] = c;
    }
  }
  // A few experienced coaches and executives out of work, waiting for a call.
  for (let i = 0; i < 18; i++) {
    const rng = rngFor(state.seed, `staff-free:${i}`);
    const kind = i < 4 ? "HC" : i < 12 ? (i % 2 ? "OC" : "DC") : i < 15 ? "GM" : "STC";
    const track = trackOf(kind);
    const side = kind === "OC" ? "offense" : kind === "DC" ? "defense" : kind === "HC" ? (rng() < 0.5 ? "offense" : "defense") : null;
    const team = pick(rng, TEAMS);
    const c = newPerson(state, rng, taken, {
      track, side, age: 46 + Math.floor(rng() * 18), salt: `x${i}`, mean: kind === "HC" ? 70 : 66, sd: 6,
      background: `Former ${team.name} ${ROLE_NAME[kind]}`,
    });
    c.fired = season - 1;
    people[c.id] = c;
  }
  return {
    people, schemes: structuredClone(STAFF.teamSchemes), install: {}, owed: [], searches: [], offers: [], proposals: [],
    expect: {}, log: [],
  };
}

/** The save's staff, created the first time (new games and saves from before the carousel). */
export function ensureStaff(state: GameState): void {
  if (!state.staff) {
    // Start from the real staffs, not whatever save was loaded before.
    bindStaff({ ...state, staff: undefined });
    state.staff = initStaff(state);
  }
  bindStaff(state);
}

// ---- Binding the save's staff to the lookups ----

const DATA_HIDDEN = structuredClone(HIDDEN_STAFF);
const DATA_PEOPLE = [...STAFF.people];
const DATA_TEAM_SCHEMES = structuredClone(STAFF.teamSchemes);
const COLLEGE_COACH = Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, t.coach]));

/** A person in the shape the rest of the engine reads. */
function asPerson(c: Coach): StaffPerson {
  return {
    id: c.id, name: c.name, team: c.team!, role: c.role!, birthYear: c.birthYear, birthYearEstimated: !!c.birthYearEstimated,
    hiredYear: c.hiredYear, background: c.background, side: c.side, callsPlays: c.callsPlays, scheme: c.scheme,
    ...(c.generated ? { generated: true } : {}),
  };
}

/** Points the staff lookups, hidden numbers and college head coaches at this save. */
export function bindStaff(state: GameState): void {
  const s = state.staff;
  for (const k of Object.keys(HIDDEN_STAFF)) delete HIDDEN_STAFF[k];
  for (const k of Object.keys(STAFF_BY_ID)) delete STAFF_BY_ID[k];
  if (!s) {
    Object.assign(HIDDEN_STAFF, DATA_HIDDEN);
    STAFF.people = [...DATA_PEOPLE];
    for (const p of STAFF.people) STAFF_BY_ID[p.id] = p;
    STAFF.teamSchemes = structuredClone(DATA_TEAM_SCHEMES);
    for (const t of COLLEGE_TEAMS) COLLEGE_TEAM[t.id].coach = COLLEGE_COACH[t.id];
    bindStaffTables(STAFF.people, STAFF.teamSchemes, {});
    return;
  }
  const employed = Object.values(s.people).filter((c) => c.team && c.role);
  STAFF.people = employed.map(asPerson);
  for (const p of STAFF.people) STAFF_BY_ID[p.id] = p;
  for (const c of Object.values(s.people)) HIDDEN_STAFF[c.id] = c.hidden;
  STAFF.teamSchemes = s.schemes;
  // College head coaches who left for the NFL have successors.
  for (const t of COLLEGE_TEAMS) COLLEGE_TEAM[t.id].coach = COLLEGE_COACH[t.id];
  for (const c of Object.values(s.people)) {
    if (c.job?.kind === "college" && c.job.title === "head coach" && COLLEGE_TEAM[c.job.team]) COLLEGE_TEAM[c.job.team].coach = c.name;
  }
  bindStaffTables(STAFF.people, s.schemes, s.install);
}

// ---- Reputation and what people say ----

/** The main numbers for a person's kind of job, averaged (engine only). */
export function quality(c: Coach, role: StaffRole = c.role ?? (c.track === "exec" || c.track === "scout" ? "GM" : c.track === "st" ? "STC" : c.track === "trainer" ? "TRN" : "OC")): number {
  const h = c.hidden;
  const v = (k: keyof StaffHidden, d = 60) => h[k] ?? d;
  switch (role) {
    case "HC": return 0.3 * v("playCalling") + 0.15 * v("development") + 0.2 * v("gameManagement") + 0.25 * v("leadership") + 0.1 * v("evaluation");
    case "OC": case "DC": return 0.55 * v("playCalling") + 0.3 * v("development") + 0.15 * v("evaluation");
    case "STC": return 0.7 * v("specialTeams") + 0.3 * v("development");
    case "GM": return 0.4 * v("evaluation") + 0.3 * v("negotiation") + 0.3 * v("capManagement");
    case "PRO": case "COL": return v("evaluation");
    case "TRN": return 0.5 * v("prevention") + 0.5 * v("recovery");
  }
}

function reputationFromHidden(track: StaffTrack, role: StaffRole, h: StaffHidden): number {
  const c = { hidden: h, track } as Coach;
  return quality(c, role);
}

/**
 * How the league sees a person, 0-100: the job they hold and, more and more
 * as the seasons pile up, what their teams did. Public, unlike the hidden numbers.
 */
export function reputation(state: GameState, c: Coach): number {
  const rng = rngFor(state.seed, `rep:${c.id}`);
  const proxy = quality(c) + gaussian(rng) * 5;
  const base: number = c.role === "HC" ? 6 : c.role === "GM" ? 4 : c.role ? 0 : c.job?.kind === "college" && c.job.title === "head coach" ? -2 : c.job ? -8 : -6;
  const recent = c.record.slice(-3);
  if (!recent.length) return Math.max(20, Math.min(98, proxy + base));
  let score = 0;
  for (const r of recent) {
    const g = r.w + r.l + r.t;
    const wp = g ? (r.w + r.t / 2) / g : 0.5;
    const unit = r.rank ? (16.5 - r.rank) / 16 : (wp - 0.5) * 2;
    score += r.role === "OC" || r.role === "DC" ? 70 + unit * 16 : 70 + (wp - 0.5) * 40 + Math.max(0, r.playoffs) * 3;
  }
  score /= recent.length;
  const w = Math.min(0.7, recent.length * 0.25);
  return Math.max(20, Math.min(98, (1 - w) * proxy + w * score + base));
}

/** Rumor and reputation as tags: noisy, so some are wrong. A closer look (an interview) makes them sharper. */
const TAGS: Partial<Record<keyof StaffHidden, [string, string]>> = {
  playCalling: ["Creative play caller", "Play calling has been questioned"],
  development: ["Develops young players", "Young players have stalled under this staff"],
  gameManagement: ["Sharp on game day: clock, challenges, fourth downs", "Shaky clock and fourth-down decisions"],
  leadership: ["Players love playing for this coach", "Has lost a locker room before"],
  evaluation: ["Good eye for talent", "Misjudges players"],
  specialTeams: ["Special teams units are always sound", "Special teams have been leaky"],
  negotiation: ["Tough, fair negotiator", "Tends to overpay at the table"],
  capManagement: ["Keeps the cap healthy", "Leaves the cap in rough shape"],
  prevention: ["Players stay healthy under this staff", "Soft-tissue injuries keep piling up"],
  recovery: ["Gets injured players back quickly", "Slow return-to-play timelines"],
};

/** The tags that count against someone. */
export const CONCERN_TAGS = new Set(Object.values(TAGS).map((t) => t![1]));

export function knownFor(state: GameState, c: Coach, looks = 0, viewer = "public"): string[] {
  const sd = looks >= 2 ? 2.5 : looks === 1 ? 4.5 : 7;
  const rows = KEYS[c.track].map((k) => {
    const z = gaussian(rngFor(state.seed, `tag:${viewer}:${c.id}:${k}`));
    return { k, v: (c.hidden[k] ?? 60) + z * sd };
  });
  const out: string[] = [];
  for (const r of [...rows].sort((a, b) => b.v - a.v).slice(0, 2)) if (r.v >= 74 && TAGS[r.k]) out.push(TAGS[r.k]![0]);
  const low = [...rows].sort((a, b) => a.v - b.v)[0];
  if (low && low.v <= 61 && TAGS[low.k]) out.push(TAGS[low.k]![1]);
  return out;
}

/** Where a person works now, in words. */
export function jobLabel(c: Coach, teamName: (id: string) => string): string {
  if (c.retired) return "Retired";
  if (c.team && c.role) return `${teamName(c.team)} ${ROLE_NAME[c.role]}`;
  if (c.job?.kind === "college") return `${COLLEGE_TEAM[c.job.team]?.school ?? c.job.team} ${c.job.title}`;
  if (c.job) return `${teamName(c.job.team)} ${c.job.title}`;
  return "Out of football";
}

// ---- Contracts and pay ----

/** Our staff payroll this year, and what we still pay people we fired. */
export function payroll(state: GameState, team: string): { staff: number; owed: number } {
  const s = state.staff;
  if (!s) return { staff: 0, owed: 0 };
  let pay = 0;
  for (const c of Object.values(s.people)) if (c.team === team && c.role && c.contract) pay += c.contract.salary;
  const year = RULES.season;
  const owed = s.owed.filter((o) => o.team === team && o.through >= year).reduce((sum, o) => sum + o.salary, 0);
  return { staff: pay, owed };
}

/** What the business books assume the eight top jobs cost; the rest of the coaching staff is in the base budget. */
export const BUDGETED_TOP_STAFF = 24 * M;

// ---- The season on the record ----

/** A team's staff season goes on their records once the team is done playing. */
export function recordTeamSeason(state: GameState, team: string): void {
  const s = state.staff;
  if (!s) return;
  const table = standings(state);
  const rank = (key: "pf" | "pa") => {
    const order = TEAMS.map((t) => t.id).sort((a, b) => key === "pf" ? table[b].pf - table[a].pf : table[a].pa - table[b].pa);
    return order.indexOf(team) + 1;
  };
  const wins = playoffWins(state);
  const inPlayoffs = [...(state.seeds?.AFC ?? []), ...(state.seeds?.NFC ?? [])].includes(team);
  const r = table[team];
  for (const c of Object.values(s.people)) {
    if (c.team !== team || !c.role) continue;
    if (c.record.some((x) => x.season === RULES.season && x.team === team)) continue;
    const row: CoachSeason = { season: RULES.season, team, role: c.role, w: r.w, l: r.l, t: r.t, playoffs: inPlayoffs ? wins[team] ?? 0 : -1 };
    if (c.role === "OC") row.rank = rank("pf");
    if (c.role === "DC") row.rank = rank("pa");
    if (c.role === "HC" && c.callsPlays.length) row.rank = rank(c.callsPlays[0] === "offense" ? "pf" : "pa");
    c.record.push(row);
    if (c.record.length > 12) c.record.splice(0, c.record.length - 12);
  }
}

function playoffWins(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const gid of Object.keys(state.playoffTeams)) {
    const r = state.results[gid];
    if (!r) continue;
    const w = r.homeScore > r.awayScore ? r.home : r.away;
    out[w] = (out[w] ?? 0) + 1;
  }
  return out;
}

// ---- Careers ----

/**
 * The offseason for coaches: everyone grows or slips a little and new
 * assistants come up, so there are always names to hire. Runs at the
 * rollover; `season` is the season ahead.
 */
export function ageStaff(state: GameState, season: number): void {
  const s = state.staff;
  if (!s) return;
  for (const c of Object.values(s.people)) {
    if (c.retired) continue;
    const rng = rngFor(state.seed, `staff-age:${season}:${c.id}`);
    const age = season - c.birthYear;
    for (const k of KEYS[c.track]) {
      const v = c.hidden[k];
      if (v === undefined) continue;
      c.hidden[k] = clamp(v + c.growth * (0.6 + 0.8 * rng()) + gaussian(rng) * 0.6, 30, 97);
    }
    c.growth = Math.round((c.growth * 0.85 + (age >= 60 ? -0.25 : 0) + gaussian(rng) * 0.15) * 100) / 100;
  }
  // The long retired leave the save.
  for (const [id, c] of Object.entries(s.people)) {
    if (c.retired && season - c.retired > 3) delete s.people[id];
  }
  replenish(state, season);
}

/** Whether a person calls it a career when the season ends: rare for working head coaches, common for the old and the idle. */
export function retiresNow(state: GameState, c: Coach): boolean {
  const season = RULES.season;
  const age = season - c.birthYear;
  let p = age < 58 ? 0.004 : age < 63 ? 0.03 : age < 68 ? 0.1 : age < 72 ? 0.25 : 0.5;
  if (c.role === "HC" && age < 68) p *= 0.5;
  const idle = !c.team && !c.job;
  if (idle && c.fired !== undefined && season - c.fired >= 2) p += 0.35;
  if (idle && c.fired === undefined) p += 0.15;
  return rngFor(state.seed, `staff-retire:${season}:${c.id}`)() < p;
}

export function retire(state: GameState, id: string): { team: string; role: StaffRole } | null {
  const c = state.staff!.people[id];
  const held = vacate(state, id, "retired");
  c.retired = RULES.season;
  return held;
}

/** A person leaves whatever job they had: the job opens (a search starts in carousel.ts for NFL jobs). */
export function vacate(state: GameState, id: string, why: "retired" | "hired" | "fired"): { team: string; role: StaffRole } | null {
  const c = state.staff!.people[id];
  const held = c.team && c.role ? { team: c.team, role: c.role } : null;
  if (c.job?.kind === "college" && c.job.title === "head coach" && why !== "fired") {
    // The school hires a successor.
    const rng = rngFor(state.seed, `college-succ:${c.job.team}:${state.date}`);
    const taken = new Set(Object.values(state.staff!.people).map((p) => p.name));
    const succ = newPerson(state, rng, taken, {
      track: "coach", side: rng() < 0.5 ? "offense" : "defense", age: 38 + Math.floor(rng() * 14), salt: `cs${c.job.team}${state.date}`,
      mean: 66, sd: 6, job: { kind: "college", title: "head coach", team: c.job.team },
      background: `${COLLEGE_TEAM[c.job.team]?.school ?? c.job.team} head coach since ${RULES.season}`,
    });
    state.staff!.people[succ.id] = succ;
  }
  c.team = null;
  c.role = null;
  c.callsPlays = [];
  if (why !== "hired") c.job = undefined;
  if (why === "fired") c.fired = RULES.season;
  delete c.contract;
  return held;
}

/** New assistants come up each year so every staff has names below the coordinators. */
function replenish(state: GameState, season: number): void {
  const s = state.staff!;
  const taken = new Set(Object.values(s.people).map((c) => c.name));
  for (const t of TEAMS) {
    const assistants = Object.values(s.people).filter((c) => !c.retired && c.job?.kind === "assistant" && c.job.team === t.id && c.track === "coach");
    const hc = Object.values(s.people).find((c) => c.team === t.id && c.role === "HC");
    for (let i = assistants.length; i < 4; i++) {
      const rng = rngFor(state.seed, `staff-new:${season}:${t.id}:${i}`);
      const job = pick(rng, ASSISTANT_JOBS);
      const c = newPerson(state, rng, taken, {
        track: "coach", side: job.side, age: 30 + Math.floor(rng() * 14), salt: `n${season}${t.id}${i}`, mean: 61, sd: 6,
        job: { kind: "assistant", title: job.title, team: t.id }, background: `${t.name} ${job.title}`,
        scheme: job.side === "offense" ? s.schemes[t.id].offense : s.schemes[t.id].defense, mentor: hc?.id,
      });
      c.birthYear = season - (30 + Math.floor(rng() * 14));
      s.people[c.id] = c;
    }
    const front = Object.values(s.people).some((c) => !c.retired && c.job?.kind === "front" && c.job.team === t.id);
    if (!front) {
      const rng = rngFor(state.seed, `staff-newfront:${season}:${t.id}`);
      const gm = Object.values(s.people).find((c) => c.team === t.id && c.role === "GM");
      const c = newPerson(state, rng, taken, {
        track: "exec", side: null, age: 36 + Math.floor(rng() * 12), salt: `nf${season}${t.id}`, mean: 65, sd: 6,
        job: { kind: "front", title: "assistant general manager", team: t.id }, background: `${t.name} assistant general manager`, mentor: gm?.id,
      });
      c.birthYear = season - (36 + Math.floor(rng() * 12));
      s.people[c.id] = c;
    }
  }
}

/** A replacement nobody had to search for: an assistant steps up, or the league finds a name. */
export function newHireFromWithin(state: GameState, team: string, role: StaffRole): Coach {
  const s = state.staff!;
  const inHouse = Object.values(s.people).filter((c) => !c.retired && c.job?.team === team && c.job.kind !== "college" && canHold(c, role));
  if (inHouse.length) return inHouse.sort((a, b) => reputation(state, b) - reputation(state, a))[0];
  const rng = rngFor(state.seed, `staff-fill:${team}:${role}:${state.date}`);
  const taken = new Set(Object.values(s.people).map((c) => c.name));
  const side = role === "OC" ? "offense" : role === "DC" ? "defense" : null;
  const c = newPerson(state, rng, taken, {
    track: trackOf(role), side, age: 34 + Math.floor(rng() * 16), salt: `w${team}${role}${state.date}`, mean: 62, sd: 6,
    background: "Longtime NFL assistant",
  });
  s.people[c.id] = c;
  return c;
}

/** Puts a person in an NFL staff job. */
export function install(state: GameState, id: string, team: string, role: StaffRole, years: number, salary: number): void {
  const s = state.staff!;
  const c = s.people[id];
  const leftCollege = c.job?.kind === "college" && c.job.title === "head coach";
  if (c.team && c.role) vacate(state, id, "hired");
  else if (leftCollege) vacate(state, id, "hired");
  c.job = undefined;
  c.team = team;
  c.role = role;
  c.hiredYear = hiredForNext(state) ? RULES.season + 1 : RULES.season;
  c.contract = { through: c.hiredYear + years - 1, salary };
  c.fired = undefined;
  // Whoever we stop paying after an offset: a fired coach hired elsewhere comes off the old team's books.
  s.owed = s.owed.filter((o) => o.id !== id);
  c.callsPlays = [];
  if (role === "OC") c.callsPlays = ["offense"];
  if (role === "DC") c.callsPlays = ["defense"];
}

/** Hires after the regular season are for next season. */
function hiredForNext(state: GameState): boolean {
  return state.date > RULES.keyDates.regularSeasonEnd;
}

export { DATA_PEOPLE };
