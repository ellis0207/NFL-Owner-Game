import { describe, expect, it } from "vitest";
import { capSummary, deadMoney, teamPlayerIds } from "../src/engine/cap";
import { dealOf, leagueYear, tradeCharges, tradedDeal } from "../src/engine/contracts";
import { PLAYER_BY_ID, RULES, TEAMS } from "../src/engine/league";
import { releasePlayer, rosterCount, rosterLimit, weakestOnRoster } from "../src/engine/roster";
import { advanceDay, newGame } from "../src/engine/season";
import {
  askPrice, canTradePlayer, checkTrade, completeTrade, counterProblem, cpuAnswer, trades, lockMatchedSheet, pickId, pickOwner, picksOf, playerValue, proposeTrade, swapDeal, tradeBalance, tradeWindow,
} from "../src/engine/trades";
import type { GameState, TradeAsset, TradeDeal } from "../src/engine/types";
import { stateAt } from "./fixtures";

const K = RULES.keyDates;
const US = "DET";

function fresh(seed = 5): GameState {
  return newGame(US, "Owner", { capRules: "real" }, seed);
}

/** A player of ours with bonus proration left in later years. */
function proratedPlayer(state: GameState): string {
  const year = leagueYear(state.date);
  return teamPlayerIds(state, US).find((id) => {
    const d = dealOf(state, id);
    return d && d.years.some((y) => y.year > year && y.proration > 1_000_000) && canTradePlayer(state, id).ok;
  })!;
}

describe("the trade window", () => {
  it("is open in camp, shut from the deadline to the Super Bowl, and agreements-only until the league year", () => {
    const state = fresh();
    expect(tradeWindow(state)).toMatchObject({ open: true, official: true });
    expect(tradeWindow({ ...state, date: K.tradeDeadline }).open).toBe(true);
    expect(tradeWindow({ ...state, date: "2026-11-11" }).open).toBe(false);
    expect(tradeWindow({ ...state, date: "2027-01-20" }).open).toBe(false);
    expect(tradeWindow({ ...state, date: "2027-02-20" })).toMatchObject({ open: true, official: false });
    expect(tradeWindow({ ...state, date: K.newLeagueYear })).toMatchObject({ open: true, official: true });
  });

  it("starts with the 2027 first-rounders traded in real life", () => {
    const state = fresh();
    expect(pickOwner(state, pickId(2027, 1, "GB"))).toBe("DAL");
    expect(pickOwner(state, pickId(2027, 1, "IND"))).toBe("NYJ");
    expect(pickOwner(state, pickId(2027, 1, "DAL"))).toBe("NYJ");
    expect(picksOf(state, "NYJ").filter((p) => p.startsWith("2027-1-"))).toHaveLength(3);
    expect(picksOf(state, US)).toHaveLength(21);
  });
});

describe("the money in a trade", () => {
  it("leaves the bonus proration with the old team and sends the salary and guarantees", () => {
    const state = fresh();
    const id = proratedPlayer(state);
    const deal = dealOf(state, id)!;
    const year = leagueYear(state.date);
    // Camp is after June 1: this year's proration stays, later years' move to next year.
    const c = tradeCharges(deal, state.date);
    const later = deal.years.filter((y) => y.year > year).reduce((s, y) => s + y.proration, 0);
    expect(c.nextYear).toBe(Math.round(later));
    expect(c.thisYear).toBeGreaterThanOrEqual(Math.round(deal.years.find((y) => y.year === year)?.proration ?? 0));
    const moved = tradedDeal(deal, "KC", state.date);
    expect(moved.years.every((y) => y.proration === 0 && !y.void)).toBe(true);
    expect(moved.years.map((y) => [y.base, y.guaranteed])).toEqual(deal.years.filter((y) => y.year >= year && !y.void).map((y) => [y.base, y.guaranteed]));
    // Before June 1 everything accelerates onto this year.
    const march = tradeCharges(deal, "2027-03-20");
    expect(march.nextYear).toBe(0);

    const before = { dead: deadMoney(state, US, year), deadNext: deadMoney(state, US, year + 1) };
    const rich = TEAMS.map((t) => t.id).filter((t) => t !== US).sort((a, b) => capSummary(state, b).space - capSummary(state, a).space)[0];
    const pick = picksOf(state, rich).find((p) => p.startsWith("2028-7"))!;
    const trade: TradeDeal = { teams: [US, rich], send: [[{ kind: "player", id }], [{ kind: "pick", pick }]] };
    expect(checkTrade(state, trade).problems).toEqual([]);
    {
      completeTrade(state, trade);
      expect(state.players[id].team).toBe(rich);
      expect(dealOf(state, id)!.team).toBe(rich);
      expect(pickOwner(state, pick)).toBe(US);
      expect(deadMoney(state, US, year) - before.dead).toBe(c.thisYear);
      expect(deadMoney(state, US, year + 1) - before.deadNext).toBe(c.nextYear);
      expect(state.news[0].text).toMatch(/acquire/);
    }
  });

  it("won't process a trade that leaves a team over the cap", () => {
    const state = fresh();
    const year = leagueYear(state.date);
    const big = teamPlayerIds(state, US).filter((id) => canTradePlayer(state, id).ok)
      .sort((a, b) => (tradedDeal(dealOf(state, b)!, "X", state.date).years[0]?.base ?? 0) - (tradedDeal(dealOf(state, a)!, "X", state.date).years[0]?.base ?? 0))[0];
    const hit = tradedDeal(dealOf(state, big)!, "X", state.date).years.find((y) => y.year === year)!.base;
    const poor = TEAMS.map((t) => t.id).filter((t) => t !== US && capSummary(state, t).space < hit - 2_000_000)[0];
    expect(poor).toBeTruthy();
    const pick = picksOf(state, poor).find((p) => p.startsWith("2029-7"))!;
    const check = checkTrade(state, { teams: [US, poor], send: [[{ kind: "player", id: big }], [{ kind: "pick", pick }]] });
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/over the \d{4} cap/);
  });
});

describe("who can be traded", () => {
  it("not practice squad players, unsigned tags, or a matched offer sheet to the team that made it", () => {
    const state = fresh();
    while (state.date <= K.practiceSquadSigningOpens) advanceDay(state);
    const ps = teamPlayerIds(state, US).find((id) => state.players[id].status === "ps")!;
    expect(canTradePlayer(state, ps).ok).toBe(false);
    const id = teamPlayerIds(state, US).find((x) => state.players[x].status === "active")!;
    lockMatchedSheet(state, id, "GB");
    expect(canTradePlayer(state, id, "GB").ok).toBe(false);
    expect(canTradePlayer(state, id, "CHI").ok).toBe(true);
    const tagged = { ...dealOf(state, id)!, kind: "franchise" as const, signed: "2027-03-01" };
    state.contracts[id] = tagged;
    expect(canTradePlayer(state, id).reason).toMatch(/tag/);
  });
});

describe("CPU front offices", () => {
  it("take an overpay, turn down a lowball, and name a price", () => {
    const state = fresh(8);
    const partner = "CHI";
    // Camp rosters run a little over 90: make room for the players coming in.
    while (rosterCount(state, US).roster >= rosterLimit(state) - 2) releasePlayer(state, weakestOnRoster(state, US, "WR")!);
    // A backup of theirs for our first-round pick: easy yes.
    const backup = teamPlayerIds(state, partner).filter((id) => canTradePlayer(state, id, US).ok)
      .map((id) => ({ id, v: playerValue(state, "gm", partner, id) }))
      .filter((x) => x.v.role < 1 && x.v.points > 0 && x.v.points < 40)[0];
    const first = picksOf(state, US).find((p) => p.startsWith("2027-1"))!;
    const yes = proposeTrade(state, { teams: [US, partner], send: [[{ kind: "pick", pick: first }], [{ kind: "player", id: backup.id }]] });
    expect(yes.verdict).toBe("accept");
    expect(state.players[backup.id].team).toBe(US);

    // Their best player for a seventh: no.
    const star = teamPlayerIds(state, partner).filter((id) => canTradePlayer(state, id, US).ok)
      .sort((a, b) => playerValue(state, "gm", partner, b).points - playerValue(state, "gm", partner, a).points)[0];
    const seventh = picksOf(state, US).find((p) => p.startsWith("2028-7"))!;
    const no = proposeTrade(state, { teams: [US, partner], send: [[{ kind: "pick", pick: seventh }], [{ kind: "player", id: star }]] });
    expect(no.verdict).not.toBe("accept");
    expect(state.players[star].team).toBe(partner);

    // What it would take for a solid starter: their counter is a deal they'll sign.
    const mid = teamPlayerIds(state, partner).filter((id) => canTradePlayer(state, id, US).ok)
      .map((id) => ({ id, v: playerValue(state, "gm", partner, id).points })).filter((x) => x.v > 30 && x.v < 150)[0];
    const price = askPrice(state, partner, [{ kind: "player", id: mid.id }]);
    expect(price.verdict).toBe("counter");
    expect(proposeTrade(state, price.counter!).verdict).toBe("accept");
    expect(PLAYER_BY_ID[mid.id] && state.players[mid.id].team).toBe(US);
  });
});

describe("counter-offers", () => {
  const key = (a: TradeAsset) => (a.kind === "player" ? a.id : a.pick);
  const tradeable = (state: GameState, team: string) => teamPlayerIds(state, team)
    .filter((id) => canTradePlayer(state, id, team === US ? undefined : US).ok && playerValue(state, "gm", team, id).points > 8);

  it("CPU teams counter a fair share of our offers, always keeping a piece of the original", () => {
    const state = stateAt(US, 5, "tradeDeadline");
    const ours = tradeable(state, US);
    const tally = { accept: 0, counter: 0, reject: 0 };
    let n = 0;
    for (const t of TEAMS.filter((x) => x.id !== US)) {
      for (const id of tradeable(state, t.id).slice(0, 6)) {
        const deal: TradeDeal = { teams: [US, t.id], send: [[{ kind: "player", id: ours[n++ % ours.length] }], [{ kind: "player", id }]] };
        if (!checkTrade(state, deal).ok) continue;
        const a = cpuAnswer(state, deal, 1);
        tally[a.verdict]++;
        if (a.counter) {
          const orig = new Set([...deal.send[0], ...deal.send[1]].map(key));
          expect([...a.counter.send[0], ...a.counter.send[1]].some((x) => orig.has(key(x)))).toBe(true);
          expect(checkTrade(state, a.counter).ok).toBe(true);
        }
      }
    }
    const all = tally.accept + tally.counter + tally.reject;
    expect(tally.counter / all).toBeGreaterThan(0.15);
    expect(tally.counter / all).toBeLessThan(0.7);
  });

  it("we can counter an offer a team made us, keeping one of its pieces", () => {
    const state = stateAt(US, 5, "tradeDeadline");
    const partner = "GB";
    const theirs = tradeable(state, partner);
    const ours = tradeable(state, US);
    const offer = {
      id: "test-offer", date: state.date, expires: state.date, note: "", status: "open" as const,
      teams: [partner, US] as [string, string],
      send: [[{ kind: "player" as const, id: theirs[0] }], [{ kind: "player" as const, id: ours[0] }]] as [TradeAsset[], TradeAsset[]],
    };
    trades(state).offers.unshift(offer);
    // A deal with none of their pieces isn't a counter.
    const other: TradeDeal = { teams: [US, partner], send: [[{ kind: "player", id: ours[1] }], [{ kind: "player", id: theirs[1] }]] };
    expect(counterProblem(state, offer.id, other)).toMatch(/at least one piece/);
    expect(proposeTrade(state, other, offer.id).verdict).toBe("reject");
    // Asking for their player for nothing back but a seventh: a lowball that ends the call.
    const seventh = picksOf(state, US).find((p) => p.startsWith("2028-7"))!;
    const low: TradeDeal = { teams: [US, partner], send: [[{ kind: "pick", pick: seventh }], [...offer.send[0]]] };
    expect(counterProblem(state, offer.id, low)).toBeNull();
    const r = proposeTrade(state, low, offer.id);
    if (r.verdict === "accept") expect(offer.status).toBe("accepted");
    else if (r.verdict === "reject") expect(["open", "withdrawn"]).toContain(offer.status);
    // Their own terms, sent back as a counter, close the deal and the offer.
    if (offer.status === "open") {
      const same: TradeDeal = { teams: [US, partner], send: [offer.send[1], offer.send[0]] };
      const yes = proposeTrade(state, same, offer.id);
      if (yes.verdict === "accept") {
        expect(offer.status).toBe("accepted");
        expect(state.players[theirs[0]].team).toBe(US);
      }
    }
  });
});

describe("player swaps", () => {
  it("CPU teams offer one of their players for one of ours, and both sides gain by their own read", () => {
    const state = stateAt(US, 5, "tradeDeadline");
    let found = 0;
    for (const t of TEAMS.map((x) => x.id).filter((x) => x !== US)) {
      const deal = swapDeal(state, t, US, () => 0.5);
      if (!deal) continue;
      found++;
      expect(deal.send[0].some((a) => a.kind === "player")).toBe(true);
      expect(deal.send[1].some((a) => a.kind === "player")).toBe(true);
      expect(checkTrade(state, deal).ok).toBe(true);
      expect(tradeBalance(state, "gm", deal, 0).gain).toBeGreaterThan(0);
    }
    // Fewer since swaps pair players of the same standing who each start for their new club.
    expect(found).toBeGreaterThanOrEqual(2);
  });
});
