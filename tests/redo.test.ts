import { beforeAll, describe, expect, it } from "vitest";
import { dealOf, dealYearsLeft, leagueYear } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { PLAYER_BY_ID, RULES } from "../src/engine/league";
import { extensionEligibility } from "../src/engine/negotiation";
import { openAsk, promiseTalks, redoEligible } from "../src/engine/redo";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";

function at(when?: string): GameState {
  return stateAt(TEAM, 3, when);
}

beforeAll(() => {
  at("draftStart");
}, 600_000);

describe("redo demands", () => {
  it("underpaid starters with years left ask in the spring, within the CBA's rules", () => {
    const state = at("draftStart");
    const asks = Object.entries(state.players).filter(([, p]) => p.redo);
    console.log(`redo asks: ${asks.length}: ${asks.map(([id, p]) => `${PLAYER_BY_ID[id].name} (${p.team}, ${p.redo!.stance}${p.redo!.settled ? ", signed" : ""})`).join("; ")}`);
    expect(asks.length).toBeGreaterThanOrEqual(5);
    expect(asks.length).toBeLessThanOrEqual(25);
    for (const [id, p] of asks) {
      expect(p.redo!.year).toBe(leagueYear(state.date));
      // Drafted players only after their third season.
      if (dealOf(state, id)?.kind === "rookie") expect(PLAYER_BY_ID[id].yearsExp).toBeGreaterThanOrEqual(3);
    }
    // CPU front offices settle most of them.
    const cpu = asks.filter(([, p]) => p.team !== TEAM);
    expect(cpu.filter(([, p]) => p.redo!.settled || p.redo!.answer !== "refused").length).toBeGreaterThan(cpu.length / 2);
  });

  it("an open ask lets a team extend a deal with years left, and a promise calms the camp", () => {
    const state = at("draftStart");
    const id = Object.keys(state.players).find((x) => openAsk(state, x) && dealYearsLeft(dealOf(state, x), leagueYear(state.date)) > 2);
    if (!id) return;
    expect(extensionEligibility(state, id).ok).toBe(true);
    state.players[id].team = state.userTeam;
    promiseTalks(state, id);
    expect(openAsk(state, id)!.stance).toBe("patient");
    expect(redoEligible(state, id)).toBe(true);
  });
});
