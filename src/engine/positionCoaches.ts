// Position coaches. Every NFL staff has a coach for each room (quarterbacks,
// running backs, receivers, tight ends, the offensive line, the defensive line,
// linebackers, the secondary) plus an assistant special teams coach, and most
// rooms have an assistant under him. They teach the players day to day, so a
// good one speeds a young player's growth, though less than the head coach and
// coordinators who set the program. The head coach hires them, and the owner
// can approve or turn down his pick. A new head coach usually brings some of
// his own people, often coaches he worked with before: that is how coaching
// trees grow. The 2026 names are the real staffs (data/league-2026/
// position-coaches.json); an empty room gets a made-up coach, marked generated.
import positionJson from "../../data/league-2026/position-coaches.json";
import { newPerson, reputation, staff } from "./coaches";
import { daysBetween } from "./dates";
import { money, send } from "./inbox";
import { RULES, TEAMS } from "./league";
import { gaussian, rngFor } from "./rng";
import { teamSchemes } from "./staff";
import type { Coach, CoachRoom, GameState, Position, RoomProposal } from "./types";
import { yearsFromMoneyYear } from "./pack";
import { PACK } from "./pack";

// A historical start has no real position staffs: every room gets made-up coaches.
const DATA = (PACK ? { teams: {}, playedFor: {} } : positionJson) as { teams: Record<string, Record<string, string[]>>; playedFor: Record<string, string[]> };

export const ROOMS: CoachRoom[] = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "ST"];

export const ROOM_TITLE: Record<CoachRoom, string> = {
  QB: "quarterbacks coach", RB: "running backs coach", WR: "wide receivers coach", TE: "tight ends coach",
  OL: "offensive line coach", DL: "defensive line coach", LB: "linebackers coach", DB: "defensive backs coach",
  ST: "assistant special teams coach",
};

export const ROOM_OF: Record<Position, CoachRoom> = {
  QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", OT: "OL", OG: "OL", C: "OL",
  EDGE: "DL", IDL: "DL", LB: "LB", CB: "DB", S: "DB", K: "ST", P: "ST", LS: "ST",
};

function sideOf(room: CoachRoom): "offense" | "defense" | null {
  return room === "ST" ? null : ["QB", "RB", "WR", "TE", "OL"].includes(room) ? "offense" : "defense";
}

function titleFor(room: CoachRoom, lead: boolean): string {
  if (lead) return ROOM_TITLE[room];
  return room === "ST" ? "special teams assistant" : `assistant ${ROOM_TITLE[room]}`;
}

/** What a position coach is paid: a lead coach $0.5M to $1.6M by reputation, an assistant less, rising with the league. */
export function roomSalary(c: Coach, lead: boolean, season = RULES.season): number {
  const rep = Math.max(0, Math.min(1, ((c.hidden.development ?? 60) - 50) / 40));
  const base = lead ? 500_000 + 1_100_000 * rep ** 1.4 : 250_000 + 200_000 * rep;
  return Math.round((base * 1.04 ** yearsFromMoneyYear(season)) / 25_000) * 25_000;
}

/** What the books assume a full set of position coaches costs, as a 2026 figure. */
export const BUDGETED_ROOM_STAFF = 11_000_000;

// ---- Creating the rooms ----

function makeCoach(state: GameState, taken: Set<string>, team: string, room: CoachRoom, lead: boolean, name: string | undefined, salt: string): Coach {
  const rng = rngFor(state.seed, `room:${salt}`);
  const side = sideOf(room);
  const age = lead ? 34 + Math.floor(rng() * 24) : 28 + Math.floor(rng() * 16);
  const schemes = state.staff?.schemes[team];
  const c = newPerson(state, rng, taken, {
    track: room === "ST" ? "st" : "coach", side, age, salt, mean: lead ? 64 : 61, sd: 6, name,
    job: { kind: "assistant", title: titleFor(room, lead), team, room, lead },
    background: `${TEAMS.find((t) => t.id === team)?.name ?? team} ${titleFor(room, lead)}`,
    scheme: side === "offense" ? schemes?.offense : side === "defense" ? schemes?.defense : null,
  });
  c.room = room;
  const played = name ? DATA.playedFor[name] : undefined;
  if (played) c.playedFor = [...played];
  c.contract = { through: RULES.season + 1 + Math.floor(rng() * 2), salary: roomSalary(c, lead) };
  return c;
}

/** Adds the real 2026 position coaches to a save that has none (new games and saves from before this step). */
export function ensurePositionCoaches(state: GameState): void {
  const s = state.staff;
  if (!s) return;
  s.roomProposals ??= [];
  s.roomsBy ??= {};
  if (Object.values(s.people).some((c) => c.job?.room)) return;
  const taken = new Set(Object.values(s.people).map((c) => c.name));
  for (const t of TEAMS) {
    const hc = Object.values(s.people).find((c) => c.team === t.id && c.role === "HC");
    const rooms = DATA.teams[t.id] ?? {};
    for (const room of ROOMS) {
      const names = (rooms[room === "ST" ? "STA" : room] ?? []).filter((n) => !Object.values(s.people).some((c) => c.name === n && c.team === t.id));
      const list = names.length ? names : [undefined];
      list.forEach((name, i) => {
        const c = makeCoach(state, taken, t.id, room, i === 0, name, `${t.id}${room}${i}`);
        if (hc) c.mentor = hc.id;
        s.people[c.id] = c;
      });
    }
    if (hc) s.roomsBy[t.id] = hc.id;
  }
}

// ---- Who teaches each room ----

/** The coaches in a team's rooms: the lead first, then the assistants. */
export function roomStaff(state: GameState, team: string): Record<CoachRoom, Coach[]> {
  const out = Object.fromEntries(ROOMS.map((r) => [r, [] as Coach[]])) as Record<CoachRoom, Coach[]>;
  for (const c of Object.values(state.staff?.people ?? {})) {
    if (c.retired || c.job?.team !== team || !c.job.room) continue;
    out[c.job.room].push(c);
  }
  for (const r of ROOMS) out[r].sort((a, b) => Number(!!b.job!.lead) - Number(!!a.job!.lead));
  return out;
}

let teachCache: { key: string; map: Record<string, Partial<Record<CoachRoom, number>>> } | null = null;

/**
 * How well each room is taught, 0-100 (engine only): the lead's development skill, a little from his assistant,
 * less if he teaches a different scheme from the one the team runs. An empty room is taught by whoever is around.
 */
export function teaching(state: GameState, team: string, room: CoachRoom): number {
  const key = `${state.seed}:${state.date}:${Object.keys(state.staff?.people ?? {}).length}`;
  if (teachCache?.key !== key) teachCache = { key, map: {} };
  const m = (teachCache.map[team] ??= {});
  if (m[room] !== undefined) return m[room]!;
  const [lead, asst] = roomStaff(state, team)[room];
  let v = 55;
  if (lead) {
    v = lead.hidden.development ?? 60;
    if (asst) v += ((asst.hidden.development ?? 60) - 60) * 0.15;
    const side = sideOf(room);
    const run = side ? teamSchemes(team)[side] : null;
    if (run && lead.scheme && lead.scheme !== run) v -= 3;
  }
  return (m[room] = v);
}

/** The position coach's share of development: about a third of the head coach's pull, added to the staff rating. */
export function roomBoost(state: GameState, team: string, pos: Position): number {
  return 0.12 * (teaching(state, team, ROOM_OF[pos]) - 60);
}

// ---- Hiring ----

function headCoach(state: GameState, team: string): Coach | undefined {
  return Object.values(staff(state).people).find((c) => c.team === team && c.role === "HC");
}

/** People who could run a room: its assistants, assistants in that room elsewhere, and coaches of that room out of work. */
function pool(state: GameState, room: CoachRoom, skip: Set<string>): Coach[] {
  const track = room === "ST" ? "st" : "coach";
  return Object.values(staff(state).people).filter((c) => {
    if (c.retired || c.role || skip.has(c.id) || c.track !== track) return false;
    if (c.job?.room === room && !c.job.lead) return true;
    if (!c.job && c.room === room) return true;
    return false;
  });
}

/** How the head coach sees a candidate: his read of the teaching (sharper if he judges people well) and his network. */
function hcView(state: GameState, team: string, hc: Coach | undefined, c: Coach, room: CoachRoom): number {
  const sd = 9 - ((hc?.hidden.evaluation ?? 60) - 50) / 6;
  let v = (c.hidden.development ?? 60) + gaussian(rngFor(state.seed, `room-view:${team}:${c.id}:${RULES.season}`)) * Math.max(3, sd);
  if (hc) {
    if (c.mentor === hc.id || hc.mentor === c.id) v += 4;
    else if (c.mentor && c.mentor === hc.mentor) v += 2;
    if (c.record.some((r) => hc.record.some((q) => q.team === r.team && q.season === r.season))) v += 2;
  }
  if (c.job?.team === team) v += 2;
  if (c.playedFor?.includes(team)) v += 1;
  const side = sideOf(room);
  if (side && c.scheme === teamSchemes(team)[side]) v += 2;
  return v + reputation(state, c) * 0.05;
}

function bestPick(state: GameState, team: string, room: CoachRoom, skip: Set<string>): Coach {
  const hc = headCoach(state, team);
  const ranked = pool(state, room, skip).map((c) => ({ c, v: hcView(state, team, hc, c, room) })).sort((a, b) => b.v - a.v);
  if (ranked[0] && ranked[0].v >= 58) return ranked[0].c;
  // Nobody he likes: a longtime assistant from the college ranks gets the job (made up).
  const taken = new Set(Object.values(staff(state).people).map((c) => c.name));
  const c = makeCoach(state, taken, team, room, true, undefined, `${team}${room}${state.date}${skip.size}`);
  c.job = undefined;
  c.background = `Longtime college ${ROOM_TITLE[room]}`;
  staff(state).people[c.id] = c;
  return c;
}

/** Puts a coach in charge of a room. Whoever led it moves on. */
export function hireRoom(state: GameState, team: string, room: CoachRoom, id: string): void {
  const s = staff(state);
  const c = s.people[id];
  for (const old of roomStaff(state, team)[room]) {
    if (old.job?.lead && old.id !== id) { old.job = undefined; old.fired = RULES.season; delete old.contract; }
  }
  const hc = headCoach(state, team);
  c.job = { kind: "assistant", title: ROOM_TITLE[room], team, room, lead: true };
  c.room = room;
  c.background = `${TEAMS.find((t) => t.id === team)?.name ?? team} ${ROOM_TITLE[room]}`;
  if (hc && !c.mentor) c.mentor = hc.id;
  const year = state.date > RULES.keyDates.regularSeasonEnd ? RULES.season + 1 : RULES.season;
  c.hiredYear = year;
  c.contract = { through: year + 1, salary: roomSalary(c, true, year) };
  s.log.unshift({ date: state.date, team, text: `${c.name} named ${ROOM_TITLE[room]}` });
}

/** The head coach proposes a position coach to the owner. */
function propose(state: GameState, room: CoachRoom, replaces?: string): void {
  const s = staff(state);
  const team = state.userTeam;
  const skip = new Set((s.roomProposals ?? []).filter((p) => p.team === team && p.room === room && p.status !== "open").map((p) => p.candidate));
  if (replaces) skip.add(replaces);
  const c = bestPick(state, team, room, skip);
  const hc = headCoach(state, team);
  const reasons: string[] = [];
  if (hc && (c.mentor === hc.id || hc.mentor === c.id)) reasons.push("we've worked together");
  if (c.job?.team === team) reasons.push("he knows our players already");
  if (c.playedFor?.includes(team)) reasons.push("he played here");
  if (!reasons.length) reasons.push("he's the best teacher I can get for the room");
  const p: RoomProposal = {
    id: `${team}-${room}-${state.date}-${s.roomProposals!.length}`, team, room, candidate: c.id, date: state.date,
    reason: reasons.join("; "), status: "open", ...(replaces ? { replaces } : {}),
  };
  s.roomProposals!.push(p);
  send(state, "staff", hc ? `${hc.name}, Head Coach` : "Head Coach", `Proposed ${ROOM_TITLE[room]}: ${c.name}`,
    `I'd like ${c.name} (${c.background ?? "assistant"}) as our ${ROOM_TITLE[room]}: ${p.reason}.` +
    (replaces ? ` That would mean moving on from ${s.people[replaces].name}.` : "") +
    ` He'd make about ${money(roomSalary(c, true))} a year. Approve or turn it down on the Staff page.`);
}

export function roomProposals(state: GameState): RoomProposal[] {
  return (staff(state).roomProposals ?? []).filter((p) => p.team === state.userTeam && p.status === "open");
}

export function decideRoom(state: GameState, id: string, choice: "approve" | "reject" | "keep"): { ok: boolean; text: string } {
  const s = staff(state);
  const p = s.roomProposals?.find((x) => x.id === id && x.status === "open");
  if (!p) return { ok: false, text: "That proposal isn't open." };
  if (choice === "keep") {
    p.status = "withdrawn";
    return { ok: true, text: `We'll keep ${p.replaces ? s.people[p.replaces].name : "the room as it is"}.` };
  }
  if (choice === "reject") {
    p.status = "rejected";
    propose(state, p.room, p.replaces);
    return { ok: true, text: "Turned down. The head coach will bring another name." };
  }
  p.status = "approved";
  const c = s.people[p.candidate];
  if (!c || c.retired || c.role || (c.job && c.job.room !== p.room)) {
    propose(state, p.room, p.replaces);
    return { ok: false, text: "He's no longer available. Another name is coming." };
  }
  hireRoom(state, p.team, p.room, c.id);
  return { ok: true, text: `${c.name} is our new ${ROOM_TITLE[p.room]}.` };
}

// ---- Each day ----

function offseason(state: GameState): boolean {
  return state.date > RULES.keyDates.regularSeasonEnd || state.date < RULES.keyDates.regularSeasonStart;
}

/** A new head coach brings his own people for about half the rooms, once he has the job. */
function newHeadCoach(state: GameState, team: string, hc: Coach): void {
  const s = staff(state);
  s.roomsBy![team] = hc.id;
  const rng = rngFor(state.seed, `room-clean:${team}:${hc.id}`);
  for (const room of ROOMS) {
    const lead = roomStaff(state, team)[room][0];
    if (!lead?.job?.lead || lead.mentor === hc.id || rng() > 0.5) continue;
    if (team === state.userTeam) propose(state, room, lead.id);
    else hireRoom(state, team, room, bestPick(state, team, room, new Set([lead.id])).id);
  }
}

export function positionCoachesDaily(state: GameState): void {
  const s = state.staff;
  if (!s) return;
  ensurePositionCoaches(state);
  for (const t of TEAMS) {
    const hc = headCoach(state, t.id);
    // Wait for the head coach search to finish, unless games are being played.
    if (!hc && offseason(state)) continue;
    if (hc && s.roomsBy![t.id] !== hc.id && offseason(state)) newHeadCoach(state, t.id, hc);
    const rooms = roomStaff(state, t.id);
    for (const room of ROOMS) {
      if (rooms[room][0]?.job?.lead) continue;
      if (t.id !== state.userTeam) { hireRoom(state, t.id, room, bestPick(state, t.id, room, new Set()).id); continue; }
      const open = s.roomProposals!.find((p) => p.team === t.id && p.room === room && p.status === "open");
      if (!open) propose(state, room);
      else if (daysBetween(open.date, state.date) >= 4) {
        decideRoom(state, open.id, "approve");
        send(state, "staff", hc ? hc.name : "Head Coach", "Moving ahead", `Since I hadn't heard back, I went ahead with ${s.people[open.candidate]?.name} as ${ROOM_TITLE[room]}.`);
      }
    }
    // Replacement proposals from a new head coach are approved after four days too.
    for (const p of s.roomProposals!) {
      if (p.team === t.id && p.status === "open" && p.replaces && daysBetween(p.date, state.date) >= 4) decideRoom(state, p.id, "approve");
    }
  }
  // Contracts that run out at the new league year are renewed for two more seasons: position staffs turn over through hires, not expirations.
  if (state.date === RULES.keyDates.newLeagueYear) {
    for (const c of Object.values(s.people)) {
      if (c.job?.room && c.contract && c.contract.through < RULES.season + 1) {
        c.contract = { through: RULES.season + 2, salary: roomSalary(c, !!c.job.lead, RULES.season + 1) };
      }
    }
  }
  s.roomProposals = s.roomProposals!.filter((p) => p.status === "open" || daysBetween(p.date, state.date) < 400);
}

/** A room's coaches for the Staff screen: name, title, years, and where he played, if he did. */
export function roomLine(c: Coach): string {
  const parts = [c.job?.title ?? ROOM_TITLE[c.room ?? "QB"]];
  if (c.playedFor?.length) parts.push(`played for ${c.playedFor.join(", ")}`);
  return parts.join(" · ");
}
