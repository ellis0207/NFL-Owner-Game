import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAY_FLAGS as F } from "../src/engine/playlog";
import { STAT_INDEX } from "../src/engine/stats";
import type { GameLog, PlayRow } from "../src/engine/types";
import { formationOf, lineUp, runCall, runTrack, type PlayBook, type RunCall } from "../src/ui/anim/stage";

const book = JSON.parse(readFileSync("assets/anim/plays.json", "utf8")) as PlayBook;
const index = JSON.parse(readFileSync("assets/anim/sprites.json", "utf8"));
const call = (o: Partial<RunCall> = {}): RunCall => ({ where: "tackle", right: false, formation: "Shotgun", carrier: null, tackler: null, score: false, ...o });
const row = (text: string, flags = 0, down = 1, look = "Shotgun · Cover 3"): PlayRow => [1, 800, 0, down, 10, 30, 1, text, flags, 0, 0, look];
const endOf = (t: ReturnType<typeof runTrack>, r: number) => { const f = Math.round(t.end * t.rate); return [t.pos[r][f * 2], t.pos[r][f * 2 + 1]]; };

describe("animation art", () => {
  it("stays inside its size budget and holds every piece a play needs", () => {
    const bytes = ["skill.webp", "line.webp", "plays.json", "sprites.json"].reduce((n, f) => n + statSync(`assets/anim/${f}`).size, 0);
    expect(bytes).toBeLessThan(2_000_000);
    for (const a of ["idle", "run", "carry", "dive", "down"]) expect(index.actions[a]).toBeTruthy();
    expect(book.offense).toHaveLength(11);
    expect(book.defense).toHaveLength(11);
    for (const p of book.plays) {
      for (const r of [...book.offense, ...book.defense]) expect(p.paths[r].length).toBeGreaterThan(40);
      expect(book.offense).toContain(p.carrier);
    }
    for (const body of Object.values(book.bodies)) expect(index.bodies).toContain(body);
  });
});

describe("acting out a run", () => {
  it("ends the carrier exactly where the play ended, with a tackler on him", () => {
    for (const formation of ["Under center", "Pistol", "Shotgun"]) {
      for (const where of ["middle", "tackle", "end"] as const) {
        for (const gain of [-4, -1, 0, 2, 7, 23, 61]) {
          const t = runTrack(book, call({ formation, where }), 30, 1, gain);
          const [cx, cy] = endOf(t, t.carrier);
          expect(cx).toBeCloseTo(30 + gain, 0);
          expect(t.tackler).toBeGreaterThanOrEqual(t.offense);
          const [tx, ty] = endOf(t, t.tackler);
          expect(Math.hypot(tx - cx, ty - cy)).toBeLessThan(1);
          expect(t.dur).toBeGreaterThan(t.end);
          expect(t.dur).toBeLessThan(14);
          for (const p of t.pos) for (const v of p) expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });

  it("keeps players at a human pace", () => {
   for (const where of ["middle", "tackle", "end"] as const) for (const gain of [3, 35]) {
    const t = runTrack(book, call({ where }), 20, 1, gain);
    for (let r = 0; r < t.roles.length; r++) {
      for (let f = 1; f < t.pos[r].length / 2; f++) {
        const yards = Math.hypot(t.pos[r][f * 2] - t.pos[r][f * 2 - 2], t.pos[r][f * 2 + 1] - t.pos[r][f * 2 - 1]);
        expect(yards * t.rate).toBeLessThan(11.5);
      }
    }
   }
  });

  it("runs a touchdown through the goal line with no tackle", () => {
    const t = runTrack(book, call({ score: true }), 92, 1, 8);
    expect(t.tackler).toBe(-1);
    const last = t.pos[t.carrier].length / 2 - 1;
    expect(t.pos[t.carrier][last * 2]).toBeGreaterThan(100.5);
  });

  it("turns around for the home team and mirrors plays to the right", () => {
    const left = runTrack(book, call({ where: "end" }), 50, 1, 6), right = runTrack(book, call({ where: "end", right: true }), 50, 1, 6);
    const home = runTrack(book, call({ where: "end" }), 50, -1, 6);
    expect(endOf(left, left.carrier)[1]).toBeGreaterThan(3);
    expect(endOf(right, right.carrier)[1]).toBeCloseTo(-endOf(left, left.carrier)[1], 3);
    expect(endOf(home, home.carrier)[0]).toBeCloseTo(44, 0);
    expect(endOf(home, home.carrier)[1]).toBeCloseTo(-endOf(left, left.carrier)[1], 3);
  });

  it("lines both teams up on their own sides of the ball", () => {
    const s = lineUp(book, "Pistol", 40, -1);
    s.spots.forEach(([x], r) => (r < s.offense ? expect(x).toBeGreaterThan(40) : expect(x).toBeLessThan(40)));
  });
});

describe("reading the feed", () => {
  const log = (rows: PlayRow[], box?: GameLog["box"]): GameLog => ({ date: "2026-09-13", plays: rows, drives: [], ids: [["a1", "a2"], ["h1"]], box });

  it("finds the side, the carrier and the tackler of a handoff", () => {
    const quads = [0, 1, STAT_INDEX.car, 1, 0, 1, STAT_INDEX.rushYds, 6, 1, 0, STAT_INDEX.tklSolo, 1];
    const c = runCall(log([row("J. Back runs around right end for 6 yards (T. Ackler).")], [[[], quads]]), 0)!;
    expect(c).toMatchObject({ where: "end", right: true, formation: "Shotgun", carrier: "a2", tackler: "h1", score: false });
    expect(runCall(log([row("J. Back runs off left tackle for 2 yards.", 0, 2, "Under center")]), 0)).toMatchObject({ where: "tackle", right: false, formation: "Under center" });
    expect(runCall(log([row("J. Back runs up the middle for 3 yards.")]), 0)!.where).toBe("middle");
  });

  it("leaves passes, kicks, fumbles and plays wiped out by a flag to the arrow", () => {
    expect(runCall(log([row("Q. Back pass short left to W. Out for 8 yards.")]), 0)).toBeNull();
    expect(runCall(log([row("J. Back runs up the middle for 3 yards. J. Back FUMBLES.", F.turnover)]), 0)).toBeNull();
    expect(runCall(log([row("J. Back runs up the middle. Holding. The play doesn't count.", F.penalty)]), 0)).toBeNull();
    expect(runCall(log([row("P. Unter punts 44 yards.", F.kick, 0)]), 0)).toBeNull();
    expect(formationOf("Empty · Cover 1")).toBe("Shotgun");
  });
});
