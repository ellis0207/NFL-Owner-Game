import { describe, expect, it } from "vitest";
import { answerOffer, business, businessDaily, cashBalance, gateForecast, pnl, setSinglePrice } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { SCHEDULE, TEAMS } from "../src/engine/league";
import { mediaState } from "../src/engine/outlets";
import { advanceDay, newGame } from "../src/engine/season";
import { controlOf, MARKETS, STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { compress, decompress } from "../src/save/codec";

const firstHome = (team: string) => SCHEDULE.find((g) => g.home === team && !g.neutral && g.type === "REG")!;

describe("stadiums", () => {
  it("covers every team with a real control structure", () => {
    for (const t of TEAMS) {
      expect(STADIUM_BY_TEAM[t.id], t.id).toBeDefined();
      expect(MARKETS[t.id], t.id).toBeDefined();
      expect(STADIUM_BY_TEAM[t.id].name).toBe(t.stadium);
    }
    expect(STADIUM_BY_TEAM.LAC.structure).toBe("tenant");
    expect(STADIUM_BY_TEAM.LA.structure).toBe("owned");
    expect(STADIUM_BY_TEAM.NYG.structure).toBe("coowned");
    expect(STADIUM_BY_TEAM.CHI.structure).toBe("publicAuthority");
    expect(controlOf(STADIUM_BY_TEAM.CHI).booking).toBe("none");
    expect(controlOf(STADIUM_BY_TEAM.MIA).booking).toBe("full");
    expect(controlOf(STADIUM_BY_TEAM.NYJ).booking).toBe("partner");
    expect(controlOf(STADIUM_BY_TEAM.LV).booking).toBe("approval");
  });
});

describe("the books", () => {
  it("open with the months before the takeover and the bank at the opening balance", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 3);
    const b = business(state);
    expect(cashBalance(state)).toBe(100_000_000);
    const national = b.ledger.filter((e) => e.cat === "national");
    expect(national.length).toBe(4);
    expect(b.ledger.some((e) => e.cat === "players" && e.amount < 0)).toBe(true);
  });

  it("books the gate, shares it with the league and pays the pool back weekly", () => {
    const state = newGame("GB", "Owner", { capRules: "real" }, 4);
    const g = firstHome("GB");
    while (state.date <= addDays(g.date, 7)) advanceDay(state);
    const b = business(state);
    const lines = b.ledger.filter((e) => e.date === g.date);
    const tickets = lines.find((e) => e.cat === "tickets")!.amount;
    const shared = lines.find((e) => e.cat === "gateShare")!.amount;
    expect(shared).toBeCloseTo(-tickets * 0.34 * 0.85, -2);
    expect(b.gates.some((x) => x.game === g.id)).toBe(true);
    expect(b.ledger.some((e) => e.cat === "gatePool" && e.date > g.date)).toBe(true);
    expect(pnl(state, 2026).totalRevenue).toBeGreaterThan(0);
  });

  it("charges league fines and player cash to the ledger", () => {
    const state = newGame("DAL", "Owner", { capRules: "real" }, 5);
    mediaState(state).fines.push({ date: state.date, amount: 250_000, reason: "test" });
    state.finance.DAL = { paid: { 2026: 5_000_000 } };
    const before = cashBalance(state);
    businessDaily(state);
    expect(cashBalance(state)).toBe(before - 5_250_000);
  });

  it("prices change who buys", () => {
    const state = newGame("ARI", "Owner", { capRules: "real" }, 6);
    const g = firstHome("ARI");
    const base = gateForecast(state, g);
    setSinglePrice(state, 1.8);
    const high = gateForecast(state, g);
    expect(high.sold).toBeLessThan(base.sold);
    expect(high.singlePrice).toBeGreaterThan(base.singlePrice);
  });
});

describe("the stadium calendar", () => {
  it("brings booking requests only to teams that control the calendar", () => {
    const chi = newGame("CHI", "Owner", { capRules: "real" }, 8);
    const mia = newGame("MIA", "Owner", { capRules: "real" }, 8);
    for (let i = 0; i < 60; i++) { advanceDay(chi); advanceDay(mia); }
    expect(business(chi).events.some((e) => e.by === "offer")).toBe(false);
    expect(business(chi).events.some((e) => e.by === "landlord")).toBe(true);
    const offer = business(mia).events.find((e) => e.by === "offer");
    expect(offer).toBeDefined();
    // No event lands on or next to an NFL game in the building.
    const nfl = SCHEDULE.filter((g) => g.home === "MIA" && !g.neutral).map((g) => g.date);
    for (const e of business(mia).events.filter((x) => x.by === "offer")) {
      for (const d of nfl) expect(Math.abs(new Date(e.date).getTime() - new Date(d).getTime())).toBeGreaterThan(86_400_000);
    }
    const open = business(mia).events.find((e) => e.status === "offered");
    if (open) {
      expect(answerOffer(mia, open.id, true)).toBeNull();
      expect(open.status).toBe("booked");
    }
  });

  it("survives a save round trip, and old saves open their books", async () => {
    const state = newGame("LAC", "Owner", { capRules: "real" }, 9);
    advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.business?.ledger.length).toBe(state.business?.ledger.length);
    delete (back as { business?: unknown }).business;
    const again = await decompress(await compress(back));
    expect(again.business).toBeDefined();
    expect(cashBalance(again)).toBe(100_000_000);
  });
});
