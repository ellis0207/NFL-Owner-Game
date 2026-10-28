import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { collegeDaily, collegeGames, collegeRecords, ensureCollege, latestPoll, prospectLog, prospectTotals } from "../src/engine/college";
import { COLLEGE_SCHEDULE, COLLEGE_TEAMS } from "../src/engine/collegeData";
import { draftClass } from "../src/engine/prospects";
import { addAssignment, knowledge, quote, scoutReport, scoutingDaily, tripCost } from "../src/engine/scouting";
import { newGame } from "../src/engine/season";
import type { GameState } from "../src/engine/types";

function playTo(state: GameState, date: string) {
  while (state.date < date) {
    collegeDaily(state);
    scoutingDaily(state);
    state.date = addDays(state.date, 1);
  }
}

describe("college universe", () => {
  it("has every FBS team on a full schedule", () => {
    expect(COLLEGE_TEAMS.length).toBe(138);
    const games: Record<string, number> = {};
    for (const g of COLLEGE_SCHEDULE) {
      games[g.away] = (games[g.away] ?? 0) + 1;
      games[g.home] = (games[g.home] ?? 0) + 1;
    }
    for (const t of COLLEGE_TEAMS) expect(games[t.id]).toBeGreaterThanOrEqual(12);
  });

  it("plays the season through the national championship", () => {
    const state = newGame("SF", "Test", { capRules: "real" }, 42);
    playTo(state, "2027-01-27");
    const c = state.college!;
    for (const g of collegeGames(state)) expect(c.results[g.id]).toBeDefined();
    expect(c.cfpField).toHaveLength(12);
    expect(c.champion).toBeTruthy();
    expect(c.post.filter((g) => g.kind === "bowl").length).toBeGreaterThan(25);
    expect(latestPoll(state, "ap")!.label).toBe("Final");
    expect(c.awards.heisman.winner).toBeTruthy();
    const recs = collegeRecords(state);
    expect(recs[c.champion!].w).toBeGreaterThanOrEqual(11);
    // Prospects have game logs that add up to their totals.
    const qb = draftClass(42).prospects.find((p) => p.position === "QB" && p.starter)!;
    const log = prospectLog(state, qb.id);
    const totals = prospectTotals(state, qb.id);
    expect(log.filter((r) => Object.keys(r.line).length).length).toBe(totals.g);
    expect(log.reduce((s, r) => s + (r.line.passYds ?? 0), 0)).toBe(totals.passYds);
  });

  it("charges travel by distance from our building", () => {
    expect(tripCost("NYG", "STAN")).toBeGreaterThan(tripCost("SF", "STAN") * 2);
  });

  it("learns more per player from narrow assignments than broad ones", () => {
    const state = newGame("NYG", "Test", { capRules: "real" }, 9);
    const dc = draftClass(9);
    const five = dc.prospects.slice(0, 5).map((p) => p.id);
    const broad = { conference: "SEC" as const, positions: ["CB" as const] };
    expect(quote(state, { filter: { players: five }, depth: "deep" }).perPlayer)
      .toBeGreaterThan(quote(state, { filter: broad, depth: "campus" }).perPlayer * 3);
    expect(scoutReport(state, five[0]).grade).toBeUndefined();
    addAssignment(state, { players: five }, "deep");
    addAssignment(state, broad, "campus");
    playTo(state, "2026-09-28");
    const c = state.college!.scouting;
    expect(c.spent).toBeGreaterThan(0);
    for (const id of five) expect(knowledge(state, id)).toBeGreaterThan(60);
    const cb = dc.prospects.find((p) => p.position === "CB" && COLLEGE_TEAMS.find((t) => t.id === p.school)!.conference === "SEC")!;
    expect(knowledge(state, cb.id)).toBeGreaterThan(0);
    expect(knowledge(state, cb.id)).toBeLessThan(knowledge(state, five[0]));
    expect(scoutReport(state, five[0]).grade).toBeTruthy();
    // Other teams scout too.
    expect(Math.max(...c.cpu.DAL)).toBeGreaterThan(0);
  });

  it("catches an older save up on the college season", () => {
    const state = newGame("DET", "Test", { capRules: "real" }, 5);
    delete state.college;
    state.date = "2026-10-05";
    ensureCollege(state);
    expect(state.date).toBe("2026-10-05");
    expect(Object.keys(state.college!.results).length).toBeGreaterThan(300);
    expect(state.college!.ap.length).toBeGreaterThan(3);
  });
});
