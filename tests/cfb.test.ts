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
    const p = state.cfb!.programs[COLLEGE_TEAMS[0].id];
    expect(p.seasons.at(-1)![0]).toBe(RULES.season - 1);
    expect(p.talent).not.toBe(COLLEGE_TEAMS[0].strength);
  });
});
