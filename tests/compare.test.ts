import { describe, expect, it } from "vitest";
import { causesDaily } from "../src/engine/causes";
import { dismissalComparison, financingComparison, renovationComparison, setPricesTracked, signingComparison, ticketComparison } from "../src/engine/compare";
import { requestLoan } from "../src/engine/debt";
import { market } from "../src/engine/freeagency";
import { advanceDay } from "../src/engine/season";
import type { Comparison } from "../src/engine/compare";
import { stateAt } from "./fixtures";

function wellFormed(c: Comparison): void {
  expect(c.options.length).toBeGreaterThanOrEqual(2);
  for (const r of c.rows) expect(r.cells.length).toBe(c.options.length);
  expect(c.forecasts.length).toBe(c.options.length);
  for (const f of c.forecasts) {
    expect(f.low).toBeLessThanOrEqual(f.mid);
    expect(f.mid).toBeLessThanOrEqual(f.high);
  }
  expect(c.assumptions.length).toBeGreaterThan(0);
  // Staff give words and ranges, never a rating.
  expect(JSON.stringify(c)).not.toMatch(/\b(ratings?|overall|ability)\b/i);
}

describe("decision comparisons", () => {
  it("a signing compares the deal, a shorter deal, another free agent and passing, with the cash and cap from the contract model", () => {
    const s = stateAt("DET", 3, "newLeagueYear");
    const fa = Object.values(market(s)).filter((f) => f.status === "open").sort((a, b) => b.ask - a.ask)[0];
    const years = Math.max(2, fa.askYears);
    const c = signingComparison(s, fa.player, { years, total: fa.ask * years, signingBonus: fa.ask * 0.5, guaranteed: fa.ask * 1.2, injuryGuaranteed: 0, voidYears: 0, shape: "flat" });
    wellFormed(c);
    expect(c.options.length).toBeGreaterThanOrEqual(3);
    const cash = c.rows.find((r) => r.label.startsWith("Cash"))!;
    expect(cash.cells[0]).not.toBe(cash.cells[1]);
    expect(c.views.length).toBeGreaterThanOrEqual(3);
  }, 300_000);

  it("ticket prices: a bigger rise keeps fewer holders and upsets fans, holding keeps more", () => {
    const s = stateAt("DET", 3);
    const c = ticketComparison(s, [0.1, 0, -0.03]);
    wellFormed(c);
    const [up, hold, down] = c.forecasts;
    expect(up.mid).toBeLessThanOrEqual(hold.mid);
    expect(hold.mid).toBeLessThanOrEqual(down.mid);
    expect(c.rows.find((r) => r.label === "Fan trust")!.cells[0]).toMatch(/Hit/);
  }, 300_000);

  it("renovation: borrowing spreads the cash, waiting costs more, the downside costs most", () => {
    const s = stateAt("DET", 3);
    const c = renovationComparison(s, "clubs");
    wellFormed(c);
    const cost = c.rows.find((r) => r.label === "Cash out this year")!.cells;
    expect(cost[1]).not.toBe(cost[0]);
    expect(c.forecasts[3].mid).toBeLessThan(c.forecasts[0].mid);
    // Another project is priced from its own effects.
    expect(renovationComparison(s, "wifi").forecasts[0].mid).not.toBe(c.forecasts[0].mid);
  }, 300_000);

  it("financing: each offer shows payments, rate risk and covenants in a recession", () => {
    const s = stateAt("DET", 3);
    requestLoan(s, { amount: 80_000_000, years: 7, kind: "floating", purpose: "general" });
    requestLoan(s, { amount: 80_000_000, years: 7, kind: "fixed", purpose: "general" });
    const offers = s.debt!.offers;
    expect(offers.length).toBeGreaterThan(0);
    const c = financingComparison(s, offers);
    wellFormed(c);
    expect(c.rows.find((r) => r.label === "Coverage in a recession")).toBeTruthy();
    const risk = c.rows.find((r) => r.label === "If rates rise 2 points")!.cells;
    offers.forEach((o, i) => expect(risk[i]).toMatch(o.kind === "floating" ? /interest/ : /fixed/));
  }, 300_000);

  it("dismissal: severance, the coaching market, scheme and the staff who'd follow", () => {
    const s = stateAt("DET", 3);
    const c = dismissalComparison(s, "HC")!;
    wellFormed(c);
    expect(c.rows.map((r) => r.label)).toEqual(expect.arrayContaining(["Severance owed", "Candidates on the market", "Same scheme as now"]));
  }, 300_000);

  it("keeps the ticket office's forecast with the decision and checks it after renewals", () => {
    const s = stateAt("DET", 3);
    expect(setPricesTracked(s, 1.06, 1.03)).toBeNull();
    const c = s.causes![0];
    expect(c.forecast?.measure).toBe("holders");
    while (s.date < `${s.date.slice(0, 4)}-05-17`) advanceDay(s);
    causesDaily(s);
    const after = s.causes!.find((x) => x.id === c.id)!;
    expect(after.outcome).toBeTruthy();
    expect(after.outcome!.text).toMatch(/observed/);
    expect(after.outcome!.text).toMatch(/Part of the change/);
  }, 600_000);
});
