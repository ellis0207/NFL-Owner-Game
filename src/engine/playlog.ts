// The play-by-play: every snap and kick of every game, written down as the
// sim plays it, with a drive chart. Full plays are kept through the week after
// a game; after that only the box score and scoring plays remain (Ellis's
// archive rule), which keeps saves small over many seasons.
//
// The words come from their own random stream (formation names, which side a
// run went), so writing the feed never changes a result.
import { addDays } from "./dates";
import { rngFor, type Rng } from "./rng";
import type { DriveRow, GameLog, GameState, PlayRow } from "./types";

/** Bit flags on a play row. */
export const PLAY_FLAGS = { score: 1, turnover: 2, penalty: 4, review: 8, kick: 16, big: 32 } as const;

/** Full play-by-play is dropped this many days after a game: through the following week's games. */
export const KEEP_DAYS = 9;

type Side = "away" | "home";

/** What the recorder needs to see of the game in progress. */
export interface LiveGame {
  q: number;
  clock: number;
  pos: Side;
  down: number;
  dist: number;
  ydl: number;
  t: Record<Side, { id: string; score: number; box: { top: number } }>;
}

interface OpenDrive {
  o: Side;
  q: number;
  c: number;
  y: number;
  plays: number;
  top: number;
}

/** A yard line as broadcasters say it: "KC 24", "50", "BUF 31". */
export function spotText(ydl: number, offense: string, defense: string): string {
  const y = Math.round(ydl);
  if (y === 50) return "50";
  return y < 50 ? `${offense} ${y}` : `${defense} ${100 - y}`;
}

export function downText(down: number, dist: number, ydl: number): string {
  const nth = ["", "1st", "2nd", "3rd", "4th"][down] ?? `${down}th`;
  return `${nth} & ${ydl + dist >= 100 ? "Goal" : dist}`;
}

export function clockText(q: number, sec: number): string {
  const quarter = q <= 4 ? `Q${q}` : q === 5 ? "OT" : `${q - 4}OT`;
  return `${quarter} ${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
}

export class Recorder {
  flavor: Rng;
  plays: PlayRow[] = [];
  drives: DriveRow[] = [];
  queue: PlayRow[] = [];
  drive: OpenDrive | null = null;
  driveNo = 0;
  inPlay = false;
  pre = { q: 1, c: 900, o: 0 as 0 | 1, dn: 1, ds: 10, y: 25, dr: 0 };
  text = "";
  flags = 0;
  look = "";
  /** How the open drive is ending, set by the play that ends it. */
  why = "";

  constructor(seed: number, gameId: string) {
    this.flavor = rngFor(seed, `pbp:${gameId}`);
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.flavor() * list.length)];
  }

  begin(g: LiveGame): void {
    this.inPlay = true;
    this.pre = { q: g.q, c: Math.max(0, Math.round(g.clock)), o: g.pos === "away" ? 0 : 1, dn: g.down, ds: g.dist, y: g.ydl, dr: this.driveNo };
    this.text = "";
    this.flags = 0;
    this.look = "";
  }

  say(text: string, flags = 0): void {
    this.text = text;
    this.flags |= flags;
  }

  more(text: string, flags = 0): void {
    this.text += text;
    this.flags |= flags;
  }

  end(g: LiveGame): void {
    this.inPlay = false;
    if (this.text) {
      const p = this.pre;
      this.plays.push([p.q, p.c, p.o, p.dn, p.ds, p.y, p.dr, this.text, this.flags, g.t.away.score, g.t.home.score, this.look]);
      if (this.drive && p.dn > 0 && this.drive.o === (p.o === 0 ? "away" : "home")) this.drive.plays++;
    }
    this.plays.push(...this.queue);
    this.queue = [];
  }

  /** A kick: written after the play it follows (a kickoff after a touchdown), or now. */
  kick(g: LiveGame, kicking: Side, text: string, flags = 0): PlayRow {
    const row: PlayRow = [g.q, Math.max(0, Math.round(g.clock)), kicking === "away" ? 0 : 1, 0, 0, 35, this.driveNo, text, flags | PLAY_FLAGS.kick, g.t.away.score, g.t.home.score, ""];
    if (this.inPlay) this.queue.push(row);
    else this.plays.push(row);
    return row;
  }

  openDrive(g: LiveGame, side: Side): void {
    this.closeDrive(g);
    this.driveNo++;
    this.drive = { o: side, q: g.q, c: Math.max(0, Math.round(g.clock)), y: g.ydl, plays: 0, top: g.t[side].box.top };
    this.why = "";
  }

  closeDrive(g: LiveGame, why?: string): void {
    const d = this.drive;
    if (!d) return;
    this.drive = null;
    const how = why ?? (this.why || "End of half");
    // Return touchdowns and onside recoveries that never ran a play aren't drives.
    if (d.plays === 0) return;
    const end = how === "Touchdown" ? 100 : g.ydl;
    this.drives.push([d.o === "away" ? 0 : 1, d.q, d.c, d.y, d.plays, Math.round(end - d.y), Math.round(g.t[d.o].box.top - d.top), how]);
  }

  log(date: string): GameLog {
    return { date, plays: this.plays, drives: this.drives };
  }
}

/** Offensive formation for a snap, from the call and the situation. */
export function formation(rec: Recorder, o: { pass: boolean; playAction: boolean; hurry: boolean; short: boolean; personnel: string; passRate: number; longYardage: boolean }): string {
  const r = rec.flavor();
  if (o.short && !o.pass) return r < 0.85 ? "Under center" : "Pistol";
  if (o.hurry) return "Shotgun";
  if (o.pass && o.longYardage && (o.personnel === "10" || o.personnel === "11") && r < 0.18) return "Empty";
  if (o.playAction) return r < 0.6 ? "Under center" : r < 0.8 ? "Pistol" : "Shotgun";
  const gun = o.pass ? 0.82 : 0.38 + (o.passRate - 0.55);
  if (r < gun) return "Shotgun";
  return r < gun + (1 - gun) * 0.25 ? "Pistol" : "Under center";
}

/** The coverage shell on a pass play. */
export function coverage(rec: Recorder, blitz: boolean, man: boolean, twoHigh: boolean): string {
  if (blitz && man) return rec.flavor() < 0.3 ? "Cover 0 blitz" : "Cover 1 blitz";
  if (man) return twoHigh ? "2-man" : "Cover 1";
  if (blitz) return "Fire zone";
  if (twoHigh) return rec.flavor() < 0.55 ? "Cover 2" : "Cover 4";
  return "Cover 3";
}

/** Keeps full plays only for recent games. */
export function prunePlayLogs(state: GameState): void {
  if (!state.pbp) return;
  for (const [id, log] of Object.entries(state.pbp)) {
    if (addDays(log.date, KEEP_DAYS) < state.date) delete state.pbp[id];
  }
}

/** Drives grouped with their plays, for the feed: each drive's rows in order. */
export function playsByDrive(log: GameLog): { drive: number; rows: PlayRow[] }[] {
  const out: { drive: number; rows: PlayRow[] }[] = [];
  for (const row of log.plays) {
    const last = out.at(-1);
    if (last && last.drive === row[6]) last.rows.push(row);
    else out.push({ drive: row[6], rows: [row] });
  }
  return out;
}
