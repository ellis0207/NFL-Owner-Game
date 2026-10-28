import { describe, expect, it } from "vitest";
import {
  dealCapHit, leagueYear, leagueYearStart, minimumSalary, originalDeal, releaseCharges, rookieScale, writeDeal, writeExtension,
  writeMinimumDeal, yearCapHit,
} from "../src/engine/contracts";
import { PLAYERS } from "../src/engine/league";

const terms = { years: 4, total: 120_000_000, signingBonus: 40_000_000, guaranteed: 70_000_000, injuryGuaranteed: 20_000_000, voidYears: 0, shape: "rising" as const };
const opts = { team: "DET", date: "2026-10-28", kind: "veteran" as const, firstYear: 2027, yearsExp: 5 };

describe("original contracts", () => {
  it("rebuild every real cap hit in the data exactly", () => {
    let checked = 0;
    for (const p of PLAYERS) {
      const deal = originalDeal(p.id);
      for (const s of p.contract.seasons) {
        expect(dealCapHit(deal, s.year)).toBe(s.capHit);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("find void years", () => {
    const voids = PLAYERS.filter((p) => originalDeal(p.id).years.some((y) => y.void));
    expect(voids.length).toBeGreaterThan(5);
  });
});

describe("league calendar", () => {
  it("runs the 2026 league year to March 2027", () => {
    expect(leagueYear("2026-10-28")).toBe(2026);
    expect(leagueYear("2027-03-10")).toBe(2026);
    expect(leagueYear(leagueYearStart(2027))).toBe(2027);
  });
});

describe("writing contracts", () => {
  it("adds up and spreads the bonus evenly", () => {
    const d = writeDeal(terms, opts);
    expect(d.total).toBe(120_000_000);
    expect(d.apy).toBe(30_000_000);
    expect(d.years.map((y) => y.proration)).toEqual([10_000_000, 10_000_000, 10_000_000, 10_000_000]);
    expect(d.years[3].base).toBeGreaterThan(d.years[0].base);
    expect(d.guaranteedAtSigning).toBe(70_000_000);
    expect(d.years.reduce((s, y) => s + y.injuryGuaranteed, 0)).toBe(20_000_000);
  });

  it("caps proration at five years and spreads it into void years", () => {
    const long = writeDeal({ ...terms, years: 6, total: 180_000_000 }, opts);
    expect(long.years.filter((y) => y.proration > 0)).toHaveLength(5);
    const voided = writeDeal({ ...terms, years: 2, total: 60_000_000, voidYears: 3 }, opts);
    expect(voided.years).toHaveLength(5);
    expect(voided.years.filter((y) => y.void)).toHaveLength(3);
    expect(voided.years[0].proration).toBe(8_000_000);
    expect(voided.apy).toBe(30_000_000);
  });

  it("puts the extension bonus on the current year too", () => {
    const current = writeDeal({ ...terms, years: 2, total: 20_000_000, signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0 }, { ...opts, firstYear: 2026 });
    const ext = writeExtension(current, { ...terms, years: 3, total: 90_000_000, signingBonus: 25_000_000 }, "2026-10-28", 5);
    expect(ext.years.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(ext.years[0].proration).toBe(5_000_000);
    expect(ext.years[0].base).toBe(current.years[0].base);
  });

  it("gives veterans on minimum deals the veteran salary benefit", () => {
    const vet = writeMinimumDeal("DET", "2026-08-01", 8);
    expect(yearCapHit(vet.years[0])).toBe(minimumSalary(2));
    const young = writeMinimumDeal("DET", "2026-08-01", 1);
    expect(yearCapHit(young.years[0])).toBe(minimumSalary(1));
  });

  it("slots rookie deals by pick", () => {
    expect(rookieScale(1, 2027).total).toBeGreaterThan(rookieScale(32, 2027).total * 3);
    expect(rookieScale(257, 2027).total).toBeLessThan(6_000_000);
  });
});

describe("releases", () => {
  const d = writeDeal(terms, { ...opts, firstYear: 2026, date: "2026-03-20" });

  it("accelerates everything before June 1", () => {
    const c = releaseCharges(d, "2026-04-15");
    expect(c.nextYear).toBe(0);
    expect(c.thisYear).toBe(40_000_000 + d.years[0].guaranteed + d.years[1].guaranteed);
  });

  it("splits across two years after June 1 or with a designation", () => {
    const after = releaseCharges(d, "2026-07-15");
    const designated = releaseCharges(d, "2026-04-15", { june1: true });
    for (const c of [after, designated]) {
      expect(c.thisYear).toBe(10_000_000 + d.years[0].guaranteed);
      expect(c.nextYear).toBe(30_000_000 + d.years[1].guaranteed + d.years[2].guaranteed);
    }
  });

  it("counts injury guarantees once they vest or if the player is hurt", () => {
    const before = releaseCharges(d, "2026-07-15");
    const hurt = releaseCharges(d, "2026-07-15", { injured: true });
    expect(hurt.nextYear).toBeGreaterThan(before.nextYear);
  });

  it("keeps salary already paid during the season", () => {
    const cheap = writeDeal({ years: 1, total: 18_000_000, signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0, voidYears: 0, shape: "flat" }, { ...opts, firstYear: 2026 });
    const c = releaseCharges(cheap, "2026-11-20");
    expect(c.thisYear).toBeGreaterThan(5_000_000);
    expect(c.thisYear).toBeLessThan(18_000_000);
  });
});
