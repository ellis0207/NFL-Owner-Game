import { beforeAll, describe, expect, it } from "vitest";
import { capHit, capSummary, teamPlayerIds } from "../src/engine/cap";
import { dealOf } from "../src/engine/contracts";
import { market, signFreeAgent } from "../src/engine/freeagency";
import { RULES, SCHEDULE, TEAMS } from "../src/engine/league";
import { addDays } from "../src/engine/dates";
import { marketPrice } from "../src/engine/market";
import { talksFor } from "../src/engine/negotiation";
import { applyTag, canTag, faClass, isPendingFreeAgent, NEXT, pendingFreeAgents, tagCost } from "../src/engine/offseason";
import { advanceDay, advanceToNextEvent, draftWaiting, isGameOver, isSeasonOver, newGame } from "../src/engine/season";
import { advanceToOurPick, currentSlot, makePick, staffRecommendations } from "../src/engine/draft";
import { rosterCount } from "../src/engine/roster";
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

  it("reaches draft day with the order, comp picks and mocks set", async () => {
    const state = await clone();
    until(state, K.draftStart);
    expect(isGameOver(state)).toBe(false);
    const d = state.draft!;
    expect(d.order!.length).toBe(256);
    expect(d.comp!.length).toBe(32);
    expect(d.mocks.length).toBeGreaterThanOrEqual(10);
    expect(d.mocks[0].rounds).toBe(4);
    expect(d.mocks[d.mocks.length - 1].rounds).toBe(1);
    // Comp picks come at the end of their round.
    const r3 = d.order!.filter((id) => id.startsWith("2027-3-"));
    expect(r3.slice(-4).every((id) => id.includes("-c"))).toBe(true);
    // The clock waits on draft day: advancing skips nothing until the owner moves the draft.
    expect(draftWaiting(state)).toBe(true);
    advanceToNextEvent(state);
    expect(state.date).toBe(K.draftStart);
    // Most top free agents have found teams by the draft (a few overpriced backup quarterbacks wait).
    const top = Object.values(market(state)).filter((f) => f.base >= 15_000_000);
    expect(top.filter((f) => f.status !== "open").length / Math.max(1, top.length)).toBeGreaterThan(0.7);
  }, 60_000);

  it("runs the draft at the owner's pace, then moves on to the next season", async () => {
    const state = await clone();
    const draftStart = K.draftStart;
    until(state, draftStart);
    const d = state.draft!;
    // Our staff weighs in when we're on the clock, and the owner can pick.
    advanceToOurPick(state);
    const slot = currentSlot(state)!;
    expect(slot.team).toBe(TEAM);
    const recs = staffRecommendations(state);
    expect(recs.map((r) => r.role)).toEqual(["GM", "HC", "OC", "DC"]);
    expect(makePick(state, recs[1].player, "owner")).toBeNull();
    const rookie = recs[1].player;
    expect(state.players[rookie].team).toBe(TEAM);
    expect(dealOf(state, rookie)!.kind).toBe("rookie");
    expect(dealOf(state, rookie)!.years.length).toBe(4);
    // Day 1 ends with grades; the GM takes over if the owner sims the rest of the day.
    advanceDay(state);
    expect(d.daysDone).toEqual([1]);
    expect(d.made.length).toBe(32);
    expect(d.made.every((m) => m.grade)).toBe(true);
    // A skipped pick of ours is the GM's.
    advanceDay(state);
    advanceDay(state);
    expect(d.made.length).toBe(256);
    expect(d.made.filter((m) => m.team === TEAM && m.overall > slot.overall).every((m) => m.by === "gm")).toBe(true);
    // The day after the draft the league moves on to the next season.
    expect(state.date).toBe(addDays(draftStart, 3));
    expect(state.season).toBe(2027);
    expect(RULES.season).toBe(2027);
    expect(isGameOver(state)).toBe(false);
    expect(state.history!.seasons[0].champion).toBeTruthy();
    expect(state.history!.drafts[0].picks.length).toBe(256);
    expect(SCHEDULE.filter((g) => g.type === "REG").length).toBe(272);
    // Undrafted free agents signed; nobody is over 90.
    expect(Object.keys(d.udfa ?? {}).length).toBeGreaterThan(100);
    for (const t of TEAMS) expect(rosterCount(state, t.id).roster).toBeLessThanOrEqual(90);
    // Draftees survive a save and load.
    const back = await decompress(await compress(state));
    expect(back.players[rookie].team).toBe(TEAM);
    expect(capHit(rookie, NEXT, back)).toBeGreaterThan(0);
    // The new season's clock runs.
    const date = state.date;
    advanceDay(state);
    expect(state.date).toBe(addDays(date, 1));
  }, 120_000);
});
