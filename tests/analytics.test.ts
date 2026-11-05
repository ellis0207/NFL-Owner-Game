import { describe, expect, it } from "vitest";
import { addAdv, emptyAdv, expectedPoints, fourthDownValues, winProbHome } from "../src/engine/analytics";
import { yearPlan } from "../src/engine/business";
import { leagueYear } from "../src/engine/contracts";
import { SCHEDULE } from "../src/engine/league";
import { attribution, teamOutlook } from "../src/engine/outlook";
import { advanceDay, newGame } from "../src/engine/season";
import { simulateGame } from "../src/engine/sim";
import { analytics, analyticsDaily, gamePlan, leagueTrend, setAnalyticsLevel, updateTrends } from "../src/engine/strategy";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const fresh = (seed = 11) => newGame(TEAM, "Owner", { capRules: "real" }, seed);
const regular = SCHEDULE.filter((g) => g.type === "REG");

describe("play value", () => {
  it("expected points rise toward the goal line and fall with down and distance", () => {
    for (let y = 5; y < 95; y += 10) expect(expectedPoints(1, 10, y + 10)).toBeGreaterThan(expectedPoints(1, 10, y));
    expect(expectedPoints(3, 12, 50)).toBeLessThan(expectedPoints(2, 5, 50));
    expect(expectedPoints(2, 5, 50)).toBeLessThan(expectedPoints(1, 10, 52));
    const v = fourthDownValues(1, 60, 0.6);
    expect(v.go).toBeGreaterThan(v.punt);
    expect(fourthDownValues(12, 20, 0).punt).toBeGreaterThan(fourthDownValues(12, 20, 0).go);
    expect(winProbHome(4, 0, 3, false, 0, true)).toBe(1);
    expect(winProbHome(1, 900, 0, true, 0)).toBeGreaterThan(0.5);
  });

  it("league EPA sits near zero, passing beats running, and win probability ends with the winner", () => {
    const s = fresh();
    const all = emptyAdv();
    for (const g of regular.slice(0, 48)) {
      const out = simulateGame(s, g, g.away, g.home);
      addAdv(all, out.box.adv!.away);
      addAdv(all, out.box.adv!.home);
      const last = out.log.plays.at(-1)!;
      if (out.result.homeScore !== out.result.awayScore) expect(last[13]! > 0.5).toBe(out.result.homeScore > out.result.awayScore);
      expect(Object.keys(out.box.pe!).some((k) => k.startsWith("q:"))).toBe(true);
    }
    const epa = all.epa / all.n;
    expect(epa).toBeGreaterThan(-0.06);
    expect(epa).toBeLessThan(0.12);
    expect(all.pe / all.pn).toBeGreaterThan(all.re / all.rn);
    expect(all.s / all.n).toBeGreaterThan(0.38);
    expect(all.s / all.n).toBeLessThan(0.56);
  }, 120_000);
});

describe("game plans and the analytics staff", () => {
  it("better staffs make better plans on average", () => {
    const quality = (level: number) => {
      let q = 0;
      for (const g of regular.filter((x) => x.home === TEAM || x.away === TEAM).slice(0, 12)) {
        const s = fresh();
        setAnalyticsLevel(s, level);
        q += gamePlan(s, TEAM, g.home === TEAM ? g.away : g.home, g).quality;
      }
      return q;
    };
    expect(quality(3)).toBeGreaterThan(quality(0));
  });

  it("the analysts weigh in on fourth downs only when there are analysts", () => {
    const run = (level: number) => {
      const s = fresh();
      setAnalyticsLevel(s, level);
      analytics(s).credibility = 95;
      for (const g of regular.filter((x) => x.home === TEAM || x.away === TEAM)) simulateGame(s, g, g.away, g.home);
      return analytics(s).advice;
    };
    const none = run(0);
    expect(none.advised).toBe(0);
    const lots = run(3);
    expect(lots.advised).toBeGreaterThan(0);
    expect(lots.followed).toBeGreaterThan(0);
  }, 120_000);

  it("charges for the department in the budget", () => {
    const s = fresh();
    setAnalyticsLevel(s, 0);
    const lean = yearPlan(s, leagueYear(s.date)).staff ?? 0;
    setAnalyticsLevel(s, 3);
    const full = yearPlan(s, leagueYear(s.date)).staff ?? 0;
    expect(lean - full).toBeGreaterThan(4e6);
  });

  it("sends a monthly report once the season is under way", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    advanceDay(s);
    analyticsDaily(s);
    expect(s.inbox.some((m) => m.title === "Monthly analytics report")).toBe(true);
  }, 300_000);
});

describe("the season in review", () => {
  it("explains the record, lists needs and moves the league's trends", () => {
    const s = stateAt(TEAM, 3);
    const at = attribution(s, TEAM)!;
    expect(at.games).toBeGreaterThanOrEqual(17);
    expect(at.lines.length).toBeGreaterThan(1);
    expect(Array.isArray(teamOutlook(s, TEAM))).toBe(true);
    const before = analytics(s).trends.length;
    updateTrends(s);
    expect(analytics(s).trends.length).toBe(before + 1);
    expect(Math.abs(leagueTrend(s).pass)).toBeLessThanOrEqual(0.05);
  }, 300_000);
});
