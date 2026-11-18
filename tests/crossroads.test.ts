import { describe, expect, it } from "vitest";
import { crossroads, forceCrossroads, judgeCrossroads, partnerWants } from "../src/engine/crossroads";
import { culture } from "../src/engine/culture";
import { forceSale } from "../src/engine/investors";
import { decideMemo, officeDaily } from "../src/engine/memos";
import { addDays } from "../src/engine/dates";
import { post } from "../src/engine/business";
import { stateAt } from "./fixtures";

const TEAM = "NYG";

describe("crossroads", () => {
  it("a star's contract splits the building, and overruling the GM costs his trust", () => {
    const s = stateAt(TEAM, 3, "2027-04-01");
    const m = forceCrossroads(s, "star")!;
    expect(m.voices!.length).toBeGreaterThanOrEqual(4);
    // Every option has someone arguing for it, and the sides disagree.
    expect(new Set(m.voices!.map((v) => v.side)).size).toBeGreaterThanOrEqual(2);
    const trust = culture(s).gmTrust;
    const player = m.payload!.player as string;
    const morale = s.players[player].morale ?? 70;
    expect(decideMemo(s, m.id, 0)).toBeNull();
    // Paying him goes against the GM and the CFO; the player and the coach are pleased.
    expect(culture(s).gmTrust).toBeLessThan(trust);
    expect(s.players[player].morale!).toBeGreaterThan(morale);
    expect(s.negotiations[player]?.status).toBe("open");
    expect(s.negotiations[player]?.handler).toBe("gm");
    expect(crossroads(s).outcomes[0].label).toBe("Pay him");
  }, 600_000);

  it("a losing season puts the coach on the desk; firing him opens the search and costs the GM's trust", () => {
    const s = stateAt(TEAM, 3, "2027-01-11");
    const m = forceCrossroads(s, "coach")!;
    expect(m.title).toMatch(/what happens to/);
    const trust = culture(s).gmTrust;
    expect(decideMemo(s, m.id, 0)).toBeNull();
    expect(culture(s).gmTrust).toBeLessThan(trust);
    expect(Object.values(s.staff!.people).some((c) => c.team === TEAM && c.role === "HC" && c.id === m.payload!.coach)).toBe(false);
  }, 600_000);

  it("partners want different things, and each judges the payout by what they want", () => {
    const s = stateAt(TEAM, 3, "2027-05-10");
    forceSale(s, 0.1, "secondary");
    forceSale(s, 0.08, "secondary");
    // The payout is asked for by a partner who wants money back.
    for (let i = 0; i < 6 && !s.investors!.partners.some((p) => partnerWants(s, p) === "cash"); i++) forceSale(s, 0.03, "secondary");
    const ps = s.investors!.partners;
    expect(ps.length).toBeGreaterThanOrEqual(2);
    post(s, "capital", 900_000_000, "test cash");
    const m = forceCrossroads(s, "payout")!;
    expect(m).toBeTruthy();
    const before = ps.map((p) => ({ mood: p.mood, paid: p.distributions, wants: partnerWants(s, p) }));
    expect(decideMemo(s, m.id, 2)).toBeNull();
    ps.forEach((p, i) => {
      expect(p.distributions).toBe(before[i].paid);
      // Reinvesting pleases partners who want winning and angers those who wanted money back.
      if (before[i].wants === "cash") expect(p.mood).toBeLessThan(before[i].mood);
      if (before[i].wants === "winning") expect(p.mood).toBeGreaterThan(before[i].mood);
    });
  }, 600_000);

  it("silence is an answer, and a season later the owner hears who was right", () => {
    const s = stateAt(TEAM, 3, "2027-05-20");
    const m = forceCrossroads(s, "star")!;
    const trust = culture(s).gmTrust;
    s.date = addDays(m.deadline, 1);
    officeDaily(s);
    expect(m.status).toBe("lapsed");
    expect(culture(s).gmTrust).toBeLessThan(trust);
    // A decided one, judged on a season already in the books.
    const m2 = forceCrossroads(s, "coach")!;
    decideMemo(s, m2.id, 1);
    crossroads(s).outcomes[0].season = 2026;
    const inbox = s.inbox.length;
    judgeCrossroads(s);
    expect(crossroads(s).outcomes[0].verdict).toBeTruthy();
    expect(s.inbox.length).toBe(inbox + 1);
    expect(s.inbox[0].title).toMatch(/One year on/);
  }, 600_000);
});
