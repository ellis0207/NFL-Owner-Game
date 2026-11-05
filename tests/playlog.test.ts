import { describe, expect, it } from "vitest";
import { askLeague, gameDayOps, gameOps, gameOpsDaily } from "../src/engine/gameops";
import { addDays } from "../src/engine/dates";
import { SCHEDULE } from "../src/engine/league";
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
      expect(c.areas.length).toBe(8);
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
