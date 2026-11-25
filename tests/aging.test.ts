import { describe, expect, it } from "vitest";
import { bodyVsCraft, tiltTraits, yearTilt } from "../src/engine/aging";
import { HIDDEN_RATINGS, PLAYERS } from "../src/engine/league";
import { ability, trait } from "../src/engine/staff";
import type { GameState } from "../src/engine/types";

const wr = PLAYERS.find((p) => p.position === "WR" && HIDDEN_RATINGS[p.id]?.traits.hands !== undefined)!;

function fake(): GameState {
  return { seed: 1, date: "2027-03-01", players: { [wr.id]: { team: null, status: "fa", dev: 0 } } } as unknown as GameState;
}

describe("skills age separately", () => {
  it("moves speed down and hands up without changing overall", () => {
    const state = fake();
    const before = { speed: trait(state, wr.id, "speed"), hands: trait(state, wr.id, "hands"), all: ability(state, wr.id) };
    tiltTraits(state, wr.id, yearTilt(34, 30, 0, 4));
    expect(trait(state, wr.id, "speed")).toBeLessThan(before.speed - 0.5);
    expect(trait(state, wr.id, "hands")).toBeGreaterThan(before.hands + 0.5);
    expect(ability(state, wr.id)).toBe(before.all);
    const offsets = Object.values(state.players[wr.id].tdev!);
    expect(Math.abs(offsets.reduce((s, v) => s + v, 0) / offsets.length)).toBeLessThan(0.02);
    expect(bodyVsCraft(state, wr.id)).toBeGreaterThan(0.8);
  });

  it("tilts harder with age and decline", () => {
    expect(yearTilt(24, 30, 2, 0)).toBeGreaterThan(yearTilt(26, 30, 0, 0));
    expect(yearTilt(34, 30, 0, 4)).toBeGreaterThan(yearTilt(30, 30, 0, 0.5) * 3);
  });
});
