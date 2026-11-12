import { describe, expect, it } from "vitest";
import { balanceSheet } from "../src/engine/books";
import { business, cashBalance, ownerCash, post, valuation } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { debt, marketRate } from "../src/engine/debt";
import { openMemos } from "../src/engine/delegation";
import {
  board, bridgeLoan, callCapital, checkSale, contingency, covenants, forceSale, investors, investorsDaily, openSale, ownerCapitalCall, ownerShare,
  partnersContributed, reserved, returns, setDisclosure,
} from "../src/engine/investors";
import { decideMemo } from "../src/engine/memos";
import { closeOwnerYear, owner, ownerEquity } from "../src/engine/ownership";
import { newGame } from "../src/engine/season";
import type { GameState } from "../src/engine/types";
import { compress, decompress } from "../src/save/codec";

const TEAM = "DET";
const M = 1_000_000;

function fresh(seed = 1): GameState {
  return newGame(TEAM, "x", { capRules: "real" }, seed);
}

/** Runs only the investors hook day by day, so other systems don't move the numbers. */
function runTo(state: GameState, date: string): void {
  while (state.date < date) {
    state.date = addDays(state.date, 1);
    investorsDaily(state);
  }
}

describe("ownership group", () => {
  it("starts with the owner holding the whole club, and the quarterly report changes nothing", () => {
    const state = fresh();
    expect(ownerShare(state)).toBe(1);
    const ledger = business(state).ledger.length;
    const liquid = owner(state).liquid;
    state.date = "2026-10-14";
    runTo(state, "2026-10-16");
    expect(investors(state).reports.length).toBe(1);
    expect(business(state).ledger.length).toBe(ledger);
    expect(owner(state).liquid).toBe(liquid);
    expect(reserved(state, "relocation")).toBeNull();
    expect(board(state)[0].name).toBe("x");
  });

  it("enforces the league's control minimum", () => {
    const state = fresh();
    expect(checkSale(state, 0.75, "secondary")).toMatch(/30%/);
    expect(checkSale(state, 0.005, "secondary")).toMatch(/1%/);
    expect(checkSale(state, 0.2, "secondary")).toBeNull();
  });

  it("sells your own shares: the money comes to you, less capital-gains tax", () => {
    const state = fresh();
    const before = owner(state).liquid;
    const equity = ownerEquity(state);
    const p = forceSale(state, 0.2);
    expect(ownerShare(state)).toBeCloseTo(0.8, 6);
    expect(p.pct).toBeCloseTo(0.2, 6);
    const s = investors(state);
    expect(s.proceeds).toBe(p.paid);
    expect(owner(state).liquid - before).toBe(p.paid - s.gainsTax);
    expect(ownerEquity(state)).toBeLessThan(equity * 0.85);
    // A minority stake sells near, and a little under, its share of the club's value.
    expect(p.paid).toBeGreaterThan(valuation(state, TEAM) * 0.2 * 0.75);
    expect(p.paid).toBeLessThan(valuation(state, TEAM) * 0.2 * 1.05);
  });

  it("new shares put money in the club and dilute everyone", () => {
    const state = fresh();
    forceSale(state, 0.2);
    const cash = cashBalance(state);
    const p = forceSale(state, 0.1, "primary");
    const first = investors(state).partners[0];
    expect(first.pct).toBeCloseTo(0.18, 6);
    expect(p.pct).toBeCloseTo(0.1, 6);
    expect(ownerShare(state)).toBeCloseTo(0.72, 6);
    expect(cashBalance(state) - cash).toBeGreaterThan(p.paid * 0.98);
    expect(partnersContributed(state)).toBe(p.paid);
  });

  it("splits distributions by share, so the owner's pocket gets only their part", () => {
    const state = fresh();
    post(state, "capital", 400 * M, "test cash");
    business(state).opening += 0;
    forceSale(state, 0.25);
    const liquid = owner(state).liquid;
    const takenOut = owner(state).takenOut;
    const contributed = balanceSheet(state).contributed;
    expect(ownerCash(state, -100 * M)).toBeNull();
    expect(owner(state).liquid - liquid).toBe(75 * M);
    expect(owner(state).takenOut - takenOut).toBe(75 * M);
    expect(investors(state).partners[0].distributions).toBe(25 * M);
    // The books see the whole distribution leave the club's contributed capital.
    expect(contributed - balanceSheet(state).contributed).toBe(100 * M);
  });

  it("calls capital from every partner", () => {
    const state = fresh(4);
    forceSale(state, 0.3);
    const putIn = owner(state).putIn;
    const text = callCapital(state, 50 * M, "test");
    const s = investors(state);
    const ours = s.calls[0].ours;
    expect(owner(state).putIn - putIn).toBe(ours);
    expect(text).toMatch(/partners put in/);
    // Either the partner paid and the owner paid 70%, or the partner was diluted for missing it.
    if (s.partners[0].calls > 0) expect(ours).toBe(35 * M);
    else expect(s.partners[0].pct).toBeLessThan(0.3);
    expect(ownerCapitalCall(state, 1 * M)).toMatch(/\$5M/);
  });

  it("puts reserved matters to the board once the owner is below two-thirds", () => {
    const state = fresh();
    forceSale(state, 0.2);
    forceSale(state, 0.2);
    expect(ownerShare(state)).toBeCloseTo(0.6, 6);
    for (const p of investors(state).partners) p.mood = 0;
    expect(reserved(state, "relocation")).toMatch(/two-thirds/);
    for (const p of investors(state).partners) p.mood = 100;
    expect(reserved(state, "relocation")).toBeNull();
    expect(investors(state).minutes.length).toBe(2);
    // Small borrowing isn't a reserved matter.
    for (const p of investors(state).partners) p.mood = 0;
    expect(reserved(state, "debt", 10 * M)).toBeNull();
    expect(board(state).some((d) => d.role.startsWith("Partner director"))).toBe(true);
  });

  it("runs a sale through bids, a memo and the league's review", () => {
    const state = fresh(2);
    expect(openSale(state, 0.1, "secondary", "standard")).toBeNull();
    const sale = investors(state).sale!;
    runTo(state, sale.bidsDue);
    expect(sale.stage).toBe("bids");
    const memo = openMemos(state).find((m) => m.payload?.investors === "bids")!;
    expect(memo).toBeTruthy();
    expect(decideMemo(state, memo.id, 0)).toBeNull();
    expect(sale.stage).toBe("league");
    runTo(state, sale.closes!);
    expect(["closed", "failed"]).toContain(sale.stage);
    if (sale.stage === "closed") expect(ownerShare(state)).toBeCloseTo(0.9, 6);
  });

  it("lets unhappy partners ask out, and buying them out raises your share", () => {
    const state = fresh();
    forceSale(state, 0.15);
    const p = investors(state).partners[0];
    p.mood = 5;
    state.date = "2026-09-30";
    runTo(state, "2026-10-01");
    const memo = openMemos(state).find((m) => m.payload?.investors === "exit")!;
    expect(memo).toBeTruthy();
    owner(state).liquid = 5_000 * M;
    expect(decideMemo(state, memo.id, 0)).toBeNull();
    expect(investors(state).partners.length).toBe(0);
    expect(ownerShare(state)).toBe(1);
    expect(investors(state).former[0].name).toBe(p.name);
  });

  it("makes a bridge loan from the owner a reviewed related-party deal", () => {
    const state = fresh();
    forceSale(state, 0.1);
    const liquid = owner(state).liquid;
    expect(bridgeLoan(state, 50 * M, marketRate(state) + 0.01)).toBeNull();
    expect(owner(state).liquid).toBe(liquid - 50 * M);
    const loan = debt(state).loans.find((l) => l.lender.startsWith("Owner"))!;
    expect(loan.balance).toBe(50 * M);
    expect(investors(state).reviews[0].outcome).toMatch(/fair-rate/);
    // Repaid: the money comes back to the owner.
    loan.repaid = state.date;
    loan.balance = 0;
    state.date = addDays(state.date, 1);
    investorsDaily(state);
    expect(owner(state).liquid).toBeGreaterThanOrEqual(liquid);
  });

  it("taxes the owner on their share of the club's income", () => {
    const a = fresh();
    const b = fresh();
    forceSale(b, 0.4);
    const ta = closeOwnerYear(a, 2026, 500 * M);
    const tb = closeOwnerYear(b, 2026, 500 * M);
    expect(tb.taxable).toBeCloseTo(ta.taxable * 0.6, -3);
  });

  it("reports value, real and risk-adjusted returns, covenants and contingency sources", () => {
    const state = fresh();
    const r = returns(state);
    expect(r.enterprise).toBe(valuation(state, TEAM));
    expect(r.hurdle).toBeGreaterThan(0.07);
    expect(Number.isFinite(r.real)).toBe(true);
    expect(covenants(state).some((c) => c.what.includes("30%"))).toBe(true);
    expect(contingency(state).length).toBe(5);
    setDisclosure(state, "full");
    expect(investors(state).disclosure).toBe("full");
  });

  it("keeps the ownership group through a save", async () => {
    const state = fresh();
    forceSale(state, 0.2, "secondary", "investor");
    const back = await decompress(await compress(state));
    expect(ownerShare(back)).toBeCloseTo(0.8, 6);
    expect(investors(back).partners[0].putFrom).toBeTruthy();
  });
});
