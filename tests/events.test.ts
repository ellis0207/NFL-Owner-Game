import { describe, expect, it } from "vitest";
import { GAME_BY_ID, GAMES_BY_DATE, RULES, SCHEDULE } from "../src/engine/league";
import { liveRows, minuteOf } from "../src/engine/clock";
import { tradeWindow } from "../src/engine/trades";
import { advanceDay, advanceHours, advanceTo, agenda, calendarItems, eventOutcome, newGame, pendingEvents, playEvent, simToNextGame } from "../src/engine/season";
import { stateAt } from "./fixtures";
import { clearStaffCaches } from "../src/engine/staff";

const opener = SCHEDULE.find((g) => g.type === "REG" && (g.home === "DET" || g.away === "DET"))!;

describe("today's events", () => {
  it("kicks our game off at its time, shows it live, and books it at the final whistle", () => {
    const state = stateAt("DET", 7, opener.date);
    const pending = pendingEvents(state);
    expect(pending.map((a) => a.id)).toContain("game");
    expect(state.results[opener.id]).toBeUndefined();

    // Going to kickoff runs the clock to the scheduled time: the game is under way, nothing is booked yet.
    expect(playEvent(state, "game")).toBe("Under way.");
    expect(state.clock).toBe(minuteOf(opener.timeET));
    expect(state.live?.[opener.id]).toBeDefined();
    expect(liveRows(state, opener.id)).toBe(0);
    expect(state.results[opener.id]).toBeUndefined();
    expect(pendingEvents(state)).toHaveLength(0);

    // An hour in, part of it has been played.
    advanceHours(state, 1);
    const rows = liveRows(state, opener.id)!;
    expect(rows).toBeGreaterThan(20);
    expect(rows).toBeLessThan(state.pbp![opener.id].plays.length);

    // Games that kick off later haven't started.
    const later = GAMES_BY_DATE[opener.date].filter((g) => minuteOf(g.timeET) > state.clock!);
    expect(later.every((g) => !state.live?.[g.id] && !state.results[g.id])).toBe(true);

    advanceHours(state, 3);
    expect(state.results[opener.id]).toBeDefined();
    expect(eventOutcome(state, "game")).toMatch(/^[WLT] \d+-\d+/);

    advanceDay(state);
    expect(GAMES_BY_DATE[opener.date].every((g) => state.results[g.id])).toBe(true);
    expect(state.live).toBeUndefined();
  });

  it("plays out the same whether the owner runs each event or the staff sims the day", () => {
    // One game at a time: the staff caches live at module level, so two saves played side by side in one
    // process would read each other's scheme fits (a real session only ever holds one).
    clearStaffCaches();
    const a = newGame("DET", "Owner", { capRules: "real" }, 11);
    while (a.date <= opener.date) advanceDay(a);
    clearStaffCaches();
    const b = newGame("DET", "Owner", { capRules: "real" }, 11);
    let held = 0;
    while (b.date <= opener.date) {
      for (const e of pendingEvents(b)) { playEvent(b, e.id); held++; }
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

describe("next game", () => {
  it("stops at our kickoff, with the game under way", () => {
    const s = newGame("DET", "Owner", { capRules: "real" }, 5);
    simToNextGame(s);
    const g = GAME_BY_ID[Object.keys(s.live ?? {}).find((id) => id.includes("DET"))!];
    expect(g).toBeDefined();
    expect(s.clock).toBe(minuteOf(g.timeET));
    expect(s.results[g.id]).toBeUndefined();
    // Pressing it again moves on to the next one.
    const day = s.date;
    simToNextGame(s);
    expect(s.date > day).toBe(true);
    expect(s.results[g.id]).toBeDefined();
  }, 120_000);
});

describe("deadlines at 4 PM", () => {
  it("the trade window shuts at 4 PM on deadline day", () => {
    const s = stateAt("DET", 7, RULES.keyDates.tradeDeadline);
    advanceTo(s, 15 * 60 + 59);
    expect(tradeWindow(s).open).toBe(true);
    advanceTo(s, 16 * 60);
    expect(tradeWindow(s).open).toBe(false);
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
