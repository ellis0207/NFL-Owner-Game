import { describe, expect, it } from "vitest";
import { newGame } from "../src/engine/season";
import { holdTalentScale, SCALE_PULL } from "../src/engine/talent";
import { HIDDEN_RATINGS, PLAYER_BY_ID } from "../src/engine/league";

describe("each position stays on the league's scale", () => {
  it("pulls a drifted position back toward the starting spread without reordering it", () => {
    const state = newGame("NYG", "Test", { capRules: "real" }, 3);
    const level = (id: string) => HIDDEN_RATINGS[id].overall + (state.players[id].dev ?? 0);
    const wrs = Object.keys(state.players).filter((id) => PLAYER_BY_ID[id]?.position === "WR");
    const qbs = Object.keys(state.players).filter((id) => PLAYER_BY_ID[id]?.position === "QB");
    const top = (ids: string[], n: number) => ids.map(level).sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0) / n;
    const before = top(wrs, 160);
    const qbBefore = top(qbs, 64);
    // Receivers bunch up: everyone below the best gains, as if the league's depth had grown.
    for (const id of wrs) state.players[id].dev = (state.players[id].dev ?? 0) + Math.max(0, 90 - level(id)) * 0.3;
    const order = [...wrs].sort((a, b) => level(b) - level(a));
    const inflated = top(wrs, 160);
    holdTalentScale(state);
    const after = top(wrs, 160);
    expect(inflated - before).toBeGreaterThan(1);
    expect(after).toBeLessThan(inflated - (inflated - before) * SCALE_PULL * 0.6);
    expect(after).toBeGreaterThan(before - 0.5);
    // Nobody passes anybody: only the scale moved.
    const again = [...wrs].sort((a, b) => level(b) - level(a));
    expect(again.slice(0, 100)).toEqual(order.slice(0, 100));
    // A position already on its scale barely moves.
    expect(Math.abs(top(qbs, 64) - qbBefore)).toBeLessThan(0.3);
  });
});
