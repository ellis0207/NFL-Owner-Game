import { describe, expect, it } from "vitest";
import { business, cashBalance, valuation } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { debt, totalDebt } from "../src/engine/debt";
import {
  appraise, controller, fairPrice, forceDeal, franchise, franchiseDaily, placeBid, pursue, setFinancing, sources, submitDeal, walkAway,
} from "../src/engine/franchisemarket";
import { investors, ownerShare } from "../src/engine/investors";
import { TEAM_BY_ID } from "../src/engine/league";
import { owners } from "../src/engine/owners";
import { DEFAULT_SETUP, owner } from "../src/engine/ownership";
import { advanceDay, newGame } from "../src/engine/season";
import { buyMore, inControl, startAsBuyer, startAsMinority, takeoverDaily, tenure } from "../src/engine/takeover";
import type { GameState } from "../src/engine/types";
import { compress, decompress } from "../src/save/codec";

const M = 1_000_000;

function fresh(seed = 1, team = "DET"): GameState {
  return newGame(team, "x", { capRules: "real" }, seed);
}

function runTo(state: GameState, date: string): void {
  while (state.date < date) {
    state.date = addDays(state.date, 1);
    franchiseDaily(state);
  }
}

describe("the franchise market", () => {
  it("appraises any club from its revenue, market, stadium and debt, with comparable sales", () => {
    const state = fresh();
    const a = appraise(state, "DAL");
    expect(a.value).toBe(valuation(state, "DAL"));
    expect(a.national + a.local).toBe(a.revenue);
    expect(a.equity).toBe(a.value - a.debt);
    expect(a.comps).toMatch(/Commanders 2023/);
    expect(controller(state, "NE")).toBe("the Kraft family");
  });

  it("lists clubs for sale rarely, and rival groups buy them", () => {
    const state = fresh(5);
    runTo(state, "2046-07-01");
    const f = franchise(state);
    const sold = f.sales.filter((s) => !s.real);
    // About one to three changes of control a decade.
    expect(sold.length).toBeGreaterThanOrEqual(1);
    expect(sold.length).toBeLessThanOrEqual(9);
    // A club can change hands twice in twenty years; the latest buyer holds it.
    const latest = new Map(sold.map((s) => [s.team, s.buyer]));
    for (const [team, buyer] of latest) expect(controller(state, team)).toBe(buyer);
  });

  it("runs diligence, then takes bids against rivals", () => {
    const state = fresh(2);
    owner(state).liquid = 2_000 * M;
    expect(pursue(state, "GB")).toMatch(/shareholders/);
    expect(pursue(state, "DET")).toMatch(/already own/);
    expect(pursue(state, "JAX")).toBeNull();
    const deal = franchise(state).deal!;
    runTo(state, deal.due);
    expect(deal.stage).toBe("bidding");
    expect(fairPrice(state, deal)).toBeLessThanOrEqual(valuation(state, "JAX"));
    expect(placeBid(state, valuation(state, "JAX") * 0.5, false)).toMatch(/won't look/);
    // A club that isn't for sale needs an offer too good to refuse.
    expect(placeBid(state, valuation(state, "JAX") * 1.45, false)).toBeNull();
    runTo(state, deal.due);
    expect(deal.stage).toBe("exclusive");
    expect(setFinancing(state, { lp: 0.6, pe: 0.2, debt: 0, trust: 0, terms: "standard" })).toMatch(/10%|30%/);
    expect(setFinancing(state, { lp: 0.2, pe: 0, debt: 5_000 * M, trust: 0, terms: "standard" })).toMatch(/limit/);
    expect(walkAway(state)).toBeNull();
    expect(deal.stage).toBe("failed");
  });

  it("can fail at the owners' vote", () => {
    const state = fresh(3);
    owner(state).liquid = 9_000 * M;
    const f = franchise(state);
    f.deal = { id: "d1", team: "JAX", opened: state.date, stage: "exclusive", due: addDays(state.date, 60), costs: 0, findings: [], rivals: [], bid: { price: valuation(state, "JAX"), financingOut: false, date: state.date } };
    expect(setFinancing(state, { lp: 0.5, pe: 0.1, debt: 0, trust: 0, terms: "standard" })).toBeNull();
    for (const r of Object.values(owners(state).relations)) r.rapport = -250;
    expect(submitDeal(state)).toBeNull();
    runTo(state, f.deal.due);
    expect(f.deal.stage).toBe("failed");
    expect(f.deal.failed).toMatch(/voted it down|lenders/);
  });

  it("closes a purchase: the old club is sold, and the player takes over the new one as it stands", async () => {
    const state = fresh(4);
    owner(state).liquid = 3_000 * M;
    const oldName = TEAM_BY_ID.DET.name;
    const deal = forceDeal(state, "JAX", { lp: 0.25, pe: 0.05, debt: 200 * M, trust: 0, terms: "standard" });
    expect(state.userTeam).toBe("JAX");
    expect(deal.stage).toBe("closed");
    expect(ownerShare(state)).toBeCloseTo(0.7, 6);
    expect(investors(state).partners.length).toBeGreaterThanOrEqual(2);
    expect(controller(state, "DET")).not.toBe("x");
    expect(controller(state, "JAX")).toBe("x");
    expect(TEAM_BY_ID.DET.name).toBe(oldName);
    expect(totalDebt(state)).toBeGreaterThanOrEqual(200 * M);
    expect(debt(state).loans.some((l) => l.id.startsWith("L0-"))).toBe(true);
    const c = deal.closing!;
    expect(c.equityPrice).toBe(Math.max(0, c.price - c.assumedDebt - c.claims + c.cash));
    expect(c.proceeds).toBeGreaterThan(0);
    expect(tenure(state).clubs.map((x) => x.team)).toEqual(["DET", "JAX"]);
    expect(owner(state).purchase).toBe(c.price);
    expect(business(state).ledger.length).toBeGreaterThan(0);
    // The new club plays on.
    for (let i = 0; i < 10; i++) advanceDay(state);
    expect(cashBalance(state)).toBeGreaterThan(-1e9);
    const back = await decompress(await compress(state));
    expect(back.userTeam).toBe("JAX");
    expect(ownerShare(back)).toBeCloseTo(0.7, 6);
  }, 60_000);

  it("a buyer start watches the club read-only, then takes control by buying it", () => {
    const state = fresh(6);
    startAsBuyer(state);
    expect(inControl(state)).toBe(false);
    expect(ownerShare(state)).toBe(0);
    expect(franchise(state).listings.some((l) => l.team === "DET")).toBe(true);
    owner(state).liquid = 9_000 * M;
    forceDeal(state, "DET", { lp: 0.3, pe: 0, debt: 0, trust: 0, terms: "owner" });
    expect(state.userTeam).toBe("DET");
    expect(inControl(state)).toBe(true);
    expect(ownerShare(state)).toBeCloseTo(0.7, 6);
  });

  it("New game can start as a buyer or a minority partner", () => {
    const b = newGame("DET", "x", { capRules: "real" }, 8, { ...DEFAULT_SETUP, entry: "buyer" });
    expect(inControl(b)).toBe(false);
    expect(tenure(b).role).toBe("buyer");
    const m = newGame("DET", "x", { capRules: "real" }, 8, { ...DEFAULT_SETUP, entry: "minority" });
    expect(ownerShare(m)).toBe(0.1);
    const o = newGame("DET", "x", { capRules: "real" }, 8);
    expect(inControl(o)).toBe(true);
    expect(o.tenure).toBeUndefined();
  });

  it("a minority partner gets distributions, can buy more up to 49%, and pays only for the rest when buying control", () => {
    const state = fresh(7);
    startAsMinority(state, 0.1);
    expect(ownerShare(state)).toBe(0.1);
    expect(buyMore(state, 0.45)).toMatch(/49%/);
    let tries = 0;
    while (buyMore(state, 0.05) && tries < 20) { state.date = addDays(state.date, 1); tries++; }
    expect(tenure(state).stake).toBeCloseTo(0.15, 6);
    const liquid = owner(state).liquid;
    state.date = "2027-04-19";
    state.date = addDays(state.date, 1);
    takeoverDaily(state);
    expect(owner(state).liquid).toBeGreaterThanOrEqual(liquid);
    const f = franchise(state);
    f.deal = { id: "d2", team: "DET", opened: state.date, stage: "exclusive", due: addDays(state.date, 60), costs: 0, findings: [], rivals: [], bid: { price: valuation(state, "DET"), financingOut: false, date: state.date } };
    const full = sources(state, { ...f.deal, financing: { lp: 0, pe: 0, debt: 0, trust: 0, terms: "standard" } });
    expect(full.equityPrice).toBeLessThan((full.assumed ? 1 : 1) * valuation(state, "DET"));
  });
});
