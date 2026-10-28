import { beforeAll, describe, expect, it } from "vitest";
import { capHit, capSummary, teamPlayerIds } from "../src/engine/cap";
import { dealOf } from "../src/engine/contracts";
import { market, signFreeAgent } from "../src/engine/freeagency";
import { RULES, TEAMS } from "../src/engine/league";
import { marketPrice } from "../src/engine/market";
import { talksFor } from "../src/engine/negotiation";
import { applyTag, canTag, faClass, isPendingFreeAgent, NEXT, pendingFreeAgents, tagCost } from "../src/engine/offseason";
import { advanceDay, isGameOver, isSeasonOver, newGame } from "../src/engine/season";
import { compress, decompress } from "../src/save/codec";
import type { GameState, OfferTerms } from "../src/engine/types";

const TEAM = "DET";
const K = RULES.keyDates;
let endOfSeason: string;

async function clone(): Promise<GameState> {
  return decompress(await compress(JSON.parse(endOfSeason)));
}

function until(state: GameState, date: string): void {
  while (state.date < date && !isGameOver(state)) advanceDay(state);
}

/** The best expiring unrestricted free agent on a team. */
function bestUfa(state: GameState, team: string): string {
  const id = pendingFreeAgents(state, team).filter((id) => faClass(id) === "UFA")
    .sort((a, b) => marketPrice(state, b, NEXT).apy - marketPrice(state, a, NEXT).apy)[0];
  if (!id) throw new Error(`no UFA on ${team}`);
  return id;
}

beforeAll(() => {
  const state = newGame(TEAM, "Owner", { capRules: "real" }, 3);
  while (!isSeasonOver(state)) advanceDay(state);
  endOfSeason = JSON.stringify(state);
}, 120_000);

describe("the offseason", () => {
  it("opens after the Super Bowl with expiring deals and a rollover", async () => {
    const state = await clone();
    advanceDay(state);
    expect(state.offseason).toBeTruthy();
    expect(pendingFreeAgents(state, TEAM).length).toBeGreaterThan(5);
    expect(state.league?.rollover?.[TEAM]?.[NEXT]).toBeGreaterThanOrEqual(0);
  });

  it("a franchise tag keeps the player for a year at the tag price", async () => {
    const state = await clone();
    until(state, K.franchiseTagWindowOpens);
    const id = bestUfa(state, TEAM);
    expect(canTag(state, TEAM, id).ok).toBe(true);
    const cost = tagCost(state, id, "franchise");
    applyTag(state, TEAM, id, "franchise");
    expect(isPendingFreeAgent(state, id)).toBe(false);
    expect(capHit(id, NEXT, state)).toBe(cost);
    expect(canTag(state, TEAM, bestUfa(state, TEAM)).ok).toBe(false); // one tag a year
    until(state, K.newLeagueYear);
    advanceDay(state);
    expect(state.players[id].team).toBe(TEAM);
  });

  it("expiring deals end at the new league year and the players become free agents", async () => {
    const state = await clone();
    until(state, K.franchiseTagDeadline);
    const leaving = pendingFreeAgents(state, TEAM).filter((id) => faClass(id) === "UFA");
    until(state, K.newLeagueYear);
    advanceDay(state);
    const gone = leaving.filter((id) => state.players[id].status === "fa");
    expect(gone.length).toBeGreaterThan(0);
    for (const id of gone) {
      expect(state.players[id].lastTeam).toBe(TEAM);
      expect(dealOf(state, id)).toBeFalsy();
      expect(teamPlayerIds(state, TEAM)).not.toContain(id);
    }
    expect(capSummary(state, TEAM).limit).toBeGreaterThan(RULES.salaryCap);
  });

  it("other teams' free agents are off limits until the negotiating window", async () => {
    const state = await clone();
    until(state, K.scoutingCombineStart);
    const other = TEAMS.find((t) => t.id !== TEAM && pendingFreeAgents(state, t.id).some((id) => faClass(id) === "UFA"))!.id;
    const id = bestUfa(state, other);
    expect(talksFor(state, TEAM, id).ok).toBe(false);
    until(state, K.negotiatingWindowOpens);
    advanceDay(state);
    const fa = market(state)[id];
    if (fa?.status === "open") expect(talksFor(state, TEAM, id).ok).toBe(true);
  });

  it("deals agreed in the window are signed when the league year opens", async () => {
    const state = await clone();
    until(state, K.negotiatingWindowOpens);
    advanceDay(state);
    const id = Object.values(market(state)).find((f) => f.status === "open" && f.from !== TEAM)!.player;
    const t: OfferTerms = { years: 2, total: 4_000_000, signingBonus: 1_000_000, guaranteed: 1_000_000, injuryGuaranteed: 0, voidYears: 0, shape: "flat" };
    signFreeAgent(state, id, TEAM, t);
    expect(market(state)[id].status).toBe("agreed");
    expect(state.players[id].team).not.toBe(TEAM);
    until(state, K.newLeagueYear);
    advanceDay(state);
    expect(state.players[id].team).toBe(TEAM);
    expect(market(state)[id].status).toBe("signed");
    expect(dealOf(state, id)!.years[0].year).toBe(NEXT);
  });

  it("free agency plays out the same way for a seed", async () => {
    const run = async () => {
      const state = await clone();
      until(state, "2027-03-14");
      return JSON.stringify(state.signings.slice(0, 40).map((s) => [s.player, s.team, s.apy]));
    };
    expect(await run()).toBe(await run());
  }, 60_000);

  it("stops at draft day", async () => {
    const state = await clone();
    until(state, K.draftStart);
    expect(isGameOver(state)).toBe(true);
    const date = state.date;
    advanceDay(state);
    expect(state.date).toBe(date);
    // Most top free agents have found teams by the draft (a few overpriced backup quarterbacks wait).
    const top = Object.values(market(state)).filter((f) => f.base >= 15_000_000);
    expect(top.filter((f) => f.status !== "open").length / Math.max(1, top.length)).toBeGreaterThan(0.7);
  }, 60_000);
});
