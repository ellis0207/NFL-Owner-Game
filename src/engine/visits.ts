// The pre-draft process beyond the scouting trips: what the combine's medical
// exams and formal interviews tell a team, the top-30 facility visits, and
// private workouts. At the combine every team's doctors examine the invited
// prospects, and each team gets 45 formal 18-minute interviews. From the
// combine until about a week before the draft, a team can bring up to 30
// prospects to its building for a physical and a day of meetings, and its
// coaches can fly out to work players out privately. What each step tells the
// owner is only as good as the people doing it: the head trainer and medical
// staff read the physicals, the head coach and GM run the interviews and
// visits, and the position coach runs the workout. A weak staff misreads more.
import { mediaBoard } from "./college";
import { addDays } from "./dates";
import { COMBINE_DATE, draftState } from "./draft";
import { send } from "./inbox";
import { RULES, TEAMS } from "./league";
import { ROOM_OF, ROOM_TITLE, roomStaff } from "./positionCoaches";
import { draftClass } from "./prospects";
import { TRAIT_WORDS } from "./reports";
import { gaussian, rngFor } from "./rng";
import { perceivedValue } from "./scouting";
import { staffEffects } from "./staff";
import type { GameState, PreDraft } from "./types";

export const INTERVIEWS = 45;
export const VISITS = 30;
export const WORKOUTS = 10;

/** Visits have to be done by the Wednesday a week before the draft. */
export function visitDeadline(): string {
  return addDays(RULES.keyDates.draftStart, -8);
}

export function preDraft(state: GameState): PreDraft {
  return (draftState(state).pre ??= { interviews: [], interviewed: {}, visits: {}, workouts: {} });
}

function invited(state: GameState, id: string): boolean {
  return !!state.draft?.combine?.[id] || (state.date < COMBINE_DATE && mediaBoard(state).slice(0, 330).includes(id));
}

function noise(state: GameState, id: string, what: string): number {
  return gaussian(rngFor(state.seed, `pre:${state.userTeam}:${id}:${what}`));
}

function bump(state: GameState, id: string, k: number): void {
  const s = state.college?.scouting;
  if (s) s.know[id] = Math.min(100, (s.know[id] ?? 0) + k);
}

// ---- Medicals ----

/** The doctors' read of a prospect, from the combine exam (or a closer look on a visit). Sharper with a better medical staff. */
export function medicalRead(state: GameState, id: string, closer = false): string | null {
  const h = draftClass(state.seed).hidden[id];
  if (!h || (!state.draft?.combine?.[id] && !preDraft(state).visits[id])) return null;
  const sharp = staffEffects(state.userTeam).injuryPrevention ?? 60;
  const sd = Math.max(2.5, (100 - sharp) / 4.5) * (closer ? 0.6 : 1);
  const read = h.durability + noise(state, id, closer ? "med-visit" : "med") * sd;
  const history = h.medical ? `${h.medical} ` : "";
  return history + (read >= 84 ? "Clean physical; the doctors have no worries."
    : read >= 72 ? "Normal wear for a college player."
      : read >= 62 ? "Some wear the doctors want to keep an eye on; we'd mark him down a little."
        : "Red flag: the doctors worry about how long he'll hold up.");
}

// ---- Interviews ----

/** How sharp the head coach and GM are in a room with a prospect (0-100, engine only). */
function roomEye(state: GameState): number {
  const fx = staffEffects(state.userTeam);
  return 0.5 * fx.coachEval + 0.5 * fx.gmEval;
}

function makeupNotes(state: GameState, id: string, salt: string, sd: number): string[] {
  const h = draftClass(state.seed).hidden[id];
  const iq = h.footballIq + noise(state, id, `${salt}:iq`) * sd;
  const ch = h.character + noise(state, id, `${salt}:ch`) * sd * 1.2;
  const we = h.workEthic + noise(state, id, `${salt}:we`) * sd * 1.2;
  const out: string[] = [];
  out.push(iq >= 82 ? "Sharp on the whiteboard; he could teach his scheme back to us."
    : iq >= 66 ? "Knew his assignments and handled the install questions fine."
      : "Struggled on the whiteboard; the coaches think he'll need time with a playbook.");
  out.push(ch >= 84 ? "Mature and likable; a leader." : ch >= 66 ? "Nothing that worries us off the field." : ch >= 50 ? "Some answers about his past didn't line up; worth a background check." : "The room came away worried about his judgment.");
  if (we >= 85) out.push("Talks like a worker, and his school backs it up.");
  else if (we < 56) out.push("We heard questions about his habits.");
  return out;
}

/** Puts a prospect on (or takes him off) our combine interview list. */
export function toggleInterview(state: GameState, id: string): { ok: boolean; text: string } {
  const pre = preDraft(state);
  if (state.date >= COMBINE_DATE) return { ok: false, text: "The combine interviews are done for this year." };
  if (pre.interviews.includes(id)) {
    pre.interviews = pre.interviews.filter((x) => x !== id);
    return { ok: true, text: "Taken off the interview list." };
  }
  if (!invited(state, id)) return { ok: false, text: "He isn't projected to get a combine invitation." };
  if (pre.interviews.length >= INTERVIEWS) return { ok: false, text: `We only get ${INTERVIEWS} formal interviews.` };
  pre.interviews.push(id);
  return { ok: true, text: `On the list (${pre.interviews.length} of ${INTERVIEWS}).` };
}

function runInterviews(state: GameState): void {
  const pre = preDraft(state);
  const dc = draftClass(state.seed);
  const pool = Object.keys(state.draft?.combine ?? {});
  // The GM fills whatever slots we didn't use with the best players on our board.
  const board = pool.filter((id) => !pre.interviews.includes(id)).sort((a, b) => perceivedValue(state, b) - perceivedValue(state, a));
  pre.interviews = [...pre.interviews.filter((id) => pool.includes(id)), ...board].slice(0, INTERVIEWS);
  const sd = Math.max(3, (100 - roomEye(state)) / 4);
  for (const id of pre.interviews) {
    pre.interviewed[id] = makeupNotes(state, id, "int", sd);
    bump(state, id, 6);
  }
  const worry = pre.interviews.filter((id) => pre.interviewed[id].some((n) => n.includes("worried")));
  send(state, "staff", "Head Coach", "Combine interviews",
    `We sat down with ${pre.interviews.length} prospects in Indianapolis. The notes are on each prospect's page, along with the doctors' exams for every invitee.` +
    (worry.length ? `\n\nThe ones that worried us: ${worry.map((id) => `${dc.byId[id].position} ${dc.byId[id].name}`).join(", ")}.` : ""));
}

// ---- Top-30 visits ----

export function canVisit(state: GameState): string | null {
  if (state.date <= COMBINE_DATE) return "Visits start after the combine.";
  if (state.date > visitDeadline()) return "The visit window has closed for this draft.";
  return null;
}

/** Brings a prospect in for a top-30 visit: our own physical and a day of meetings with the coaches. */
export function inviteVisit(state: GameState, id: string): { ok: boolean; text: string } {
  const pre = preDraft(state);
  const why = canVisit(state);
  if (why) return { ok: false, text: why };
  if (pre.visits[id]) return { ok: false, text: "He's already been in." };
  if (Object.keys(pre.visits).length >= VISITS) return { ok: false, text: `We've used all ${VISITS} visits.` };
  const sd = Math.max(2.5, (100 - roomEye(state)) / 5);
  pre.visits[id] = { date: state.date, notes: makeupNotes(state, id, "visit", sd) };
  bump(state, id, 10);
  return { ok: true, text: `${draftClass(state.seed).byId[id].name} came in for his visit. The doctors' and coaches' notes are on his page.` };
}

// ---- Private workouts ----

export function canWorkOut(state: GameState): string | null {
  if (state.date <= COMBINE_DATE) return "Private workouts start after the combine.";
  if (state.date >= RULES.keyDates.draftStart) return "It's too late for workouts.";
  return null;
}

/** Sends the position coach to put a prospect through a private workout. */
export function privateWorkout(state: GameState, id: string): { ok: boolean; text: string } {
  const pre = preDraft(state);
  const why = canWorkOut(state);
  if (why) return { ok: false, text: why };
  if (pre.workouts[id]) return { ok: false, text: "We've already worked him out." };
  if (Object.keys(pre.workouts).length >= WORKOUTS) return { ok: false, text: `The coaches only have time for ${WORKOUTS} private workouts.` };
  const dc = draftClass(state.seed);
  const p = dc.byId[id];
  const h = dc.hidden[id];
  const room = ROOM_OF[p.position];
  const coach = roomStaff(state, state.userTeam)[room][0];
  // A position coach's eye: his own evaluation skill, steadied by a good head coach.
  const eye = 0.7 * (coach?.hidden.evaluation ?? 60) + 0.3 * staffEffects(state.userTeam).coachEval;
  const sd = Math.max(2, (100 - eye) / 5);
  const reads = Object.entries(h.traits).map(([t, v]) => [t, v - h.overall + noise(state, id, `wo:${t}`) * sd] as const).sort((a, b) => b[1] - a[1]);
  const notes: string[] = [];
  const best = reads.filter(([, v]) => v >= 3).slice(0, 2).map(([t]) => TRAIT_WORDS[t]?.[0]).filter(Boolean);
  const worst = reads.filter(([, v]) => v <= -4).slice(-2).map(([t]) => TRAIT_WORDS[t]?.[1]).filter(Boolean);
  if (best.length) notes.push(`Liked: ${best.join("; ").toLowerCase()}.`);
  if (worst.length) notes.push(`Didn't like: ${worst.join("; ").toLowerCase()}.`);
  const ov = h.overall + noise(state, id, "wo:ov") * sd;
  notes.push(ov >= 76 ? "Thinks he can play for us right away." : ov >= 68 ? "Sees a player he can develop into a starter." : "Isn't sure he makes our roster.");
  pre.workouts[id] = { date: state.date, by: coach ? `${coach.name}, ${ROOM_TITLE[room]}` : "Our position coach", notes };
  bump(state, id, 8);
  return { ok: true, text: `${coach?.name ?? "Our coach"} worked out ${p.name}. His notes are on the prospect's page.` };
}

/** Everything the pre-draft process has told us about a prospect, for his page. */
export function preDraftNotes(state: GameState, id: string): { label: string; lines: string[] }[] {
  const pre = state.draft?.pre;
  const out: { label: string; lines: string[] }[] = [];
  const med = medicalRead(state, id, !!pre?.visits[id]);
  if (med) out.push({ label: pre?.visits[id] ? "Medical (our physical on his visit)" : "Combine medical", lines: [med] });
  if (pre?.interviewed[id]) out.push({ label: "Combine interview", lines: pre.interviewed[id] });
  if (pre?.visits[id]) out.push({ label: "Top-30 visit", lines: pre.visits[id].notes });
  if (pre?.workouts[id]) out.push({ label: `Private workout (${pre.workouts[id].by})`, lines: pre.workouts[id].notes });
  return out;
}

// ---- Other teams ----

/** Other teams do the same work: interviews at the combine, visits and workouts before the deadline. */
function cpuWork(state: GameState, what: "interviews" | "visits"): void {
  const s = state.college?.scouting;
  if (!s) return;
  const dc = draftClass(state.seed);
  const pool = Object.keys(state.draft?.combine ?? {});
  for (const t of TEAMS) {
    if (t.id === state.userTeam || !s.cpu[t.id]) continue;
    const ranked = pool.map((id) => ({ id, v: perceivedValue(state, id, t.id) })).sort((a, b) => b.v - a.v);
    const rng = rngFor(state.seed, `cpu-pre:${what}:${t.id}`);
    const picks = what === "interviews" ? ranked.slice(0, INTERVIEWS) : ranked.slice(0, 90).filter(() => rng() < 0.45).slice(0, VISITS + WORKOUTS);
    for (const { id } of picks) {
      const i = dc.index[id];
      s.cpu[t.id][i] = Math.min(95, (s.cpu[t.id][i] ?? 0) + (what === "interviews" ? 6 : 10));
    }
  }
}

export function visitsDaily(state: GameState): void {
  if (!state.draft || !state.college) return;
  const pre = preDraft(state);
  if (state.date === COMBINE_DATE && !pre.ran) {
    pre.ran = true;
    runInterviews(state);
    cpuWork(state, "interviews");
  }
  if (state.date === visitDeadline()) cpuWork(state, "visits");
  if (state.date === addDays(COMBINE_DATE, 1)) {
    send(state, "staff", "General Manager", "Visits and workouts",
      `The visit window is open until ${visitDeadline()}. We can bring in up to ${VISITS} prospects for a physical and meetings, and our position coaches can run up to ${WORKOUTS} private workouts before the draft. Start from any prospect's page.`);
  }
}
