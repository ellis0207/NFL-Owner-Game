import { describe, expect, it } from "vitest";
import { business, nationalRevenue } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { fanBase } from "../src/engine/fans";
import { RULES, TEAM_BY_ID } from "../src/engine/league";
import { bindBrand, brandLift, jerseyForecast, licensingIncome, merch, merchDaily, requestRebrand, setMerchPrice } from "../src/engine/merch";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("merchandise and the brand", () => {
  it("orders jerseys by player, sells them through the season and closes the books", () => {
    const s = stateAt(TEAM, 7);
    // The season's statement goes out two days after the Super Bowl.
    advanceDay(s);
    advanceDay(s);
    const m = merch(s);
    const year = m.seasons.find((x) => x.season === 2026)!;
    expect(year.gross).toBeGreaterThan(5e6);
    expect(year.online + year.stands).toBeCloseTo(year.gross, -3);
    // The most marketable players lead the sales, and the rest go in one bucket.
    const units = Object.entries(year.units).filter(([id]) => id !== "team").sort((a, b) => b[1] - a[1]);
    expect(units.length).toBeGreaterThanOrEqual(5);
    expect(year.units.team).toBeGreaterThan(0);
    // After the Super Bowl what's left is marked down and nothing stays on the shelves.
    for (const st of Object.values(m.stock)) expect(st.ordered).toBeCloseTo(st.sold, 0);
    const store = business(s).ledger.filter((e) => e.cat === "merch" && e.year === 2026).reduce((a, e) => a + e.amount, 0);
    expect(store).toBeGreaterThan(3e6);
    expect(store).toBeLessThan(25e6);
    // League licensing is national money, shared equally.
    expect(licensingIncome(2026)).toBeCloseTo(nationalRevenue(2026) * 0.06, 0);
    // Higher prices sell fewer jerseys.
    const before = jerseyForecast(s).reduce((a, f) => a + f.units, 0);
    setMerchPrice(s, 1.2);
    expect(jerseyForecast(s).reduce((a, f) => a + f.units, 0)).toBeLessThan(before);
  });

  it("renames the club with the league's approval, at a real cost, and the fans notice", () => {
    const s = stateAt(TEAM, 7);
    const trust = fanBase(s).trust;
    expect(requestRebrand(s, "name", "Lions")).toMatch(/already uses/);
    expect(requestRebrand(s, "name", "Pioneers")).toBeNull();
    const m = merch(s);
    s.date = addDays(m.rebrand!.asked, 30);
    merchDaily(s);
    expect(m.rebrand!.approved).toBe(true);
    const cost = m.rebrand!.cost;
    expect(cost).toBeGreaterThan(25e6);
    m.rebrand!.launches = RULES.season;
    merchDaily(s);
    expect(TEAM_BY_ID[TEAM].name).toBe("Pioneers");
    expect(fanBase(s).trust).toBeLessThan(trust);
    expect(brandLift(s)).toBeGreaterThan(1.2);
    const spent = business(s).ledger.filter((e) => e.cat === "brand").reduce((a, e) => a + e.amount, 0);
    expect(-spent).toBeCloseTo(cost, -2);
    // Too soon for another change.
    requestRebrand(s, "uniform");
    s.date = addDays(m.rebrand!.asked, 30);
    merchDaily(s);
    expect(m.rebrand!.approved).toBe(false);
    // A save without the rename puts the league's names back.
    bindBrand(stateAt(TEAM, 7));
    expect(TEAM_BY_ID[TEAM].name).toBe("Lions");
  });
});
