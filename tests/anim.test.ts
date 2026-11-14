import { readFileSync, statSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { SCHEDULE } from "../src/engine/league";
import { PLAY_FLAGS as F } from "../src/engine/playlog";
import { newGame } from "../src/engine/season";
import { simulateGame } from "../src/engine/sim";
import type { GameLog } from "../src/engine/types";
import { ACT, type PlayBook, type Track } from "../src/ui/anim/book";
import { buildTrack } from "../src/ui/anim/build";
import { readCall } from "../src/ui/anim/read";
import { animReport, topSpeed, type AnimReport } from "./anim-report";

const book = JSON.parse(readFileSync("assets/anim/plays.json", "utf8")) as PlayBook;
const index = JSON.parse(readFileSync("assets/anim/sprites.json", "utf8"));

let log: GameLog, players: never, report: AnimReport;
beforeAll(() => {
  const s = newGame("DET", "Owner", { capRules: "real" } as never, 7);
  const g = SCHEDULE.filter((x) => x.type === "REG")[0];
  const out = simulateGame(s, g, g.away, g.home);
  log = out.log; players = out.box.players as never;
  report = animReport(6, 11);
});

/** The first row whose words match, built as a play. */
const play = (re: RegExp): { n: number; t: Track } => {
  const n = log.plays.findIndex((p) => re.test(p[7]) && !(p[8] & F.note));
  expect(n).toBeGreaterThanOrEqual(0);
  return { n, t: buildTrack(book, log, n, players)! };
};
const last = (t: Track) => t.pos[0].length / 2 - 1;

describe("animation art", () => {
  it("stays inside its size budget and holds every piece a play needs", () => {
    const bytes = ["skill.webp", "line.webp", "plays.json", "sprites.json"].reduce((n, f) => n + statSync(`assets/anim/${f}`).size, 0);
    expect(bytes).toBeLessThan(2_000_000);
    for (const a of ["idle", "run", "carry", "dive", "down", "set", "block", "throw", "catch", "kick", "cheer", "kneel"]) expect(index.actions[a]).toBeTruthy();
    for (const word of ["Under center", "Pistol", "Shotgun", "Empty"]) {
      for (const personnel of ["10", "11", "12", "13", "21"]) {
        const spots = book.formations[word][personnel];
        expect(spots.OL).toHaveLength(5);
        expect(spots.QB).toHaveLength(1);
      }
    }
    for (const r of ["flat", "hitch", "slant", "out", "curl", "dig", "cross", "post", "corner", "go", "seam"]) expect(book.routes[r].length).toBeGreaterThan(20);
    expect(book.runs.length).toBeGreaterThanOrEqual(9);
  });
});

describe("the log's lineups", () => {
  it("names eleven men a side on every snap", () => {
    let snaps = 0;
    log.plays.forEach((row, n) => {
      if (!row[15]) return;
      snaps++;
      const call = readCall(log, n)!;
      expect(call.off!.flat()).toHaveLength(11);
      expect(call.def!.flat()).toHaveLength(11);
      expect(new Set([...call.off!.flat(), ...call.def!.flat()]).size).toBe(22);
    });
    expect(snaps).toBeGreaterThan(100);
  });
});

describe("acting out the play-by-play", () => {
  it("builds nearly every play, with nobody faster than a man can run and the ball ending on the spot", () => {
    expect(report.errors).toEqual([]);
    expect(report.off).toEqual([]);
    const missed = Object.values(report.fallback).reduce((a, b) => a + b, 0);
    expect(missed / report.plays).toBeLessThan(0.02);
    expect(report.fast.length / report.built).toBeLessThan(0.005);
    for (const kind of ["run", "pass", "kick", "kickoff", "flag"]) expect(report.kinds[kind]).toBeGreaterThan(0);
  });

  it("puts 22 men on the field and is the same every time", () => {
    const { n, t } = play(/ runs (up the middle|off|around|wide)/);
    expect(t.pos).toHaveLength(22);
    expect(t.team.filter((x) => x === 0)).toHaveLength(11);
    const again = buildTrack(book, log, n, players)!;
    expect(Array.from(again.pos[6])).toEqual(Array.from(t.pos[6]));
    expect(Array.from(again.ball)).toEqual(Array.from(t.ball));
  });

  it("has the named receiver catch a completed pass and carry it on", () => {
    const { n, t } = play(/ pass (short|deep) (left|right|middle) to .* for \d+ yards? \(/);
    const call = readCall(log, n)!;
    const target = t.slot.findIndex((s) => s?.id === call.ids.target);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(t.holder[last(t)]).toBe(target);
    expect(t.act[target]).toContain(ACT.catch);
    expect(t.act.some((a) => a.includes(ACT.throw))).toBe(true);
    // The ball left the passer's hand and flew.
    expect(Array.from(t.holder)).toContain(-1);
    expect(topSpeed(t)).toBeLessThan(11);
  });

  it("leaves an incomplete pass on the ground", () => {
    const { t } = play(/ pass .*incomplete/);
    expect(t.holder[last(t)]).toBe(-1);
    expect(t.ball[last(t) * 3 + 2]).toBeLessThan(0.5);
  });

  it("brings the quarterback down behind the line on a sack", () => {
    const { n, t } = play(/ sacked by /);
    const dir = t.dir, los = log.plays[n][2] === 0 ? log.plays[n][5] : 100 - log.plays[n][5];
    expect((t.ball[last(t) * 3] - los) * dir).toBeLessThan(0);
    expect(t.act.filter((a) => a[last(t)] === ACT.fall)).toHaveLength(2);
  });

  it("kicks: a made field goal clears the goal line, a kickoff travels, a punt is kicked", () => {
    const fg = play(/field goal is GOOD/).t;
    const x = fg.ball[last(fg) * 3];
    expect(x < 0 || x > 100).toBe(true);
    expect(fg.act.some((a) => a.includes(ACT.kick))).toBe(true);
    const ko = play(/kicks off/).t;
    expect(ko.pos).toHaveLength(22);
    expect(ko.span[1] - ko.span[0]).toBeGreaterThan(40);
    expect(play(/ punts /).t.act.some((a) => a.includes(ACT.kick))).toBe(true);
  });

  it("drops a flag on a penalty before the snap", () => {
    const { t } = play(/^Penalty on \w+: (False start|Encroachment|Defensive offside|Neutral zone infraction)/);
    expect(t.flag).not.toBeNull();
    expect(t.pos).toHaveLength(22);
  });

  it("still plays logs kept before lineups were written down", () => {
    const old: GameLog = { ...log, plays: log.plays.map((p) => p.slice(0, 15) as never) };
    delete old.who;
    let built = 0;
    old.plays.forEach((row, n) => {
      if (row[8] & F.note) return;
      const t = buildTrack(book, old, n, players);
      if (t) { built++; for (const p of t.pos) expect(Number.isFinite(p[p.length - 1])).toBe(true); }
    });
    expect(built).toBeGreaterThan(120);
  });
});
