import { beforeAll, describe, expect, it } from "vitest";
import { teamPlayerIds } from "../src/engine/cap";
import { dealOf, writeDeal, yearCapHit } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { cashPaid } from "../src/engine/finance";
import { attachIncentives, incentiveAdjustment, incentiveMax, likelyIncentives } from "../src/engine/incentives";
import { PLAYER_BY_ID, RULES } from "../src/engine/league";
import { NEXT } from "../src/engine/offseason";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";
const K = RULES.keyDates;

function at(when?: string): GameState {
  return stateAt(TEAM, 3, when);
}

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

beforeAll(() => {
  at("draftStart");
}, 600_000);

describe("incentives on the cap", () => {
  it("count only the likely ones in their year", () => {
    const deal = writeDeal({ years: 1, total: 5_000_000, signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0, voidYears: 0, shape: "flat" },
      { team: TEAM, date: "2027-03-12", kind: "veteran", firstYear: 2027, yearsExp: 6 });
    const before = yearCapHit(deal.years[0]);
    deal.years[0].incentives = [
      { kind: "snaps", threshold: 0.5, amount: 500_000, likely: true },
      { kind: "sacks", threshold: 10, amount: 1_000_000, likely: false },
    ];
    expect(yearCapHit(deal.years[0])).toBe(before + 500_000);
    expect(incentiveMax(deal.years[0])).toBe(1_500_000);
  });

  it("an owner's offer gets a package of about that size, and likely means he did it last season", () => {
    const state = at();
    const id = teamPlayerIds(state, TEAM).find((x) => PLAYER_BY_ID[x].position === "WR" && (state.players[x].status === "active"))!;
    const deal = writeDeal({ years: 2, total: 12_000_000, signingBonus: 2_000_000, guaranteed: 4_000_000, injuryGuaranteed: 0, voidYears: 0, shape: "flat" },
      { team: TEAM, date: state.date, kind: "veteran", firstYear: NEXT, yearsExp: 6 });
    attachIncentives(state, id, deal, NEXT, 2_000_000);
    for (const y of deal.years) {
      expect(y.incentives?.length).toBeGreaterThanOrEqual(2);
      expect(Math.abs(incentiveMax(y) - 2_000_000)).toBeLessThan(150_000);
    }
    const none = writeDeal({ years: 1, total: 3_000_000, signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0, voidYears: 0, shape: "flat" },
      { team: TEAM, date: state.date, kind: "veteran", firstYear: NEXT, yearsExp: 6 });
    attachIncentives(state, id, none, NEXT, 0);
    expect(none.years[0].incentives).toBeUndefined();
  });

  it("are settled after the Super Bowl: earned ones paid, the difference on next year's cap", () => {
    const state = at();
    const id = teamPlayerIds(state, TEAM).find((x) => state.players[x].status === "active" && dealOf(state, x)?.years.some((y) => y.year === RULES.season))!;
    const deal = structuredClone(dealOf(state, id)!);
    state.contracts[id] = deal;
    const y = deal.years.find((x) => x.year === RULES.season)!;
    // One likely incentive he can't reach (a credit back), one unlikely one he can't miss (a charge).
    y.incentives = [
      { kind: "snaps", threshold: 2, amount: 400_000, likely: true },
      { kind: "snaps", threshold: 0, amount: 1_000_000, likely: false },
    ];
    const cash = cashPaid(state, TEAM, RULES.season);
    until(state, addDays(K.superBowl, 3));
    expect(y.incentives.map((i) => i.earned)).toEqual([false, true]);
    expect(cashPaid(state, TEAM, RULES.season) - cash).toBe(1_000_000);
    expect(incentiveAdjustment(state, TEAM, RULES.season + 1)).toBe(400_000 - 1_000_000);
    expect(state.inbox.some((m) => m.title === "Incentives settled for the season")).toBe(true);
  });
});

describe("incentives in the market", () => {
  it("show up on about a third of veteran free-agent deals, mostly short ones, mostly not likely", () => {
    const state = at("draftStart");
    let deals = 0, withInc = 0, likely = 0, max = 0, apy = 0, long = 0, longWith = 0;
    for (const [id, d] of Object.entries(state.contracts)) {
      // Minimum-salary deals seldom carry incentives worth writing, so the share is measured on real money.
      if (!d || d.kind !== "veteran" || d.signed < K.newLeagueYear || !PLAYER_BY_ID[id] || d.apy < 2_500_000) continue;
      deals++;
      const real = d.years.filter((y) => !y.void).length;
      if (real >= 4) long++;
      const y = d.years.find((x) => x.incentives);
      if (!y) continue;
      withInc++;
      if (real >= 4) longWith++;
      likely += likelyIncentives(y);
      max += incentiveMax(y);
      apy += d.apy;
    }
    const share = withInc / deals;
    console.log(`incentives: ${withInc}/${deals} deals (${Math.round(share * 100)}%), size ${Math.round((max / apy) * 100)}% of APY, likely ${Math.round((likely / max) * 100)}%, long deals ${longWith}/${long}`);
    expect(deals).toBeGreaterThan(60);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.45);
    expect(max / apy).toBeGreaterThan(0.05);
    expect(max / apy).toBeLessThan(0.4);
    expect(likely / max).toBeLessThan(0.5);
  });
});
