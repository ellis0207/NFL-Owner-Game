import { describe, expect, it } from "vitest";
import { business, pnl } from "../src/engine/business";
import { dealFor, localDeals, localIncome, LOCAL_CATS, signLocalOffer } from "../src/engine/commerce";
import { leagueYear } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { RULES } from "../src/engine/league";
import { projectEffects, projects, projectTerms, startProject } from "../src/engine/projects";
import { gradesDay } from "../src/engine/review";
import { advanceDay, isGameOver } from "../src/engine/season";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";

function until(state: GameState, date: string): void {
  while (state.date < date && !isGameOver(state)) advanceDay(state);
}

describe("the business offseason", () => {
  it("shops expiring sponsor deals, builds a project, grades the offseason and sets expectations", () => {
    const state = stateAt(TEAM, 5);
    const year = leagueYear(state.date);
    const l = localDeals(state);
    expect(l.deals.length).toBe(Object.keys(LOCAL_CATS).length);
    // Named deals plus the small partners come close to the old lump sum.
    const income = localIncome(state, year);
    expect(income.media).toBeGreaterThan(0);
    expect(income.sponsors).toBeGreaterThan(income.media);

    until(state, `${year + 1}-02-02`);
    expect(l.window?.year).toBe(year);
    expect(l.offers.length).toBeGreaterThan(0);
    const cats = [...new Set(l.offers.map((o) => o.cat))];
    const mine = l.offers.filter((o) => o.cat === cats[0]).sort((a, b) => b.years - a.years)[0];
    expect(signLocalOffer(state, mine.id)).toBeNull();
    expect(l.offers.some((o) => o.cat === cats[0])).toBe(false);

    // A one-offseason project: a deposit now, the rest monthly, open by August.
    const t = projectTerms(state, "boards");
    expect(t.blocked).toBeUndefined();
    startProject(state, "boards");
    expect(projects(state)).toHaveLength(1);
    expect(projectTerms(state, "boards").blocked).toMatch(/Under way/);

    until(state, addDays(l.window!.closes, 1));
    expect(l.window).toBeUndefined();
    expect(l.offers).toHaveLength(0);
    // Every category that was up has a partner for the new league year, unless the owner passed.
    for (const c of cats) expect(dealFor(state, c, year + 1)).toBeTruthy();
    expect(dealFor(state, cats[0], year + 1)?.partner).toBe(mine.partner);

    until(state, addDays(RULES.keyDates.draftStart, 5));
    expect(RULES.season).toBe(year + 1);
    const r = state.review!;
    expect(r.season).toBe(year + 1);
    expect(r.before).toBeTruthy();
    expect(r.picks?.length).toBeGreaterThan(0);
    expect(Object.keys(r.draft ?? {}).length).toBe(32);

    until(state, addDays(gradesDay(), 1));
    expect(Object.keys(r.grades!)).toHaveLength(3);
    for (const g of Object.values(r.grades!)) expect(Object.keys(g)).toHaveLength(32);
    expect(r.gm).toMatch(/^[A-DF]/);
    expect(r.expect!.wins).toBeGreaterThanOrEqual(3);
    expect(r.storylines.length).toBeGreaterThan(0);
    expect(state.inbox.some((m) => m.title === "Our offseason")).toBe(true);

    until(state, "2027-08-02");
    const p = projects(state)[0];
    expect(p.opened).toBe(true);
    expect(p.paid).toBe(p.cost);
    expect(projectEffects(state).gate.demand).toBeGreaterThan(1);
    // Capital projects move cash but stay out of operating income.
    const book = pnl(state, leagueYear(state.date));
    expect(book).toBeTruthy();
    expect(business(state).ledger.filter((e) => e.cat === "projects").reduce((s, e) => s + e.amount, 0)).toBeCloseTo(-p.cost, -3);
  });

  it("settles the storylines against the record when the regular season ends", () => {
    const state = stateAt(TEAM, 4, "2026-08-10");
    const r = state.review!;
    expect(r.season).toBe(2026);
    expect(r.expect).toBeTruthy();
    expect(r.storylines.length).toBeGreaterThan(0);
    until(state, addDays(RULES.keyDates.regularSeasonEnd, 3));
    expect(r.settled).toBe(true);
    expect(r.storylines.every((s) => s.status !== "open")).toBe(true);
  });
});
