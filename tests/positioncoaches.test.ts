import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { TEAMS } from "../src/engine/league";
import { decideRoom, positionCoachesDaily, ROOMS, roomBoost, roomProposals, roomStaff, teaching } from "../src/engine/positionCoaches";
import { newGame } from "../src/engine/season";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";

beforeAll(() => {
  stateAt(TEAM, 3, "draftStart");
}, 600_000);

describe("position coaches", () => {
  it("every team starts with its real 2026 position coaches in all nine rooms", () => {
    const state = newGame(TEAM, "Owner", { capRules: "real" }, 5);
    let leads = 0;
    let generated = 0;
    for (const t of TEAMS) {
      const rooms = roomStaff(state, t.id);
      for (const r of ROOMS) {
        expect(rooms[r][0]?.job?.lead, `${t.id} ${r}`).toBe(true);
        leads++;
        if (rooms[r][0].generated) generated++;
      }
    }
    expect(leads).toBe(32 * 9);
    // Only the rooms no team site listed are made up.
    expect(generated).toBeLessThanOrEqual(12);
    const det = roomStaff(state, "DET");
    expect(det.QB[0].name).toBe("Mark Brunell");
    expect(det.QB[0].playedFor).toContain("JAX");
    const people = Object.values(state.staff!.people).filter((c) => !c.retired).length;
    console.log(`people tracked at kickoff: ${people}`);
  });

  it("a better teacher speeds growth in his room", () => {
    const state = newGame(TEAM, "Owner", { capRules: "real" }, 5);
    const lead = roomStaff(state, "DET").WR[0];
    lead.hidden.development = 50;
    const low = roomBoost(state, "DET", "WR");
    state.date = addDays(state.date, 1);
    lead.hidden.development = 85;
    const high = roomBoost(state, "DET", "WR");
    expect(high).toBeGreaterThan(low + 3);
    expect(teaching(state, "DET", "WR")).toBeGreaterThan(80);
  });

  it("an empty room is filled: CPU teams hire, our head coach proposes and the owner decides", () => {
    const state: GameState = stateAt(TEAM, 3, "draftStart");
    const cpu = roomStaff(state, "GB").OL[0];
    cpu.job = undefined;
    const ours = roomStaff(state, TEAM).LB[0];
    ours.job = undefined;
    positionCoachesDaily(state);
    expect(roomStaff(state, "GB").OL[0]?.job?.lead).toBe(true);
    const p = roomProposals(state).find((x) => x.room === "LB");
    expect(p).toBeTruthy();
    const first = p!.candidate;
    decideRoom(state, p!.id, "reject");
    const next = roomProposals(state).find((x) => x.room === "LB")!;
    expect(next.candidate).not.toBe(first);
    expect(decideRoom(state, next.id, "approve").ok).toBe(true);
    expect(roomStaff(state, TEAM).LB[0].id).toBe(next.candidate);
  });

  it("a new head coach brings some of his own people", () => {
    const state: GameState = stateAt(TEAM, 3, "draftStart");
    const before = ROOMS.map((r) => roomStaff(state, "GB")[r][0].id);
    // As if the head coach just arrived: the rooms were set under someone else.
    state.staff!.roomsBy!.GB = "someone-else";
    for (const r of ROOMS) roomStaff(state, "GB")[r][0].mentor = "someone-else";
    positionCoachesDaily(state);
    const after = ROOMS.map((r) => roomStaff(state, "GB")[r][0].id);
    const changed = after.filter((id, i) => id !== before[i]).length;
    expect(changed).toBeGreaterThanOrEqual(1);
    expect(changed).toBeLessThanOrEqual(8);
  });
});
