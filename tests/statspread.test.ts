import { describe, expect, it } from "vitest";
import { PLAYER_BY_ID } from "../src/engine/league";
import { seasonTotals } from "../src/engine/stats";
import { stateAt } from "./fixtures";
import { statSpread } from "./statspread";

// One played season (a shared fixture). The bounds are a little wider than the
// real ranges in statspread.ts, since a single season wanders; they catch the
// old failure, where twice the real number of receivers reached 1,000 yards
// and fifty players reached 10 sacks.
describe("player statistics spread like the real league's", () => {
  it("keeps the marks and leaders near real seasons", () => {
    const s = statSpread(stateAt("DET", 3));
    expect(s.rec1000).toBeGreaterThanOrEqual(12);
    expect(s.rec1000).toBeLessThanOrEqual(34);
    expect(s.rec100).toBeLessThanOrEqual(18);
    expect(s.sack10).toBeGreaterThanOrEqual(8);
    expect(s.sack10).toBeLessThanOrEqual(34);
    expect(s.tackles100).toBeLessThanOrEqual(80);
    expect(s.leadRec).toBeLessThanOrEqual(160);
    expect(s.leadTargets).toBeLessThanOrEqual(215);
    expect(s.pass4000).toBeGreaterThanOrEqual(2);
    expect(s.rush1000).toBeGreaterThanOrEqual(6);
  });

  it("credits sacks to blitzers and tackles to the whole defense", () => {
    const totals = seasonTotals(stateAt("DET", 3), "REG");
    const share = (key: "sacks" | "tklSolo") => {
      const by: Record<string, number> = {};
      let all = 0;
      for (const [id, { line }] of Object.entries(totals)) {
        const v = (line as Record<string, number>)[key] ?? 0;
        const pos = PLAYER_BY_ID[id]?.position ?? "?";
        by[pos] = (by[pos] ?? 0) + v;
        all += v;
      }
      return (pos: string) => (by[pos] ?? 0) / all;
    };
    const sacks = share("sacks");
    // Real 2024-25: edges about 57%, interior 23%, linebackers 12%, safeties and corners 8%.
    expect(sacks("EDGE")).toBeGreaterThan(0.42);
    expect(sacks("LB") + sacks("S") + sacks("CB")).toBeGreaterThan(0.08);
    const tackles = share("tklSolo");
    expect(tackles("EDGE") + tackles("IDL")).toBeGreaterThan(0.18);
  });
});
