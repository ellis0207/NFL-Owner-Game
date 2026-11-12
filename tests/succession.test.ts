import { describe, expect, it } from "vitest";
import { valuation } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { forceSale, investors, ownerShare } from "../src/engine/investors";
import { DEFAULT_SETUP, owner } from "../src/engine/ownership";
import { openMemos } from "../src/engine/delegation";
import { advanceDay, isGameOver, newGame } from "../src/engine/season";
import {
  giveRole, heirReport, legacyReview, liquidity, mortality, nameSuccessor, offerBuyout, ownerAge, resolveSuccessionMemo, saleNet, seekApproval, sellClub,
  setInsurance, setInvolvement, stepDown, succession, successionDaily,
} from "../src/engine/succession";
import { inControl, tenure } from "../src/engine/takeover";
import type { GameState } from "../src/engine/types";
import { compress, decompress } from "../src/save/codec";

const M = 1_000_000;

function fresh(seed = 1): GameState {
  return newGame("DET", "Pat Example", { capRules: "real" }, seed);
}

function runTo(state: GameState, date: string): void {
  while (state.date < date) {
    state.date = addDays(state.date, 1);
    successionDaily(state);
  }
}

function tenureMemo(state: GameState) {
  return openMemos(state).find((m) => m.payload?.succession === "tenure");
}

describe("succession", () => {
  it("the owner ages, and death grows likelier with age and poor health", () => {
    const state = fresh();
    const age = ownerAge(state);
    expect(age).toBeGreaterThanOrEqual(55);
    expect(age).toBeLessThanOrEqual(70);
    expect(succession(state).heirs.length).toBeGreaterThanOrEqual(2);
    expect(mortality(80, 80)).toBeGreaterThan(mortality(60, 80) * 4);
    expect(mortality(70, 30)).toBeGreaterThan(mortality(70, 90));
    // Ten years of mortality at 62 is roughly one in five.
    let alive = 1;
    for (let a = 62; a < 72; a++) alive *= 1 - mortality(a, 80);
    expect(1 - alive).toBeGreaterThan(0.1);
    expect(1 - alive).toBeLessThan(0.35);
  });

  it("heirs are seen through reports that sharpen when they work at the club", () => {
    const state = fresh(2);
    const h = succession(state).heirs.find((x) => x.age >= 18)!;
    const r = heirReport(state, h);
    expect(r.interest).toMatch(/run the club|board|money/);
    expect(Object.values(r).join(" ")).not.toMatch(/\d/);
    expect(giveRole(state, h.id, true)).toBeNull();
    expect(h.role).toBe(true);
  });

  it("names a successor, seeks the league's approval, and plans for estate taxes", () => {
    const state = fresh(3);
    const s = succession(state);
    const h = [...s.heirs].sort((a, b) => b.age - a.age)[0];
    h.age = Math.max(h.age, 30);
    h.acumen = 0.7;
    expect(setInvolvement(state, "retired")).toMatch(/successor/);
    expect(nameSuccessor(state, h.id, "Northgate Trust Company")).toBeNull();
    expect(seekApproval(state)).toBeNull();
    runTo(state, s.review!);
    expect(s.approved).toBe(true);
    expect(setInvolvement(state, "chair")).toBeNull();
    const liq = liquidity(state);
    expect(liq.tax).toBeGreaterThan(0);
    expect(liq.tax).toBeCloseTo(liq.taxable * 0.4, -3);
    expect(setInsurance(state, liq.tax)).toBeNull();
    expect(liquidity(state).short).toBeLessThanOrEqual(liq.short);
  });

  it("buys out a partner at a negotiated price", () => {
    const state = fresh(4);
    owner(state).liquid = 3_000 * M;
    const p = forceSale(state, 0.1, "secondary", "standard");
    expect(ownerShare(state)).toBeCloseTo(0.9, 6);
    expect(offerBuyout(state, p.id, -0.5)).toMatch(/wants more/);
    expect(offerBuyout(state, p.id, 0.2)).toBeNull();
    expect(ownerShare(state)).toBeCloseTo(1, 6);
    expect(investors(state).former[0].name).toBe(p.name);
  });

  it("sells the whole club: bids, the vote, net proceeds and total return, then the player chooses", () => {
    const state = fresh(5);
    expect(sellClub(state)).toBeNull();
    const s = succession(state);
    runTo(state, s.sale!.due);
    expect(s.sale!.stage).toBe("bids");
    const n = saleNet(state, s.sale!.bids[0].price);
    expect(n.net).toBe(n.price - n.debt + n.cash - n.fees - n.partners - n.tax);
    const memo = openMemos(state).find((m) => m.payload?.succession === "bids")!;
    expect(resolveSuccessionMemo(state, memo, 0)).toBeNull();
    const liquid = owner(state).liquid;
    runTo(state, s.sale!.due);
    expect(s.sale!.stage).toBe("closed");
    {
      expect(owner(state).liquid).toBeGreaterThan(liquid);
      expect(inControl(state)).toBe(false);
      expect(s.sale!.net!.multiple).toBeGreaterThan(0);
      const t = tenureMemo(state)!;
      expect(t.options.length).toBe(2);
      resolveSuccessionMemo(state, t, 1);
      expect(isGameOver(state)).toBe(true);
      expect(s.ended!.parts.map((p) => p.area)).toEqual(["Winning", "Money", "Buildings", "Culture", "Community"]);
    }
  });

  it("hands the club on: the heir plays on with the same club, contracts and history", async () => {
    const state = fresh(6);
    const s = succession(state);
    const h = [...s.heirs].sort((a, b) => b.age - a.age)[0];
    h.age = 35; h.acumen = 0.8;
    nameSuccessor(state, h.id);
    seekApproval(state);
    runTo(state, s.review!);
    const contracts = Object.keys(state.contracts).length;
    const players = Object.keys(state.players).length;
    expect(stepDown(state)).toBeNull();
    resolveSuccessionMemo(state, tenureMemo(state)!, 0);
    expect(state.ownerName).toBe(h.name);
    expect(s.generation).toBe(2);
    expect(inControl(state)).toBe(true);
    expect(tenure(state).clubs.map((c) => c.how)).toContain("Handed on");
    expect(Object.keys(state.contracts).length).toBe(contracts);
    expect(Object.keys(state.players).length).toBe(players);
    expect(owner(state).purchase).toBe(valuation(state, "DET"));
    for (let i = 0; i < 5; i++) advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.succession!.generation).toBe(2);
    expect(back.ownerName).toBe(h.name);
  }, 60_000);

  it("an old, ill owner dies and the club passes to the heir", () => {
    const state = fresh(7);
    const s = succession(state);
    s.born = 1920;
    s.health = 10;
    let days = 0;
    while (!s.pending && !s.history.some((x) => /became controlling owner/.test(x.text)) && days < 5000) { state.date = addDays(state.date, 1); successionDaily(state); days++; }
    expect(days).toBeLessThan(5000);
    const m = tenureMemo(state)!;
    expect(m.options.length).toBe(3);
    resolveSuccessionMemo(state, m, 0);
    expect(s.generation).toBe(2);
    expect(state.ownerName).not.toBe("Pat Example");
  });

  it("the estate can sell, leaving the player a buyer with the proceeds", () => {
    const state = fresh(8);
    const s = succession(state);
    s.successor = s.heirs[0].id;
    s.approved = true;
    stepDown(state);
    const before = owner(state).liquid;
    resolveSuccessionMemo(state, tenureMemo(state)!, 1);
    expect(tenure(state).role).toBe("buyer");
    expect(owner(state).liquid).toBeGreaterThan(before);
  });

  it("starts as an heir with siblings as partners and estate tax owed", () => {
    const state = newGame("DET", "Pat Example", { capRules: "real" }, 9, { ...DEFAULT_SETUP, entry: "heir" });
    expect(succession(state).generation).toBe(2);
    expect(ownerAge(state)).toBeLessThan(45);
    expect(investors(state).partners.some((p) => p.kind === "family")).toBe(true);
    expect(owner(state).personalDebt).toBeGreaterThan(0);
    expect(tenure(state).clubs[0].how).toBe("Inherited");
    expect(legacyReview(state).parts.length).toBe(5);
  });
});

