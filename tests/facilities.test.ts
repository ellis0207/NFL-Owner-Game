import { describe, expect, it } from "vitest";
import { business, pnl } from "../src/engine/business";
import { leagueYear } from "../src/engine/contracts";
import {
  backlog, commissionStudy, condition, facilities, facilitiesDaily, facilityPull, faultFactor, maintainsStadium, projectPayback, readOf, replacePart, setPlan, stadiumValue, switchSurface,
} from "../src/engine/facilities";
import { stateAt } from "./fixtures";

const TEAM = "DET";

/** Runs the first of the month n times without playing anything else. */
function months(s: ReturnType<typeof stateAt>, n: number) {
  for (let i = 0; i < n; i++) {
    const [y, m] = s.date.split("-").map(Number);
    s.date = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    facilitiesDaily(s);
  }
}

describe("stadium and facility upkeep", () => {
  it("parts wear, the plan replaces them, and putting it off grows a backlog", () => {
    const s = stateAt(TEAM, 7);
    const f = facilities(s);
    expect(Object.keys(f.parts).length).toBeGreaterThanOrEqual(15);
    expect(f.surface).toBe("turf");
    expect(maintainsStadium(TEAM)).toBe(true);
    const ok = structuredClone(s);
    months(ok, 36);
    expect(backlog(ok).parts.length).toBe(0);
    expect(facilities(ok).log.some((x) => x.auto)).toBe(true);
    expect(setPlan(s, "defer")).toBeNull();
    months(s, 36);
    expect(backlog(s).cost).toBeGreaterThan(0);
    expect(faultFactor(s)).toBeGreaterThan(faultFactor(ok));
    // Neglect at the team facility shows up in free agency.
    business(s).budget.facilities = 0;
    months(s, 48);
    expect(facilityPull(s)).toBeLessThan(0);
  });

  it("the owner sees a read until a study measures it, and can replace parts and switch the surface", () => {
    const s = stateAt(TEAM, 7);
    facilities(s);
    expect(commissionStudy(s)).toBeNull();
    expect(readOf(s, "seats")).toEqual({ value: condition(s, "seats"), measured: true });
    const spent = () => business(s).ledger.filter((e) => e.cat === "projects").reduce((a, e) => a + e.amount, 0);
    const before = spent();
    expect(replacePart(s, "boards")).toBeNull();
    expect(condition(s, "boards")).toBe(100);
    expect(spent()).toBeLessThan(before - 20e6);
    // The field changes only in the offseason; Ford Field has a fixed roof, so grass needs a tray.
    s.date = "2027-03-01";
    expect(switchSurface(s, "grass")).toMatch(/tray/);
    expect(stadiumValue(s)).toBeNull(); // publicly owned
    // Payback estimates come from last year's revenue lines.
    const p = projectPayback(s, "footprint");
    expect(p.yearly).toBeGreaterThan(0);
    expect(p.years).toBeGreaterThan(1);
    // The upkeep line is split into what it pays for.
    const year = leagueYear("2026-12-01");
    const notes = business(s).ledger.filter((e) => e.cat === "stadium" && e.year === year).map((e) => e.note ?? "");
    expect(notes.some((n) => n.startsWith("Utilities"))).toBe(true);
    expect(pnl(s, year).expenses.find((r) => r.cat === "stadium")!.amount).toBeLessThan(0);
  });
});
