// The college coaching carousel. Every FBS program has a head coach on the
// save's staff list (the real 2026 coaches; made-up people for the jobs that
// open later). Programs judge their coach against what the program expects of
// itself: the bigger the brand, the shorter the leash. The firings come on the
// Sunday and Monday after rivalry week, with a few in midseason; the searches
// run through December, and a coach who wins at a smaller school is the first
// name on a bigger school's list, so one hire opens the next job down the line.
//
// A coach's hidden numbers drive the program: recruiting pull (leadership and
// evaluation), game day (play calling and game management) and development.
import { COLLEGE_SCHEDULE, COLLEGE_TEAM, COLLEGE_TEAMS, CONFERENCES, schoolName } from "./collegeData";
import { addDays, daysBetween, weekday } from "./dates";
import { newPerson } from "./coaches";
import { news } from "./inbox";
import { RULES } from "./league";
import { gaussian, rngFor } from "./rng";
import type { CfbWorld, Coach, GameState } from "./types";

const LOG_CAP = 400;

// ---- Who coaches where ----

const index = new WeakMap<object, { key: string; map: Record<string, string | null> }>();
let moves = 0;

function people(state: GameState): Record<string, Coach> {
  return state.staff?.people ?? {};
}

/** The head coach of a program, if the job is filled. */
export function headCoach(state: GameState, team: string): Coach | undefined {
  const ps = people(state);
  const key = `${state.date}:${moves}`;
  let hit = index.get(ps);
  const valid = (id: string | null | undefined) => {
    if (!id) return id === null;
    const c = ps[id];
    return !!c && !c.retired && c.job?.kind === "college" && c.job.title === "head coach" && c.job.team === team;
  };
  if (!hit || hit.key !== key || !valid(hit.map[team])) {
    const map: Record<string, string | null> = Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, null]));
    for (const c of Object.values(ps)) {
      if (!c.retired && c.job?.kind === "college" && c.job.title === "head coach" && c.job.team in map && !map[c.job.team]) map[c.job.team] = c.id;
    }
    hit = { key, map };
    index.set(ps, hit);
  }
  const id = hit.map[team];
  return id ? ps[id] : undefined;
}

export function coachName(state: GameState, team: string): string {
  return headCoach(state, team)?.name ?? (state.cfb ? "Interim coach" : COLLEGE_TEAM[team]?.coach ?? "");
}

/** Engine only: how well a coach recruits, coaches on Saturdays and develops players (the staff scale). */
export function recruiter(c: Coach | undefined): number {
  if (!c) return 62;
  return 0.6 * (c.hidden.leadership ?? 68) + 0.4 * (c.hidden.evaluation ?? 68);
}

export function gameDay(c: Coach | undefined): number {
  if (!c) return 62;
  return 0.5 * (c.hidden.playCalling ?? 66) + 0.5 * (c.hidden.gameManagement ?? 66);
}

export function developer(c: Coach | undefined): number {
  return c ? c.hidden.development ?? 68 : 64;
}

// ---- Every program gets its coach ----

/** Puts a head coach on the staff list for every program that doesn't have one (real names where the data has them). */
export function ensureCollegeCoaches(state: GameState): void {
  const s = state.staff;
  if (!s) return;
  const taken = new Set(Object.values(s.people).map((c) => c.name));
  for (const t of COLLEGE_TEAMS) {
    // An open job is filled by its search, not here.
    if (headCoach(state, t.id) || state.cfb?.openings[t.id]) continue;
    const rng = rngFor(state.seed, `cfb-coach0:${t.id}`);
    const real = t.coach && !taken.has(t.coach) ? t.coach : undefined;
    const strength = state.cfb?.programs[t.id]?.strength ?? t.strength;
    const c = newPerson(state, rng, taken, {
      track: "coach", side: rng() < 0.55 ? "offense" : "defense", age: 38 + Math.floor(rng() * 24), salt: `cfb${t.id}`,
      mean: 61 + (strength - 64) * 0.22, sd: 6, job: { kind: "college", title: "head coach", team: t.id },
      background: `${t.school} head coach`, name: real,
    });
    c.hiredYear = real ? t.coachSince ?? RULES.season : RULES.season;
    c.background = `${t.school} head coach since ${c.hiredYear}`;
    s.people[c.id] = c;
    moves++;
  }
}

// ---- The calendar ----

let calKey: unknown = null;
let BLACK_MONDAY = "";
let MID_FROM = "";
let MID_TO = "";
/** The Monday after the last regular-season Saturday, the Sundays of October and November before it. */
function calendar(): void {
  if (calKey === COLLEGE_SCHEDULE) return;
  calKey = COLLEGE_SCHEDULE;
  const last = COLLEGE_SCHEDULE.filter((g) => g.week <= 13).reduce((m, g) => (g.date > m ? g.date : m), "");
  BLACK_MONDAY = addDays(last, 2);
  MID_FROM = addDays(last, -60);
  MID_TO = addDays(last, -6);
}

export function blackMonday(): string {
  calendar();
  return BLACK_MONDAY;
}

/** The college season a decision is made in: the fall that just ended (or is under way). */
function cfbSeason(state: GameState): number {
  return state.college?.season ?? RULES.season;
}

/** The first season a coach hired today would coach. */
function firstSeason(state: GameState): number {
  const s = cfbSeason(state);
  return state.date > blackMonday() || Number(state.date.slice(0, 4)) > s ? s + 1 : s;
}

// ---- Expectations ----

/** What a program expects to win, from its standing in the sport (a share of games). */
export function expectation(w: CfbWorld, team: string): number {
  const p = w.programs[team];
  const power = CONFERENCES[COLLEGE_TEAM[team].conference]?.power;
  return Math.max(0.3, Math.min(0.85, 0.52 + (p.prestige - 64) * 0.011 + (power ? 0 : 0.04)));
}

/** A coach's seasons at a program: [season, wins, losses, rank, conference title, playoff]. */
export function tenureRows(state: GameState, coachId: string, team?: string): [string, number[]][] {
  const w = state.cfb;
  if (!w) return [];
  const out: [string, number[]][] = [];
  for (const [t, p] of Object.entries(w.programs)) {
    if (team && t !== team) continue;
    for (const row of p.seasons) if (p.coaches[row[0]] === coachId) out.push([t, row]);
  }
  return out.sort((a, b) => a[1][0] - b[1][0]);
}

/** How a coach's teams did against what their programs expected (wins above expectation per season). */
export function overachievement(state: GameState, c: Coach): number {
  const w = state.cfb!;
  const rows = tenureRows(state, c.id);
  if (!rows.length) return 0;
  let sum = 0;
  let wt = 0;
  rows.slice(-4).forEach(([t, r], i, all) => {
    const g = r[1] + r[2];
    if (!g) return;
    const k = 1 + (i === all.length - 1 ? 0.5 : 0);
    sum += k * (r[1] / g - expectation(w, t)) * 12 + k * (r[4] ? 1 : 0) + k * (r[5] ? 1 + r[5] * 0.5 : 0);
    wt += k;
  });
  return wt ? sum / wt : 0;
}

/** Wins and losses this fall so far for a program. */
function liveRecord(state: GameState, team: string): [number, number] {
  const c = state.college;
  if (!c) return [0, 0];
  let w = 0;
  let l = 0;
  for (const g of [...COLLEGE_SCHEDULE, ...c.post]) {
    if (g.away !== team && g.home !== team) continue;
    const r = c.results[g.id];
    if (!r) continue;
    const us = g.home === team ? r[1] : r[0];
    const them = g.home === team ? r[0] : r[1];
    if (us > them) w++;
    else l++;
  }
  return [w, l];
}

/** How hot a coach's seat is, 0 cool to 1 gone (public: it's what the media and boosters say). */
export function seatHeat(state: GameState, team: string): number {
  const w = state.cfb;
  const c = headCoach(state, team);
  if (!w || !c) return 0;
  const exp = expectation(w, team);
  const [lw, ll] = liveRecord(state, team);
  const live = lw + ll ? lw / (lw + ll) : exp;
  const past = w.programs[team].seasons.filter((r) => w.programs[team].coaches[r[0]] === c.id).slice(-2);
  const rec = [live, ...past.reverse().map((r) => r[1] / Math.max(1, r[1] + r[2]))];
  const weights = [lw + ll >= 6 ? 0.55 : (lw + ll) * 0.08, 0.3, 0.15].slice(0, rec.length);
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const actual = rec.reduce((s, x, i) => s + x * weights[i], 0) / wsum;
  const gap = exp - actual;
  const tenure = Math.max(0, cfbSeason(state) - c.hiredYear);
  const titles = past.some((r) => r[4] || r[5] >= 3) ? 0.12 : 0;
  // Meeting expectations is safe; a season two or three wins short starts the talk; a collapse ends it.
  const raw = 1 / (1 + Math.exp(-(gap - 0.2 - titles) * 16));
  return Math.round(raw * (tenure >= 2 ? 1 : tenure === 1 ? 0.45 : 0.08) * 100) / 100;
}

// ---- Firings, departures, searches ----

function log(state: GameState, team: string, kind: CfbWorld["log"][number]["kind"], coach: string, text: string): void {
  const w = state.cfb!;
  w.log.unshift({ date: state.date, team, kind, coach, text });
  if (w.log.length > LOG_CAP) w.log.length = LOG_CAP;
  news(state, "college", `CFB · ${text}`);
}

/** Made-up buyout figures: what is left on the deal, roughly. */
function buyout(state: GameState, c: Coach): number {
  const left = Math.max(1, (c.contract?.through ?? c.hiredYear + 5) - cfbSeason(state));
  return Math.round(((c.contract?.salary ?? 3_000_000) * left * 0.7) / 100_000) * 100_000;
}

function money(x: number): string {
  return x >= 1_000_000 ? `$${(x / 1_000_000).toFixed(1)} million` : `$${Math.round(x / 1000)},000`;
}

function open(state: GameState, team: string): void {
  state.cfb!.openings[team] = state.date;
}

export function fireCoach(state: GameState, team: string, midseason = false): void {
  const c = headCoach(state, team);
  if (!c) return;
  const [w, l] = liveRecord(state, team);
  c.job = undefined;
  c.fired = RULES.season;
  delete c.contract;
  moves++;
  open(state, team);
  const out = buyout(state, c);
  log(state, team, "fired", c.id, `${schoolName(team)} fire head coach ${c.name}${midseason ? ` after a ${w}-${l} start; an assistant finishes the season` : ` after a ${w}-${l} season`} (buyout around ${money(out)})`);
}

function retireCoach(state: GameState, team: string): void {
  const c = headCoach(state, team);
  if (!c) return;
  c.job = undefined;
  c.retired = RULES.season;
  moves++;
  open(state, team);
  log(state, team, "retired", c.id, `${c.name} retires as ${schoolName(team)} head coach after ${Math.max(1, cfbSeason(state) - c.hiredYear + 1)} seasons`);
}

/** Black Monday: the programs that are done waiting, and the coaches who are done coaching. */
function blackMondayMoves(state: GameState): void {
  const w = state.cfb!;
  const season = cfbSeason(state);
  for (const t of COLLEGE_TEAMS) {
    if (w.openings[t.id]) continue;
    const c = headCoach(state, t.id);
    if (!c) continue;
    const age = season - c.birthYear;
    const rng = rngFor(state.seed, `cfb-fire:${season}:${t.id}`);
    if (age >= 60 && rng() < (age - 58) * 0.035) {
      retireCoach(state, t.id);
      continue;
    }
    const heat = seatHeat(state, t.id);
    if (rng() < heat * 0.8) fireCoach(state, t.id);
  }
}

/** A few programs pull the plug in October. */
function midseason(state: GameState): void {
  const w = state.cfb!;
  for (const t of COLLEGE_TEAMS) {
    if (w.openings[t.id]) continue;
    const [lw, ll] = liveRecord(state, t.id);
    if (ll < 4 || lw + ll < 6) continue;
    const heat = seatHeat(state, t.id);
    if (heat < 0.75) continue;
    if (rngFor(state.seed, `cfb-mid:${state.date}:${t.id}`)() < (heat - 0.7) * 0.35) fireCoach(state, t.id, true);
  }
}

/** Who a program would call: coaches who won somewhere smaller, coordinators, and the out of work. */
function candidates(state: GameState, team: string): { c: Coach; score: number }[] {
  const w = state.cfb!;
  const prestige = w.programs[team].prestige;
  const conf = COLLEGE_TEAM[team].conference;
  const season = cfbSeason(state);
  const out: { c: Coach; score: number }[] = [];
  for (const c of Object.values(people(state))) {
    if (c.retired || c.track !== "coach" || c.team) continue;
    const age = season - c.birthYear;
    if (age > 66 || age < 32) continue;
    const job = c.job;
    let base: number;
    if (job?.kind === "college" && job.title === "head coach") {
      if (job.team === team || w.openings[job.team]) continue;
      const theirs = w.programs[job.team]?.prestige ?? 50;
      // A sitting coach moves up, not across.
      if (prestige - theirs < 8 || c.hiredYear >= season) continue;
      base = 62 + overachievement(state, c) * 2.2 + (theirs - 50) * 0.08;
    } else if (job?.kind === "college") {
      if (!/coordinator/.test(job.title)) continue;
      base = 58 + ((w.programs[job.team]?.strength ?? 60) - 64) * 0.18;
    } else if (!job) {
      if (c.fired === undefined && !c.formerPlayer) continue;
      base = 56 + overachievement(state, c) * 1.5 + (c.fired === season ? -4 : 0);
    } else continue;
    const hidden = (recruiter(c) + gameDay(c) + developer(c)) / 3;
    const noise = gaussian(rngFor(state.seed, `cfb-cand:${season}:${team}:${c.id}`)) * 3;
    const near = job?.kind === "college" && COLLEGE_TEAM[job.team]?.conference === conf ? 1.5 : 0;
    out.push({ c, score: 0.5 * base + 0.5 * hidden + noise + near });
  }
  return out.sort((a, b) => b.score - a.score);
}

function salaryFor(prestige: number): number {
  return Math.round((900_000 + Math.max(0, prestige - 40) ** 2.1 * 1_800) / 50_000) * 50_000;
}

function hire(state: GameState, team: string): void {
  const w = state.cfb!;
  const list = candidates(state, team);
  const season = firstSeason(state);
  let pick = list[0]?.c;
  if (!pick) {
    // Nobody on the list: an up-and-coming assistant gets his first job (made up).
    const rng = rngFor(state.seed, `cfb-new:${state.date}:${team}`);
    const taken = new Set(Object.values(people(state)).map((c) => c.name));
    pick = newPerson(state, rng, taken, {
      track: "coach", side: rng() < 0.5 ? "offense" : "defense", age: 36 + Math.floor(rng() * 12), salt: `cn${team}${state.date}`,
      mean: 62, sd: 6, background: "Longtime college assistant",
    });
    state.staff!.people[pick.id] = pick;
  }
  const from = pick.job;
  const fromText = from?.kind === "college"
    ? `${from.title === "head coach" ? "head coach" : from.title} at ${schoolName(from.team)}`
    : pick.fired !== undefined ? `out of work since ${pick.fired === RULES.season ? "this season" : pick.fired}` : pick.background ?? "";
  if (from?.kind === "college" && from.title === "head coach") open(state, from.team);
  // A power program keeps a coordinator on hand; the promoted one is replaced (made up).
  if (from?.kind === "college" && from.title !== "head coach" && CONFERENCES[COLLEGE_TEAM[from.team]?.conference]?.power) {
    const rng = rngFor(state.seed, `cfb-coord:${state.date}:${from.team}`);
    const taken = new Set(Object.values(people(state)).map((c) => c.name));
    const side = /offensive/.test(from.title) ? "offense" : "defense";
    const r = newPerson(state, rng, taken, {
      track: "coach", side, age: 32 + Math.floor(rng() * 14), salt: `cc${from.team}${state.date}`, mean: 63, sd: 6,
      job: { kind: "college", title: from.title, team: from.team }, background: `${schoolName(from.team)} ${from.title}`,
    });
    state.staff!.people[r.id] = r;
  }
  pick.job = { kind: "college", title: "head coach", team };
  pick.hiredYear = season;
  delete pick.fired;
  pick.contract = { through: season + 4 + Math.floor(rngFor(state.seed, `cfb-len:${pick.id}:${season}`)() * 3), salary: salaryFor(w.programs[team].prestige) };
  pick.background = `${schoolName(team)} head coach since ${season}`;
  moves++;
  delete w.openings[team];
  log(state, team, "hired", pick.id, `${schoolName(team)} hire ${pick.name}${fromText ? ` (${fromText})` : ""} as head coach`);
}

/** Searches take one to three weeks; a midseason opening waits for the season to end. */
function searches(state: GameState): void {
  const w = state.cfb!;
  const bm = blackMonday();
  for (const [team, opened] of Object.entries(w.openings).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))) {
    const start = opened < bm && state.date <= addDays(bm, 30) && daysBetween(opened, bm) < 70 ? bm : opened;
    const wait = 6 + Math.floor(rngFor(state.seed, `cfb-wait:${team}:${opened}`)() * 14);
    if (state.date >= addDays(start, wait)) hire(state, team);
  }
}

export function cfbCoachesDaily(state: GameState): void {
  const w = state.cfb;
  if (!w || !state.staff) return;
  calendar();
  // NFL teams and retirements leave programs without a coach.
  for (const t of COLLEGE_TEAMS) if (!w.openings[t.id] && !headCoach(state, t.id)) open(state, t.id);
  if (weekday(state.date) === "Sunday" && state.date >= MID_FROM && state.date <= MID_TO) midseason(state);
  if (state.date === BLACK_MONDAY) blackMondayMoves(state);
  searches(state);
}

/** The coaching changes in the last year, newest first. */
export function recentMoves(state: GameState, days = 365): CfbWorld["log"] {
  const since = addDays(state.date, -days);
  return (state.cfb?.log ?? []).filter((m) => m.date >= since);
}
