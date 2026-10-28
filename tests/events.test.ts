import { describe, expect, it } from "vitest";
import { GAMES_BY_DATE, RULES, SCHEDULE } from "../src/engine/league";
import { advanceDay, agenda, calendarItems, eventOutcome, newGame, pendingEvents, playEvent } from "../src/engine/season";

const opener = SCHEDULE.find((g) => g.type === "REG" && (g.home === "DET" || g.away === "DET"))!;

describe("today's events", () => {
  it("waits for the owner to sim our game, and the rest of the league plays when the day ends", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 7);
    while (state.date < opener.date) advanceDay(state);
    const pending = pendingEvents(state);
    expect(pending.map((a) => a.id)).toContain("game");
    expect(state.results[opener.id]).toBeUndefined();

    expect(playEvent(state, "game")).toMatch(/^[WLT] \d+-\d+/);
    expect(state.results[opener.id]).toBeDefined();
    expect(eventOutcome(state, "game")).toBeDefined();
    expect(pendingEvents(state)).toHaveLength(0);
    const others = GAMES_BY_DATE[opener.date].filter((g) => g.id !== opener.id);
    expect(others.every((g) => !state.results[g.id])).toBe(true);

    advanceDay(state);
    expect(others.every((g) => state.results[g.id])).toBe(true);
  });

  it("plays out the same whether the owner runs each event or the staff sims the day", () => {
    const a = newGame("DET", "Owner", { capRules: "real" }, 11);
    const b = newGame("DET", "Owner", { capRules: "real" }, 11);
    let held = 0;
    while (a.date <= opener.date) {
      for (const e of pendingEvents(b)) { playEvent(b, e.id); held++; }
      advanceDay(a);
      advanceDay(b);
    }
    expect(held).toBeGreaterThan(30);
    expect(b.results).toEqual(a.results);
    const injured = (s: typeof a) => Object.entries(s.players).filter(([, p]) => p.injury).map(([id]) => id).sort();
    expect(injured(b)).toEqual(injured(a));
  });

  it("each practice and meeting is its own event", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 3);
    expect(agenda(state).map((a) => a.id)).toContain("meeting:report");
    advanceDay(state);
    const practice = agenda(state).find((a) => a.id === "practice");
    expect(practice?.action).toBe("practice");
    expect(playEvent(state, "practice")).toBeTruthy();
    expect(pendingEvents(state).some((a) => a.id === "practice")).toBe(false);
  });
});

describe("calendar", () => {
  it("lists our games and league deadlines ahead of time", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 3);
    expect(calendarItems(state, opener.date).some((a) => a.kind === "game" && a.gameId === opener.id)).toBe(true);
    expect(calendarItems(state, RULES.keyDates.tradeDeadline).some((a) => a.id === "league:tradeDeadline")).toBe(true);
    expect(calendarItems(state, RULES.keyDates.rosterCutdown).some((a) => a.id === "league:rosterCutdown")).toBe(true);
  });
});
