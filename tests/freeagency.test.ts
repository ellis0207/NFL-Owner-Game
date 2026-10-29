import { beforeAll, describe, expect, it } from "vitest";
import { deadMoney, releaseCost, teamPlayerIds } from "../src/engine/cap";
import { dealOf, leagueYear } from "../src/engine/contracts";
import { freeAgentPrice, market } from "../src/engine/freeagency";
import { PLAYER_BY_ID, PLAYERS, RULES, TEAMS } from "../src/engine/league";
import { openTalks, sendOffer, talksFor } from "../src/engine/negotiation";
import { practiceSquad, releasePlayer, rosterCount } from "../src/engine/roster";
import { advanceDay, newGame } from "../src/engine/season";
import { onWaivers, putInClaim, subjectToWaivers, waiverOrder } from "../src/engine/waivers";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const K = RULES.keyDates;
const TEAM = "DET";
const IN_SEASON = "2026-09-22";

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

beforeAll(() => {
  stateAt(TEAM, 5, "rosterCutdown");
  stateAt(TEAM, 5, IN_SEASON);
}, 120_000);

describe("the free agent pool", () => {
  it("starts with the real unsigned players of 2026", () => {
    const state = newGame(TEAM, "Owner", { capRules: "real" }, 1);
    const pool = PLAYERS.filter((p) => !p.team);
    expect(pool.length).toBeGreaterThan(300);
    for (const p of pool) expect(state.players[p.id]).toMatchObject({ team: null, status: "fa" });
    // Veterans who signed after Week 1 in real life were available in camp.
    expect(pool.some((p) => p.name === "Zach Ertz")).toBe(true);
    // Announced retirements are not.
    expect(pool.some((p) => p.name === "Lavonte David")).toBe(false);
  });

  it("cutdown cuts go through waivers, and practice squads form after the claims", async () => {
    const state = stateAt(TEAM, 5, "rosterCutdown");
    advanceDay(state);
    expect(state.date).toBe(K.cutdownWaiversExpire);
    const wire = Object.values(state.waivers ?? {});
    expect(wire.length).toBeGreaterThan(500);
    for (const w of wire.slice(0, 50)) expect(subjectToWaivers(state, w.player, K.rosterCutdown)).toBe(true);
    // Vested veterans skip waivers and are free agents right away.
    const vets = Object.entries(state.players).filter(([id, p]) => p.status === "fa" && p.lastTeam && !onWaivers(state, id) && PLAYER_BY_ID[id].yearsExp >= 4);
    expect(vets.length).toBeGreaterThan(50);
    for (const t of TEAMS) expect(rosterCount(state, t.id).roster).toBe(53);
    advanceDay(state);
    expect(Object.keys(state.waivers ?? {}).length).toBeLessThan(40);
    const claims = (state.transactions ?? []).filter((t) => t.kind === "claimed" && t.date === K.cutdownWaiversExpire);
    expect(claims.length).toBeGreaterThan(5);
    expect(claims.length).toBeLessThan(80);
    for (const t of TEAMS) {
      expect(rosterCount(state, t.id).roster).toBe(53);
      expect(practiceSquad(state, t.id).length).toBeGreaterThanOrEqual(12);
      expect(practiceSquad(state, t.id).length).toBeLessThanOrEqual(RULES.rosterLimits.practiceSquad);
      const vets = practiceSquad(state, t.id).filter((id) => PLAYER_BY_ID[id].yearsExp >= 3).length;
      expect(vets).toBeLessThanOrEqual(6);
    }
    // A claimed player's contract moves with him.
    const c = claims[0];
    expect(state.players[c.player].team).toBe(c.team);
    expect(dealOf(state, c.player)?.team).toBe(c.team);
  }, 60_000);

  it("waiver priority follows the 2026 draft order, then the standings", async () => {
    const state = stateAt(TEAM, 5, IN_SEASON);
    expect(waiverOrder(state, "2026-09-10")).toEqual(RULES.waiverOrder);
    const order = waiverOrder(state, "2026-10-05");
    expect(new Set(order).size).toBe(32);
  });

  it("vested veterans skip waivers until the trade deadline", async () => {
    const state = stateAt(TEAM, 5, IN_SEASON);
    const vet = teamPlayerIds(state, "KC").find((id) => state.players[id].status === "active" && PLAYER_BY_ID[id].yearsExp >= 6)!;
    const young = teamPlayerIds(state, "KC").find((id) => state.players[id].status === "active" && PLAYER_BY_ID[id].yearsExp <= 1)!;
    expect(releasePlayer(state, vet)).toBe("fa");
    expect(releasePlayer(state, young)).toBe("waivers");
    expect(onWaivers(state, young)?.clears).toBe("2026-09-23");
    expect(subjectToWaivers(state, vet, K.veteranWaiversBegin)).toBe(true);
  });

  it("vested veterans on the Week 1 roster are owed the season's salary", async () => {
    const state = stateAt(TEAM, 5, IN_SEASON);
    const vet = TEAMS.flatMap((t) => teamPlayerIds(state, t.id)).find((id) => {
      const y = dealOf(state, id)?.years.find((x) => x.year === 2026);
      return state.players[id].status === "active" && PLAYER_BY_ID[id].yearsExp >= 5 && y && y.base > 2_000_000 && y.guaranteed === 0 && !y.weeks;
    })!;
    expect(state.termPay?.[vet]).toBe(2026);
    // Veterans signed after Week 1 aren't covered.
    const late = Object.keys(state.players).find((id) => dealOf(state, id)?.years[0]?.weeks && state.players[id].status === "active");
    if (late) expect(state.termPay?.[late]).toBeUndefined();
    const base = dealOf(state, vet)!.years.find((x) => x.year === 2026)!.base;
    const cost = releaseCost(vet, state);
    // Two of eighteen game checks are paid; the other sixteen are still owed.
    expect(cost.cashOwed).toBeGreaterThanOrEqual(Math.round((base * 15) / 18));
  });

  it("the owner can sign a free agent during the season, for the weeks that are left", async () => {
    const state = stateAt(TEAM, 5, IN_SEASON);
    const team = TEAM;
    const cut = teamPlayerIds(state, team).find((id) => state.players[id].status === "active" && PLAYER_BY_ID[id].yearsExp <= 1)!;
    const id = Object.values(market(state)).filter((f) => f.status === "open" && state.players[f.player].status === "fa" && !onWaivers(state, f.player))
      .sort((a, b) => a.floor - b.floor)[0].player;
    expect(talksFor(state, team, id).ok).toBe(true);
    const neg = openTalks(state, team, id, "free-agent", "owner");
    const price = Math.max(neg.ask, freeAgentPrice(state, id)) * 1.1;
    const terms = { years: 1, total: Math.round(price), signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0, voidYears: 0, shape: "flat" as const };
    // The 53 is full: no room until someone goes.
    expect(sendOffer(state, id, terms).ok).toBe(false);
    releasePlayer(state, cut);
    expect(sendOffer(state, id, terms).ok).toBe(true);
    for (let i = 0; i < 6 && state.players[id].team !== team; i++) advanceDay(state);
    expect(state.players[id].team).toBe(team);
    expect(state.players[id].status).toBe("active");
    const y = dealOf(state, id)!.years[0];
    expect(y.year).toBe(leagueYear(state.date));
    expect(y.weeks).toBeLessThan(18);
  }, 30_000);

  it("the owner's waiver claims are awarded by priority", async () => {
    const state = stateAt(TEAM, 5, IN_SEASON);
    const victim = teamPlayerIds(state, "NYJ").find((id) => state.players[id].status === "active" && PLAYER_BY_ID[id].yearsExp <= 2)!;
    const deadBefore = deadMoney(state, "NYJ");
    const cost = releaseCost(victim, state);
    releasePlayer(state, victim);
    putInClaim(state, TEAM, victim);
    advanceDay(state);
    advanceDay(state);
    const team = state.players[victim].team;
    const order = waiverOrder(state);
    if (team !== TEAM) expect(team === null ? false : order.indexOf(team) < order.indexOf(TEAM)).toBe(true);
    // The team that cut him is relieved of the salary it no longer owes.
    if (team) expect(deadMoney(state, "NYJ")).toBeLessThanOrEqual(deadBefore + cost.deadThisYear - cost.salaryThisYear + 1);
    else expect(deadMoney(state, "NYJ")).toBe(deadBefore + cost.deadThisYear);
  }, 30_000);
});
