import { describe, expect, it } from "vitest";
import { bindDraftModel, modelApplies } from "../src/engine/outcomes";
import { draftClass } from "../src/engine/prospects";
import { newGame } from "../src/engine/season";
import type { GameState } from "../src/engine/types";

/** Spearman rank correlation. */
function rankCorr(a: number[], b: number[]): number {
  const rank = (v: number[]) => { const r = new Array(v.length); v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]).forEach(([, i], k) => (r[i] = k)); return r as number[]; };
  const x = rank(a), y = rank(b), m = (a.length - 1) / 2;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < a.length; i++) { c += (x[i] - m) * (y[i] - m); vx += (x[i] - m) ** 2; vy += (y[i] - m) ** 2; }
  return c / Math.sqrt(vx * vy);
}

describe("draft outcomes nobody can see", () => {
  it("draws every prospect's NFL outcome in a new game, loosely tied to the tape", () => {
    const state = newGame("NYG", "Test", { capRules: "real" }, 5);
    expect(state.draftModelFrom).toBe(2027);
    const dc = draftClass(state.seed, 2027);
    const top = dc.prospects.map((p) => p.id).sort((a, b) => dc.hidden[b].value - dc.hidden[a].value).slice(0, 257);
    for (const id of top) expect(dc.hidden[id].nfl).toBeDefined();
    const later = (t: { overall: number; potential: number }) => t.overall + 0.7 * (t.potential - t.overall);
    const corr = rankCorr(top.map((id) => dc.hidden[id].value), top.map((id) => later(dc.hidden[id].nfl!)));
    expect(corr).toBeGreaterThan(0.6);
    expect(corr).toBeLessThan(0.85);
    // The class's talent doesn't change on average, only who has it.
    const mean = (f: (id: string) => number) => top.reduce((s, id) => s + f(id), 0) / top.length;
    expect(Math.abs(mean((id) => later(dc.hidden[id].nfl!)) - mean((id) => later(dc.hidden[id])))).toBeLessThan(1);
    // Some first-round grades bust and some late-round ones become very good players.
    const busts = top.slice(0, 32).filter((id) => later(dc.hidden[id].nfl!) < later(dc.hidden[id]) - 6).length;
    const gems = top.slice(150).filter((id) => later(dc.hidden[id].nfl!) > later(dc.hidden[id]) + 8).length;
    expect(busts).toBeGreaterThan(0);
    expect(gems).toBeGreaterThan(0);
    // Combine speed is what it was: the carry-over is about the game, not the stopwatch.
    const speedMoved = top.filter((id) => dc.hidden[id].nfl!.traits.speed !== undefined && Math.abs(dc.hidden[id].nfl!.traits.speed - dc.hidden[id].traits.speed) > 1).length;
    expect(speedMoved).toBeLessThan(top.length * 0.1);
  });

  it("leaves classes an older save already scouted or drafted as they were", () => {
    const old = { seed: 77, season: 2027 } as GameState;
    bindDraftModel(old);
    expect(old.draftModelFrom).toBe(2029);
    expect(modelApplies(77, 2028)).toBe(false);
    expect(modelApplies(77, 2029)).toBe(true);
    const dc = draftClass(77, 2028);
    expect(dc.prospects.every((p) => !dc.hidden[p.id].nfl)).toBe(true);
    expect(draftClass(77, 2029).prospects.some((p) => draftClass(77, 2029).hidden[p.id].nfl)).toBe(true);
  });
});
