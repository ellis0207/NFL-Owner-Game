import { describe, expect, it } from "vitest";
import { business, businessChief } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { AREA_KEYS, mode, office, openMemos, PRESETS, setMode, setPreset } from "../src/engine/delegation";
import {
  EXEC_KEYS, EXEC_ROLES, execBoost, execRole, execs, execTerms, fireExec, interview, offerExec, openExecSearch, promoteDeputy, setReportsTo,
} from "../src/engine/executives";
import { market } from "../src/engine/freeagency";
import { BASE_KEY_DATES } from "../src/engine/league";
import { assignTask, briefing, consistency, decideMemo, holdMeeting, researchMemo } from "../src/engine/memos";
import { DEFAULT_SETUP } from "../src/engine/ownership";
import { advanceDay, newGame } from "../src/engine/season";
import type { DecisionArea } from "../src/engine/types";
import { stateAt } from "./fixtures";

const game = (seed = 5) => newGame("DET", "Owner", { capRules: "real" }, seed, DEFAULT_SETUP);

describe("business executives", () => {
  it("start with every required job filled, a deputy in each, and the old business chief as president", () => {
    const s = game();
    for (const r of EXEC_KEYS) {
      if (EXEC_ROLES[r].optional) expect(execRole(s, r)).toBeUndefined();
      else expect(execRole(s, r)?.contract?.salary).toBeGreaterThan(0);
      expect(Object.values(execs(s).people).some((e) => e.deputyOf === r)).toBe(true);
      expect(Math.abs(execBoost(s, r))).toBeLessThanOrEqual(1);
    }
    expect(businessChief(s)).toContain(execRole(s, "PRES")!.name);
  });

  it("hire through a search: interviews, an offer at the asking price, and the firm's fee on the books", () => {
    const s = game();
    const search = openExecSearch(s, "FOPS", "Halverson Partners");
    if (typeof search === "string") throw new Error(search);
    expect(search.pool.length).toBe(6);
    const id = search.pool[0];
    expect(interview(s, "FOPS", id, "leadership")).not.toMatch(/isn't in/);
    interview(s, "FOPS", id, "ambition");
    interview(s, "FOPS", id, "finances");
    expect(interview(s, "FOPS", id, "priorities")).toMatch(/hour/);
    // Hand over the coaching decisions so an ambitious candidate will take it.
    setMode(s, "coaching", "delegate");
    const ask = execTerms(s, "FOPS", id);
    const low = offerExec(s, "FOPS", id, { salary: ask.salary * 0.6, years: ask.years, guaranteed: ask.guaranteed }, (a) => mode(s, a));
    expect(low.ok).toBe(false);
    const fees = () => business(s).ledger.filter((e) => e.cat === "professional").reduce((t, e) => t + e.amount, 0);
    const before = fees();
    // The candidate may have walked after the low offer; then hire the next one.
    let hired = false;
    for (const c of [...search.pool]) {
      const t = execTerms(s, "FOPS", c);
      if (offerExec(s, "FOPS", c, { salary: t.salary, years: t.years, guaranteed: t.guaranteed }, (a) => mode(s, a)).ok) { hired = true; break; }
    }
    expect(hired).toBe(true);
    expect(execRole(s, "FOPS")).toBeDefined();
    expect(fees()).toBeLessThan(before);
    expect(execs(s).searches.length).toBe(0);
    expect(office(s).trail.some((t) => t.what.includes("Hired"))).toBe(true);
  });

  it("let go costs severance and reputation; the deputy steps in and can be promoted", () => {
    const s = game();
    const rep = execs(s).reputation;
    const cfo = execRole(s, "CFO")!;
    expect(fireExec(s, "CFO")).toBeNull();
    expect(execRole(s, "CFO")).toBeUndefined();
    expect(execs(s).reputation).toBeLessThan(rep);
    expect(execs(s).departures[0].cost).toBeGreaterThan(0);
    expect(cfo.role).toBeNull();
    // The deputy covers, worse than a hire.
    expect(execBoost(s, "CFO")).toBeGreaterThan(-1);
    expect(briefing(s).join(" ")).toMatch(/chief financial officer/);
    expect(promoteDeputy(s, "CFO")).toBeNull();
    expect(execRole(s, "CFO")).toBeDefined();
  });

  it("refuse a reporting chart with a loop", () => {
    const s = game();
    expect(setReportsTo(s, "COO", "CTO")).toMatch(/loop/);
    expect(setReportsTo(s, "CTO", "CFO")).toBeNull();
    expect(execs(s).reportsTo.CTO).toBe("CFO");
    expect(execs(s).reorgs).toBe(1);
  });
});

describe("decision rights", () => {
  it("default to how the game always worked, and presets set every area", () => {
    const s = game();
    expect(mode(s, "signings")).toBe("owner");
    expect(mode(s, "coaching")).toBe("approve");
    setPreset(s, "chairman");
    for (const a of AREA_KEYS) expect(mode(s, a)).toBe(PRESETS.chairman.modes[a as DecisionArea]);
    expect(office(s).trail[0].what).toMatch(/Chairman/);
  });

  it("taking decisions back unsettles the executive who had them", () => {
    const s = game();
    const cro = execRole(s, "CRO")!;
    setMode(s, "sponsors", "delegate");
    const up = cro.satisfaction;
    setMode(s, "sponsors", "owner");
    expect(cro.satisfaction).toBeLessThan(up);
    const coach = s.media!.coach;
    setMode(s, "coaching", "owner");
    expect(s.media!.coach).toBeLessThan(coach);
  });

  it("signings: the GM writes memos in approve mode and bids on his own when delegated", () => {
    const s = stateAt("DET", 3, addDays(BASE_KEY_DATES.negotiatingWindowOpens, -1));
    setMode(s, "signings", "approve");
    for (let i = 0; i < 4; i++) advanceDay(s);
    const memos = openMemos(s).filter((m) => m.kind === "signing");
    expect(memos.length).toBeGreaterThan(0);
    const m = memos[0];
    expect(m.amount).toBeGreaterThan(0);
    expect(m.options.length).toBe(2);
    const id = m.payload!.player as string;
    if (market(s)[id]?.status === "open") {
      expect(decideMemo(s, m.id, 0, "We need the help")).toBeNull();
      expect(market(s)[id].offers.some((o) => o.team === "DET")).toBe(true);
      expect(office(s).trail[0].why).toBe("We need the help");
    }
    const d = stateAt("DET", 3, addDays(BASE_KEY_DATES.negotiatingWindowOpens, -1));
    setMode(d, "signings", "delegate");
    const before = d.signings.filter((x) => x.team === "DET").length;
    for (let i = 0; i < 12; i++) advanceDay(d);
    expect(d.signings.filter((x) => x.team === "DET").length).toBeGreaterThan(before);
    expect(office(d).trail.some((t) => t.approved === "delegated")).toBe(true);
  }, 120_000);
});

describe("memos, meetings and reviews", () => {
  it("research brings a memo back with notes; an unanswered memo lapses to its default", () => {
    const s = game();
    setMode(s, "pricing", "approve");
    // Jump to just before pricing opens and let the revenue staff write it up.
    while (s.date < addDays(BASE_KEY_DATES.regularSeasonEnd, 5)) advanceDay(s);
    const memo = openMemos(s).find((m) => m.kind === "pricing");
    expect(memo).toBeDefined();
    expect(researchMemo(s, memo!.id)).toBeNull();
    advanceDay(s);
    advanceDay(s);
    advanceDay(s);
    expect(memo!.notes.some((n) => n.startsWith("Research"))).toBe(true);
    while (s.date <= addDays(memo!.deadline, 1)) advanceDay(s);
    expect(memo!.status).toBe("lapsed");
    expect(business(s).next).toBeDefined();
    expect(office(s).trail.some((t) => t.approved === "policy")).toBe(true);
    // The monthly record kept up along the way.
    expect(office(s).trends.length).toBeGreaterThan(3);
    expect(office(s).meetings.length).toBeGreaterThan(3);
    expect(consistency(s).notes.length).toBeGreaterThan(0);
  }, 180_000);

  it("tasks go to the accountable executive and report back", () => {
    const s = game();
    holdMeeting(s);
    expect(office(s).meetings[0].minutes.length).toBeGreaterThan(1);
    expect(assignTask(s, "savings")).toBeNull();
    expect(assignTask(s, "savings")).toMatch(/already/);
    expect(assignTask(s, "rosterReport")).toBeNull();
    for (let i = 0; i < 46; i++) advanceDay(s);
    const t = office(s).tasks.find((x) => x.kind === "savings")!;
    expect(t.status).toBe("done");
    expect(office(s).savings?.rate).toBeGreaterThan(0);
    expect(office(s).tasks.find((x) => x.kind === "rosterReport")!.status).toBe("done");
  }, 60_000);

  it("the league-year close reviews every executive and puts the reviews on the desk", () => {
    const s = stateAt("DET", 3, addDays(BASE_KEY_DATES.newLeagueYear, -1));
    advanceDay(s);
    advanceDay(s);
    const memo = office(s).memos.find((m) => m.kind === "execReview");
    expect(memo).toBeDefined();
    expect(execRole(s, "CFO")!.reviews.length).toBe(1);
    expect(memo!.problem).toMatch(/Chief financial officer/);
    expect(decideMemo(s, memo!.id, 0)).toBeNull();
    expect(memo!.status).toBe("decided");
  }, 120_000);
});
