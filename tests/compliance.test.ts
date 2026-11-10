import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { invalidateRosters, teamPlayerIds } from "../src/engine/cap";
import {
  appealCase, certify, compliance, complianceDaily, forfeitPick, fundingRequired, openCase, respondCase, sanctionsIn, setFunding, tradePhysicals,
} from "../src/engine/compliance";
import { crises, crisisDaily, decideCrisis, fundRemediation, startCrisis } from "../src/engine/crisis";
import { addDays } from "../src/engine/dates";
import { fanBase } from "../src/engine/fans";
import { RULES } from "../src/engine/league";
import { authorization, entities, exposure, legal, legalDaily, openMatter, openMatters, settleMatter } from "../src/engine/legal";
import { picksOf } from "../src/engine/trades";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";

/** Move the calendar without playing games: only the hooks under test run. */
function days(s: GameState, n: number, hooks: ((s: GameState) => void)[]) {
  for (let i = 0; i < n; i++) {
    s.date = addDays(s.date, 1);
    for (const h of hooks) h(s);
  }
}

describe("compliance office", () => {
  it("files roster moves, certifies, funds guarantees and audits the cap", () => {
    const s = stateAt(TEAM, 3, "2027-05-20");
    const c = compliance(s);
    complianceDaily(s);
    const id = teamPlayerIds(s, TEAM)[0];
    s.players[id].team = "FA";
    invalidateRosters(s);
    complianceDaily(s);
    expect(c.filings.length).toBeGreaterThan(0);
    expect(certify(s)).toBeNull();
    expect(certify(s)).toMatch(/already/);
    // Cash funding moves money into escrow on the 1st; a letter of credit charges a fee instead.
    expect(fundingRequired(s)).toBeGreaterThan(0);
    setFunding(s, "cash");
    s.date = "2027-05-31";
    days(s, 1, [complianceDaily]);
    expect(c.escrow).toBe(fundingRequired(s));
    expect(business(s).ledger.some((e) => e.cat === "escrow" && e.amount < 0)).toBe(true);
    setFunding(s, "letter");
    days(s, 30, [complianceDaily]);
    expect(c.escrow).toBe(0);
    // The June audit happened in between.
    expect(c.audits.some((a) => a.year === 2026)).toBe(true);
  }, 300_000);

  it("runs an investigation to a sanction that costs a pick, and hears the appeal", () => {
    const s = stateAt(TEAM, 3, "2027-05-20");
    const k = openCase(s, TEAM, "injuryReport", 2);
    k.evidence = 1;
    expect(respondCase(s, k.id, "cooperate")).toBeNull();
    const before = picksOf(s, TEAM);
    for (let i = 0; i < 120 && k.stage !== "sanctioned"; i++) days(s, 1, [complianceDaily]);
    expect(k.stage).toBe("sanctioned");
    expect(k.fine).toBeGreaterThan(0);
    expect(k.picks).toHaveLength(1);
    expect(picksOf(s, TEAM)).not.toContain(k.picks![0]);
    expect(before).toContain(k.picks![0]);
    expect(compliance(s).strikes).toBe(1);
    expect(appealCase(s, k.id)).toBeNull();
    expect(appealCase(s, k.id)).toMatch(/nothing/);
    for (let i = 0; i < 60 && k.stage !== "closed"; i++) days(s, 1, [complianceDaily]);
    expect(k.outcome).toMatch(/appeal/);
    // A pick already forfeited isn't taken twice.
    const again = forfeitPick(s, TEAM, 5);
    expect(again).not.toBe(k.picks![0]);
  }, 300_000);

  it("the league disciplines one to three clubs in a typical year", () => {
    const s = stateAt(TEAM, 3, "2027-05-02");
    days(s, 365 * 3, [complianceDaily]);
    const counts = [2027, 2028, 2029].map((y) => compliance(s).leagueCases.filter((k) => k.team !== TEAM && k.sanction && k.opened >= `${y}-05-02` && k.opened < `${y + 1}-05-02`).length);
    const avg = counts.reduce((a, b) => a + b, 0) / 3;
    expect(avg).toBeGreaterThanOrEqual(0.7);
    expect(avg).toBeLessThanOrEqual(3.5);
    expect(sanctionsIn(s, RULES.season)).toBeDefined();
  }, 300_000);

  it("a hurt player can fail his trade physical, and a healthy one passes", () => {
    const s = stateAt(TEAM, 3, "2027-05-20");
    const ours = teamPlayerIds(s, TEAM)[1];
    const deal = { teams: [TEAM, "NE"] as [string, string], send: [[{ kind: "player" as const, id: ours }], []] as [never[], never[]] };
    expect(tradePhysicals(s, deal as never, "t1")).toBeNull();
    s.players[ours].injury = { type: "Torn ACL", date: s.date, returnDate: addDays(s.date, 270), seasonEnding: true };
    const results = [...Array(10).keys()].map((i) => tradePhysicals(s, deal as never, `t-${i}`));
    expect(results.some((r) => r && /failed/.test(r))).toBe(true);
    expect(compliance(s).physicals.length).toBeGreaterThan(5);
  }, 300_000);
});

describe("crisis playbook", () => {
  it("a denial that the findings contradict costs more trust than owning it", () => {
    const run = (response: string) => {
      const s = stateAt(TEAM, 3, "2027-05-20");
      const x = startCrisis(s, "safety", { fault: 0.9, severity: 2 });
      const trust = fanBase(s).trust;
      decideCrisis(s, x.id, "response", response);
      decideCrisis(s, x.id, "league", "inform");
      decideCrisis(s, x.id, "review", "independent");
      days(s, 50, [crisisDaily]);
      expect(x.stage).toBe("resolved");
      return { s, x, drop: trust - fanBase(s).trust };
    };
    const denied = run("deny");
    const owned = run("safety");
    expect(denied.drop).toBeGreaterThan(owned.drop);
    expect(crises(denied.s).scar).toBeGreaterThan(crises(owned.s).scar);
    // At fault: a fan injury claim follows, and fixes can be funded.
    expect(openMatters(owned.s).some((m) => m.kind === "fan injury claims")).toBe(true);
    expect(fundRemediation(owned.s, owned.x.id, 1_000_000)).toBeNull();
  }, 300_000);
});

describe("legal", () => {
  it("names club companies and sign-offs, and runs a dispute from negotiation to an end", () => {
    const s = stateAt(TEAM, 3, "2027-05-20");
    expect(entities(s)[0].name).toMatch(/Detroit Lions Football Club/);
    expect(authorization(s, 50_000_000)).toContain("The owner");
    expect(authorization(s, 50_000_000, "debt")).toContain("League finance committee");
    const m = openMatter(s, "vendor contract dispute", "A supplier", 1_000_000, 0.5);
    expect(exposure(s).find((e) => e.id === m.id)!.high).toBeGreaterThan(exposure(s).find((e) => e.id === m.id)!.low);
    for (let i = 0; i < 400 && openMatters(s).includes(m); i++) days(s, 1, [legalDaily]);
    expect(["settled", "won", "lost"]).toContain(m.stage);
    expect(m.spent).toBeGreaterThan(0);
    const n = openMatter(s, "employment claims", "A former employee", 500_000, 0.4);
    expect(settleMatter(s, n.id)).toBeNull();
    expect(n.result).toMatch(/insurance/);
    expect(legal(s).matters.length).toBeGreaterThan(1);
  }, 300_000);
});
