import { beforeAll, describe, expect, it } from "vitest";
import { addDeadMoney, capSummary } from "../src/engine/cap";
import { addDays } from "../src/engine/dates";
import { RULES, TEAMS } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";
const K = RULES.keyDates;

function at(when?: string): GameState {
  return stateAt(TEAM, 3, when);
}

beforeAll(() => {
  at("superBowl");
}, 600_000);

describe("the league-year cap deadline", () => {
  it("every team, ours included, is under the cap once the league year opens", () => {
    const state = at("superBowl");
    const next = RULES.season + 1;
    while (state.date < addDays(K.newLeagueYear, -8)) advanceDay(state);
    // Push us well over next year's cap with dead money the GM has to work around.
    addDeadMoney(state, TEAM, next, Math.max(0, capSummary(state, TEAM, next).space) + 25_000_000);
    expect(capSummary(state, TEAM, next).space).toBeLessThan(0);
    while (state.date <= addDays(K.newLeagueYear, 1)) advanceDay(state);
    expect(state.inbox.some((m) => m.title === "We're over next year's cap")).toBe(true);
    expect(state.inbox.some((m) => m.title === "Getting under the cap")).toBe(true);
    for (const t of TEAMS) expect(capSummary(state, t.id).space, t.id).toBeGreaterThanOrEqual(0);
  });

});
