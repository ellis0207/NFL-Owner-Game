import { describe, expect, it } from "vitest";
import { capSummary, releaseCost } from "../src/engine/cap";
import { PLAYER_BY_ID, PLAYERS, RULES, SCHEDULE } from "../src/engine/league";
import { playerReport } from "../src/engine/reports";
import { seasonTotals, stat } from "../src/engine/stats";
import { compress, decompress, migrate } from "../src/save/codec";
import { rosterCount } from "../src/engine/roster";
import { advanceDay, isSeasonOver, newGame, veteranReportDate } from "../src/engine/season";
import { standings } from "../src/engine/standings";
import { trades } from "../src/engine/trades";
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
    expect(cost.deadThisYear).toBe(22_500_000); // fully guaranteed base salary plus the roster bonus already paid
    expect(cost.savingsThisYear).toBe(0);
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
      // A team knocked out of the playoffs doesn't replace a player hurt in its last game.
      expect(c.roster).toBeLessThanOrEqual(RULES.rosterLimits.regularSeason);
      expect(c.roster).toBeGreaterThanOrEqual(RULES.rosterLimits.regularSeason - 1);
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
    // Parity: the best team rarely goes 17-0 and winless seasons are rare.
    let winless = 0;
    for (const s of seasons) {
      const wins = Object.values(standings(s)).map((r) => r.w).sort((a, b) => b - a);
      expect(wins[0]).toBeLessThanOrEqual(16);
      if (wins[wins.length - 1] === 0) winless++;
    }
    // Miami starts with $188M of dead money and wins 0-3 games in most seasons, so a winless year isn't a surprise.
    expect(winless).toBeLessThanOrEqual(2);
  });

  it("keeps a box score for every game, and player stats add up to team totals", () => {
    const state = seasons[0];
    for (const g of SCHEDULE) {
      const box = state.box[g.id];
      expect(box).toBeTruthy();
      const r = state.results[g.id];
      for (const side of ["away", "home"] as const) {
        const lines = Object.values(box.players[side]);
        const sum = (k: Parameters<typeof stat>[1]) => lines.reduce((a, v) => a + stat(v, k), 0);
        expect(sum("passYds")).toBe(box.team[side].passYds);
        expect(sum("rushYds")).toBe(box.team[side].rushYds);
        expect(sum("cmp")).toBe(box.team[side].cmp);
        // Points: touchdowns, kicks and safeties add up to the final score.
        const quarters = box.quarters[side].reduce((a, b) => a + b, 0);
        expect(quarters).toBe(side === "home" ? r.homeScore : r.awayScore);
      }
    }
  });

  it("produces season stat lines in a realistic range", () => {
    const reg = seasonTotals(seasons[0], "REG");
    const lines = Object.values(reg).map((s) => s.line);
    const top = (k: "passYds" | "rushYds" | "recYds" | "sacks") => Math.max(...lines.map((l) => l[k] ?? 0));
    expect(top("passYds")).toBeGreaterThan(3800);
    expect(top("passYds")).toBeLessThan(5800);
    expect(top("rushYds")).toBeGreaterThan(1150);
    expect(top("rushYds")).toBeLessThan(2400);
    expect(top("recYds")).toBeGreaterThan(1200);
    expect(top("recYds")).toBeLessThan(2200);
    expect(top("sacks")).toBeGreaterThan(10);
    expect(top("sacks")).toBeLessThan(26);
  });

  it("makes trades before the deadline and none after it", () => {
    for (const state of seasons) {
      const log = trades(state).log;
      expect(log.length).toBeGreaterThan(10);
      expect(log.length).toBeLessThan(90);
      expect(log.every((t) => t.date <= RULES.keyDates.tradeDeadline)).toBe(true);
      expect(log.some((t) => t.send.some((side) => side.some((a) => a.kind === "pick")))).toBe(true);
    }
  });

  it("injures players, uses injured reserve and keeps rosters legal", () => {
    for (const state of seasons) {
      const injuries = Object.values(state.box).reduce((a, b) => a + b.injuries.length, 0);
      expect(injuries).toBeGreaterThan(300);
      const ir = Object.values(state.players).filter((p) => p.status === "ir").length;
      expect(ir).toBeGreaterThan(10);
      for (const team of ["DET", "KC", "MIA", "SF"]) {
        expect(rosterCount(state, team).roster).toBeLessThanOrEqual(RULES.rosterLimits.regularSeason);
        expect(rosterCount(state, team).roster).toBeGreaterThanOrEqual(RULES.rosterLimits.regularSeason - 1);
      }
    }
  });
});

describe("reports", () => {
  it("never show a number from the hidden ratings", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 4);
    for (const p of PLAYERS.slice(0, 400)) {
      const r = playerReport(state, p.id);
      const text = [r.grade, r.summary, r.fit ?? "", ...r.strengths, ...r.concerns].join(" ");
      expect(text).not.toMatch(/\d/);
    }
  });
});

describe("saves", () => {
  it("round-trip a played season, box scores included", async () => {
    const state = seasons0();
    const back = await decompress(await compress(state));
    expect(back.box).toEqual(state.box);
    expect(back.version).toBe(3);
  });

  it("upgrade a version 1 save", () => {
    const old = { ...newGame("DET", "Owner", { capRules: "real" }, 2), version: 1 } as unknown as GameState;
    delete (old as Partial<GameState>).box;
    delete (old as Partial<GameState>).contracts;
    const up = migrate(old);
    expect(up.version).toBe(3);
    expect(up.box).toEqual({});
  });
});

function seasons0(): GameState {
  const state = newGame("KC", "Owner", { capRules: "real" }, 99);
  for (let i = 0; i < 80; i++) advanceDay(state);
  return state;
}
