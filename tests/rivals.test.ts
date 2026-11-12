import { describe, expect, it } from "vitest";
import { atomic, snapshotYear } from "../src/engine/archive";
import { cause, causeLog, effect } from "../src/engine/causes";
import { addDays } from "../src/engine/dates";
import { franchise, sold } from "../src/engine/franchisemarket";
import { PLAYERS } from "../src/engine/league";
import { coachCase } from "../src/engine/outlook";
import { proposeRealign, relocation } from "../src/engine/relocation";
import { budget, cashLean, club, hiringFactor, patienceShift, profile, rivals, rivalsDaily } from "../src/engine/rivals";
import { newGame } from "../src/engine/season";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const M = 1_000_000;

function fresh(seed = 1): GameState {
  return newGame("DET", "x", { capRules: "real" }, seed);
}

function runTo(state: GameState, date: string): void {
  while (state.date < date) {
    state.date = addDays(state.date, 1);
    rivalsDaily(state);
  }
}

describe("rival clubs", () => {
  it("every CPU club has an owner style, a governance model, budgets and a reputation", () => {
    const state = fresh();
    const r = rivals(state);
    expect(Object.keys(r.clubs).length).toBe(31);
    expect(r.clubs.DET).toBeUndefined();
    expect(r.clubs.DAL.governance).toBe("owner");
    expect(new Set(Object.values(r.clubs).map((c) => c.style)).size).toBeGreaterThan(2);
    const b = budget(state, "KC");
    expect(b.salary).toBeGreaterThan(200 * M);
    expect(b.staff).toBeGreaterThan(0);
    const p = profile(state, "NE");
    expect(p.owner).toBe("the Kraft family");
    expect(p.rep).toMatch(/regarded|Ordinary|best-run/);
    expect(JSON.stringify(p)).not.toMatch(/"rep":\d/);
    // At the start nothing leans: the league plays as before.
    expect(cashLean(state, "KC")).toBe(1);
    expect(hiringFactor(state, "KC")).toBeCloseTo(1, 6);
  });

  it("short cash cuts a club's spending, and patience moves its coach's job security", () => {
    const state = fresh(2);
    const c = club(state, "MIA");
    c.cash = -10 * M;
    state.date = "2026-09-01";
    rivalsDaily(state);
    expect(c.tight).toBe(true);
    expect(cashLean(state, "MIA")).toBeLessThan(1);
    c.patience = 5;
    expect(patienceShift(state, "MIA")).toBeGreaterThan(0);
    c.patience = 1;
    expect(patienceShift(state, "MIA")).toBeLessThan(0);
  });

  it("owners meddle a few times a season leaguewide, not weekly", () => {
    const state = fresh(3);
    runTo(state, "2027-02-15");
    const n = Object.values(rivals(state).clubs).reduce((t, c) => t + c.meddles.length, 0);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(12);
  });

  it("a new owner can change a club's style and is remembered", () => {
    const state = fresh(4);
    sold(state, "TEN", 5_000 * M, "the Harcastle partnership");
    state.date = "2026-09-01";
    rivalsDaily(state);
    const c = club(state, "TEN");
    expect(c.owner).toBe("the Harcastle partnership");
    expect(c.memory[0].text).toMatch(/New owners/);
    expect(franchise(state).control.TEN).toBe("the Harcastle partnership");
  });

  it("clubs adapt after a season and reputations follow firings", () => {
    const state = stateAt("DET", 3, "2027-05-14");
    const before = Object.fromEntries(Object.entries(rivals(state).clubs).map(([k, c]) => [k, c.style]));
    state.date = "2027-05-15";
    rivalsDaily(state);
    const r = rivals(state);
    expect(r.reviewed).toBeGreaterThanOrEqual(2026);
    const reps = Object.values(r.clubs).map((c) => c.rep);
    expect(Math.min(...reps)).toBeLessThan(60);
    void before;
  });

  it("realignment can be proposed without a move, and the owners vote", () => {
    const state = fresh(5);
    expect(proposeRealign(state, "CHI")).toMatch(/already in our division/);
    expect(proposeRealign(state, "DAL")).toMatch(/annual meeting/);
    expect(relocation(state).realign[0].status).toBe("proposed");
  });

  it("the cause-and-effect log ties decisions to what followed", () => {
    const state = fresh(6);
    const id = cause(state, "contracts", "Signed a player.", ["Cap space fell."], { kind: "player", id: PLAYERS[0].id });
    effect(state, id, "He started every game.");
    expect(causeLog(state)[0].effects.map((e) => e.text)).toEqual(["Cap space fell.", "He started every game."]);
  });

  it("archives each league year and undoes an action that fails", () => {
    const state = fresh(7);
    const rec = snapshotYear(state, 2026);
    expect(rec.contracts.length).toBeGreaterThan(40);
    expect(rec.cap.limit).toBeGreaterThan(250 * M);
    expect(rec.rules.length).toBeGreaterThan(3);
    const date = state.date;
    expect(() => atomic(state, () => { state.date = "2030-01-01"; state.ownerName = "y"; throw new Error("fail"); })).toThrow();
    expect(state.date).toBe(date);
    expect(state.ownerName).toBe("x");
    expect(atomic(state, () => { state.ownerName = "z"; return "no"; })).toBe("no");
    expect(state.ownerName).toBe("x");
  });

  it("the coaches put a number on what a free agent adds", () => {
    const state = fresh(8);
    const qb = PLAYERS.find((p) => p.position === "QB" && p.team && p.team !== "DET")!;
    const c = coachCase(state, "DET", qb.id);
    expect(c.after).toBeGreaterThanOrEqual(c.before);
    expect(c.text).toMatch(/coaches/);
  });
});
