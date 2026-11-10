import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { buildSchedule, keyDatesFor, PRIME_CAP } from "../src/engine/calendar";
import { dealOf, weeksPaid } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { BASE_FORMAT, bindFormat, FORMAT, formatFor } from "../src/engine/format";
import { RULES, SCHEDULE, TEAMS } from "../src/engine/league";
import {
  capMediaBump, decideDispute, distributionForecast, leagueMoney, marketIndex, poolsFor, sharingImpact, WITHHELD,
} from "../src/engine/leaguemoney";
import {
  amendProposal, askForSeat, briefing, emergencies, formCoalition, issuePull, issueStance, leagueOffice, scheduleDraw, trialDone,
} from "../src/engine/leagueoffice";
import { currentMeeting, owners, proposable } from "../src/engine/owners";
import { bindSeasonFormat, rulesFor } from "../src/engine/rules";
import { advanceDay } from "../src/engine/season";
import type { RuleProposal } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const place = Object.fromEntries(TEAMS.map((t, i) => [t.id, (i % 4) + 1]));
// Each division needs places 1-4 exactly once.
for (const conf of ["AFC", "NFC"]) for (const div of ["East", "North", "South", "West"]) {
  TEAMS.filter((t) => t.conference === conf && t.division === div).forEach((t, i) => { place[t.id] = i + 1; });
}

function perTeam(games: ReturnType<typeof buildSchedule>) {
  const reg = games.filter((g) => g.type === "REG");
  const count: Record<string, number> = {};
  const weeks: Record<string, Set<number>> = {};
  for (const g of reg) for (const t of [g.home!, g.away!]) {
    count[t] = (count[t] ?? 0) + 1;
    (weeks[t] ??= new Set()).add(g.week!);
  }
  return { reg, count, weeks };
}

describe("season format", () => {
  it("builds 18-game seasons with two byes, and keeps the 17-game shape", () => {
    const base = perTeam(buildSchedule(2027, 7, place, "KC", { format: BASE_FORMAT }));
    expect(Object.values(base.count).every((n) => n === 17)).toBe(true);
    const big = buildSchedule(2027, 7, place, "KC", { format: { games: 18, byes: 2 }, draw: scheduleDrawFor() });
    const { reg, count, weeks } = perTeam(big);
    expect(Object.values(count).every((n) => n === 18)).toBe(true);
    // Nine at home for everyone, two byes three or more weeks apart, the last week all division games.
    for (const t of TEAMS) {
      expect(reg.filter((g) => g.home === t.id && !g.neutral).length + reg.filter((g) => g.home === t.id && g.neutral).length).toBe(9);
      const off = [...Array(20).keys()].map((i) => i + 1).filter((w) => !weeks[t.id].has(w));
      expect(off).toHaveLength(2);
      expect(off[1] - off[0]).toBeGreaterThanOrEqual(3);
    }
    expect(reg.filter((g) => g.week === 20).every((g) => g.divisionGame)).toBe(true);
    // Prime time stays within the league's limit per team.
    const prime: Record<string, number> = {};
    for (const g of reg) if (g.timeET >= "19:00" && !g.neutral) for (const t of [g.home!, g.away!]) prime[t] = (prime[t] ?? 0) + 1;
    expect(Math.max(...Object.values(prime))).toBeLessThanOrEqual(PRIME_CAP + 2);
  });

  it("pushes the calendar back for a longer season", () => {
    const normal = keyDatesFor(2028);
    bindFormat(() => ({ games: 18, byes: 2 }), 2026);
    const long = keyDatesFor(2028);
    bindFormat(() => BASE_FORMAT, 2026);
    expect(long.regularSeasonEnd).toBe(addDays(normal.regularSeasonEnd, 14));
    expect(long.superBowl > normal.superBowl).toBe(true);
  });

  it("a vote for 18 games and a second bye runs through the next season's schedule, pay and calendar", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    owners(s).rules.push({ rule: "games18", year: 2027, yes: 25, sponsor: "committee" }, { rule: "secondBye", year: 2027, yes: 26, sponsor: "committee" });
    bindSeasonFormat(s);
    expect(formatFor(2027)).toEqual({ games: 18, byes: 2 });
    expect(formatFor(2026)).toEqual(BASE_FORMAT);
    while (RULES.season === 2026) advanceDay(s);
    expect(FORMAT).toEqual({ games: 18, byes: 2, weeks: 20 });
    const { count } = perTeam(SCHEDULE as ReturnType<typeof buildSchedule>);
    expect(Object.values(count).every((n) => n === 18)).toBe(true);
    // Players are paid over 20 weeks, and a full season's pay is still the base salary.
    expect(weeksPaid(addDays(RULES.keyDates.regularSeasonEnd, 1))).toBe(20);
    const id = Object.keys(s.contracts).find((k) => dealOf(s, k)?.team === TEAM)!;
    expect(dealOf(s, id)).toBeDefined();
    bindFormat(() => BASE_FORMAT, 2026);
  }, 300_000);
});

function scheduleDrawFor(): Record<string, number> {
  return Object.fromEntries(TEAMS.map((t) => [t.id, 0.5 + 0.5 * marketIndex(t.id)]));
}

describe("league money", () => {
  it("splits the national share into pools, holds a little back and settles it after the audit", () => {
    const s = stateAt(TEAM, 3, "2027-04-10");
    const p = poolsFor(s, 2026);
    expect(p.media + p.sponsorship + p.licensing + p.other).toBeCloseTo(p.gross, -2);
    expect(p.gross - p.costs).toBeCloseTo(p.net, -2);
    const before = business(s).ledger.length;
    while (s.date < "2027-04-16") advanceDay(s);
    const settle = business(s).ledger.slice(before).filter((e) => e.cat === "revenueShare" && /League audit/.test(e.note ?? ""));
    expect(settle).toHaveLength(1);
    // About the amount held back, give or take the audit's correction.
    const paid = business(s).ledger.filter((e) => e.year === 2026 && e.cat === "national").reduce((t, e) => t + e.amount, 0);
    expect(Math.abs(settle[0].amount)).toBeLessThan(paid * (WITHHELD + 0.03));
    expect(leagueMoney(s).settled[2026]).toBeDefined();
    // A dispute can be contested or dropped.
    leagueMoney(s).dispute = { year: 2026, amount: 1_000_000, opened: s.date };
    expect(decideDispute(s, false)).toBeNull();
    expect(leagueMoney(s).dispute).toBeUndefined();
  }, 300_000);

  it("forecasts wider ranges for unsigned media years, and new deals and an extra game move the cap", () => {
    const s = stateAt(TEAM, 3);
    const f = distributionForecast(s, 6);
    const signed = f.find((x) => !x.unsigned)!;
    const unsigned = f.find((x) => x.unsigned);
    if (unsigned) expect((unsigned.high - unsigned.low) / unsigned.mid).toBeGreaterThan((signed.high - signed.low) / signed.mid);
    leagueMoney(s).tv.renewals.push({ from: 2030, factor: 1.1, text: "" });
    expect(capMediaBump(s, 2030)).toBeCloseTo(0.065, 3);
    owners(s).rules.push({ rule: "games18", year: 2028, yes: 25, sponsor: "committee" });
    bindSeasonFormat(s);
    expect(capMediaBump(s, 2028)).toBeGreaterThan(0.02);
    bindFormat(() => BASE_FORMAT, 2026);
    // Sharing more of the gate moves money from big markets to small ones.
    const impact = sharingImpact(s, 0.4, 0.15);
    const big = impact.find((x) => x.team === "LA")!;
    const small = impact.find((x) => x.team === "BUF")!;
    expect(small.transfer).toBeGreaterThan(big.transfer);
  }, 300_000);
});

describe("governance", () => {
  it("has a commissioner and committees, and gives seats, coalitions and briefings", () => {
    const s = stateAt(TEAM, 3, "2027-03-20");
    const lo = leagueOffice(s);
    expect(lo.commissioner.name).toMatch(/ /);
    for (const m of Object.values(lo.committees)) expect(m.length).toBe(7);
    expect(askForSeat(s, "finance")).toMatch(/request/);
    const msg = formCoalition(s, "money");
    expect(msg).toBeTruthy();
    const m = currentMeeting(s);
    expect(m).toBeDefined();
    const p = m!.proposals[0];
    expect(briefing(s, p)).toMatch(/Difficulty/);
    // Technology needs a trial season before it can be proposed.
    expect(trialDone(s, "skyJudge")).toBe(false);
    expect(proposable(s)).not.toContain("skyJudge");
    lo.trials.skyJudge = 2026;
    expect(proposable(s)).toContain("skyJudge");
    expect(Math.abs(issueStance(s, "NE", "money"))).toBeLessThanOrEqual(1);
  }, 300_000);

  it("a narrowed proposal wins more votes and passes as a one-season trial", () => {
    const s = stateAt(TEAM, 3, "2027-03-20");
    const m = currentMeeting(s)!;
    const rule = proposable(s).find((r) => r !== "skyJudge" && r !== "safetyTech")!;
    const p: RuleProposal = { id: `${m.year}:${rule}`, rule, sponsor: TEAM, committee: "neutral", lobby: {}, ourVote: true };
    m.proposals.push(p);
    const before = issuePull(s, p, "NE");
    expect(amendProposal(s, p)).toMatch(/trial/);
    expect(issuePull(s, p, "NE")).toBeGreaterThan(before);
    while (!m.done) advanceDay(s);
    const adopted = owners(s).rules.find((r) => r.rule === rule && r.year === m.year);
    if (adopted) {
      expect(adopted.until).toBe(m.year);
      // The season after, the trial lapses unless the owners make it permanent.
      const without = { ...s, owners: { ...owners(s), rules: owners(s).rules.filter((r) => r !== adopted) } };
      expect(rulesFor(s, m.year + 1)).toEqual(rulesFor(without, m.year + 1));
      expect(rulesFor(s, m.year)).not.toEqual(rulesFor(without, m.year));
    }
  }, 300_000);
});

describe("schedule moves", () => {
  it("moves a game for a storm and keeps the schedule's lookups in step", () => {
    const s = stateAt(TEAM, 3, "2026-09-20");
    const draw = scheduleDraw(s, place, "KC");
    expect(Object.keys(draw)).toHaveLength(32);
    let moved = 0;
    for (let i = 0; i < 30 && !moved; i++) {
      emergencies(s, 60);
      moved = leagueOffice(s).moves.length;
      advanceDay(s);
    }
    expect(moved).toBeGreaterThan(0);
    const mv = leagueOffice(s).moves[0];
    const g = SCHEDULE.find((x) => x.id === mv.game)!;
    expect(g.neutral || g.weekday === "Monday").toBe(true);
  }, 300_000);
});
