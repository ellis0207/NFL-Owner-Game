import { afterEach, describe, expect, it } from "vitest";
import { BASE_TERMS, bindTerms, termsFor } from "../src/engine/cbaterms";
import { dealOf, minimumSalary, projectedCap, rookieScale } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { canSignAtMinimum } from "../src/engine/freeagency";
import { GAMES_BY_DATE } from "../src/engine/league";
import { distributionCut, castVote, forceDeal, forceLockout, labor, laborDaily, laborOdds, lockedOut, settleGrievance } from "../src/engine/labor";
import { monthlyDistribution } from "../src/engine/leaguemoney";
import { proposeTrade } from "../src/engine/trades";
import { proposable } from "../src/engine/owners";
import { rulesFor } from "../src/engine/rules";
import { advanceDay } from "../src/engine/season";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";

afterEach(() => bindTerms(() => BASE_TERMS));

describe("labor", () => {
  it("starts under the real 2020 agreement and talks settle at realistic odds", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    const l = labor(s);
    expect(l.agreements[0].through).toBe(2030);
    expect(termsFor(2030).share).toBe(0.485);
    const o = laborOdds();
    expect(o.beforeDeadline).toBeGreaterThan(0.55);
    expect(o.beforeDeadline).toBeLessThan(0.75);
    expect(o.offseasonLockout).toBeGreaterThan(0.2);
    expect(o.offseasonLockout).toBeLessThan(0.4);
    expect(o.gamesLost).toBeGreaterThan(0.02);
    expect(o.gamesLost).toBeLessThan(0.09);
    // A hard line slows a deal; pushing for peace speeds it.
    expect(laborOdds(20000, 0.7).gamesLost).toBeGreaterThan(o.gamesLost);
    // Talks open two years out and end in a deal or a lockout.
    s.date = "2029-02-27";
    let opened = false;
    for (let i = 0; i < 1000 && l.agreements.length === 1 && !lockedOut(s); i++) {
      s.date = addDays(s.date, 1);
      laborDaily(s);
      opened ||= !!l.talks;
    }
    expect(opened).toBe(true);
    expect(l.agreements.length === 2 || lockedOut(s)).toBe(true);
  }, 300_000);

  it("a new agreement applies at once: cap, minimums, rookie pool, an 18th game; old contracts stay as signed", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    const id = Object.keys(s.players).find((x) => s.players[x].team === TEAM && dealOf(s, x)?.years.some((y) => y.year === 2031))!;
    const before = JSON.stringify(dealOf(s, id));
    const cap = projectedCap(2031), min = minimumSalary(0, 2031), top = rookieScale(1, 2031).total;
    expect(proposable(s)).not.toContain("games18");
    forceDeal(s, { share: 0.5, minScale: 1.1, rookieScale: 0.9, games: 18, practice: 12 });
    expect(labor(s).agreements.length).toBe(2);
    expect(projectedCap(2031) / cap).toBeCloseTo(0.5 / 0.485, 2);
    expect(minimumSalary(0, 2031)).toBeGreaterThan(min * 1.05);
    expect(rookieScale(1, 2031).total).toBeLessThan(top * 0.95);
    expect(projectedCap(2030)).toBeCloseTo(cap / 1.07, -6);
    expect(rulesFor(s, 2031).games).toBe(18);
    expect(rulesFor(s, 2030).games).toBe(17);
    expect(JSON.stringify(dealOf(s, id))).toBe(before);
  }, 300_000);

  it("a lockout stops signings and trades, cancels games, refunds tickets and cuts the national money", () => {
    const s = stateAt(TEAM, 3, "2026-09-13");
    const games = GAMES_BY_DATE[s.date] ?? [];
    expect(games.length).toBeGreaterThan(0);
    const dist = monthlyDistribution(s, 2026);
    const trust = s.fans?.trust ?? 60;
    forceLockout(s);
    expect(lockedOut(s)).toBe(true);
    const fa = Object.keys(s.players).find((x) => s.players[x].status === "fa")!;
    expect(canSignAtMinimum(s, TEAM, fa).reason).toMatch(/locked out/);
    expect(proposeTrade(s, { teams: [TEAM, "CHI"], give: [[], []] } as never).verdict).toBe("reject");
    advanceDay(s);
    for (const g of games) expect(s.results[g.id]).toBeUndefined();
    expect(labor(s).lost[2026]).toBe(games.filter((g) => g.type === "REG").length);
    expect(distributionCut(s, 2026)).toBeLessThan(1);
    expect(monthlyDistribution(s, 2026)).toBeLessThan(dist);
    expect(s.fans!.trust).toBeLessThan(trust);
    forceDeal(s);
    expect(lockedOut(s)).toBe(false);
    expect(labor(s).agreements[1].lockout?.gamesLost).toBeGreaterThan(0);
  }, 300_000);

  it("a tentative deal goes to the owners' vote and the players; grievances can be settled", () => {
    const s = stateAt(TEAM, 3, "2026-09-20") as GameState;
    const l = labor(s);
    s.date = "2029-03-01";
    laborDaily(s);
    const t = l.talks!;
    t.status = "tentative";
    t.tentative = { date: s.date, terms: { ...BASE_TERMS, share: 0.49 }, votesDue: s.date };
    expect(castVote(s, true)).toBeNull();
    laborDaily(s);
    expect(l.agreements.length === 2 || l.talks?.status === "talks").toBe(true);
    l.grievances.unshift({ id: "g1", filed: s.date, kind: "pay", player: Object.keys(s.players)[0], claim: 1_000_000, due: "2030-01-01", status: "open" });
    const paid = s.finance[TEAM]?.paid[2028] ?? 0;
    expect(settleGrievance(s, "g1")).toMatch(/Settled/);
    expect((s.finance[TEAM]?.paid[2028] ?? 0) - paid).toBe(550_000);
  }, 300_000);
});
