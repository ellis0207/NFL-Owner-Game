import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { SCHEDULE } from "../src/engine/league";
import { STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { benchmark, buildBackups, planCost, DEFAULT_PLAN, setPlan, startExperiment, venue, venueGame } from "../src/engine/venue";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("game-day venue operations", () => {
  it("reports on every home game and benchmarks against the league", () => {
    const s = stateAt(TEAM, 7);
    const v = venue(s);
    expect(v.reports.length).toBeGreaterThanOrEqual(8);
    const r = v.reports[0];
    expect(r.attendance).toBeGreaterThan(40_000);
    expect(r.perCap.food).toBeGreaterThan(10);
    expect(r.perCap.food).toBeLessThan(60);
    const b = benchmark(s)!;
    expect(b.ours.gateWait).toBeGreaterThan(2);
    expect(b.ours.complaints).toBeLessThan(20);
  });

  it("a fuller plan shortens the lines and costs more; backups and experiments work", () => {
    const s = stateAt(TEAM, 7);
    const g = SCHEDULE.find((x) => x.home === TEAM && x.type === "REG")!;
    const cap = STADIUM_BY_TEAM[TEAM].capacity;
    const x = { attendance: cap, sold: cap, comps: 0, noShows: 0, revenue: 12e6, gateShare: 2e6, concessions: 1e6, parking: 4e5, merch: 3e5, merchShort: 0 };
    setPlan(s, { staffing: 0 });
    const lean = venueGame(s, g, x).report;
    setPlan(s, { staffing: 3 });
    const deep = venueGame(s, g, x).report;
    expect(deep.gateWait).toBeLessThan(lean.gateWait);
    expect(deep.foodWait).toBeLessThan(lean.foodWait);
    const total = (p: typeof DEFAULT_PLAN) => Object.values(planCost(p)).reduce((a, n) => a + n, 0);
    expect(total({ ...DEFAULT_PLAN, show: "premium", staffing: 2 })).toBeGreaterThan(0);
    expect(total(DEFAULT_PLAN)).toBe(0);
    expect(total({ ...DEFAULT_PLAN, show: "basic", staffing: 0 })).toBeLessThan(0);
    const before = business(s).ledger.length;
    expect(buildBackups(s)).toBeNull();
    expect(buildBackups(s)).toMatch(/already/);
    expect(business(s).ledger.length).toBe(before + 1);
    expect(startExperiment(s, "queue")).toBeNull();
    expect(startExperiment(s, "menu")).toMatch(/already/);
    for (let i = 0; i < 4; i++) venueGame(s, g, x);
    expect(venue(s).experiment!.done).toBe(true);
    expect(venue(s).experiments[0].kind).toBe("queue");
  });
});
