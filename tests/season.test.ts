import { describe, expect, it } from "vitest";
import { capSummary, releaseCost } from "../src/engine/cap";
import { PLAYER_BY_ID, RULES, SCHEDULE } from "../src/engine/league";
import { rosterCount } from "../src/engine/roster";
import { advanceDay, isSeasonOver, newGame, veteranReportDate } from "../src/engine/season";
import { standings } from "../src/engine/standings";
import type { GameState } from "../src/engine/types";

function playSeason(seed: number): GameState {
  const state = newGame("DET", "Test Owner", { capRules: "real" }, seed);
  while (!isSeasonOver(state)) advanceDay(state);
  return state;
}

describe("new game", () => {
  it("starts on the day veterans report, 47 days before the opener", () => {
    expect(veteranReportDate("SEA")).toBe("2026-07-24"); // opener Wed Sept 9
    expect(veteranReportDate("DET")).toBe("2026-07-28"); // opener Sun Sept 13
    const state = newGame("DET", "Owner", { capRules: "real" }, 1);
    expect(state.date).toBe("2026-07-28");
    expect(rosterCount(state, "DET").roster).toBeGreaterThan(85);
  });

  it("starts every team under its cap", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 1);
    for (const team of ["DET", "MIA", "NE", "SF", "LA"]) expect(capSummary(state, team).space).toBeGreaterThan(0);
  });
});

describe("releases", () => {
  it("keeps this year's bonus proration and guarantees as dead money", () => {
    const rodgers = PLAYER_BY_ID["00-0023459"];
    const cost = releaseCost(rodgers.id);
    expect(cost.deadThisYear).toBe(22_000_000); // fully guaranteed base salary
    expect(cost.savingsThisYear).toBe(500_000);
  });
});

describe("a full season", () => {
  const seasons = [11, 22, 33].map(playSeason);

  it("plays every game and crowns a champion", () => {
    for (const state of seasons) {
      expect(Object.keys(state.results)).toHaveLength(SCHEDULE.length);
      expect(state.champion).toBeTruthy();
    }
  });

  it("cuts every team to 53 with a practice squad", () => {
    const state = seasons[0];
    for (const team of ["DET", "KC", "MIA"]) {
      const c = rosterCount(state, team);
      expect(c.roster).toBe(RULES.rosterLimits.regularSeason);
      expect(c.ps).toBeLessThanOrEqual(RULES.rosterLimits.practiceSquad);
      expect(c.ps).toBeGreaterThan(8);
    }
  });

  it("produces NFL-like scoring, home field and parity", () => {
    const reg = seasons.flatMap((s) => SCHEDULE.filter((g) => g.type === "REG").map((g) => s.results[g.id]));
    const points = reg.flatMap((r) => [r.awayScore, r.homeScore]);
    const avg = points.reduce((a, b) => a + b, 0) / points.length;
    expect(avg).toBeGreaterThan(19);
    expect(avg).toBeLessThan(26);
    const homeWins = reg.filter((r) => r.homeScore > r.awayScore).length / reg.length;
    expect(homeWins).toBeGreaterThan(0.48);
    expect(homeWins).toBeLessThan(0.62);
    const ties = reg.filter((r) => r.homeScore === r.awayScore).length / seasons.length;
    expect(ties).toBeLessThan(3);
    // Parity: the best team rarely goes 17-0 and nearly everyone wins some games.
    for (const s of seasons) {
      const wins = Object.values(standings(s)).map((r) => r.w).sort((a, b) => b - a);
      expect(wins[0]).toBeLessThanOrEqual(16);
      expect(wins[wins.length - 1]).toBeGreaterThanOrEqual(1);
    }
  });
});
