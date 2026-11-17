import { describe, expect, it } from "vitest";
import { corps, localStaff, outletOf, recordLine, working } from "../src/engine/media/corps";
import { NATIONAL, mediaState } from "../src/engine/outlets";
import { TEAMS } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";

describe("the press corps", () => {
  it("staffs eight national outlets and local media in every market, made up from the seed", async () => {
    const a = await stateAt("DET", 7, "regularSeasonStart");
    const b = await stateAt("DET", 7, "regularSeasonStart");
    delete mediaState(a).corps;
    delete mediaState(b).corps;
    const people = corps(a).people;
    expect(NATIONAL).toHaveLength(8);
    for (const o of NATIONAL) expect(people.filter((p) => p.outlet === o.id).length, o.id).toBeGreaterThanOrEqual(4);
    for (const t of TEAMS) {
      expect(localStaff(a, t.id, "beat")).toHaveLength(2);
      expect(localStaff(a, t.id, "host")).toHaveLength(2);
      expect(localStaff(a, t.id, "anchor")).toHaveLength(1);
    }
    expect(people.length).toBeGreaterThan(220);
    expect(new Set(people.map((p) => p.name)).size).toBe(people.length);
    expect(corps(b).people.map((p) => p.name)).toEqual(people.map((p) => p.name));
    expect(people.find((p) => p.name === "Kara Voss")?.outlet).toBe("blitz");
    expect(outletOf("local:DET").name).toMatch(/Detroit/);
    expect(recordLine({ ...people[0], hits: 8, misses: 1 })).toMatch(/8 of 9/);
  });

  it("files sourced reports at the deadline and judges them later", async () => {
    const state = await stateAt("DET", 7, "tradeDeadline");
    const start = state.date;
    // The last week before the deadline is already past; play the weeks after it so reports get judged.
    for (let i = 0; i < 30; i++) advanceDay(state);
    const c = corps(state);
    const all = c.rumors;
    expect(all.length).toBeGreaterThan(5);
    const judged = all.filter((r) => r.outcome && r.outcome !== "quiet");
    expect(judged.length).toBeGreaterThan(0);
    const reporters = new Set(all.map((r) => r.reporter));
    expect(working(state).filter((p) => reporters.has(p.id)).some((p) => p.hits + p.misses > 0)).toBe(true);
    const sourced = mediaState(state).stories.filter((s) => s.type?.startsWith("rumor.") && s.date >= start);
    expect(sourced.length).toBeGreaterThan(3);
    expect(sourced.every((s) => s.reporter)).toBe(true);
  });
});
