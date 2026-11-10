import { describe, expect, it } from "vitest";
import { adopted, analysts, analystsDaily, availabilityModel, capOptimizer, contractModel, decideExperiment, startExperiment } from "../src/engine/analysts";
import { assessments } from "../src/engine/assess";
import { capSummary, teamPlayerIds } from "../src/engine/cap";
import { careerLeaders, careerLines, careerTotals, eraRankings } from "../src/engine/careerstats";
import { askToKeep, applyContingency, bubbleBoard, coachRoom, contingencyView, setContingency } from "../src/engine/coachroom";
import { capPlanner, cashVsCap, compFormula, decideOption, openOptions } from "../src/engine/contractextras";
import { leagueYear, releaseCharges, writeDeal } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { hindsight, regradeDraft, slotExpectation } from "../src/engine/hindsight";
import { PLAYER_BY_ID, RULES } from "../src/engine/league";
import { offerValue } from "../src/engine/negotiation";
import { care, franchiseReputation, ownerStanding, replaceDoctor } from "../src/engine/playercare";
import { depthChart } from "../src/engine/roster";
import { DEFAULT_SPLIT, draftBoards, offerUdfa, scoutOps, setSplit, splitFactors, UDFA_BUDGET } from "../src/engine/scoutops";
import { blitzPressure, innovate, selfScout, tendency, tendencyBucket } from "../src/engine/simtactics";
import { seasonTotals } from "../src/engine/stats";
import { hasNoTradeClause } from "../src/engine/trades";
import type { OfferTerms } from "../src/engine/types";
import { draftPool } from "../src/engine/draft";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const terms = (x: Partial<OfferTerms> = {}): OfferTerms => ({ years: 4, total: 80_000_000, signingBonus: 16_000_000, guaranteed: 16_000_000, injuryGuaranteed: 0, voidYears: 0, shape: "flat", ...x });

describe("career stats", () => {
  it("carries seasons from the files and adds the ones played in this game", () => {
    const s = stateAt(TEAM, 3);
    const qb = Object.values(PLAYER_BY_ID).find((p) => p.position === "QB" && careerLines(undefined, p.id).length >= 5)!;
    const before = careerLines(undefined, qb.id);
    const live = careerLines(s, qb.id, true);
    expect(live.length).toBeGreaterThanOrEqual(before.length);
    expect(Number(careerTotals(s, qb.id, true).passYds)).toBeGreaterThanOrEqual(Number(careerTotals(undefined, qb.id).passYds));
    const leaders = careerLeaders(s, "passYds", 5);
    expect(leaders).toHaveLength(5);
    expect(leaders[0].value).toBeGreaterThan(30_000);
    expect(eraRankings(s, ["QB"], 10).length).toBe(10);
  }, 300_000);
});

describe("contract structure", () => {
  it("writes option and roster bonuses, partial guarantees and a no-trade clause", () => {
    const d = writeDeal(terms({ optionBonus: 10_000_000, rosterBonus: 2_000_000, skillGuaranteed: 8_000_000, capGuaranteed: 4_000_000, noTrade: true }), { team: TEAM, date: "2027-03-15", kind: "veteran", firstYear: 2027, yearsExp: 5 });
    expect(d.option?.year).toBe(2028);
    expect(d.option?.amount).toBeGreaterThan(0);
    expect(d.noTrade).toBe(true);
    expect(d.years.slice(1).some((y) => (y.roster ?? 0) > 0)).toBe(true);
    // A release for football reasons owes the skill guarantee; one to save cap room owes the cap guarantee.
    const skill = releaseCharges(d, "2027-04-01", { reason: "skill" });
    const cap = releaseCharges(d, "2027-04-01", { reason: "cap" });
    expect(skill.thisYear).toBeGreaterThan(cap.thisYear);
    const rows = cashVsCap(d);
    expect(rows[0].cash).toBeGreaterThan(rows[0].cap);
  });

  it("prices the extras in an agent's eyes", () => {
    const neg = { player: Object.keys(PLAYER_BY_ID)[0], askGuarantee: 0.3, askYears: 4, missRisk: 0.1 };
    const base = offerValue(neg, terms());
    expect(offerValue(neg, terms({ noTrade: true }))).toBeGreaterThan(base);
    expect(offerValue(neg, terms({ skillGuaranteed: 10_000_000 }))).toBeGreaterThan(base);
    expect(offerValue(neg, terms({ optionBonus: 10_000_000 }))).toBeLessThan(base);
  });

  it("lets the owner exercise or decline an option bonus", () => {
    const s = stateAt(TEAM, 3, "2027-03-15");
    const [a, b] = teamPlayerIds(s, TEAM).filter((id) => ["active", "camp"].includes(s.players[id].status)).slice(0, 2);
    for (const id of [a, b]) {
      s.contracts[id] = writeDeal(terms({ total: 12_000_000, signingBonus: 2_000_000, guaranteed: 2_000_000, optionBonus: 3_000_000 }), { team: TEAM, date: s.date, kind: "veteran", firstYear: leagueYear(s.date), yearsExp: 5 });
    }
    expect(openOptions(s).map((o) => o.id)).toEqual(expect.arrayContaining([a, b]));
    expect(decideOption(s, a, true)).toBeNull();
    expect(s.contracts[a]!.option!.exercised).toBe(true);
    expect(decideOption(s, b, false)).toBeNull();
    expect(s.players[b].status).toBe("fa");
    expect(hasNoTradeClause(a, s)).toBe(false);
  }, 300_000);

  it("plans the cap with trial deals and runs the comp formula", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    const plain = capPlanner(s, TEAM, []);
    const trial = capPlanner(s, TEAM, [{ label: "QB", terms: terms(), firstYear: leagueYear(s.date) }]);
    expect(plain).toHaveLength(5);
    expect(trial[0].space).toBeLessThan(plain[0].space);
    const cut = capPlanner(s, TEAM, [{ label: "QB", terms: terms(), firstYear: leagueYear(s.date), cutAfter: leagueYear(s.date) + 1 }]);
    expect(cut[3].added).toBe(0);
    const comp = compFormula(s, RULES.season + 1);
    expect(comp.picks.length).toBeLessThanOrEqual(32);
    for (const p of comp.picks) expect(p.round).toBeGreaterThanOrEqual(3);
  }, 300_000);
});

describe("sim tactics", () => {
  it("reads tendencies, punishes missed blitz pickups and spreads new ideas", () => {
    const seen: Record<string, [number, number]> = {};
    const b = tendencyBucket(3, 8, "11");
    seen[b] = [18, 20];
    expect(tendency(seen, b).pass).toBeGreaterThan(0.8);
    expect(selfScout(seen, b, 80)).toBeLessThan(selfScout(seen, b, 20) + 1e-9);
    expect(blitzPressure(false)).toBeGreaterThan(blitzPressure(true) * 3);
    const s = stateAt(TEAM, 3);
    const ideas = innovate(s, RULES.season + 1);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.length).toBeLessThan(6);
    // Pressure is tracked in the box scores.
    const t = seasonTotals(s, "REG");
    const pressures = Object.values(t).reduce((n, r) => n + Number((r.line as Record<string, number>).pressures ?? 0), 0);
    const sacked = Object.values(t).reduce((n, r) => n + Number((r.line as Record<string, number>).sacked ?? 0), 0);
    expect(pressures).toBeGreaterThan(sacked * 2);
  }, 300_000);

  it("builds position assessments from the season", () => {
    const a = assessments(stateAt(TEAM, 3));
    expect(a.qb.length).toBeGreaterThan(0);
    expect(a.line.length).toBeGreaterThanOrEqual(5);
    expect(a.def.length).toBeGreaterThan(5);
    expect(a.unit.thirdDownStop).toBeGreaterThan(40);
    expect(a.unit.thirdDownStop).toBeLessThan(80);
  }, 300_000);
});

describe("coach's room", () => {
  it("lists the bubble, caps the owner's asks and follows the next-man-up order", () => {
    const s = stateAt(TEAM, 3, addDays(RULES.keyDates.rosterCutdown, -6));
    const rows = bubbleBoard(s);
    expect(rows.length).toBeGreaterThan(8);
    coachRoom(s).bubble = { season: RULES.season, date: s.date, rows, keep: [] };
    for (const r of rows.slice(0, 3)) expect(askToKeep(s, r.id, true)).toBeNull();
    expect(askToKeep(s, rows[3].id, true)).toMatch(/three/);
    const chart = depthChart(s, TEAM);
    const wr = contingencyView(chart).find((v) => v.pos === "WR")!;
    expect(wr.next.length).toBe(2);
    setContingency(s, "WR", [wr.next[1], wr.next[0]]);
    const copy = { ...chart, WR: [...chart.WR] };
    applyContingency(s, TEAM, copy);
    expect(copy.WR[3]).toBe(wr.next[1]);
  }, 300_000);
});

describe("scouting operations", () => {
  it("keeps the old behavior at the default split and moves with it", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    scoutOps(s);
    const f = splitFactors(s);
    expect(f.gain).toBeCloseTo(1, 5);
    expect(f.medicalAt).toBeCloseTo(85, 5);
    setSplit(s, { ...DEFAULT_SPLIT, travel: 0.8 });
    expect(splitFactors(s).gain).toBeGreaterThan(1);
    const pool = draftPool(s);
    const boards = draftBoards(s, pool);
    expect(boards.length).toBeGreaterThan(20);
    expect(boards.every((b) => b.ev <= b.value + b.fit * 0.2 + 1e-9)).toBe(true);
    expect(offerUdfa(s, pool[pool.length - 1], 100_000)).toBeNull();
    expect(offerUdfa(s, pool[pool.length - 2], UDFA_BUDGET)).toMatch(/budget/);
  }, 300_000);
});

describe("hindsight", () => {
  it("re-grades a draft against what each slot usually gives", () => {
    expect(slotExpectation(1)).toBeGreaterThan(slotExpectation(100));
    const s = stateAt(TEAM, 3);
    // The 2026 class has one season in: regrade it as if two had passed, to check the shape.
    const r = regradeDraft(s, RULES.season, 2);
    if (r) {
      expect(r.teams.length).toBe(32);
      expect(r.picks.length).toBeGreaterThan(200);
    }
    expect(hindsight(s).talent).toBeTruthy();
  }, 300_000);
});

describe("player care and the doctors", () => {
  it("scores the owner, charges for a doctor change and keeps reputations in range", () => {
    const s = stateAt(TEAM, 3);
    const st = ownerStanding(s);
    expect(st.score).toBeGreaterThanOrEqual(0);
    expect(st.score).toBeLessThanOrEqual(100);
    const rep = franchiseReputation(s, TEAM);
    expect(rep).toBeGreaterThanOrEqual(0);
    expect(rep).toBeLessThanOrEqual(1);
    const before = care(s).doctors.find((d) => d.role === "physician")!;
    const fresh = replaceDoctor(s, "physician");
    expect(care(s).doctors.find((d) => d.role === "physician")!.name).toBe(fresh.name);
    expect(fresh.name === before.name && fresh.since === before.since).toBe(false);
  }, 300_000);
});

describe("analysts", () => {
  it("staffs by level, prices players and measures experiments with noise", () => {
    const s = stateAt(TEAM, 3);
    s.analytics!.level = 2;
    expect(analysts(s).staff.length).toBe(6);
    const qb = teamPlayerIds(s, TEAM).find((id) => PLAYER_BY_ID[id].position === "QB" && s.players[id].status === "active")!;
    const m = contractModel(s, qb)!;
    expect(m.range[0]).toBeLessThanOrEqual(m.apy);
    expect(m.range[1]).toBeGreaterThanOrEqual(m.apy);
    expect(availabilityModel(s, qb)).toBeGreaterThan(0);
    expect(capOptimizer(s).length).toBeLessThanOrEqual(10);
    expect(startExperiment(s, "practice")).toBeNull();
    const e = analysts(s).experiments[0];
    s.date = e.ends;
    analystsDaily(s);
    expect(e.measured).toBeDefined();
    expect(adopted(s, "practice")).toBe(0);
    decideExperiment(s, "practice", true);
    expect(adopted(s, "practice")).not.toBe(0);
    expect(capSummary(s, TEAM).limit).toBeGreaterThan(0);
  }, 300_000);
});
