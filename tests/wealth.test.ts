import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { openMemos } from "../src/engine/delegation";
import { economy } from "../src/engine/economy";
import { forceSale } from "../src/engine/investors";
import { decideMemo } from "../src/engine/memos";
import { closeOwnerYear, fundCapitalCall, owner } from "../src/engine/ownership";
import { newGame } from "../src/engine/season";
import type { GameState } from "../src/engine/types";
import {
  borrow, borrowLimit, fundTrust, giveToFoundation, HOLDING_KEYS, invest, netWorth, opportunityCost, resolveWealthMemo, sellHolding, setFamilyOffice,
  setVisibility, syncHoldings, wealth, wealthDaily,
} from "../src/engine/wealth";
import { compress, decompress } from "../src/save/codec";

const M = 1_000_000;

function fresh(seed = 1): GameState {
  return newGame("DET", "x", { capRules: "real" }, seed);
}

function runTo(state: GameState, date: string): void {
  while (state.date < date) {
    state.date = addDays(state.date, 1);
    wealthDaily(state);
  }
}

const total = (s: GameState) => HOLDING_KEYS.reduce((t, k) => t + wealth(s).holdings[k], 0);

describe("the owner's wealth", () => {
  it("splits outside holdings by how the owner made their money", () => {
    const state = fresh();
    const w = wealth(state);
    expect(total(state)).toBeCloseTo(owner(state).outside, -2);
    // The default owner built a company: half of it is their own businesses.
    expect(w.holdings.business / owner(state).outside).toBeCloseTo(0.5, 2);
    expect(netWorth(state).concentration).toBeGreaterThan(0.3);
    expect(netWorth(state).concentration).toBeLessThan(0.7);
  });

  it("moves holdings month by month with the economy, and recessions hurt stocks and businesses", () => {
    const a = fresh(3);
    const b = fresh(3);
    wealth(a);
    wealth(b);
    economy(a);
    economy(b);
    b.economy!.now.recession = true;
    b.economy!.now.growth = -2;
    const startA = total(a);
    const startB = total(b);
    a.date = "2026-08-31";
    b.date = "2026-08-31";
    for (let i = 0; i < 6; i++) {
      runTo(a, addDays(a.date, 31));
      b.economy!.now.recession = true;
      b.economy!.now.growth = -2;
      runTo(b, addDays(b.date, 31));
    }
    expect(total(a)).not.toBe(startA);
    expect(total(b) / startB).toBeLessThan(total(a) / startA);
    expect(owner(a).outside).toBe(Math.round(total(a)));
  });

  it("sells stocks at once and property only after a wait", () => {
    const state = fresh();
    const liquid = owner(state).liquid;
    expect(sellHolding(state, "stocks", 100 * M)).toBeNull();
    expect(owner(state).liquid - liquid).toBe(99 * M);
    expect(sellHolding(state, "realEstate", 100 * M)).toBeNull();
    expect(wealth(state).pending.length).toBe(1);
    const due = wealth(state).pending[0].date;
    runTo(state, addDays(due, -1));
    expect(wealth(state).pending.length).toBe(1);
    runTo(state, due);
    expect(wealth(state).pending.length).toBe(0);
    expect(invest(state, "business", 10 * M)).toMatch(/businesses/);
  });

  it("charges interest on personal debt and limits borrowing", () => {
    const state = fresh();
    wealth(state);
    expect(borrow(state, borrowLimit(state) + 1)).toMatch(/Lenders/);
    expect(borrow(state, 200 * M)).toBeNull();
    owner(state).liquid = 0;
    state.date = "2026-08-31";
    runTo(state, "2026-09-01");
    expect(owner(state).personalDebt).toBeGreaterThan(200 * M);
  });

  it("forced sales for capital calls come out of stocks and bonds first", () => {
    const state = fresh();
    const w = wealth(state);
    const business0 = w.holdings.business;
    owner(state).liquid = 0;
    fundCapitalCall(state, 300 * M);
    syncHoldings(state);
    expect(w.holdings.business).toBe(business0);
    expect(total(state)).toBeCloseTo(owner(state).outside, -2);
  });

  it("keeps the family trust and the foundation out of the owner's reach, and gifts cut the owner's tax", () => {
    const a = fresh();
    const b = fresh();
    const worth = netWorth(a).total;
    expect(fundTrust(a, 500 * M)).toBeNull();
    expect(wealth(a).trust).toBe(500 * M);
    expect(netWorth(a).total).toBeCloseTo(worth - 500 * M, -3);
    expect(giveToFoundation(b, 50 * M)).toBeNull();
    const plain = closeOwnerYear(fresh(), 2026, 1_000 * M);
    const gave = closeOwnerYear(b, 2026, 1_000 * M);
    expect(gave.tax).toBeLessThan(plain.tax);
    // The foundation pays out 5% a year.
    b.date = "2026-12-30";
    runTo(b, "2026-12-31");
    expect(wealth(b).foundation.granted).toBeGreaterThan(0);
  });

  it("a family office costs a fee", () => {
    const state = fresh();
    setFamilyOffice(state, true);
    const liquid = owner(state).liquid;
    state.date = "2026-08-31";
    runTo(state, "2026-09-01");
    expect(wealth(state).log[0].text).toMatch(/family office/i);
    expect(owner(state).liquid).toBeLessThan(liquid * 1.01);
  });

  it("tracks the team against the stock market", () => {
    const state = fresh();
    const o = opportunityCost(state);
    expect(o.alt).toBeGreaterThan(0);
    state.date = "2026-08-31";
    runTo(state, "2026-12-02");
    expect(wealth(state).history.length).toBe(4);
    expect(opportunityCost(state).alt).not.toBe(o.alt);
  });

  it("handles a business conflict as a memo, and a betting stake brings a league fine", () => {
    const state = fresh();
    forceSale(state, 0.1);
    let memo;
    for (let d = 0; d < 1500 && !memo; d++) {
      state.date = addDays(state.date, 1);
      wealthDaily(state);
      memo = openMemos(state).find((m) => m.payload?.wealth);
    }
    expect(memo).toBeTruthy();
    expect(decideMemo(state, memo!.id, 0)).toBeNull();
    expect(wealth(state).conflicts[0].outcome).toMatch(/stayed out/);
    const fines = business(state).ledger.filter((e) => e.cat === "fines").length;
    resolveWealthMemo(state, { ...memo!, id: "x", title: "A sports-betting stake in your portfolio", payload: { wealth: "conflict", conflict: "betting", amount: 5 * M } }, 2);
    expect(business(state).ledger.filter((e) => e.cat === "fines").length).toBe(fines + 1);
  });

  it("public profile settings change only when the owner picks something other than the usual", () => {
    const state = fresh();
    setVisibility(state, "spotlight");
    expect(wealth(state).visibility).toBe("spotlight");
  });

  it("keeps the owner's wealth through a save", async () => {
    const state = fresh();
    fundTrust(state, 100 * M);
    const back = await decompress(await compress(state));
    expect(back.wealth!.trust).toBe(100 * M);
  });
});
