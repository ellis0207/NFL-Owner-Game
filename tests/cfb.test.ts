import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { collegeDaily, newCollege } from "../src/engine/college";
import { COLLEGE_TEAMS } from "../src/engine/collegeData";
import { cfbDaily, cfbRollover, closeCfbSeason } from "../src/engine/cfbworld";
import { headCoach, blackMonday } from "../src/engine/cfbcoaches";
import { activeClass, classRanking, recruitPool, signingDay } from "../src/engine/recruiting";
import { draftClass, enrollYear } from "../src/engine/prospects";
import { applySeason } from "../src/engine/seasons";
import { RULES } from "../src/engine/league";
import { newGame } from "../src/engine/season";
import { collegeCareer } from "../src/engine/cfbworld";
import { portalMoves } from "../src/engine/portal";
import { mediaState } from "../src/engine/outlets";
import type { GameState } from "../src/engine/types";

function playTo(state: GameState, date: string) {
  while (state.date < date) {
    collegeDaily(state, { quiet: true });
    cfbDaily(state);
    state.date = addDays(state.date, 1);
  }
}

describe("living college world", () => {
  const state = newGame("NYG", "Test", { capRules: "real" }, 21);

  it("starts with a coach at every program and the class of next fall half committed", () => {
    for (const t of COLLEGE_TEAMS) expect(headCoach(state, t.id), t.id).toBeTruthy();
    const year = activeClass(state.date);
    expect(year).toBe(RULES.season + 1);
    const pool = recruitPool(state.seed, year);
    expect(pool.recruits.filter((r) => r.stars === 5)).toHaveLength(32);
    const commits = Object.keys(state.cfb!.classes[year].commits).length;
    expect(commits / pool.recruits.length).toBeGreaterThan(0.3);
    expect(commits / pool.recruits.length).toBeLessThan(0.7);
    // Every future prospect in the pool is one of the draft classes three to five years out.
    const fut = pool.recruits.find((r) => r.draftYear)!;
    expect(enrollYear(draftClass(state.seed, fut.draftYear!).byId[fut.id].classYear, fut.draftYear!)).toBe(year);
  });

  it("fires, hires and signs a class, and future prospects play where they signed", () => {
    const year = activeClass(state.date);
    playTo(state, addDays(signingDay(year), 2));
    const w = state.cfb!;
    const moves = w.log.filter((m) => m.date >= blackMonday());
    expect(moves.filter((m) => m.kind === "fired").length).toBeGreaterThanOrEqual(4);
    expect(moves.filter((m) => m.kind === "hired").length).toBeGreaterThanOrEqual(4);
    // Searches end within weeks.
    for (const [, d] of Object.entries(w.openings)) expect(d > addDays(state.date, -40)).toBe(true);
    const cls = w.classes[year];
    expect(cls.done).toBe(true);
    const pool = recruitPool(state.seed, year);
    expect(Object.keys(cls.commits)).toHaveLength(pool.recruits.length);
    expect(Object.values(cls.commits).every((c) => c.signed)).toBe(true);
    const ranking = classRanking(state, year);
    expect(w.programs[ranking[0].team].classRank[year]).toBe(1);
    // A future prospect is listed at the school he signed with.
    const fut = pool.recruits.find((r) => r.draftYear && r.rank < 50)!;
    expect(draftClass(state.seed, fut.draftYear!).byId[fut.id].school).toBe(cls.commits[fut.id].school);
    // The next class opened the day after.
    expect(w.classes[year + 1]).toBeDefined();
    // The December portal moved players, and the college desk has the day's facts to write.
    const moved = portalMoves(state).filter((m) => m.to && m.to !== m.from);
    expect(moved.length).toBeGreaterThan(20);
    expect(moved.length).toBeLessThan(400);
    const kinds = new Set((mediaState(state).cfbq ?? []).map((f) => f.kind));
    for (const k of ["commit", "flip", "signing", "fired", "hired", "portal"]) expect(kinds.has(k), k).toBe(true);
  });

  it("moves programs at the rollover without inflating the sport", () => {
    playTo(state, `${RULES.season + 1}-05-01`);
    const before = COLLEGE_TEAMS.map((t) => state.cfb!.programs[t.id].strength);
    closeCfbSeason(state);
    state.season = RULES.season + 1;
    applySeason(state);
    cfbRollover(state);
    state.college = newCollege(state);
    const after = COLLEGE_TEAMS.map((t) => state.cfb!.programs[t.id].strength);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
    expect(Math.abs(mean(after) - mean(before))).toBeLessThan(0.2);
    expect(Math.abs(sd(after) - sd(before))).toBeLessThan(0.2);
    expect(after.some((x, i) => Math.abs(x - before[i]) > 3)).toBe(true);
    // Transfers play for their new school from the next season on, and careers carry over.
    const moved = Object.entries(state.cfb!.transfers?.[RULES.season + 1] ?? {});
    expect(moved.length).toBeGreaterThan(10);
    const [id, to] = moved[0];
    expect(draftClass(state.seed, RULES.season + 1).byId[id].school).toBe(to);
    const nextYear = draftClass(state.seed, RULES.season + 1).prospects.slice(0, 40);
    expect(nextYear.filter((x) => collegeCareer(state, x.id).length).length).toBeGreaterThan(20);
    const p = state.cfb!.programs[COLLEGE_TEAMS[0].id];
    expect(p.seasons.at(-1)![0]).toBe(RULES.season - 1);
    expect(p.talent).not.toBe(COLLEGE_TEAMS[0].strength);
  });
});

describe("college desk", () => {
  it("writes every college story kind and angle cleanly", async () => {
    const { COLLEGE_CONTENT } = await import("../src/engine/media/content/college");
    const { writeStory } = await import("../src/engine/media/compose");
    const { FORMATS } = await import("../src/engine/media/formats");
    const { teamSlots } = await import("../src/engine/media/facts");
    const { schoolSlots } = await import("../src/engine/cfbmedia");
    const { rngFor } = await import("../src/engine/rng");
    const state = newGame("DET", "Test", { capRules: "real" }, 5);
    const flags = ["five", "top10", "home", "g5", "late", "coachGone", "early", "national", "midseason", "big", "quick", "long", "fromHC", "coord", "retread", "up", "qb", "rise", "fall"];
    let written = 0;
    for (const [kind, c] of Object.entries(COLLEGE_CONTENT)) {
      for (const on of [false, true]) {
        const tags: Record<string, boolean> = { [kind]: true };
        for (const t of flags) tags[t] = on && !(t === "fall" && kind === "program");
        const slots = {
          S: schoolSlots(state, "ALA"), F: schoolSlots(state, "UGA"), T: teamSlots(state, "DET"), topic: "college",
          R: { name: "Jo Doe", pos: "QB", stars: 5, word: "five-star", rank: 4, home: "TX" },
          C: { name: "Pat Coach", from: on ? "head coach at Georgia" : "", years: 3, rec: "5-7" },
          P: { name: "Sam Roe", pos: "WR", line: on ? "60 catches for 900 yards" : "" },
          year: 2027, list: "1. Alabama, 2. Georgia", n: 220, rec: "5-7", years: 3, buyout: "$12.0 million", last: "4-8", rank: 18, from: on ? "head coach at Georgia" : "",
        };
        const f = { id: `t:${kind}:${on}`, type: `college.${kind}`, family: "college" as const, kind: "college" as const, teams: [], players: [], value: 60, ours: false, tags, slots };
        for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0)) {
          for (const format of c.formats) {
            const missing: string[] = [];
            const d = writeStory(state, f as never, angle, format, FORMATS[format].outlets[0][0], rngFor(1, `${f.id}:${angle.id}:${format}`), missing);
            const text = `${d.headline} ${d.body}`;
            expect(missing, `${d.type}: ${text}`).toEqual([]);
            expect(text, d.type).not.toMatch(/undefined|NaN|\[object|[{}<>[\]]/);
            written++;
          }
        }
      }
    }
    expect(written).toBeGreaterThan(80);
  });
});
