import { describe, expect, it } from "vitest";
import { boardroom, boardroomDaily, forceBoardMeeting, openPledge, partnerGoal, setExecBonus, settleExecBonus } from "../src/engine/boardroom";
import { partnerWants } from "../src/engine/crossroads";
import { execRole } from "../src/engine/executives";
import { forceSale, investors } from "../src/engine/investors";
import { decideMemo } from "../src/engine/memos";
import { openProblems, problemsDaily } from "../src/engine/problems";
import { business } from "../src/engine/business";
import { stateAt } from "./fixtures";

const TEAM = "NYG";

describe("boardroom", () => {
  it("the board asks for a promise; a pledge is checked at the next meeting and a broken one costs the partners who asked", () => {
    const s = stateAt(TEAM, 3, "2027-04-20");
    forceSale(s, 0.2, "secondary");
    forceSale(s, 0.1, "secondary");
    const ps = investors(s).partners;
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) expect(partnerGoal(s, p).text.length).toBeGreaterThan(5);
    const m = forceBoardMeeting(s)!;
    expect(m.voices!.length).toBeGreaterThanOrEqual(2);
    expect(m.problem).toMatch(/Around the table/);
    expect(decideMemo(s, m.id, 0)).toBeNull();
    const pl = openPledge(s)!;
    expect(pl.status).toBe("open");
    // Force the pledge to fail by the time it's checked: "no new debt" against a debt below zero can't be kept.
    pl.kind = "value";
    pl.base = -1e12;
    const asked = ps.filter((p) => partnerWants(s, p) === pl.want);
    const before = asked.map((p) => p.mood);
    s.date = pl.due;
    boardroomDaily(s);
    expect(pl.status).toBe("broken");
    expect(boardroom(s).broken).toBe(1);
    asked.forEach((p, i) => expect(p.mood).toBeLessThan(before[i]));
    // The next meeting is on the desk, and it remembers.
    const next = s.office!.memos.find((x) => x.payload?.board && x.status === "open" && x.id !== m.id)!;
    expect(next.problem).toMatch(/pledge was broken/);
  }, 600_000);

  it("an unhappy partner shows up as an open problem, and lingering problems are remembered", () => {
    const s = stateAt(TEAM, 3, "2027-04-20");
    forceSale(s, 0.2, "secondary");
    const p = investors(s).partners[0];
    p.mood = 20;
    const list = openProblems(s);
    const row = list.find((x) => x.id === `partner:${p.id}`)!;
    expect(row.severity).toBe(3);
    // Next Monday the list remembers when it started.
    while (new Date(s.date).getUTCDay() !== 1) s.date = new Date(Date.parse(s.date) + 86400000).toISOString().slice(0, 10);
    problemsDaily(s);
    expect(s.problems!.seen[`partner:${p.id}`]).toBe(s.date);
  }, 600_000);

  it("an executive bonus is paid when the review reaches the target and missed when it doesn't", () => {
    const s = stateAt(TEAM, 3, "2027-04-20");
    const e = execRole(s, "CFO")!;
    expect(setExecBonus(s, "CFO", 0.25, 60)).toBeNull();
    const ledger = business(s).ledger.length;
    const mood = e.satisfaction;
    expect(settleExecBonus(s, "CFO", 72)).toMatch(/Bonus earned/);
    expect(business(s).ledger.length).toBeGreaterThan(ledger);
    expect(e.satisfaction).toBeGreaterThan(mood);
    expect(setExecBonus(s, "CFO", 0.25, 80)).toBeNull();
    const m2 = e.satisfaction;
    expect(settleExecBonus(s, "CFO", 72)).toMatch(/missed/);
    expect(e.satisfaction).toBeLessThan(m2);
  }, 600_000);
});
