import { describe, expect, it } from "vitest";
import { newGame } from "../src/engine/season";
import { draftClass } from "../src/engine/prospects";
import { chooseDraftClass, classSource, openClassYear, settleDraftClass } from "../src/engine/classpick";
import { classOptions, ensureDraftClasses, REAL_YEARS, realRows, sourceFor, bindClassChoices } from "../src/engine/realclasses";
import { mediaRank } from "../src/engine/college";
import { COLLEGE_TEAM, smallSchool } from "../src/engine/collegeData";
import { perceivedValue } from "../src/engine/scouting";
import { collegeKickoff } from "../src/engine/college";

// Real draft classes (realclasses.ts, built by pipeline/draft_classes.py).
describe("real draft classes", () => {
  it("has every real class from 1991 to 2026 and the 2027 board", () => {
    expect(REAL_YEARS[0]).toBe(1991);
    expect(REAL_YEARS.at(-1)).toBe(2027);
    for (const y of REAL_YEARS.filter((y) => y <= 2026)) {
      const rows = realRows(y);
      // Every pick of the draft (12 rounds to 1992, 224 in 1993, 222 in 1994, 240 in 1997, 246 in 2001, about
      // 255 most years), plus the undrafted (combine invitees only from 2000, so the 1990s classes run shorter).
      expect(rows.filter((r) => r[7]).length).toBeGreaterThanOrEqual(y === 1993 || y === 1994 ? 222 : 240);
      expect(rows.length).toBeGreaterThan(y < 1995 ? 300 : y < 2000 ? 330 : 420);
      for (const r of rows) expect(COLLEGE_TEAM[r[1]], `${r[0]}'s school ${r[1]}`).toBeTruthy();
    }
    expect(realRows(2027).length).toBe(150);
  });

  it("a new 2026 game drafts the real 2027 board, filled in behind by the generator", () => {
    const s = newGame("DET", "Test", { capRules: "real" }, 11);
    expect(classSource(s)).toBe(2027);
    const dc = draftClass(s.seed);
    expect(dc.prospects.length).toBe(640);
    expect(dc.prospects[0].name).toBe("Jeremiah Smith");
    expect(dc.prospects.filter((p) => p.board).length).toBe(150);
    expect(new Set(dc.prospects.map((p) => p.id)).size).toBe(640);
  });

  it("a real class reads where it really went, and its careers are real", () => {
    const s = newGame("DET", "Test", { capRules: "real" }, 12);
    expect(openClassYear(s)).toBe(2027);
    expect(chooseDraftClass(s, 2016)).toBeNull();
    const dc = draftClass(s.seed);
    const dak = dc.prospects.find((p) => p.name === "Dak Prescott")!;
    expect(dak.real).toEqual({ year: 2016, pick: 135, team: "DAL" });
    // Played eleven years late, he's the same age at his draft.
    expect(Number(dak.birthDate.slice(0, 4))).toBe(2004);
    const h = dc.hidden[dak.id];
    expect(h.fixed).toBe(true);
    expect(h.nfl!.potential).toBeGreaterThanOrEqual(90);
    // The media has him about where he went; our full file finds the rest.
    expect(Math.abs(mediaRank(s, dak.id) - 135)).toBeLessThan(45);
    s.college!.scouting.know[dak.id] = 90;
    expect(perceivedValue(s, dak.id) - h.value).toBeGreaterThan(6);
    // Small schools are placed for scouting trips.
    const small = dc.prospects.filter((p) => smallSchool(p.school));
    expect(small.length).toBeGreaterThan(10);
    // Out of order, the 2016 class can't come around again, and 2027's own board is free.
    expect(classOptions(s, 2028)).not.toContain(2016);
    expect(sourceFor(s.seed, 2027)).toBe(2016);
  });

  it("a generated class stays as it was, and the choice closes at college kickoff", () => {
    const s = newGame("DET", "Test", { capRules: "real" }, 13);
    chooseDraftClass(s, 0);
    expect(draftClass(s.seed).prospects[0].board).toBeUndefined();
    s.date = collegeKickoff();
    expect(chooseDraftClass(s, 2014)).not.toBeNull();
    settleDraftClass(s);
    expect(s.draftClasses!.picks[2027]).toBe(0);
  });

  it("older saves keep generated classes through the one after their coming draft", () => {
    const s = newGame("DET", "Test", { capRules: "real" }, 14);
    delete s.draftClasses;
    ensureDraftClasses(s);
    bindClassChoices(s);
    expect(sourceFor(s.seed, 2027)).toBe(0);
    expect(s.draftClasses!.from).toBe(2028);
  });
});
