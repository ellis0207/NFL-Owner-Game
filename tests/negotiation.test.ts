import { describe, expect, it } from "vitest";
import { agentFor, morale, trustOf } from "../src/engine/agents";
import { teamPlayerIds } from "../src/engine/cap";
import { dealOf, leagueYear } from "../src/engine/contracts";
import { cashPaid } from "../src/engine/finance";
import { PLAYER_BY_ID } from "../src/engine/league";
import { invalidateMarket, marketPrice } from "../src/engine/market";
import { checkOffer, delegate, extensionEligibility, openTalks, sendOffer, startYearFor } from "../src/engine/negotiation";
import { depthChart, isHoldingOut } from "../src/engine/roster";
import { advanceDay, newGame } from "../src/engine/season";
import { compress, decompress } from "../src/save/codec";
import type { GameState, OfferTerms } from "../src/engine/types";

const TEAM = "DET";

function fresh(seed = 7): GameState {
  return newGame(TEAM, "Owner", { capRules: "real" }, seed);
}

/** A starter-level player on the team who can be extended now. */
function candidate(state: GameState): string {
  const id = teamPlayerIds(state, TEAM)
    .filter((id) => extensionEligibility(state, id).ok && !state.players[id].holdout)
    .map((id) => ({ id, apy: marketPrice(state, id, startYearFor(state, id, "extension")).apy }))
    .filter((x) => x.apy >= 4_000_000 && x.apy <= 25_000_000)
    .sort((a, b) => b.apy - a.apy)[0]?.id;
  if (!id) throw new Error("no extension candidate");
  return id;
}

function untilReply(state: GameState, id: string): void {
  for (let i = 0; i < 10 && state.negotiations[id].pending; i++) advanceDay(state);
}

describe("contract talks", () => {
  it("opens with the agent asking at or above the hidden walk-away price", () => {
    const state = fresh();
    const id = candidate(state);
    const neg = openTalks(state, TEAM, id, "extension", "owner");
    expect(neg.ask).toBeGreaterThan(neg.floor);
    expect(neg.rounds).toHaveLength(1);
    const opening = neg.rounds[0].terms;
    expect(opening.total / opening.years).toBeCloseTo(neg.ask, -5);
    expect(opening.guaranteed).toBeGreaterThanOrEqual(opening.signingBonus);
  });

  it("signs when we meet the agent's terms, pays the bonus now and records grades", () => {
    const state = fresh();
    const id = candidate(state);
    const neg = openTalks(state, TEAM, id, "extension", "owner");
    const cashBefore = cashPaid(state, TEAM);
    const before = dealOf(state, id)!;
    const check = sendOffer(state, id, { ...neg.rounds[0].terms });
    expect(check.ok).toBe(true);
    untilReply(state, id);
    expect(state.negotiations[id].status).toBe("agreed");
    const deal = dealOf(state, id)!;
    expect(deal).not.toBe(before);
    expect(deal.kind).toBe("extension");
    expect(state.signings[0].player).toBe(id);
    expect(state.signings[0].grades).toHaveLength(3);
    expect(cashPaid(state, TEAM) - cashBefore).toBeGreaterThanOrEqual(neg.rounds[0].terms.signingBonus);
  });

  it("a lowball hurts morale and the agent's trust, and doesn't sign", () => {
    const state = fresh();
    const id = candidate(state);
    const neg = openTalks(state, TEAM, id, "extension", "owner");
    const agent = agentFor(id).id;
    const m0 = morale(state, id);
    const t0 = trustOf(state, agent, TEAM);
    const years = neg.askYears;
    const total = Math.round(neg.floor * 0.5 * years);
    expect(sendOffer(state, id, { years, total, signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0, voidYears: 0, shape: "flat" }).ok).toBe(true);
    untilReply(state, id);
    expect(state.negotiations[id].status).not.toBe("agreed");
    expect(morale(state, id)).toBeLessThan(m0);
    expect(trustOf(state, agent, TEAM)).toBeLessThan(t0);
  });

  it("rejects offers that break the rules", () => {
    const state = fresh();
    const id = candidate(state);
    const neg = openTalks(state, TEAM, id, "extension", "owner");
    const base: OfferTerms = { years: 3, total: 30_000_000, signingBonus: 10_000_000, guaranteed: 5_000_000, injuryGuaranteed: 0, voidYears: 0, shape: "flat" };
    expect(checkOffer(state, neg, base).ok).toBe(false); // bonus is always guaranteed
    expect(checkOffer(state, neg, { ...base, guaranteed: 10_000_000, voidYears: 6 }).ok).toBe(false);
    expect(checkOffer(state, neg, { ...base, years: 9, guaranteed: 10_000_000 }).ok).toBe(false);
    // The bonus prorates onto this year's cap too: more than the space we have.
    expect(checkOffer(state, neg, { ...base, years: 1, total: 900_000_000, signingBonus: 800_000_000, guaranteed: 800_000_000 }).ok).toBe(false);
  });

  it("won't extend a player with years left on the deal", () => {
    const state = fresh();
    const year = leagueYear(state.date);
    const locked = teamPlayerIds(state, TEAM).find((id) => {
      const d = dealOf(state, id);
      return d && d.years.filter((y) => y.year > year + 1 && !y.void).length >= 2 && d.kind !== "rookie";
    })!;
    expect(locked).toBeTruthy();
    expect(extensionEligibility(state, locked).ok).toBe(false);
  });

  it("a GM with a mandate to sign works the deal without the owner", () => {
    const state = fresh();
    const id = candidate(state);
    openTalks(state, TEAM, id, "extension", "owner");
    delegate(state, id, { goal: "sign" });
    for (let i = 0; i < 40 && state.negotiations[id].status === "open"; i++) advanceDay(state);
    const neg = state.negotiations[id];
    expect(neg.handler).toBe("gm");
    expect(neg.rounds.filter((r) => r.from === "team").length).toBeGreaterThan(0);
    expect(neg.notes.length).toBeGreaterThan(0);
    expect(neg.status).not.toBe("open");
  });

  it("is deterministic for a seed", () => {
    const run = () => {
      const state = fresh(11);
      const id = candidate(state);
      const neg = openTalks(state, TEAM, id, "extension", "owner");
      sendOffer(state, id, { ...neg.rounds[0].terms, total: Math.round(neg.rounds[0].terms.total * 0.9) });
      untilReply(state, id);
      return JSON.stringify(state.negotiations[id]);
    };
    expect(run()).toBe(run());
  });

  it("survives a save and load mid-negotiation", async () => {
    const state = fresh();
    const id = candidate(state);
    const neg = openTalks(state, TEAM, id, "extension", "owner");
    sendOffer(state, id, { ...neg.rounds[0].terms, total: Math.round(neg.rounds[0].terms.total * 0.92) });
    const loaded = await decompress(await compress(state));
    expect(loaded.negotiations[id].pending).toEqual(state.negotiations[id].pending);
    expect(loaded.negotiations[id].floor).toBe(state.negotiations[id].floor);
  });
});

describe("the market", () => {
  it("a record deal at one position pulls up its neighbor", () => {
    const state = fresh();
    const te = Object.keys(state.players).find((id) => PLAYER_BY_ID[id].position === "TE" && marketPrice(state, id, 2027).apy > 8_000_000)!;
    const before = marketPrice(state, te, 2027).apy;
    // Hand five receivers record deals.
    const wrs = Object.keys(state.players).filter((id) => PLAYER_BY_ID[id].position === "WR" && dealOf(state, id)?.kind === "veteran")
      .sort((a, b) => dealOf(state, b)!.apy - dealOf(state, a)!.apy).slice(0, 5);
    for (const id of wrs) state.contracts[id] = { ...dealOf(state, id)!, apy: dealOf(state, id)!.apy * 1.4 };
    invalidateMarket(state);
    expect(marketPrice(state, te, 2027).apy).toBeGreaterThan(before);
  });
});

describe("holdouts", () => {
  it("players holding out miss practice and games", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = newGame(TEAM, "Owner", { capRules: "real" }, seed);
      const out = Object.keys(state.players).find((id) => state.players[id].holdout);
      if (!out) continue;
      const team = state.players[out].team!;
      expect(isHoldingOut(state, out, state.date)).toBe(true);
      expect(Object.values(depthChart(state, team)).flat()).not.toContain(out);
      return;
    }
    throw new Error("no holdouts in eight seeds");
  });
});
