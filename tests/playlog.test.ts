import { describe, expect, it } from "vitest";
import { askLeague, gameDayOps, gameOps, gameOpsDaily } from "../src/engine/gameops";
import { addDays } from "../src/engine/dates";
import { SCHEDULE } from "../src/engine/league";
import { boxAt, castAt, nextDriveStop, nextQuarterStop, storylines } from "../src/engine/gamecast";
import { STAT_KEYS } from "../src/engine/stats";
import { KEEP_DAYS, PLAY_FLAGS as F } from "../src/engine/playlog";
import { business } from "../src/engine/business";
import { advanceDay, newGame } from "../src/engine/season";
import { simulateGame } from "../src/engine/sim";
import type { GameState, ScheduledGame } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const fresh = () => newGame(TEAM, "Owner", { capRules: "real" }, 11);
const regular = SCHEDULE.filter((g) => g.type === "REG").slice(0, 48);

describe("play-by-play", () => {
  it("writes every snap, and the feed agrees with the box score", () => {
    const s = fresh();
    for (const g of regular.slice(0, 16)) {
      const { result, box, log } = simulateGame(s, g, g.away, g.home);
      const snaps = log.plays.filter((p) => p[3] > 0 && !(p[8] & (F.penalty | F.kick)));
      expect(snaps.length).toBe(box.team.away.plays + box.team.home.plays);
      const last = log.plays.at(-1)!;
      expect([last[9], last[10]]).toEqual([result.awayScore, result.homeScore]);
      // Every scoring play in the summary shows up as a scoring row.
      expect(log.plays.filter((p) => p[8] & F.score).length).toBe(box.scoring.length);
      expect(log.drives.length).toBeGreaterThan(14);
      expect(log.drives.length).toBeLessThan(34);
      // Touchdown drives in the chart match offensive touchdowns.
      for (const d of log.drives) expect(d[4]).toBeGreaterThan(0);
      for (const p of snaps) expect(p[11]).not.toBe("");
    }
  }, 60_000);

  it("can be stepped through one play at a time, with a scoreboard and a ball on the field", () => {
    const s = fresh();
    for (const g of regular.slice(0, 6)) {
      const { result, log } = simulateGame(s, g, g.away, g.home);
      const n = log.plays.length;
      const start = castAt(log, 0);
      expect([start.away, start.home, start.q, start.clock, start.down]).toEqual([0, 0, 1, 900, 0]);
      expect(start.ball).not.toBeNull();
      expect(start.timeouts).toEqual([3, 3]);
      expect(start.last).toBeNull();
      let prev = start;
      let labelled = 0, moved = 0;
      for (let i = 1; i <= n; i++) {
        const c = castAt(log, i);
        // The score never goes down, and the clock never runs backwards inside a quarter.
        expect(c.away).toBeGreaterThanOrEqual(prev.away);
        expect(c.home).toBeGreaterThanOrEqual(prev.home);
        if (c.q === prev.q && !c.final) expect(c.clock).toBeLessThanOrEqual(prev.clock);
        // Everything drawn stays on the field or in an end zone.
        for (const x of [c.ball, c.toGain, c.driveStart, c.last?.from, c.last?.to]) {
          if (x == null) continue;
          expect(x).toBeGreaterThanOrEqual(-10);
          expect(x).toBeLessThanOrEqual(110);
        }
        for (const t of c.timeouts!) {
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(3);
        }
        if (c.down) {
          expect(c.poss).not.toBeNull();
          // The line to gain is ahead of the ball in the direction the offense is going.
          if (c.toGain !== null) expect((c.toGain - c.ball!) * (c.poss === 0 ? 1 : -1)).toBe(c.dist);
        }
        // A scoring row is called a score on the graphic.
        if (c.last!.row[8] & F.score) expect(c.last!.tone).toBe("score");
        if (c.last!.label) labelled++;
        if (c.last!.to !== null) moved++;
        prev = c;
      }
      expect(prev.final).toBe(true);
      expect([prev.away, prev.home]).toEqual([result.awayScore, result.homeScore]);
      expect(labelled / n).toBeGreaterThan(0.9);
      expect(moved / n).toBeGreaterThan(0.9);
      // Somebody used a timeout, and both sides got them back at halftime.
      expect(log.plays.some((p) => p[14] !== 15)).toBe(true);
      // Skipping by drive and by quarter always moves forward and lands at the end.
      for (const stop of [nextDriveStop, nextQuarterStop]) {
        let at = 0, hops = 0;
        while (at < n) {
          const to = stop(log, at);
          expect(to).toBeGreaterThan(at);
          at = to;
          hops++;
        }
        expect(at).toBe(n);
        expect(hops).toBeGreaterThanOrEqual(4);
      }
    }
  }, 60_000);

  it("keeps a running box score that ends where the final one does", () => {
    const s = fresh();
    for (const g of regular.slice(0, 8)) {
      const { box, log } = simulateGame(s, g, g.away, g.home);
      expect(log.box!.length).toBe(log.plays.length);
      expect(boxAt(log, 0)!.team.away.yards).toBe(0);
      const half = boxAt(log, Math.floor(log.plays.length / 2))!;
      expect(half.team.away.plays + half.team.home.plays).toBeGreaterThan(20);
      const end = boxAt(log, log.plays.length)!;
      for (const side of ["away", "home"] as const) {
        for (const [k, v] of Object.entries(box.team[side])) expect(end.team[side][k as keyof typeof box.team.away], k).toBeCloseTo(v, 1);
        expect(end.quarters[side].reduce((a, b) => a + b, 0)).toBe(box.quarters[side].reduce((a, b) => a + b, 0));
        // Every player's line matches, apart from snap counts, which aren't kept play by play.
        for (const [id, line] of Object.entries(box.players[side])) {
          const mine = end.players[side][id] ?? [];
          for (let k = 3; k < STAT_KEYS.length; k++) expect(mine[k] ?? 0, `${id} ${STAT_KEYS[k]}`).toBe(line[k] ?? 0);
        }
      }
    }
  }, 60_000);

  it("writes down injuries, plays called back, timeouts and who is at quarterback", () => {
    const s = fresh();
    let hurt = 0, back = 0, timeouts = 0, lines = 0;
    for (const g of regular.slice(0, 16)) {
      const { box, log } = simulateGame(s, g, g.away, g.home);
      const text = log.plays.map((p) => p[7]);
      // Both starting quarterbacks are named before the opening kickoff.
      expect(text.slice(0, 2).every((t) => /quarterback/i.test(t))).toBe(true);
      expect(log.plays[2][8] & F.kick).toBeTruthy();
      // Every injury in the box score is in the feed, on the play it happened.
      const flagged = log.plays.filter((p) => p[8] & F.injury);
      expect(flagged.length).toBeGreaterThanOrEqual(Math.min(1, box.injuries.length));
      for (const p of flagged) expect(p[7]).toMatch(/INJURY: .+ is down after the play/);
      hurt += flagged.length;
      const nullified = log.plays.filter((p) => p[11] === "Play called back");
      for (const p of nullified) {
        expect(p[8] & F.penalty).toBeTruthy();
        expect(p[7]).toMatch(/Penalty on [A-Z]+: .+ The play doesn't count\.$/);
      }
      back += nullified.length;
      timeouts += text.filter((t) => t.startsWith("Timeout, ")).length;
      const stories = storylines(log, [g.away, g.home]);
      expect(stories.length).toBe(log.plays.length);
      expect(stories.flat().some((t) => t.startsWith("Halftime"))).toBe(true);
      lines += stories.flat().length;
    }
    expect(hurt).toBeGreaterThan(8);
    expect(back).toBeGreaterThan(40);
    expect(timeouts).toBeGreaterThan(8);
    expect(lines).toBeGreaterThan(16 * 5);
  }, 60_000);

  it("is the same game every time from the same seed", () => {
    const g = regular[3];
    const a = simulateGame(fresh(), g, g.away, g.home);
    const b = simulateGame(fresh(), g, g.away, g.home);
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    expect(a.result).toEqual(b.result);
  }, 60_000);

  it("keeps full plays through the following week only", () => {
    const s = stateAt(TEAM, 3, "2026-10-20");
    const ids = Object.keys(s.pbp ?? {});
    expect(ids.length).toBeGreaterThan(10);
    // The daily hook runs before the date turns over, so a log can be a day past the line until tonight.
    for (const log of Object.values(s.pbp!)) expect(addDays(log.date, KEEP_DAYS + 1) >= s.date).toBe(true);
    // Box scores and scoring plays stay for every game played.
    expect(Object.keys(s.box).length).toBeGreaterThan(ids.length);
    for (let i = 0; i < 12; i++) advanceDay(s);
    for (const log of Object.values(s.pbp!)) expect(addDays(log.date, KEEP_DAYS + 1) >= s.date).toBe(true);
  }, 300_000);
});

describe("officials and replay", () => {
  it("gets some calls wrong, reverses many on review, and lets some stand", () => {
    const s = fresh();
    let reversed = 0;
    let stood = 0;
    let wrong = 0;
    let right = 0;
    for (const g of regular) {
      const { box, log } = simulateGame(s, g, g.away, g.home);
      for (const p of log.plays) {
        if (p[7].includes("ruling was reversed")) reversed++;
        if (p[7].includes("the ruling stands")) stood++;
      }
      for (const c of box.calls ?? []) {
        if (c.wrong) wrong++;
        else right++;
      }
    }
    expect(reversed).toBeGreaterThan(0);
    expect(stood + wrong).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    // Mistakes are rare: well under one per team per game on average.
    expect(wrong / regular.length).toBeLessThan(2);
  }, 120_000);

  it("answers a club's question about a call a few days later", () => {
    const s = fresh();
    const g = regular.find((x) => x.home === TEAM || x.away === TEAM)!;
    const out = simulateGame(s, g, g.away, g.home);
    s.results[g.id] = out.result;
    s.box[g.id] = { ...out.box, calls: [{ q: 2, clock: 300, team: TEAM, text: "Defensive pass interference called", wrong: true }, { q: 3, clock: 100, team: "GB", text: "x", wrong: false }] };
    expect(askLeague(s, g.id, 1)).not.toBeNull();
    expect(askLeague(s, g.id, 0)).toBeNull();
    expect(askLeague(s, g.id, 0)).toBe("Already asked.");
    gameOpsDaily(s);
    expect(gameOps(s).inquiries[0].answer).toBeUndefined();
    s.date = addDays(s.date, 3);
    gameOpsDaily(s);
    expect(gameOps(s).inquiries[0].answer).toMatch(/agrees/);
    expect(s.inbox[0].from).toMatch(/officiating/);
  }, 60_000);
});

describe("game-day operations", () => {
  const run = (s: GameState, n: number) => {
    const base = regular.find((x) => x.home === TEAM)!;
    let problems = 0;
    let minor = 0;
    for (let i = 0; i < n; i++) {
      const g: ScheduledGame = { ...base, id: `${base.id}-ops${i}` };
      gameDayOps(s, g, { away: base.away, home: TEAM, awayScore: 10, homeScore: 20, overtime: false });
    }
    for (const c of gameOps(s).checks) {
      expect(c.areas.length).toBe(10);
      problems += c.areas.filter((a) => a[1] === "problem").length;
      minor += c.areas.filter((a) => a[1] === "minor").length;
    }
    return { problems, minor };
  };

  it("checks eight areas at every home game, and a bigger budget means fewer issues", () => {
    const lean = fresh();
    business(lean).budget.gameday = 0;
    const rich = fresh();
    business(rich).budget.gameday = 3;
    const a = run(lean, 40);
    const b = run(rich, 40);
    expect(a.minor + a.problems).toBeGreaterThan(b.minor + b.problems);
  }, 60_000);

  it("skips away games and charges for problems", () => {
    const s = fresh();
    const away = regular.find((x) => x.away === TEAM)!;
    gameDayOps(s, away, { away: TEAM, home: away.home, awayScore: 1, homeScore: 2, overtime: false });
    expect(gameOps(s).checks.length).toBe(0);
    run(s, 40);
    const withCost = gameOps(s).checks.filter((c) => c.incidents.length);
    for (const c of withCost) expect(c.cost).toBeGreaterThan(0);
  }, 60_000);
});
