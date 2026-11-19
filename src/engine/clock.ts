// The hour of the day. The calendar still turns a day at a time (every daily
// system runs when the day ends, at midnight), but inside a day the clock moves
// by the minute: games kick off at their scheduled Eastern time and run about
// three hours, and the league's 4 PM deadlines take effect at 4 PM.
//
// A leaf module: it reads the state and the schedule's times and nothing else.
import type { GameState, LiveGame } from "./types";

export type { LiveGame };

/** Minutes in a day. The clock reaches it at midnight, when the day's business is done. */
export const DAY = 1440;
/** The league's deadlines (roster cutdown, trades, tags, the new league year) fall at 4 PM Eastern. */
export const DEADLINE = 16 * 60;
/** The mark in `state.day.done` once today's 4 PM deadline has passed. */
export const DEADLINE_MARK = "@4pm";

/** "13:00" -> 780 */
export function minuteOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Where the clock stands today. Saves made before the clock ran by the hour stand at midnight. */
export function nowMinute(state: GameState): number {
  return state.clock ?? 0;
}

/** 780 -> "1:00 PM" */
export function clockLabel(minute: number): string {
  const m = ((minute % DAY) + DAY) % DAY;
  const h = Math.floor(m / 60);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Whether a 4 PM deadline on `date` has passed: any later day, or that day once
 * the deadline's business has been done. During that business (the last-minute
 * trades, the tags filed on the final day) it still counts as before.
 */
export function pastDeadline(state: GameState, date: string): boolean {
  if (!date) return false;
  if (state.date !== date) return state.date > date;
  return state.day?.date === date && DEADLINE_MARK in state.day.done;
}

/**
 * How long a game runs on the clock, in minutes: about three hours and five
 * minutes, a little more with lots of plays, twenty more with overtime. Every
 * game is over by midnight, when the day's business is done.
 */
export function gameLength(plays: number, overtime: boolean): number {
  return 170 + Math.round(Math.max(0, plays - 150) * 0.2) + (overtime ? 20 : 0) + 15;
}

/** The live game, if this one is under way now. */
export function liveGame(state: GameState, id: string): LiveGame | undefined {
  return state.live?.[id];
}

/** How many rows of a live game's play log have happened by now; undefined when the game isn't under way. */
export function liveRows(state: GameState, id: string): number | undefined {
  const g = state.live?.[id];
  const log = state.pbp?.[id];
  if (!g || !log) return undefined;
  const now = log.date === state.date ? nowMinute(state) : DAY;
  const share = Math.max(0, Math.min(1, (now - g.kick) / Math.max(1, g.end - g.kick)));
  // The last row is the final whistle: it waits for the end.
  return Math.max(0, Math.min(log.plays.length - 1, Math.floor(share * log.plays.length)));
}
