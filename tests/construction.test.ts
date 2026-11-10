import { beforeAll, describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import {
  approvalsSince, awardContract, baseCost, bindConstruction, closeFinancing, commissionStudies, construction, constructionDaily, designPlan, fastTrack,
  fundingGap, newStadiumLift, ourShareOf, overrun, setFunding, shelvePlan, submitDesign, tempVenueFactor,
} from "../src/engine/construction";
import { addDays } from "../src/engine/dates";
import { debt } from "../src/engine/debt";
import { recoveryEdge } from "../src/engine/facilities";
import { counterLease, lease, leasesDaily } from "../src/engine/leases";
import { RULES, TEAM_BY_ID } from "../src/engine/league";
import { addCommitment, afterRejection, answerRival, answerSponsor, lobby, politics, politicsDaily, splitAsk, voterSupport } from "../src/engine/politics";
import { newGame } from "../src/engine/season";
import { STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { standingState as standing } from "../src/engine/standing";
import type { GameState } from "../src/engine/types";
import { venue } from "../src/engine/venue";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const M = 1_000_000;

function days(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    state.date = addDays(state.date, 1);
    constructionDaily(state);
    politicsDaily(state);
  }
}

/** A plan through its studies and into the design stage. */
function designed(state: GameState): void {
  expect(commissionStudies(state)).toMatch(/consultants/);
  days(state, 91);
}

beforeAll(() => {
  stateAt(TEAM, 3, "2026-10-10");
}, 600_000);

describe("building a new stadium", () => {
  it("studies take about three months and $4M, then offer three sites with costs in the real range", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    designed(state);
    const p = construction(state).plan!;
    expect(business(state).ledger.some((e) => e.note === "New-stadium feasibility studies" && e.amount === -4 * M)).toBe(true);
    expect(p.stage).toBe("design");
    expect(p.sites.map((s) => s.kind)).toEqual(["current", "downtown", "suburb"]);
    expect(p.study!.low).toBeLessThan(p.study!.high);
    designPlan(state, { site: "suburb", roof: "dome", model: "partnership" });
    const cost = baseCost(state, p);
    expect(cost).toBeGreaterThan(1.4e9);
    expect(cost).toBeLessThan(3e9);
    designPlan(state, { roof: "retractable" });
    expect(baseCost(state, p)).toBeGreaterThan(cost);
    // A second plan can't start while this one runs; a shelved one can be restarted.
    expect(commissionStudies(state)).toMatch(/already/);
    expect(shelvePlan(state)).toBeNull();
    expect(commissionStudies(state)).toMatch(/consultants/);
  }, 120_000);

  it("a privately funded team-owned design skips the public vote", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    designed(state);
    designPlan(state, { site: "suburb", model: "team" });
    expect(submitDesign(state, 0)).toMatch(/straight to financing/);
    expect(construction(state).plan!.stage).toBe("finance");
    expect(politics(state).talks).toBeUndefined();
  }, 120_000);

  it("the public side: studies, the environmental review, a council vote and a tax-district referendum", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    designed(state);
    const p = construction(state).plan!;
    designPlan(state, { site: "downtown", model: "partnership", benefits: { jobs: true } });
    const max = Math.round(baseCost(state, p) * 0.45);
    expect(submitDesign(state, max + 50 * M)).toMatch(/won't go past/);
    expect(submitDesign(state, 500 * M)).toBeNull();
    const t = politics(state).talks!;
    expect(p.stage).toBe("politics");
    expect(t.parts.bonds + t.parts.infra + t.parts.grants + t.parts.district).toBe(500 * M);
    expect(t.parts.district).toBeGreaterThan(0);
    expect(p.commitments.some((c) => c.startsWith("Local hiring"))).toBe(true);
    // Voters weigh the size of the ask and the club's commitments.
    const base = voterSupport(state);
    t.ask = 900 * M;
    expect(voterSupport(state)).toBeLessThan(base);
    t.ask = 500 * M;
    expect(addCommitment(state, "access")).toBeNull();
    expect(voterSupport(state)).toBeGreaterThan(base);
    expect(lobby(state)).toMatch(/heard us out/);
    expect(lobby(state)).toMatch(/this month/);
    // Make it a sure thing, then run the calendar.
    t.push += 40;
    days(state, 46);
    expect(t.independent).toBeDefined();
    days(state, 220);
    expect(t.env!.mitigation).toBeGreaterThanOrEqual(0);
    expect(p.mitigation).toBe(t.env!.mitigation);
    expect(t.council!.yes).toBeGreaterThanOrEqual(5);
    expect(t.referendum!.required).toBe(true);
    expect(t.referendum!.date!.slice(5, 7)).toBe("11");
    while (t.status === "talks") days(state, 30);
    expect(t.status).toBe("approved");
    expect(t.referendum!.yes!).toBeGreaterThanOrEqual(50);
    expect(p.stage).toBe("finance");
    expect(p.funding.public).toBe(500 * M);
    expect(p.stayUntil).toBe(Number(p.milestones.political!.slice(0, 4)) + 34);
    expect(p.commitments.some((c) => c.startsWith("Non-relocation pledge"))).toBe(true);
    expect(approvalsSince(state, "2026-10-10")).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("a failed vote leaves four ways forward: another round, private money, renovation or other markets", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    designed(state);
    designPlan(state, { site: "downtown", model: "authority" });
    submitDesign(state, 600 * M);
    const t = politics(state).talks!;
    t.push -= 80;
    days(state, 260);
    expect(t.status).toBe("rejected");
    expect(t.council!.yes).toBeLessThan(5);
    expect(afterRejection(state, "renegotiate")).toMatch(/Another round/);
    expect(t.ask).toBe(450 * M);
    expect(t.round).toBe(2);
    expect(t.status).toBe("talks");
    t.status = "rejected";
    const lean = standing(state).officials[0].lean;
    expect(afterRejection(state, "relocate")).toMatch(/other markets/);
    expect(construction(state).exploreRelocation).toBe(state.date);
    expect(construction(state).plan!.stage).toBe("shelved");
    expect(standing(state).officials[0].lean).toBeLessThan(lean);
  }, 120_000);

  it("a rival suburb's offer can be leverage or a new home for the plan", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    designed(state);
    const p = construction(state).plan!;
    designPlan(state, { site: "downtown", model: "partnership" });
    submitDesign(state, 400 * M);
    const t = politics(state).talks!;
    t.rival = { date: state.date, name: "Lakeview", subsidy: 250 * M };
    const share = ourShareOf(state, p);
    expect(answerRival(state, "accepted")).toMatch(/Lakeview puts in/);
    expect(p.site).toBe("rival");
    expect(ourShareOf(state, p)).toBeLessThan(share - 150 * M);
    expect(answerRival(state, "leverage")).toMatch(/No offer/);
  }, 120_000);

  it("splits the public money by ownership model", () => {
    const state = newGame(TEAM, "x", { capRules: "real" }, 3);
    commissionStudies(state);
    const p = construction(state).plan!;
    expect(splitAsk(100 * M, { ...p, model: "team" })).toEqual({ bonds: 0, infra: 100 * M, grants: 0, district: 0 });
    const s = splitAsk(100 * M, { ...p, model: "authority" });
    expect(s.district).toBe(25 * M);
    expect(s.bonds).toBe(40 * M);
  });

  it("financing needs a 5% contingency; loans, the league's program and seat licenses are booked", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    designed(state);
    const p = construction(state).plan!;
    designPlan(state, { site: "suburb", model: "team", roof: "dome" });
    submitDesign(state, 0);
    expect(setFunding(state, { equity: 100 * M })).toBeNull();
    expect(closeFinancing(state)).toMatch(/short of our share/);
    const need = ourShareOf(state, p) * 1.05;
    state.owner!.liquid = Math.max(state.owner!.liquid, need);
    setFunding(state, { psl: 1e12, loan: 200 * M, equity: 0 });
    expect(p.funding.psl).toBeLessThan(600 * M);
    setFunding(state, { equity: Math.round(need - p.funding.league - p.funding.psl - p.funding.loan + M) });
    expect(fundingGap(state, p)).toBeLessThanOrEqual(0);
    expect(closeFinancing(state)).toMatch(/Financing closed/);
    expect(debt(state).loans.some((l) => l.lender === "League stadium program")).toBe(true);
    expect(debt(state).loans.some((l) => l.purpose === "projects" && l.years === 30)).toBe(true);
    expect(business(state).ledger.some((e) => e.cat === "seatLicenses" && e.amount === p.funding.psl)).toBe(true);
    expect(p.stage).toBe("bids");
    expect(p.bids).toHaveLength(3);
    // Fixed price costs more up front and leaves the overruns with the builder.
    const b = p.bids[0];
    expect(awardContract(state, b.contractor, "fixed")).toMatch(/Permits/);
    expect(p.price).toBe(Math.round(b.price * 1.1 / M) * M);
    expect(p.stage).toBe("permits");
  }, 120_000);

  it("the build runs three-odd years from the first study at $1.5-3B, with common 10-30% overruns, and opens as our new home", () => {
    const overruns: number[] = [];
    for (let seed = 1; seed <= 8; seed++) {
      const state = newGame(TEAM, "x", { capRules: "real" }, seed);
      const start = state.date;
      fastTrack(state, { site: seed === 1 ? "current" : "suburb", contract: seed % 2 ? "gmp" : "costPlus" });
      const c = construction(state);
      const p = c.plan!;
      expect(p.stage).toBe("build");
      expect(p.price!).toBeGreaterThan(1.4e9);
      expect(p.price!).toBeLessThan(3e9);
      if (seed === 1) {
        expect(c.temporary).toBeDefined();
        expect(tempVenueFactor(state, state.date)).toBeLessThan(1);
      }
      while (p.stage !== "open") days(state, 30);
      overruns.push(overrun(p));
      const years = (Date.parse(state.date) - Date.parse(start)) / 3.156e10;
      expect(years).toBeGreaterThan(2.5);
      expect(years).toBeLessThan(5);
      expect(p.paid).toBe(p.ours);
      if (seed === 1) {
        expect(c.temporary).toBeUndefined();
        expect(STADIUM_BY_TEAM[TEAM].name).toBe(p.name);
        expect(STADIUM_BY_TEAM[TEAM].roof).toBe("dome");
        expect(TEAM_BY_ID[TEAM].roof).toBe("dome");
        expect(c.opened.at(-1)!.ours).toBe(true);
        const saved = RULES.season;
        RULES.season = Number(state.date.slice(0, 4));
        expect(newStadiumLift(state).demand).toBeCloseTo(0.1);
        RULES.season = saved;
        if (state.facilities) for (const [k, part] of Object.entries(state.facilities.parts)) if (k.startsWith("stadium") || k === "field") expect(part.wear).toBe(0);
      }
    }
    const typical = overruns.filter((o) => o >= 0.05 && o <= 0.32).length;
    expect(typical).toBeGreaterThanOrEqual(4);
    expect(Math.max(...overruns)).toBeLessThan(0.6);
  }, 120_000);

  it("other clubs open seeded buildings and approve about one new stadium every two to four years", () => {
    const totals: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const state = newGame(TEAM, "x", { capRules: "real" }, seed);
      for (let y = 2027; y <= 2037; y++) {
        state.date = `${y}-03-01`;
        constructionDaily(state);
        state.date = `${y}-07-15`;
        constructionDaily(state);
        if (y === 2027) {
          expect(construction(state).opened.some((n) => n.team === "TEN" && n.name === "Nissan Stadium")).toBe(true);
          expect(STADIUM_BY_TEAM.TEN.roof).toBe("dome");
        }
      }
      totals.push(approvalsSince(state, "2026-08-01"));
    }
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(avg).toBeGreaterThanOrEqual(2.5);
    expect(avg).toBeLessThanOrEqual(6);
  });
});

describe("stadium side issues", () => {
  it("a sponsor up for renewal asks where we'll play; briefing them helps and silence costs", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    commissionStudies(state);
    const year = Number(state.date.slice(0, 4));
    const deals = business(state).local!.deals;
    deals[0].start = year - deals[0].years + 1;
    deals[0].value = Math.max(deals[0].value, 2 * M);
    state.date = `${state.date.slice(0, 7)}-09`;
    days(state, 1);
    const q = politics(state).question!;
    expect(q).toBeDefined();
    const deal = deals.find((d) => d.partner === q.partner && d.cat === q.cat)!;
    const rel = deal.rel ?? 60;
    expect(answerSponsor(state, true)).toMatch(/appreciated/);
    expect(deal.rel).toBe(Math.min(100, rel + 8));
    expect(answerSponsor(state, false)).toMatch(/No question/);
  }, 120_000);

  it("lease talks take asks on upkeep, events and renewal options", () => {
    const state = stateAt(TEAM, 3, "superBowl");
    state.date = RULES.keyDates.newLeagueYear;
    const l = lease(state)!;
    l.through = Number(state.date.slice(0, 4)) + 1;
    leasesDaily(state);
    const upkeep = l.talks!.offer.upkeep;
    expect(counterLease(state, "upkeep").ok).toBe(true);
    for (let i = 0; i < 8; i++) { state.date = addDays(state.date, 1); leasesDaily(state); }
    expect(l.talks?.offer.upkeep ?? upkeep).toBeLessThanOrEqual(upkeep);
    // Ask for renewal options until the public side gives some or walks away.
    for (let k = 0; k < 4 && l.talks && !l.talks.offer.option; k++) {
      expect(counterLease(state, "option").ok).toBe(true);
      for (let i = 0; i < 8; i++) { state.date = addDays(state.date, 1); leasesDaily(state); }
    }
    if (l.talks) expect(l.talks.offer.option).toBe(5);
  }, 120_000);

  it("the training complex speeds rehab a little, and the league inspects the field each month", () => {
    const state = stateAt(TEAM, 3);
    const edge = recoveryEdge(state);
    expect(edge).toBeGreaterThanOrEqual(-0.04);
    expect(edge).toBeLessThanOrEqual(0.05);
    expect(venue(state).reports.some((r) => r.inspection?.includes("field inspection"))).toBe(true);
  }, 120_000);
});

describe("stadium data binding", () => {
  it("a renegotiated lease survives rebinding the stadiums, and a team-owned new building drops its lease", () => {
    const state = newGame(TEAM, "x", { capRules: "real" }, 2);
    const l = lease(state)!;
    l.rent = 1_234_000;
    bindConstruction(state);
    expect(STADIUM_BY_TEAM[TEAM].rent).toBe(1_234_000);
    fastTrack(state, { model: "team", site: "suburb" });
    const p = construction(state).plan!;
    while (p.stage !== "open") days(state, 30);
    expect(state.leases?.[TEAM]).toBeUndefined();
    expect(STADIUM_BY_TEAM[TEAM].structure).toBe("owned");
    expect(STADIUM_BY_TEAM[TEAM].leaseThrough).toBeUndefined();
    construction(state).opened = [];
    bindConstruction(state);
  });
});
