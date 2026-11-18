import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, checkAchievements } from "../src/engine/achievements";
import { stateAt } from "./fixtures";

describe("achievements", () => {
  it("a played season earns the first ones once, with the date, and a tutorial earns none", () => {
    const s = stateAt("NYG", 3, "2027-04-01");
    // The day loop already checks them; earned during the season.
    expect(s.achievements!.earned["first-win"]).toBeDefined();
    delete s.achievements;
    const first = checkAchievements(s);
    expect(first.map((a) => a.id)).toContain("first-win");
    expect(s.achievements!.earned["first-win"].date).toBe(s.date);
    // Already earned: nothing new the second time.
    expect(checkAchievements(s).length).toBe(0);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const t = stateAt("NYG", 3, "2027-04-01");
    delete t.achievements;
    t.tutorial = { lesson: 0, marks: {} };
    expect(checkAchievements(t).length).toBe(0);
  }, 600_000);
});
