// The field view: where a game stands after any number of plays in its
// play-by-play, for the scoreboard and the field drawing. It only reads a
// finished game's log; nothing here is seen by the sim.
//
// Field positions are yards from the away team's goal line: the away team
// drives from 0 toward 100 and the home team the other way, the same
// convention as the drive chart. The end zones run from -10 to 0 and 100 to 110.
import { PLAYER_BY_ID } from "./league";
import { PLAY_FLAGS as F, TEAM_BOX_KEYS } from "./playlog";
import { STAT_INDEX, STAT_KEYS, STAT_LONGS, type StatKey } from "./stats";
import type { GameLog, PlayRow, TeamBox } from "./types";

export interface CastPlay {
  /** The play's row in the log. */
  row: PlayRow;
  /** Where the ball was snapped or kicked from. */
  from: number;
  /** Where it ended up; null when the feed doesn't say (the end of a half). */
  to: number | null;
  /** The result in a word or two, as a broadcast graphic would put it. */
  label: string;
  tone: "score" | "turnover" | "flag" | "story" | "";
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
  if (row[8] & F.story) return { to: null, label: "Alert", tone: "story" };
  if (row[8] & F.note) return { to: null, label: /^Timeout/.test(text) ? "Timeout" : "", tone: "" };
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
  if (row[8] & F.penalty) return { to, label: row[11] === "Play called back" ? "Called back" : "Flag", tone: "flag" };
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

/** The box score as it stood partway through a game. */
export interface RunningBox {
  quarters: { away: number[]; home: number[] };
  team: { away: TeamBox; home: TeamBox };
  /** Stat lines in STAT_KEYS order, like a finished box score's. */
  players: { away: Record<string, number[]>; home: Record<string, number[]> };
}

const SIDES = ["away", "home"] as const;
const DEF_FROM = STAT_INDEX.tklSolo, DEF_TO = STAT_INDEX.defTd;

function emptyBox(): RunningBox {
  const team = () => Object.fromEntries(TEAM_BOX_KEYS.map((k) => [k, 0])) as unknown as TeamBox;
  return { quarters: { away: [0, 0, 0, 0], home: [0, 0, 0, 0] }, team: { away: team(), home: team() }, players: { away: {}, home: {} } };
}

/** Adds one row's changes to a running box score. Returns the players it touched as [side, id] pairs. */
function applyRow(box: RunningBox, log: GameLog, i: number): [0 | 1, string][] {
  const row = log.plays[i];
  const was = i > 0 ? log.plays[i - 1] : null;
  const period = Math.min(row[0], 5) - 1;
  const pts = [row[9] - (was?.[9] ?? 0), row[10] - (was?.[10] ?? 0)];
  for (const s of [0, 1] as const) {
    const gained = pts[s];
    const q = box.quarters[SIDES[s]];
    while (q.length <= period) q.push(0);
    q[period] += gained;
  }
  const touched: [0 | 1, string][] = [];
  const d = log.box?.[i];
  if (!d || !log.ids) return touched;
  const [team, players] = d;
  for (let j = 0; j < team.length; j += 3) {
    const t = box.team[SIDES[team[j]]];
    const k = TEAM_BOX_KEYS[team[j + 1]];
    t[k] = Math.round((t[k] + team[j + 2]) * 10) / 10;
  }
  for (let j = 0; j < players.length; j += 4) {
    const s = players[j] as 0 | 1;
    const id = log.ids[s][players[j + 1]];
    const k = players[j + 2];
    const line = (box.players[SIDES[s]][id] ??= STAT_KEYS.map(() => 0));
    line[k] = STAT_LONGS.has(k) ? Math.max(line[k], players[j + 3]) : line[k] + players[j + 3];
    // Snap counts aren't kept play by play; mark a defender as having played so his line shows.
    if (k >= DEF_FROM && k <= DEF_TO) line[STAT_INDEX.defSnaps] = 1;
    touched.push([s, id]);
  }
  return touched;
}

/** The box score after the first `at` rows, or null for a log written before it was kept row by row. */
export function boxAt(log: GameLog, at: number): RunningBox | null {
  if (!log.box || !log.ids) return null;
  const box = emptyBox();
  const n = Math.max(0, Math.min(log.plays.length, Math.floor(at)));
  for (let i = 0; i < n; i++) applyRow(box, log, i);
  return box;
}

const ORDINAL = ["", "first", "second", "third", "fourth"];

/** Individual marks worth a line when a player reaches them. */
const MARKS: { key: StatKey; at: number[]; say: (name: string, n: number) => string }[] = [
  { key: "passYds", at: [300, 400, 500], say: (p, n) => `${p} is over ${n} yards passing.` },
  { key: "passTd", at: [3, 4, 5, 6], say: (p, n) => `${p} has thrown ${n} touchdown passes.` },
  { key: "int", at: [2, 3, 4], say: (p, n) => `${p} has thrown ${n} interceptions.` },
  { key: "rushYds", at: [100, 150, 200], say: (p, n) => `${p} is over ${n} yards rushing.` },
  { key: "rushTd", at: [2, 3, 4], say: (p, n) => `${p} has run for ${n} touchdowns.` },
  { key: "recYds", at: [100, 150, 200], say: (p, n) => `${p} is over ${n} yards receiving.` },
  { key: "recTd", at: [2, 3, 4], say: (p, n) => `${p} has caught ${n} touchdown passes.` },
  { key: "sacks", at: [2, 3, 4], say: (p, n) => `${p} has ${n} sacks.` },
  { key: "defInt", at: [2, 3], say: (p, n) => `${p} has intercepted ${n} passes.` },
];

/**
 * Storylines read off the play-by-play: for each row, the lines worth saying
 * once it has happened. Lead changes, runs of unanswered points, turnovers
 * piling up, individual marks and the ends of quarters. `teams` is [away, home].
 */
export function storylines(log: GameLog, teams: [string, string]): string[][] {
  const rows = log.plays;
  const out: string[][] = rows.map(() => []);
  const box = emptyBox();
  const before: Record<string, number[]> = {};
  let run = null as { side: 0 | 1; pts: number; said: number } | null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const was = [i > 0 ? rows[i - 1][9] : 0, i > 0 ? rows[i - 1][10] : 0];
    const now = [row[9], row[10]];
    const giveaways = [box.team.away.turnovers, box.team.home.turnovers];
    const touched = applyRow(box, log, i);
    const say = (text: string) => out[i].push(text);

    // The score: a new leader, a tie, a run of unanswered points.
    for (const s of [0, 1] as const) {
      const pts = now[s] - was[s];
      if (pts <= 0) continue;
      const lead = now[s] - now[1 - s], led = was[s] - was[1 - s];
      if (lead > 0 && led <= 0 && was[0] + was[1] > 0) say(`${teams[s]} takes the lead, ${now[s]}-${now[1 - s]}.`);
      else if (lead === 0) say(`Tied at ${now[s]}.`);
      if (run?.side === s) run.pts += pts;
      else run = { side: s, pts, said: 0 };
      if (run.pts >= 14 && run.pts - run.said >= 7 && now[1 - s] > 0) {
        say(`${teams[s]} has scored ${run.pts} straight points.`);
        run.said = run.pts;
      }
    }
    for (const s of [0, 1] as const) {
      const n = box.team[SIDES[s]].turnovers;
      if (n > giveaways[s] && n >= 3) say(`${teams[s]} has turned the ball over ${n} times.`);
    }
    // Individual marks, checked for the players this row touched.
    for (const [s, id] of touched) {
      const line = box.players[SIDES[s]][id];
      const old = (before[id] ??= STAT_KEYS.map(() => 0));
      for (const m of MARKS) {
        const k = STAT_INDEX[m.key];
        const hit = m.at.filter((n) => old[k] < n && line[k] >= n).at(-1);
        if (hit) say(m.say(PLAYER_BY_ID[id]?.name ?? "A player", hit));
        old[k] = line[k];
      }
    }
    // The end of a period.
    const next = rows[i + 1];
    if (next && next[0] !== row[0]) {
      say(row[0] === 2 ? `Halftime: ${teams[0]} ${now[0]}, ${teams[1]} ${now[1]}.`
        : row[0] === 4 ? `End of regulation, tied at ${now[0]}. Overtime.`
        : row[0] < 4 ? `End of the ${ORDINAL[row[0]]} quarter.` : "End of the overtime period.");
    }
  }
  return out;
}
