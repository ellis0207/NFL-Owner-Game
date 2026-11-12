import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { addMemo, noteDecision } from "../src/engine/delegation";
import { RULES } from "../src/engine/league";
import { decisionQueue, departmentReadings, markReviewed, setInvolvement } from "../src/engine/queue";
import { SCREENS } from "../src/ui/nav";
import { stateAt } from "./fixtures";

const memo = (date: string, title: string, amount: number, kind = "general") => ({
  kind, title, from: "CFO", problem: `Why ${title} matters.`, proposal: "Do it", amount, deadline: addDays(date, 3),
  ifLate: "The vendor walks away.", options: [{ label: "Approve" }, { label: "Decline" }], risks: [], budget: "", recommend: 0,
}) as never;

describe("decision queue", () => {
  it("brings memos, deadlines and staff actions into one list, each with why, when, who and what if nothing", () => {
    const s = stateAt("DET", 3, "franchiseTagWindowOpens");
    addMemo(s, memo(s.date, "Scoreboard upgrade", 2_000_000, "overrun"));
    noteDecision(s, "pricing", "Raised parking prices", 6_000_000, "COO", "delegated");
    const q = decisionQueue(s);
    const m = q.find((i) => i.title === "Scoreboard upgrade")!;
    expect(m.why).toContain("matters");
    expect(m.expires).toBe(addDays(s.date, 3));
    expect(m.recommends).toContain("Approve");
    expect(m.ifNothing).toBe("The vendor walks away.");
    // The tag deadline shows when we have players whose deals run out.
    const tag = q.find((i) => i.id === "deadline:tag");
    expect(tag?.expires).toBe(RULES.keyDates.franchiseTagDeadline);
    expect(q.some((i) => i.kind === "review")).toBe(true);
    // Every link lands on a real page.
    for (const i of q) expect(SCREENS).toContain(i.link.screen);
    // Most pressing first.
    for (let k = 1; k < q.length; k++) expect(q[k - 1].score).toBeGreaterThanOrEqual(q[k].score);
    markReviewed(s);
    expect(decisionQueue(s).some((i) => i.kind === "review")).toBe(false);
  }, 300_000);

  it("a hands-off owner sees only the major calls; a hands-on owner gets department readings", () => {
    const s = stateAt("DET", 3, "franchiseTagWindowOpens");
    addMemo(s, memo(s.date, "Small repair", 50_000, "overrun"));
    addMemo(s, memo(s.date, "Stadium bond", 40_000_000, "general"));
    setInvolvement(s, "handsOff");
    const q = decisionQueue(s);
    expect(q.every((i) => i.major)).toBe(true);
    expect(q.some((i) => i.title === "Stadium bond")).toBe(true);
    expect(q.some((i) => i.title === "Small repair")).toBe(false);
    expect(s.office!.modes.pricing).toBe("delegate");
    setInvolvement(s, "handsOn");
    expect(decisionQueue(s).some((i) => i.title === "Small repair")).toBe(true);
    const r = departmentReadings(s);
    expect(r.length).toBeGreaterThanOrEqual(8);
    for (const x of r) expect(SCREENS).toContain(x.link.screen);
  }, 300_000);
});
