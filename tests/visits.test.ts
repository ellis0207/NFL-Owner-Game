import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { COMBINE_DATE } from "../src/engine/draft";
import { HIDDEN_STAFF } from "../src/engine/league";
import { draftClass } from "../src/engine/prospects";
import { advanceDay } from "../src/engine/season";
import { clearStaffCaches, teamStaff } from "../src/engine/staff";
import { inviteVisit, INTERVIEWS, medicalRead, preDraft, preDraftNotes, privateWorkout, toggleInterview, VISITS } from "../src/engine/visits";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";

function afterCombine(): GameState {
  const state = stateAt(TEAM, 3, "superBowl");
  const first = Object.keys(draftClass(state.seed).byId).find((id) => toggleInterview(state, id).ok);
  expect(first).toBeTruthy();
  while (state.date <= addDays(COMBINE_DATE, 1)) advanceDay(state);
  return state;
}

let state: GameState;
beforeAll(() => {
  state = afterCombine();
}, 600_000);

describe("pre-draft visits and medicals", () => {
  it("holds our 45 combine interviews, keeping the ones we asked for", () => {
    const pre = preDraft(state);
    expect(pre.interviews.length).toBe(INTERVIEWS);
    for (const id of pre.interviews) expect(pre.interviewed[id]?.length).toBeGreaterThan(0);
    const invitee = Object.keys(state.draft!.combine!)[0];
    expect(preDraftNotes(state, invitee).some((n) => n.label.includes("medical"))).toBe(true);
  });

  it("runs visits and workouts within their limits", () => {
    const ids = Object.keys(state.draft!.combine!);
    expect(inviteVisit(state, ids[0]).ok).toBe(true);
    expect(inviteVisit(state, ids[0]).ok).toBe(false);
    for (const id of ids.slice(1, VISITS + 3)) inviteVisit(state, id);
    expect(Object.keys(preDraft(state).visits).length).toBe(VISITS);
    expect(privateWorkout(state, ids[0]).ok).toBe(true);
    expect(preDraftNotes(state, ids[0]).map((n) => n.label).join("|")).toMatch(/visit.*workout/i);
  });

  it("a better medical staff reads the physicals more accurately", () => {
    const dc = draftClass(state.seed);
    const ids = Object.keys(state.draft!.combine!);
    const truth = (id: string) => {
      const d = dc.hidden[id].durability;
      return d >= 84 ? "Clean" : d >= 72 ? "Normal" : d >= 62 ? "Some wear" : "Red flag";
    };
    const trn = teamStaff(TEAM).TRN!.id;
    const saved = { ...HIDDEN_STAFF[trn] };
    const hits = (prevention: number) => {
      HIDDEN_STAFF[trn] = { ...saved, prevention };
      clearStaffCaches();
      return ids.filter((id) => medicalRead(state, id)!.includes(truth(id))).length / ids.length;
    };
    const good = hits(95);
    const bad = hits(35);
    HIDDEN_STAFF[trn] = saved;
    clearStaffCaches();
    console.log(`medical reads right: good staff ${(good * 100).toFixed(0)}%, weak staff ${(bad * 100).toFixed(0)}%`);
    expect(good).toBeGreaterThan(bad + 0.1);
  });
});
