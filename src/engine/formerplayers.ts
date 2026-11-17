// Former players who become coaches. Each spring a handful of recently retired
// players take their first coaching jobs. In real life about a fifth of NFL
// position coaches played in the league (84 of the 408 on 2026 staffs), and
// with coaching careers lasting fifteen to twenty years that means roughly six
// to eight former players join NFL staffs each year, nearly always as an
// assistant position coach or quality control coach, often with a club they
// played for. About as many start in college, usually at their old school.
// Long careers, quarterbacks, linemen, linebackers and defensive backs, and
// players known for how they prepare and lead are the likeliest; specialists
// and stars who earned enough to stay home rarely do it. Once hired they are
// ordinary staff: they grow (or don't) like any young coach, lead a room when a
// head coach rates their teaching, and only a rare one reaches coordinator or
// head coach. The people are real players; their coaching ability is made up.
import { careerLines } from "./careerstats";
import { personality } from "./clubhouse";
import { newPerson, staff } from "./coaches";
import { COLLEGE_TEAMS } from "./collegeData";
import { addDays, ageOn } from "./dates";
import { news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID, TEAMS } from "./league";
import { ROOM_OF, ROOM_TITLE, roomSalary, roomStaff } from "./positionCoaches";
import { rngFor } from "./rng";
import type { Coach, CoachRoom, GameState, Position } from "./types";

/** How often each position goes into coaching, relative to a receiver. */
const POSITION_LEAN: Record<Position, number> = {
  QB: 1.7, RB: 0.8, FB: 1.2, WR: 1, TE: 1.1, OT: 1.2, OG: 1.3, C: 1.5,
  EDGE: 0.9, IDL: 1, LB: 1.3, CB: 1.1, S: 1.3, K: 0.25, P: 0.25, LS: 0.2,
};

/** Seasons after retiring that a first coaching job is still likely, with the pull fading. */
const SINCE_LEAN = [1.25, 1.1, 0.9, 0.65, 0.4];

/** The chance a typical retired player starts coaching in a given spring (tuned so ~12-16 a year start, NFL and college together). */
const BASE = 0.0105;

/** The day each spring that new coaches are counted: after the retirements and the start of the league year. */
function hiringDay(): string {
  return addDays(RULES.keyDates.newLeagueYear, 35);
}

function sideOf(room: CoachRoom): "offense" | "defense" | null {
  return room === "ST" ? null : ["QB", "RB", "WR", "TE", "OL"].includes(room) ? "offense" : "defense";
}

/** The NFL teams a player suited up for, by today's team ids. */
export function teamsPlayedFor(state: GameState, id: string): string[] {
  const out = new Set<string>();
  for (const s of careerLines(state, id)) if (TEAM_BY_ID[s.team]) out.add(s.team);
  const p = state.players[id];
  if (p?.lastTeam && TEAM_BY_ID[p.lastTeam]) out.add(p.lastTeam);
  const d = PLAYER_BY_ID[id]?.draft.team;
  if (d && TEAM_BY_ID[d] && !out.size) out.add(d);
  return [...out];
}

/** How likely this retired player is to start coaching this spring (engine only). */
export function coachingChance(state: GameState, id: string, since: number): number {
  const data = PLAYER_BY_ID[id];
  if (!data || since < 0 || since >= SINCE_LEAN.length) return 0;
  const exp = state.players[id]?.exp ?? data.yearsExp ?? 0;
  const age = ageOn(data.birthDate, state.date) ?? 33;
  if (age > 45) return 0;
  const me = personality(id);
  // Playing time teaches the game; a cup of coffee rarely leads to a whistle.
  let w = POSITION_LEAN[data.position] * (0.35 + 0.65 * Math.min(1, exp / 8));
  // Students of the game who prepare and lead are the ones coaches recruit onto staffs.
  w *= 0.45 + me.learning * 0.5 + me.work * 0.35 + me.leadership * 0.35;
  // First-round stars with long careers have made their money and mostly go to TV or home.
  if (data.draft.round === 1 && exp >= 9) w *= 0.6;
  return BASE * w * SINCE_LEAN[since];
}

/** A college for a former player's first job: his own school when it plays FBS, otherwise one nearby in spirit (any FBS school). */
function collegeFor(state: GameState, id: string, salt: string): string {
  const school = PLAYER_BY_ID[id]?.college?.toLowerCase();
  const own = school ? COLLEGE_TEAMS.find((t) => t.school.toLowerCase() === school) : undefined;
  if (own && rngFor(state.seed, `pc-own:${salt}`)() < 0.6) return own.id;
  const list = COLLEGE_TEAMS;
  return list[Math.floor(rngFor(state.seed, `pc-col:${salt}`)() * list.length)].id;
}

/** An NFL room with space for another young assistant: a club he played for first, else anywhere. */
function nflOpening(state: GameState, room: CoachRoom, played: string[], salt: string): string | null {
  const open = (team: string) => roomStaff(state, team)[room].length < 3;
  const mine = played.filter(open);
  const rng = rngFor(state.seed, `pc-nfl:${salt}`);
  if (mine.length && rng() < 0.7) return mine[Math.floor(rng() * mine.length)];
  const any = TEAMS.map((t) => t.id).filter(open);
  return any.length ? any[Math.floor(rng() * any.length)] : null;
}

function assistantTitle(room: CoachRoom, size: number): string {
  if (room === "ST") return "special teams assistant";
  const side = sideOf(room);
  return size >= 2 ? `${side === "offense" ? "offensive" : "defensive"} quality control coach` : `assistant ${ROOM_TITLE[room]}`;
}

/** Turns a retired player into a young coach: real name, made-up coaching ability shaped a little by how he played the game. */
function makeCoach(state: GameState, id: string, room: CoachRoom, played: string[]): Coach {
  const data = PLAYER_BY_ID[id];
  const s = staff(state);
  const me = personality(id);
  const rng = rngFor(state.seed, `pc-make:${id}`);
  const age = ageOn(data.birthDate, state.date) ?? 33;
  const taken = new Set(Object.values(s.people).map((c) => c.name));
  const c = newPerson(state, rng, taken, {
    track: room === "ST" ? "st" : "coach", side: sideOf(room), age, salt: `fp${RULES.season}`,
    mean: 56 + (me.learning - 0.5) * 10 + (me.work - 0.5) * 6, sd: 6, name: data.name,
    background: `Former NFL ${data.position}${played.length ? ` (${played.map((t) => TEAM_BY_ID[t]?.name ?? t).join(", ")})` : ""}`,
  });
  // Players carry their standing with them: a respected veteran starts with the room's ear.
  if (c.hidden.leadership !== undefined) c.hidden.leadership = Math.min(90, c.hidden.leadership + (me.leadership - 0.5) * 12);
  // A real person with a known birth date, though his coaching ability is made up.
  delete c.birthYearEstimated;
  delete c.generated;
  if (data.birthDate) c.birthYear = Number(data.birthDate.slice(0, 4));
  c.room = room;
  c.formerPlayer = id;
  if (played.length) c.playedFor = played;
  // Young, fresh from the field: plenty of room to grow, though not all of it shows up.
  c.growth = Math.round((1.1 + (me.learning - 0.5) * 1.2 + (rng() - 0.5)) * 100) / 100;
  return c;
}

/** Where this year's new coaches went, for the report and tests. */
export interface CoachingStart { player: string; coach: string; level: "nfl" | "college"; team: string; title: string }

/** Places a retired player in his first coaching job (exported for tests). */
export function startCoaching(state: GameState, id: string, forceLevel?: "nfl" | "college"): CoachingStart | null {
  const data = PLAYER_BY_ID[id];
  const s = staff(state);
  if (!data || Object.values(s.people).some((c) => c.formerPlayer === id)) return null;
  const room = ROOM_OF[data.position];
  const played = teamsPlayedFor(state, id);
  const exp = state.players[id]?.exp ?? data.yearsExp ?? 0;
  const salt = `${RULES.season}:${id}`;
  // About half start in the NFL; long careers open more doors there.
  let level = forceLevel ?? (rngFor(state.seed, `pc-level:${salt}`)() < 0.3 + Math.min(0.2, exp * 0.02) ? "nfl" : "college");
  const nflTeam = level === "nfl" ? nflOpening(state, room, played, salt) : null;
  if (level === "nfl" && !nflTeam) level = "college";
  const c = makeCoach(state, id, room, played);
  const year = RULES.season + 1;
  let team: string;
  let title: string;
  if (level === "nfl") {
    team = nflTeam!;
    title = assistantTitle(room, roomStaff(state, team)[room].length);
    c.job = { kind: "assistant", title, team, room, lead: false };
    c.scheme = sideOf(room) === "offense" ? s.schemes[team]?.offense ?? c.scheme : sideOf(room) === "defense" ? s.schemes[team]?.defense ?? c.scheme : null;
    const hc = Object.values(s.people).find((p) => p.team === team && p.role === "HC");
    if (hc) c.mentor = hc.id;
    c.hiredYear = year;
    c.contract = { through: year + 1, salary: roomSalary(c, false, year) };
  } else {
    team = collegeFor(state, id, salt);
    title = room === "ST" ? "special teams coach" : ROOM_TITLE[room];
    c.job = { kind: "college", title, team };
    c.hiredYear = year;
  }
  s.people[c.id] = c;
  const where = level === "nfl" ? `the ${TEAM_BY_ID[team].name}` : COLLEGE_TEAMS.find((t) => t.id === team)?.school ?? team;
  s.log.unshift({ date: state.date, team: level === "nfl" ? team : "", text: `Former ${data.position} ${data.name} joins ${where} as ${title}` });
  const notable = exp >= 8 || played.includes(state.userTeam);
  if (notable) news(state, `Former ${data.position} ${data.name} starts coaching: ${title} at ${where}`);
  if (level === "nfl" && team === state.userTeam) {
    const hc = Object.values(s.people).find((p) => p.team === team && p.role === "HC");
    send(state, "staff", hc ? `${hc.name}, Head Coach` : "Head Coach", `${data.name} joins our staff`,
      `We've brought on ${data.name}, who played ${data.position}${played.length ? ` for the ${played.map((t) => TEAM_BY_ID[t]?.name ?? t).join(", ")}` : ""}, as ${title}. ` +
      `It's an entry-level job; we'll see whether he can teach. He fits inside the assistants' budget.`);
  }
  return { player: id, coach: c.id, level, team, title };
}

/** College coaches who played in the league move up to an NFL assistant job when a staff rates their teaching. */
function collegeToPros(state: GameState): number {
  let n = 0;
  for (const c of Object.values(staff(state).people)) {
    if (c.retired || !c.formerPlayer || c.job?.kind !== "college" || !c.room) continue;
    if (RULES.season + 1 - c.hiredYear < 2) continue;
    const odds = Math.max(0, ((c.hidden.development ?? 55) - 58) * 0.03);
    if (rngFor(state.seed, `pc-up:${RULES.season}:${c.id}`)() >= odds) continue;
    const team = nflOpening(state, c.room, c.playedFor ?? [], `up${RULES.season}${c.id}`);
    if (!team) continue;
    const title = assistantTitle(c.room, roomStaff(state, team)[c.room].length);
    c.job = { kind: "assistant", title, team, room: c.room, lead: false };
    c.hiredYear = RULES.season + 1;
    c.contract = { through: RULES.season + 2, salary: roomSalary(c, false, RULES.season + 1) };
    staff(state).log.unshift({ date: state.date, team, text: `${c.name} leaves the college ranks to become ${TEAM_BY_ID[team].name} ${title}` });
    n++;
  }
  return n;
}

/** This spring's new coaches among recently retired players. */
export function formerPlayersSpring(state: GameState): CoachingStart[] {
  const hist = state.history;
  if (!state.staff || !hist) return [];
  const out: CoachingStart[] = [];
  for (const [id, year] of Object.entries(hist.retired)) {
    if (state.players[id]?.status !== "retired") continue;
    const p = coachingChance(state, id, RULES.season - year);
    if (!p || rngFor(state.seed, `pc:${RULES.season}:${id}`)() >= p) continue;
    const start = startCoaching(state, id);
    if (start) out.push(start);
  }
  collegeToPros(state);
  return out;
}

export function formerPlayersDaily(state: GameState): void {
  if (state.date === hiringDay()) formerPlayersSpring(state);
}

/** What a retired player does now, if he coaches: for his player card. */
export function coachingNow(state: GameState, id: string): string | null {
  const c = Object.values(state.staff?.people ?? {}).find((x) => x.formerPlayer === id);
  if (!c) return null;
  if (c.retired) return `Coached until ${c.retired}`;
  if (c.team && c.role) return `${TEAM_BY_ID[c.team]?.name ?? c.team} ${c.role === "HC" ? "head coach" : c.role === "OC" ? "offensive coordinator" : c.role === "DC" ? "defensive coordinator" : c.role === "STC" ? "special teams coordinator" : c.role}`;
  if (c.job?.kind === "college") return `${COLLEGE_TEAMS.find((t) => t.id === c.job!.team)?.school ?? c.job.team} ${c.job.title}`;
  if (c.job) return `${TEAM_BY_ID[c.job.team]?.name ?? c.job.team} ${c.job.title}`;
  return "Between coaching jobs";
}
