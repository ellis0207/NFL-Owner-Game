import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { followUp, fullRealism, isRealism, makeSandbox, rankedDesk, saveReport, deleteReport, setPlayMode, showEstimates, showPrivate } from "../src/engine/desk";
import { areaLimit, office, setAreaLimit } from "../src/engine/delegation";
import { accountFor, journal, trialBalance } from "../src/engine/journal";
import { RULES } from "../src/engine/league";
import {
  agendaOrder, backCoach, extendCoach, hireQc, hotSeat, micromanagement, noteFiring, ownerCalendar, people, promoteQc, qcBonus, qcCoaches, regard, remember, schedule,
  setAgenda, severanceOwed, successionPlan, workingConditions,
} from "../src/engine/people";
import { advanceDay } from "../src/engine/season";
import { teamStaff } from "../src/engine/staff";
import { constituents, credibility, meetOfficial, reputationTrend, resolveStandingMemo, setStance, standingState } from "../src/engine/standing";
import {
  approveCapital, capitalAsks, capitalPool, cutDepartment, cutQuality, findingChance, hireConsultant, consulting, invested, payrollByDept, remediate, setControls, treasury,
  workingCapital,
} from "../src/engine/treasury";
import type { Memo } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("treasury", () => {
  it("draws capital from one pool, cuts staff at a cost, and works audit findings", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    const pool = capitalPool(s);
    expect(pool.pool).toBeGreaterThanOrEqual(0);
    const ask = capitalAsks(s).find((a) => a.fits && !a.done);
    if (ask) {
      expect(approveCapital(s, ask.kind)).toBeNull();
      expect(invested(s, ask.kind)).toBe(true);
      expect(capitalPool(s).spent).toBeGreaterThan(pool.spent);
      expect(approveCapital(s, ask.kind)).toMatch(/already/);
    }
    // Stronger controls make findings less likely.
    setControls(s, 0);
    const loose = findingChance(s);
    setControls(s, 3);
    expect(findingChance(s)).toBeLessThan(loose);
    // Consultants run six months.
    expect(hireConsultant(s, "audit")).toBeNull();
    expect(consulting(s, "audit")).toBe(true);
    expect(hireConsultant(s, "audit")).toMatch(/already/);
    // Layoffs: severance now, worse work after.
    const before = business(s).ledger.length;
    const fair = s.culture!.fairness;
    expect(cutDepartment(s, "scouts", 0.2)).toBeNull();
    expect(business(s).ledger.length).toBeGreaterThan(before);
    expect(cutQuality(s, "scouts")).toBeLessThan(1);
    expect(s.culture!.fairness).toBeLessThan(fair);
    // A fixed finding stays fixed.
    treasury(s).findings.unshift({ year: RULES.season, text: "Test finding", severity: "minor", cost: 50_000 });
    expect(remediate(s, 0)).toBeNull();
    expect(remediate(s, 0)).toMatch(/Nothing/);
    const rows = payrollByDept(s);
    expect(rows.length).toBe(10);
    expect(rows.reduce((t, r) => t + r.amount, 0)).toBeGreaterThan(0);
    const wc = workingCapital(s);
    expect(Number.isFinite(wc.net)).toBe(true);
  }, 300_000);
});

describe("double-entry journal", () => {
  it("balances: debits equal credits and cash matches the ledger", () => {
    const s = stateAt(TEAM, 3);
    const tb = trialBalance(s);
    expect(tb.ties).toBe(true);
    expect(Math.abs(tb.debits - tb.credits)).toBeLessThanOrEqual(tb.rows.length);
    const j = journal(s, undefined, "Cash");
    expect(j.length).toBeGreaterThan(50);
    for (const e of j.slice(0, 50)) expect(e.debit === "Cash" || e.credit === "Cash").toBe(true);
    expect(accountFor("tickets")).not.toBe(accountFor("staff"));
  }, 300_000);
});

describe("people", () => {
  it("adds quality-control coaches, promotes one, and extends a coach with a partial guarantee", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    expect(qcBonus(s)).toBe(0);
    expect(hireQc(s, "offense")).toBeNull();
    expect(hireQc(s, "defense")).toBeNull();
    expect(qcCoaches(s)).toHaveLength(2);
    expect(qcBonus(s)).toBeGreaterThan(0);
    const off = qcCoaches(s).find((c) => c.side === "offense")!;
    expect(promoteQc(s, off.id, "CB")).toMatch(/other side/);
    expect(promoteQc(s, off.id, "WR")).toBeNull();
    expect(qcCoaches(s)).toHaveLength(1);
    expect(people(s).promotions[0].who).toBe(off.name);

    const oc = teamStaff(TEAM).OC ?? teamStaff(TEAM).DC;
    if (oc?.contract) {
      const full = severanceOwed(s, oc.id);
      const r = extendCoach(s, oc.id, 3, oc.contract.salary * 1.1, 0.5, 500_000);
      if (r.ok) {
        expect(s.staff!.people[oc.id].contract!.guaranteed).toBe(0.5);
        expect(severanceOwed(s, oc.id)).toBeLessThan(oc.contract.salary * 3 * 1.1 + 1);
        expect(full).toBeGreaterThanOrEqual(0);
      }
    }
    expect(successionPlan(s).length).toBeGreaterThan(0);
  }, 300_000);

  it("remembers, tracks the hot seat and a broken vote of confidence", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    remember(s, "Test Person", "Thanked publicly", 4);
    remember(s, "Test Person", "Overruled", -1);
    expect(regard(s, "Test Person")).toBeGreaterThan(0);
    const before = hotSeat(s);
    expect(backCoach(s)).toBeNull();
    expect(hotSeat(s)).toBeLessThan(before + 1e-9);
    const hc = teamStaff(TEAM).HC!;
    standingState(s);
    noteFiring(s, hc.id);
    expect(s.standing!.broken.some((b) => b.text.includes(hc.name))).toBe(true);
    expect(micromanagement(s)).toBeGreaterThanOrEqual(0);
    const w = workingConditions(s);
    for (const v of [w.staffing, w.workload, w.resources, w.wellbeing]) expect(v).toBeGreaterThanOrEqual(0);
  }, 300_000);

  it("keeps the owner's calendar and agenda", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    expect(schedule(s, s.date, "public")).toMatch(/ahead/);
    expect(schedule(s, addDays(s.date, 3), "league")).toBeNull();
    expect(ownerCalendar(s).some((r) => r.date === addDays(s.date, 3))).toBe(true);
    setAgenda(s, ["Stadium", "Debt", "Nonsense"]);
    expect(people(s).agenda).toEqual(["Stadium", "Debt"]);
    expect(agendaOrder(s, ["The budget", "Debt", "Stadium"])).toEqual(["Stadium", "Debt", "The budget"]);
    // The appointment happens and the days run cleanly through every new hook.
    for (let i = 0; i < 5; i++) advanceDay(s);
    expect(people(s).calendar.find((c) => c.kind === "league")?.done).toBe(true);
  }, 300_000);
});

describe("standing", () => {
  it("reads eight audiences, follows voters, and answers scandals", () => {
    const s = stateAt(TEAM, 3);
    const cred = credibility(s);
    expect(cred).toHaveLength(8);
    for (const a of cred) expect(a.score).toBeGreaterThanOrEqual(0);
    expect(reputationTrend(s).length).toBeGreaterThan(0);
    const st = standingState(s);
    expect(st.officials.length).toBeGreaterThan(0);
    const lean = st.officials[0].lean;
    const msg = meetOfficial(s, 0);
    expect(msg).toBeTruthy();
    expect(st.officials[0].lean).not.toBe(lean + 100);
    expect(meetOfficial(s, 0)).toMatch(/recently/);
    expect(constituents(s)).toBeGreaterThan(0);
    setStance(s, "handsOff");
    setStance(s, "involved");
    expect(st.broken.length).toBeGreaterThan(0);
    const league = st.league;
    const memo = { payload: { standing: "owner", text: "test" } } as unknown as Memo;
    resolveStandingMemo(s, memo, 2);
    expect(st.league).toBeLessThan(league);
    expect(st.incidents[0].text).toMatch(/Owner/);
  }, 300_000);
});

describe("desk and settings", () => {
  it("ranks the desk, answers follow-ups, saves reports, and sets play modes and limits", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    const desk = rankedDesk(s);
    for (let i = 1; i < desk.length; i++) expect(desk[i - 1].score).toBeGreaterThanOrEqual(desk[i].score);
    const m = office(s).memos.find((x) => x.status === "open");
    if (m) {
      expect(followUp(s, m.id, "sensitivity")).toBeNull();
      expect(m.notes.some((n) => n.startsWith("A:"))).toBe(true);
    }
    expect(saveReport(s, "Cap", "cap", {})).toBeNull();
    expect(saveReport(s, "x", "nope", {})).toMatch(/Unknown/);
    deleteReport(s, office(s).reports![0].id);
    expect(office(s).reports).toHaveLength(0);

    setAreaLimit(s, "signings", 5_000_000);
    expect(areaLimit(s, "signings")).toBe(5_000_000);
    setPlayMode(s, "football");
    expect(office(s).modes.sponsors).toBe("delegate");
    setPlayMode(s, "owner");
    expect(office(s).modes.sponsors).not.toBe("delegate");

    s.settings.info = "limited";
    expect(showEstimates(s)).toBe(false);
    expect(fullRealism(s)).toBeNull();
    expect(isRealism(s)).toBe(true);
    expect(showPrivate(s)).toBe(false);
    makeSandbox(s);
    expect(isRealism(s)).toBe(false);
    expect(showPrivate(s)).toBe(true);
    expect(fullRealism(s)).toMatch(/sandbox/);
  }, 300_000);
});
