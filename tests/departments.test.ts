import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { decideMemo, officeDaily } from "../src/engine/memos";
import { office } from "../src/engine/delegation";
import { cyberRisk, departments, departmentsDaily, deptYearCost, miles, replaceSystem, resolveIncident, securityFactor, setDeptBudget, setDeptPolicy } from "../src/engine/departments";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("travel, security and technology", () => {
  it("files a report for every road trip, with costs that follow the distance", () => {
    const s = stateAt(TEAM, 7);
    const d = departments(s);
    expect(d.trips.length).toBeGreaterThanOrEqual(8);
    const far = d.trips.reduce((a, t) => (t.miles > a.miles ? t : a));
    const near = d.trips.reduce((a, t) => (t.miles < a.miles ? t : a));
    expect(far.costs.charter).toBeGreaterThan(near.costs.charter);
    expect(miles("SEA", "MIA")).toBeGreaterThan(2500);
    expect(d.travel.metrics.length).toBeGreaterThan(0);
    // The standard levels are already in the budget.
    expect(deptYearCost(s)).toEqual({ security: 0, technology: 0, travel: 0 });
  });

  it("security and technology choices change the odds, and incidents come to the owner as memos", () => {
    const s = stateAt(TEAM, 7);
    const risk = cyberRisk(s);
    setDeptBudget(s, "it", 3);
    expect(setDeptPolicy(s, "it", "vendors", "checked")).toBeNull();
    expect(cyberRisk(s)).toBeLessThan(risk);
    setDeptPolicy(s, "security", "drills", "quarterly");
    expect(securityFactor(s)).toBeLessThan(1);
    expect(deptYearCost(s).technology).toBeGreaterThan(1.5e6);
    expect(replaceSystem(s, "ticketing")).toBeNull();
    expect(departments(s).systems.ticketing.until).toBeDefined();
    // A breach told late costs more than one told on time.
    const tech = () => business(s).ledger.filter((e) => e.cat === "technology").reduce((a, e) => a + e.amount, 0);
    const t0 = tech();
    resolveIncident(s, { kind: "breach", fans: 100_000 }, 0);
    const onTime = t0 - tech();
    const t1 = tech();
    resolveIncident(s, { kind: "breach", fans: 100_000 }, 1);
    expect(t1 - tech()).toBeGreaterThan(onTime);
    // Quarters run cheaply and keep the numbers.
    s.date = "2027-04-01";
    departmentsDaily(s);
    expect(departments(s).it.metrics[0].quarter).toBe("2027-Q2");
    // An unanswered incident memo falls back on the recommendation.
    for (const m of office(s).memos.filter((x) => x.kind === "incident" && x.status === "open")) {
      expect(decideMemo(s, m.id, m.recommend)).toBeNull();
    }
    officeDaily(s);
  });
});
