import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { balanceSheet, books, budgetVsActual, cashFlow, forecast, incomeStatement, reserveTarget } from "../src/engine/books";
import { business, businessDaily, cashBalance, ownerCash, pnl } from "../src/engine/business";
import { leagueYear } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import {
  acceptLoan, debt, debtDaily, distributionsBlocked, LEAGUE_DEBT_LIMIT, loanRate, marketRate, openLoans, prepay, pushLender, requestLoan, serviceDebt,
} from "../src/engine/debt";
import { RULES, SCHEDULE } from "../src/engine/league";
import { DEFAULT_SETUP, fundCapitalCall, owner, scorecard, setWeights } from "../src/engine/ownership";
import { advanceDay, newGame } from "../src/engine/season";
import { parseSaveFile } from "../src/save/codec";
import { stateAt } from "./fixtures";

const M = 1_000_000;
const game = (scenario: "healthy" | "tight" | "leveraged" = "healthy", seed = 11) => newGame("DET", "Owner", { capRules: "real" }, seed, { ...DEFAULT_SETUP, scenario });

describe("the club's books", () => {
  it("open with a budget, a balance sheet that balances and a cash flow that ties to the bank", () => {
    const s = game();
    const year = leagueYear(s.date);
    expect(books(s).plan[year]?.national).toBeGreaterThan(400 * M);
    const bs = balanceSheet(s);
    expect(bs.totalAssets - bs.totalLiabilities).toBe(bs.equity);
    expect(bs.contributed + bs.retained).toBe(bs.equity);
    expect(bs.assets.find((a) => a.label === "Cash")?.amount).toBe(100 * M);
    for (let i = 0; i < 40; i++) advanceDay(s);
    const cf = cashFlow(s, year);
    expect(cf.reconciled).toBe(true);
    expect(cf.end).toBe(cashBalance(s));
    // Budget to date follows the year: monthly lines are a twelfth a month.
    const national = budgetVsActual(s, year).find((r) => r.cat === "national")!;
    expect(national.actual).toBeCloseTo(national.toDate, -3);
    // Accrual player pay is the cash adjusted for bonuses spread over contracts.
    const inc = incomeStatement(s, year);
    expect(inc.net).toBe(inc.ebitda + inc.depreciation + inc.interest);
    expect(reserveTarget(s)).toBeGreaterThan(50 * M);
  });

  it("counts season-ticket deposits toward the games they paid for", () => {
    const s = game();
    const b = business(s);
    b.deferred = { season: RULES.season, amount: 9 * M, applied: 0 };
    const first = SCHEDULE.find((g) => g.home === "DET" && !g.neutral && (g.type === "PRE" || g.type === "REG"))!;
    while (s.date <= first.date) advanceDay(s);
    const applied = b.ledger.filter((e) => e.cat === "deposits" && e.amount < 0);
    expect(applied.length).toBe(1);
    expect(b.deferred.applied).toBeGreaterThan(0);
    expect(balanceSheet(s).liabilities.find((l) => l.label.startsWith("Season-ticket"))?.amount).toBe(9 * M - b.deferred.applied);
  });

  it("closes the year with a clean audit, a new budget and the owner's taxes worked out", () => {
    const s = stateAt("DET", 3, "draftStart");
    const c = books(s).closed.find((x) => x.year === 2026)!;
    expect(c).toBeDefined();
    expect(c.audit).toBe("clean");
    expect(c.planOperating).not.toBe(0);
    expect(books(s).plan[2027]).toBeDefined();
    expect(business(s).ledger.some((e) => e.cat === "professional" && e.year === 2027)).toBe(true);
    // A new owner's write-off of the purchase price usually covers the club's income.
    expect(owner(s).taxesPaid).toBeGreaterThanOrEqual(0);
    const f = forecast(s, 10);
    expect(f.length).toBe(10);
    for (const y of f) {
      expect(y.low).toBeLessThanOrEqual(y.cash);
      expect(y.high).toBeGreaterThanOrEqual(y.cash);
    }
    expect(f[9].revenue).toBeGreaterThan(f[1].revenue);
  }, 240_000);
});

describe("borrowing", () => {
  it("prices term sheets, takes a loan, services it and lets it be paid down", () => {
    const s = game();
    expect(requestLoan(s, { amount: 100 * M, years: 7, kind: "fixed", purpose: "general" })).toMatch(/term sheet/);
    const offers = debt(s).offers;
    expect(offers.length).toBeGreaterThan(0);
    const bank = offers.find((o) => o.amort === "amortizing") ?? offers[0];
    pushLender(s, bank.id);
    const offer = debt(s).offers.find((o) => o.lender === bank.lender) ?? debt(s).offers[0];
    const before = cashBalance(s);
    expect(acceptLoan(s, offer.id)).toBeNull();
    expect(cashBalance(s)).toBeCloseTo(before + 100 * M - 100 * M * offer.fee - 0.25 * M, -2);
    const loan = openLoans(s)[0];
    const bal = loan.balance;
    serviceDebt(s);
    const interest = business(s).ledger.filter((e) => e.cat === "interest").at(-1)!;
    expect(-interest.amount).toBeCloseTo(bal * loanRate(s, loan) / 12, -2);
    if (loan.amort === "amortizing") expect(loan.balance).toBeLessThan(bal);
    expect(prepay(s, loan.id, 20 * M)).toBeNull();
    expect(loan.balance).toBeLessThan(bal - 19 * M);
  });

  it("refuses debt past the league's limit", () => {
    const s = game();
    expect(requestLoan(s, { amount: LEAGUE_DEBT_LIMIT + 100 * M, years: 7, kind: "fixed", purpose: "general" })).toMatch(/debt limit/);
    expect(debt(s).offers.length).toBe(0);
  });

  it("moves the market rate a little each month, the same way for the same save", () => {
    const a = game("healthy", 21);
    const b = game("healthy", 21);
    const r1 = marketRate(a, "2028-06");
    expect(marketRate(b, "2028-06")).toBe(r1);
    expect(r1).toBeGreaterThan(0.005);
    expect(r1).toBeLessThan(0.08);
  });

  it("a broken covenant brings a waiver and blocks distributions; a second calls the loan", () => {
    const s = game("leveraged");
    const loan = openLoans(s)[0];
    expect(loan.balance).toBe(450 * M);
    expect(cashBalance(s)).toBe(50 * M);
    // No loan proceeds: the acquisition debt paid the seller.
    expect(business(s).ledger.some((e) => e.cat === "loanIn")).toBe(false);
    loan.minCoverage = 50;
    s.date = "2026-10-01";
    debtDaily(s);
    expect(loan.breaches).toBe(1);
    expect(loan.stepUp).toBeGreaterThan(0);
    expect(distributionsBlocked(s)).toBe(true);
    expect(ownerCash(s, -1 * M)).toMatch(/covenant/);
    s.date = "2027-01-01";
    debtDaily(s);
    expect(loan.accelerated).toBe(addDays("2027-01-01", 90));
    expect(debt(s).offers.some((o) => o.purpose === "refinance")).toBe(true);
    s.date = loan.accelerated!;
    debtDaily(s);
    expect(loan.repaid).toBe(s.date);
    expect(openLoans(s).length).toBe(0);
  });
});

describe("the owner", () => {
  it("starts from the profile and pays capital calls from personal money", () => {
    const s = newGame("DET", "Owner", { capRules: "real" }, 12, { ...DEFAULT_SETUP, scenario: "tight", wealth: 0, spending: "conservative", background: "realEstate" });
    expect(cashBalance(s)).toBe(15 * M);
    expect(debt(s).facility.limit).toBe(150 * M);
    expect(books(s).reserveMonths).toBe(4);
    const o = owner(s);
    expect(o.liquid).toBe(300 * M);
    // Putting in more than the owner has on hand is refused.
    expect(ownerCash(s, 400 * M)).toMatch(/on hand/);
    expect(ownerCash(s, 50 * M)).toBeNull();
    expect(o.liquid).toBe(250 * M);
    expect(fundCapitalCall(s, 300 * M)).toMatch(/discount/);
    expect(o.liquid).toBe(0);
    expect(o.outside).toBeLessThan(2200 * M);
    // Money out to the owner respects the reserve.
    expect(ownerCash(s, -60 * M)).toMatch(/reserve/);
  });

  it("scores every goal and weights them the owner's way", () => {
    const s = game();
    const card = scorecard(s);
    for (const v of Object.values(card.scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    setWeights(s, { titles: 0, profit: 0, value: 0, community: 0, reputation: 0, stability: 5 });
    expect(scorecard(s).overall).toBe(card.scores.stability);
  });

  it("puts each finished season on the owner's record", () => {
    const s = stateAt("DET", 3, "draftStart");
    for (let i = 0; i < 12 && (s.season ?? 2026) === 2026; i++) advanceDay(s);
    expect(s.season).toBe(2027);
    const row = owner(s).legacy.find((r) => r.season === 2026)!;
    expect(row).toBeDefined();
    expect(row.revenue).toBe(pnl(s, 2026).totalRevenue);
    expect(row.overall).toBeGreaterThan(0);
  }, 240_000);

  it("old saves get books, a credit facility and an owner", () => {
    const s = parseSaveFile(gunzipSync(readFileSync(new URL("./saves/pr12-2027-05-02.json.gz", import.meta.url))).toString());
    expect(s.debt?.facility.limit).toBe(300 * M);
    expect(s.owner?.purchase).toBeGreaterThan(1000 * M);
    expect(s.books?.plan[leagueYear(s.date)]).toBeDefined();
    for (let i = 0; i < 3; i++) advanceDay(s);
    businessDaily(s);
  }, 60_000);
});
