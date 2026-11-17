import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { hallOfFameDaily, hofCase, hofClasses, hofMembers, projectClasses } from "../src/engine/halloffame";
import { honors } from "../src/engine/honors";
import { RULES } from "../src/engine/league";
import { newGame } from "../src/engine/season";
import { history } from "../src/engine/seasons";
import type { GameState } from "../src/engine/types";

function fresh(seed = 7): GameState { return newGame("DET", "Owner", { capRules: "real" }, seed); }

function vote(s: GameState): void {
  s.date = addDays(RULES.keyDates.superBowl, -3);
  hallOfFameDaily(s);
}

describe("Hall of Fame", () => {
  it("holds every real class since 1963 with plaques and careers", () => {
    const s = fresh();
    const classes = hofClasses(s);
    for (let y = 1963; y <= 2026; y++) expect(classes[y]?.length).toBeGreaterThan(0);
    expect(hofMembers(s).length).toBe(387);
    const rice = hofCase(s, "hof:jerry-rice")!;
    expect(rice.hofYear).toBe(2010);
    expect(rice.stats.recYds).toBe(22895);
    expect(rice.rows.length).toBeGreaterThan(4);
    expect(hofCase(s, "hof:jim-brown")!.stats.rushYds).toBe(12312);
    expect(hofCase(s, "hof:jimmy-johnson-cb")!.hofYear).toBe(1994);
    const brady = hofCase(s, "hof:tom-brady")!;
    expect(brady.hofYear).toBeUndefined();
    expect(brady.eligible).toBe(2028);
  }, 120_000);

  it("votes a class with the panel of Hall of Famers, and projects the next ones", () => {
    const s = fresh();
    const proj = projectClasses(s, 4);
    expect(proj.map((p) => p.year)).toEqual([2027, 2028, 2029, 2030]);
    for (const p of proj) expect(p.ids.length).toBeGreaterThan(0);
    expect(proj[1].ids).toContain("hof:tom-brady");
    vote(s);
    const h = honors(s).hof;
    const b = h.ballots![2027];
    expect(h.classes[2027].length).toBeGreaterThanOrEqual(3);
    expect(b.modern.filter((e) => e.stage === 5).length).toBe(5);
    expect(b.modern.filter((e) => e.stage <= 15).length).toBe(15);
    expect(b.modern.some((e) => e.id === "hof:tom-brady")).toBe(false);
    // Voters are living Hall of Fame players.
    for (const id of b.panel) { const c = hofCase(s, id)!; expect(c.hofYear).toBeDefined(); expect(c.dead).toBe(false); }
    // Everyone left out of the last vote has a reason the papers can print.
    for (const e of b.modern.filter((x) => x.stage <= 15 && !x.elected)) expect(e.why).toBeTruthy();
    expect(hofClasses(s)[2027]).toEqual(h.classes[2027]);
  }, 120_000);

  it("can make a great player with a reputation wait while a cleaner one goes in first", () => {
    let brownFirst = 0;
    let petersonFirst = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = fresh(seed);
      vote(s);
      const cls = honors(s).hof.classes[2027];
      if (cls.includes("hof:antonio-brown")) brownFirst++;
      if (cls.includes("hof:adrian-peterson")) petersonFirst++;
    }
    expect(brownFirst).toBe(0);
    expect(petersonFirst).toBeGreaterThanOrEqual(4);
  }, 300_000);

  it("puts this league's retired stars on the ballot with the honors they won before the save", () => {
    const s = fresh();
    const id = "00-0031388"; // Aaron Donald
    history(s).retired[id] = RULES.season - 5;
    const c = hofCase(s, id)!;
    expect(c.pb).toBeGreaterThanOrEqual(8);
    expect(c.rings).toBeGreaterThanOrEqual(1);
    vote(s);
    expect(honors(s).hof.ballots![2027].modern.some((e) => e.id === id && e.stage <= 15)).toBe(true);
  }, 120_000);

  it("reads a save from before the vote existed", () => {
    const s = fresh();
    honors(s).hof = { classes: { 2027: [] }, finalists: {} };
    expect(hofClasses(s)[2026].length).toBe(5);
    expect(projectClasses(s, 2)[0].year).toBe(2028);
  }, 120_000);
});
