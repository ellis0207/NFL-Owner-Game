// The field view: where a game stands after any number of plays in its
// play-by-play, for the scoreboard and the field drawing. It only reads a
// finished game's log; nothing here is seen by the sim.
//
// Field positions are yards from the away team's goal line: the away team
// drives from 0 toward 100 and the home team the other way, the same
// convention as the drive chart. The end zones run from -10 to 0 and 100 to 110.
import { PLAY_FLAGS as F } from "./playlog";
import type { GameLog, PlayRow } from "./types";

export interface CastPlay {
  /** The play's row in the log. */
  row: PlayRow;
  /** Where the ball was snapped or kicked from. */
  from: number;
  /** Where it ended up; null when the feed doesn't say (the end of a half). */
  to: number | null;
  /** The result in a word or two, as a broadcast graphic would put it. */
  label: string;
  tone: "score" | "turnover" | "flag" | "";
}

export interface Cast {
  /** Plays shown so far, and how many the game has. */
  at: number;
  total: number;
  final: boolean;
  away: number;
  home: number;
  /** Quarter (5+ is overtime) and seconds left in it. */
  q: number;
  clock: number;
  /** Who has the ball for the next snap; null for a kickoff or once the game is over. */
  poss: 0 | 1 | null;
  /** The next snap: down and distance, 0 when the next thing is a kickoff. */
  down: number;
  dist: number;
  /** Yards from the offense's own goal line. */
  ydl: number;
  /** The ball, the first-down line and where the drive began, as field positions. */
  ball: number | null;
  toGain: number | null;
  driveStart: number | null;
  /** Timeouts left [away, home]; null in logs written before they were recorded. */
  timeouts: [number, number] | null;
  /** The home team's win probability after the last play shown. */
  wp: number | null;
  last: CastPlay | null;
}

/** A spot given from one team's own goal line, as a field position. */
export function fieldX(offense: 0 | 1, ydl: number): number {
  return offense === 0 ? ydl : 100 - ydl;
}

function resultOf(row: PlayRow, next: PlayRow | null, offPts: number, defPts: number): Pick<CastPlay, "to" | "label" | "tone"> {
  const o = row[2];
  const text = row[7];
  if (row[8] & F.note) return { to: null, label: "", tone: "" };
  // Points first: the ball ends up in an end zone or through the uprights.
  if (offPts >= 6) return { to: fieldX(o, 104), label: "Touchdown", tone: "score" };
  if (offPts === 3) return { to: fieldX(o, 110), label: "Field goal", tone: "score" };
  if (defPts >= 6) return { to: fieldX(o, -4), label: "Touchdown", tone: "score" };
  if (defPts === 2) return { to: fieldX(o, -3), label: "Safety", tone: "score" };
  // Otherwise the next snap says where the ball was spotted. A kickoff after
  // a scrimmage play means the half ended, and the feed keeps no spot for it.
  const spotted = next && (next[3] > 0 || row[3] === 0);
  const to = spotted ? fieldX(next[2], next[5]) : null;
  if (row[8] & F.turnover) {
    const label = /INTERCEPT/.test(text) ? "Interception" : /FUMBLE|MUFF/.test(text) ? "Fumble" : "Turnover";
    return { to, label, tone: "turnover" };
  }
  if (/Turnover on downs/.test(text)) return { to, label: "Turnover on downs", tone: "turnover" };
  if (row[3] === 0) return { to, label: /onside/.test(text) ? "Onside kick" : "Kickoff", tone: "" };
  if (/ punts /.test(text)) return { to, label: "Punt", tone: "" };
  if (row[8] & F.penalty) return { to, label: "Flag", tone: "flag" };
  if (next && next[3] > 0 && next[2] === o) {
    if (/ incomplete/.test(text)) return { to, label: "Incomplete", tone: "" };
    if (/ sacked /.test(text)) return { to, label: `Sack · loss of ${Math.abs(Math.round(next[5] - row[5]))}`, tone: "" };
    const gain = Math.round(next[5] - row[5]);
    const yards = gain === 0 ? "No gain" : `${gain > 0 ? "Gain" : "Loss"} of ${Math.abs(gain)}`;
    return { to, label: next[3] === 1 && gain > 0 ? `First down · ${yards.toLowerCase()}` : yards, tone: "" };
  }
  if (next && next[3] > 0 && /field goal/i.test(text)) return { to, label: "No good", tone: "turnover" };
  return { to, label: "", tone: "" };
}

/** The game as it stood after the first `at` rows of its play-by-play. */
export function castAt(log: GameLog, at: number): Cast {
  const rows = log.plays;
  const n = Math.max(0, Math.min(rows.length, Math.floor(at)));
  const lastRow = n > 0 ? rows[n - 1] : null;
  const before = n > 1 ? rows[n - 2] : null;
  // The next thing to happen on the field; lines that aren't plays are skipped.
  let next: PlayRow | null = null;
  for (let i = n; i < rows.length && !next; i++) if (!(rows[i][8] & F.note)) next = rows[i];

  let last: CastPlay | null = null;
  if (lastRow) {
    const o = lastRow[2];
    const was = [before?.[9] ?? 0, before?.[10] ?? 0];
    const now = [lastRow[9], lastRow[10]];
    last = { row: lastRow, from: fieldX(o, lastRow[5]), ...resultOf(lastRow, next, now[o] - was[o], now[1 - o] - was[1 - o]) };
  }

  const snap = next && next[3] > 0 ? next : null;
  let driveStart: number | null = null;
  if (snap) {
    const first = rows.find((p) => p[6] === snap[6] && p[3] > 0 && p[2] === snap[2]);
    if (first) driveStart = fieldX(first[2], first[5]);
  }
  const packed = lastRow ? lastRow[14] : rows[0]?.[14] != null ? 15 : null;
  return {
    at: n,
    total: rows.length,
    final: n >= rows.length,
    away: lastRow?.[9] ?? 0,
    home: lastRow?.[10] ?? 0,
    q: next?.[0] ?? lastRow?.[0] ?? 1,
    // A kickoff is written down after it lands, so one that opens a half shows the full quarter.
    clock: !next ? 0 : next[3] === 0 && next[0] <= 4 && lastRow?.[0] !== next[0] ? 900 : next[1],
    poss: snap ? snap[2] : null,
    down: snap?.[3] ?? 0,
    dist: snap?.[4] ?? 0,
    ydl: snap?.[5] ?? 0,
    ball: next ? fieldX(next[2], next[5]) : last?.to ?? null,
    toGain: snap && snap[5] + snap[4] < 100 ? fieldX(snap[2], snap[5] + snap[4]) : null,
    driveStart,
    timeouts: packed == null ? null : [packed >> 2, packed & 3],
    wp: lastRow?.[13] ?? null,
    last,
  };
}

/** The row count that finishes the drive in progress: the next "Next drive" stop. */
export function nextDriveStop(log: GameLog, at: number): number {
  const rows = log.plays;
  if (at >= rows.length) return rows.length;
  const d = rows[at][6];
  let i = at;
  while (i < rows.length && rows[i][6] === d) i++;
  return Math.max(i, at + 1);
}

/** The row count at the end of the quarter in progress. */
export function nextQuarterStop(log: GameLog, at: number): number {
  const rows = log.plays;
  if (at >= rows.length) return rows.length;
  const q = rows[at][0];
  let i = at;
  while (i < rows.length && rows[i][0] === q) i++;
  return Math.max(i, at + 1);
}
