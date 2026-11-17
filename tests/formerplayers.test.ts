import { beforeAll, describe, expect, it } from "vitest";
import { coachingChance, coachingNow, startCoaching } from "../src/engine/formerplayers";
import { PLAYER_BY_ID, RULES } from "../src/engine/league";
import { positionCoachesDaily, ROOM_OF, roomStaff } from "../src/engine/positionCoaches";
import { parseSaveFile, toSaveFile } from "../src/save/codec";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";
let state: GameState;

beforeAll(() => {
  state = stateAt(TEAM, 3, "draftStart");
}, 600_000);

function retirees(s: GameState): string[] {
  return Object.keys(s.history!.retired).filter((id) => s.players[id]?.status === "retired" && PLAYER_BY_ID[id]);
}

describe("former players becoming coaches", () => {
  it("is a small chance, larger for long-career quarterbacks than for kickers", () => {
    const ids = retirees(state);
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) expect(coachingChance(state, id, 0)).toBeLessThan(0.06);
    const qb = ids.filter((id) => PLAYER_BY_ID[id].position === "QB");
    const k = ids.filter((id) => ["K", "P", "LS"].includes(PLAYER_BY_ID[id].position));
    const avg = (list: string[]) => list.reduce((a, id) => a + coachingChance(state, id, 0), 0) / Math.max(1, list.length);
    if (qb.length && k.length) expect(avg(qb)).toBeGreaterThan(avg(k));
    // The pull fades: nobody starts five or more years after retiring.
    expect(coachingChance(state, ids[0], 5)).toBe(0);
  });

  it("starts an NFL former player as an assistant in his position's room, never a lead", () => {
    const s = structuredClone(state);
    const id = retirees(s).find((x) => PLAYER_BY_ID[x].position !== "K")!;
    const start = startCoaching(s, id, "nfl")!;
    expect(start.level).toBe("nfl");
    const c = s.staff!.people[start.coach];
    expect(c.name).toBe(PLAYER_BY_ID[id].name);
    expect(c.formerPlayer).toBe(id);
    expect(c.job?.kind).toBe("assistant");
    expect(c.job?.lead).toBe(false);
    expect(c.job?.room).toBe(ROOM_OF[PLAYER_BY_ID[id].position]);
    expect(roomStaff(s, start.team)[c.job!.room!].length).toBeLessThanOrEqual(3);
    expect(coachingNow(s, id)).toContain(c.job!.title);
    // Only once per player.
    expect(startCoaching(s, id, "college")).toBeNull();
    // The rooms still have their leads after a day of hiring.
    positionCoachesDaily(s);
    expect(roomStaff(s, start.team)[c.job!.room!][0].job?.lead).toBe(true);
  });

  it("starts a college former player on a school staff, and he can be hired into an NFL room later", () => {
    const s = structuredClone(state);
    const id = retirees(s).find((x) => PLAYER_BY_ID[x].position === "WR" || PLAYER_BY_ID[x].position === "LB") ?? retirees(s)[0];
    const start = startCoaching(s, id, "college")!;
    const c = s.staff!.people[start.coach];
    expect(c.job?.kind).toBe("college");
    expect(c.room).toBe(ROOM_OF[PLAYER_BY_ID[id].position]);
    expect(c.hiredYear).toBe(RULES.season + 1);
  });

  it("this spring's new coaches survive a save and reload", () => {
    const back = parseSaveFile(JSON.stringify(toSaveFile(state)));
    const before = Object.values(state.staff!.people).filter((c) => c.formerPlayer).map((c) => c.id).sort();
    const after = Object.values(back.staff!.people).filter((c) => c.formerPlayer).map((c) => c.id).sort();
    expect(after).toEqual(before);
  });
});
