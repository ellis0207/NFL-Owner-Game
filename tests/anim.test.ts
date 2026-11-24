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
import { plan } from "../src/ui/anim/Players3D";
import { animReport, topSpeed, type AnimReport } from "./anim-report";

const book = JSON.parse(readFileSync("assets/anim/plays.json", "utf8")) as PlayBook;
const index = JSON.parse(readFileSync("assets/anim/sprites.json", "utf8"));

let log: GameLog, players: never, report: AnimReport;
beforeAll(() => {
  const s = newGame("DET", "Owner", { capRules: "real" } as never, 7);
  // The first game of the season that has a sack in it (nearly every game does).
  let out = null as unknown as ReturnType<typeof simulateGame>;
  for (const g of SCHEDULE.filter((x) => x.type === "REG").slice(0, 6)) {
    out = simulateGame(s, g, g.away, g.home);
    if (out.log.plays.some((p) => / sacked by /.test(p[7]))) break;
  }
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
    for (const kind of ["run", "pass", "kick", "kickoff", "flag", "extra point"]) expect(report.kinds[kind]).toBeGreaterThan(0);
  });

  it("puts 22 men on the field and is the same every time", () => {
    const { n, t } = play(/ runs (up the middle|off|around|wide)/);
    // Twenty-two players and the seven officials.
    expect(t.team.filter((x) => x !== 2)).toHaveLength(22);
    expect(t.team.filter((x) => x === 2)).toHaveLength(7);
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

  it("has the right side fall on an onside kick thirteen yards from the tee", () => {
    const n = log.plays.findIndex((p) => /kicks off/.test(p[7]));
    for (const kept of [true, false]) {
      const plays = log.plays.slice(0, n + 1).map((p) => [...p]) as GameLog["plays"];
      plays[n][7] = `Joe Kicker onside kick, recovered by ${kept ? "AAA!" : "BBB."}`;
      const t = buildTrack(book, { ...log, plays }, n, players)!;
      expect(t.pos).toHaveLength(22);
      const end = last(t), who = t.holder[end];
      expect(t.team[who]).toBe(kept ? 0 : 1);
      expect(Math.abs(t.ball[end * 3] - t.ball[0])).toBeCloseTo(13, 0);
      expect(t.act[who][end]).toBe(ACT.fall);
      expect(t.caption?.[1]).toMatch(kept ? /AAA recovers/ : /BBB recovers/);
      expect(topSpeed(t)).toBeLessThan(10.8);
    }
  });

  it("blocks a punt behind the line and gives the ball to the defense", () => {
    const n = log.plays.findIndex((p) => / punts /.test(p[7]));
    const plays = log.plays.slice(0, n + 1).map((p) => [...p]) as GameLog["plays"];
    plays[n][7] = "Joe Punter punt is BLOCKED; BBB recovers.";
    plays[n][8] = F.kick | F.turnover | F.big;
    const t = buildTrack(book, { ...log, plays }, n, players)!;
    const end = last(t), who = t.holder[end];
    expect(t.team[who]).toBe(1);
    // The ball never gets past the line of scrimmage and ends eight yards behind it.
    let far = 0;
    for (let f = 0; f <= end; f++) far = Math.max(far, (t.ball[f * 3] - t.ball[0]) * t.dir);
    expect(far).toBeLessThan(1);
    expect((t.ball[end * 3] - t.ball[0]) * t.dir).toBeCloseTo(-8, 0);
    expect(t.caption?.[1]).toMatch(/Punt blocked/);
    expect(topSpeed(t)).toBeLessThan(10.8);
  });

  it("blocks a field goal and an extra point at the line", () => {
    const n = log.plays.findIndex((p) => /field goal is GOOD/.test(p[7]));
    const plays = log.plays.slice(0, n + 1).map((p) => [...p]) as GameLog["plays"];
    plays[n][7] = "Joe Kicker 40-yard field goal is BLOCKED; BBB recovers.";
    plays[n][8] = F.kick | F.big;
    const t = buildTrack(book, { ...log, plays }, n, players)!;
    const end = last(t);
    expect(t.team[t.holder[end]]).toBe(1);
    let far = 0;
    for (let f = 0; f <= end; f++) far = Math.max(far, (t.ball[f * 3] - t.ball[0]) * t.dir);
    expect(far).toBeLessThan(1.5);
    expect(t.caption?.[1]).toMatch(/Field goal blocked: BBB recovers/);
    expect(topSpeed(t)).toBeLessThan(10.8);
    // The same on a try: the touchdown row says the kick was blocked.
    const td = log.plays.findIndex((p, i) => /TOUCHDOWN\.$/.test(p[7]) && p[3] > 0 && !(p[8] & F.turnover) && readCall(log, i)?.try?.good);
    const rows = log.plays.map((p) => [...p]) as GameLog["plays"];
    rows[td][7] += " Joe Kicker's extra point is BLOCKED.";
    const tr = buildTrack(book, { ...log, plays: rows }, td, players)!.then!;
    expect(tr.caption?.[1]).toBe("Extra point is blocked");
    const x = tr.ball[last(tr) * 3];
    expect(x > 0 && x < 100).toBe(true);
  });

  it("follows every touchdown with its try at the goal that was scored on", () => {
    let kicks = 0;
    log.plays.forEach((row, n) => {
      if (!/TOUCHDOWN/.test(row[7]) || row[11] === "Play called back") return;
      const t = buildTrack(book, log, n, players)!;
      const call = readCall(log, n)!;
      const next = log.plays.slice(n + 1).find((p) => p[3] === 0);
      if (!call.try) { expect(next).toBeUndefined(); return; }
      const tr = t.then!;
      // The club that scored kicks off next, so it is the one lined up for the try.
      if (next) expect(call.try.side).toBe(next[2]);
      const goal = call.try.side === 0 ? 100 : 0;
      expect(Math.abs(tr.ball[0] - goal)).toBeLessThan(16);
      expect(tr.caption?.[1]).toMatch(call.try.good ? /is good$/ : /no good$|fails$/);
      if (!call.try.two) {
        kicks++;
        const x = tr.ball[last(tr) * 3];
        expect(x < 0 || x > 100).toBe(true);
        expect(tr.act.some((a) => a.includes(ACT.kick))).toBe(true);
      }
    });
    expect(kicks).toBeGreaterThan(0);
  });

  it("drops a flag on a penalty before the snap", () => {
    const { t } = play(/^Penalty on \w+: (False start|Encroachment|Defensive offside|Neutral zone infraction)/);
    expect(t.flag).not.toBeNull();
    expect(t.pos).toHaveLength(29);
  });

  it("steps a penalty off to the next snap's spot behind an official, with the call shown", () => {
    for (const re of [/^Penalty on \w+: False start/, /but there is a flag down and it comes back/]) {
      const { n, t } = play(re);
      const next = log.plays[n + 1];
      const spot = next[2] === 0 ? next[5] : 100 - next[5];
      expect(Math.abs(t.ball[last(t) * 3] - spot)).toBeLessThan(1.5);
      expect(t.team.filter((x) => x === 2)).toHaveLength(7);
      expect(t.caption?.[1]).toMatch(/\d+ yards/);
      // The official carried it there.
      expect(Array.from(t.holder)).toContain(t.team.indexOf(2));
    }
  });

  it("has the recovering side fall on a fumble where the play ended", () => {
    // Fumbles are rare; look through the report's games' worth of rows in a few more games.
    const s = newGame("DET", "Owner", { capRules: "real" } as never, 7);
    let seen = 0;
    for (const g of SCHEDULE.filter((x) => x.type === "REG").slice(0, 24)) {
      const out = simulateGame(s, g, g.away, g.home);
      out.log.plays.forEach((row, n) => {
        if (!/FUMBLES, forced/.test(row[7]) || !(row[8] & F.turnover)) return;
        const t = buildTrack(book, out.log, n, out.box.players as never)!;
        const end = t.pos[0].length / 2 - 1;
        const who = t.holder[end];
        expect(who).toBeGreaterThanOrEqual(0);
        expect(t.team[who]).toBe(1);
        expect(t.act[who][end]).toBe(ACT.fall);
        // The ball was loose on the way.
        expect(Array.from(t.holder.slice(Math.max(0, end - 40), end))).toContain(-1);
        seen++;
      });
    }
    expect(seen).toBeGreaterThan(3);
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

/** The moves in the 3D player model (assets/anim/player3d.json, glTF). */
function glbMoves(): string[] {
  return (JSON.parse(readFileSync("assets/anim/player3d.json", "utf8")).animations as { name: string }[]).map((a) => a.name);
}

describe("the choreography around a play", () => {
  it("snaps the ball, hands it off and has the officials take their places", () => {
    const { t } = play(/ runs (up the middle|off|around|wide)/);
    expect(t.act.some((a) => a.includes(ACT.snap))).toBe(true);
    expect(t.act.some((a) => a.includes(ACT.handoff))).toBe(true);
    expect(t.act.some((a) => a.includes(ACT.take))).toBe(true);
    // The umpire stands behind the linebackers, the referee behind the quarterback.
    const refs = t.team.map((x, i) => (x === 2 ? i : -1)).filter((i) => i >= 0);
    const depth = refs.map((i) => (t.pos[i][0] - t.ball[0]) * t.dir);
    expect(Math.min(...depth)).toBeLessThan(-8);
    expect(Math.max(...depth)).toBeGreaterThan(15);
  });

  it("signals an incomplete pass and a touchdown", () => {
    const inc = play(/ pass .*incomplete/).t;
    expect(inc.act.some((a, i) => inc.team[i] === 2 && a.includes(ACT.incomplete))).toBe(true);
    const td = play(/ pass .* TOUCHDOWN/).t;
    const end = last(td);
    expect(td.act.filter((a, i) => td.team[i] === 2 && a[end] === ACT.cheer).length).toBeGreaterThanOrEqual(2);
    // The scorer has company.
    expect(td.act.filter((a, i) => td.team[i] === 0 && a[end] === ACT.cheer).length).toBeGreaterThanOrEqual(2);
  });
});

describe("the 3D players", () => {
  it("ships a model under its budget with every move the field view asks for", () => {
    expect(statSync("assets/anim/player3d.json").size).toBeLessThan(2_000_000);
    const moves = new Set(glbMoves());
    const asked = new Set<string>();
    for (let n = 0; n < log.plays.length; n++) {
      if (log.plays[n][8] & (F.note | F.story)) continue;
      let t: Track | null = buildTrack(book, log, n, players);
      while (t) {
        for (let i = 0; i < t.pos.length; i++) for (const s of plan(t, i, n).segs) asked.add(s.clip);
        t = t.then ?? null;
      }
    }
    for (const m of asked) expect(moves.has(m), m).toBe(true);
    // A real game uses most of them: stances, runs, blocks, throws, catches, tackles and the kicks.
    for (const m of ["stance3", "gun", "run", "carry", "block", "throw", "catch", "tackle", "tackled", "kick", "punt"]) expect(asked.has(m), m).toBe(true);
  });

  it("turns every player smoothly and keeps a lineman in his stance before the snap", () => {
    const { t } = play(/ runs /);
    for (let i = 0; i < t.pos.length; i++) {
      const p = plan(t, i, 1);
      for (let f = 1; f < p.heading.length; f++) expect(Math.abs(p.heading[f] - p.heading[f - 1])).toBeLessThanOrEqual(0.5 + 1e-6);
      if (t.group?.[i] === "OL") expect(p.segs[0].clip).toBe("stance3");
    }
  });
});
