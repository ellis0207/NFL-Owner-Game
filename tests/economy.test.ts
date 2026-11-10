import { describe, expect, it } from "vitest";
import { gateForecast } from "../src/engine/business";
import { par } from "../src/engine/commerce";
import { distributionsBlocked } from "../src/engine/debt";
import { addDays } from "../src/engine/dates";
import {
  corporateFactor, cpiFor, demandFactor, economy, economyDaily, forecastBand, realDollars, scenario, wageFactor,
} from "../src/engine/economy";
import { SCHEDULE } from "../src/engine/league";
import { owner } from "../src/engine/ownership";
import {
  capacityOn, disruptGate, distressOption, premium, riskScore, shocks, shocksDaily, startDisruption, supervised,
} from "../src/engine/shocks";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";

function months(s: GameState, n: number, hooks: ((s: GameState) => void)[]) {
  for (let i = 0; i < n; i++) {
    const [y, m] = s.date.slice(0, 7).split("-").map(Number);
    s.date = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    for (const h of hooks) h(s);
  }
}

describe("economy", () => {
  it("recessions come out of the conditions about once a decade, and cut demand by a few percent", () => {
    let recessions = 0;
    let worst = 1;
    let sum = 0;
    let n = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = { seed, date: "2026-08-01", settings: {} } as unknown as GameState;
      economy(s);
      months(s, 12 * 30, [(x) => {
        economyDaily(x);
        const d = demandFactor(x, TEAM);
        sum += d; n++;
        if (x.economy!.now.recession) worst = Math.min(worst, corporateFactor(x, TEAM));
      }]);
      recessions += s.economy!.recessions.length;
      // A recession starts only with output well below trend.
      for (const r of s.economy!.recessions) expect(r.depth).toBeLessThan(-1.5);
    }
    const perDecade = recessions / 6 / 3;
    expect(perDecade).toBeGreaterThan(0.5);
    expect(perDecade).toBeLessThan(2);
    expect(Math.abs(sum / n - 1)).toBeLessThan(0.02);
    expect(worst).toBeLessThan(0.98);
    expect(worst).toBeGreaterThan(0.85);
  });

  it("a recession lowers the gate, suites and sponsor prices; a hot economy and inflation raise wages", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    economy(s);
    const g = SCHEDULE.find((x) => x.home === TEAM && x.type === "REG" && x.date > s.date)!;
    const before = gateForecast(s, g);
    const sponsor = par(s, "bank", 2027);
    const corp0 = corporateFactor(s, TEAM);
    s.economy!.now = { ...s.economy!.now, gap: -3, confidence: 85, recession: true };
    s.fans!.economy = demandFactor(s, TEAM);
    const after = gateForecast(s, g);
    // Sold-out games keep their season tickets; single-game buyers and suites feel it.
    expect(after.heat).toBeLessThan(before.heat);
    expect(after.tickets).toBeLessThanOrEqual(before.tickets);
    expect(after.tickets).toBeGreaterThan(before.tickets * 0.9);
    expect(corporateFactor(s, TEAM)).toBeLessThan(corp0);
    expect(par(s, "bank", 2027)).toBeLessThan(sponsor);
    s.economy!.now = { ...s.economy!.now, gap: 1.5, unemployment: 3.4, cpi: 1.06, recession: false };
    expect(wageFactor(s)).toBeGreaterThan(1);
  }, 300_000);

  it("reports in 2026 dollars, widens forecast ranges and runs scenarios", () => {
    const s = { seed: 2, date: "2026-08-01", settings: {} } as unknown as GameState;
    economy(s);
    months(s, 12 * 5, [economyDaily]);
    expect(cpiFor(s, 2030)).toBeGreaterThan(1.05);
    expect(realDollars(s, 100_000_000, 2030)).toBeLessThan(100_000_000);
    expect(forecastBand(s, 4)).toBeGreaterThan(forecastBand(s, 0));
    const lines = { tickets: 110e6, premium: 100e6, sponsorship: 140e6, concessions: 20e6, merch: 10e6, other: 500e6, costs: 650e6, floatingDebt: 100e6 };
    const base = scenario(s, { growth: 0, rate: 0.035, price: 0, attendance: 0 }, lines);
    const bad = scenario(s, { growth: -4, rate: 0.06, price: 0, attendance: -0.05 }, lines);
    expect(bad.operating).toBeLessThan(base.operating);
    expect(bad.revenue).toBeLessThan(base.revenue);
  });
});

describe("shocks and insurance", () => {
  it("a covered fire is claimed and paid; a flood without the rider is not; lost games feed an interruption claim", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    const d = startDisruption(s, "fire", true);
    expect(capacityOn(s, s.date)).toBeLessThan(1);
    expect(disruptGate(s, s.date, 10_000_000)).toBeLessThan(1);
    const sh = shocks(s);
    const claim = sh.claims.find((c) => c.cover === "property")!;
    expect(claim.covered).toBe(d.repair - sh.policies.property.deductible);
    for (let i = 0; i < 300 && (claim.status === "open" || claim.status === "disputed" || s.date <= d.until); i++) { s.date = addDays(s.date, 1); shocksDaily(s); }
    expect(claim.status).toBe("paid");
    expect(claim.paid).toBeGreaterThan(0);
    expect(sh.claims.some((c) => c.cover === "interruption")).toBe(true);
    const before = sh.claims.length;
    startDisruption(s, "flood", false);
    expect(sh.claims.length).toBe(before);
    expect(sh.log[0].text).toMatch(/Flood is excluded/);
  }, 300_000);

  it("premiums follow risk controls", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    const good = premium(s, "property", undefined, riskScore(s));
    s.treasury = { ...(s.treasury ?? {}), controls: 0 } as never;
    s.compliance = { ...(s.compliance ?? {}), staff: 0 } as never;
    expect(premium(s, "property", undefined, riskScore(s))).toBeGreaterThan(good);
  }, 300_000);

  it("a serious stadium disruption comes about once a decade", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    s.date = "2026-10-01";
    months(s, 12 * 40, [shocksDaily]);
    const n = shocks(s).disruptions.length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(9);
  }, 300_000);

  it("an owner who can't fund the club falls into distress, then league supervision, and investors get it out", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    const o = owner(s);
    o.liquid = 0;
    o.outside = 0;
    o.personalDebt = 3_000_000_000;
    s.date = "2026-10-01";
    shocksDaily(s);
    expect(shocks(s).distress?.stage).toBe("distress");
    months(s, 2, [shocksDaily]);
    expect(supervised(s)).toBe(true);
    expect(distributionsBlocked(s)).toBe(true);
    expect(Object.values(s.business!.budget).every((v) => v <= 1)).toBe(true);
    expect(distressOption(s, "investors")).toBeNull();
    expect(distressOption(s, "partner")).toBeNull();
    expect(distressOption(s, "partner")).toMatch(/control|distress/);
    expect(shocks(s).distress!.stakeSold).toBeCloseTo(0.45, 2);
  }, 300_000);
});
