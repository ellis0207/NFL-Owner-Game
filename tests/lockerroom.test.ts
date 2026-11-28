import { describe, expect, it } from "vitest";
import { teamPlayerIds } from "../src/engine/cap";
import { starters } from "../src/engine/clubhouse";
import { decideMemo } from "../src/engine/memos";
import { openMemos } from "../src/engine/delegation";
import { TEAM_BY_ID } from "../src/engine/league";
import { moodPull, moodTarget, resolveLockerMemo } from "../src/engine/lockerroom";
import { standings } from "../src/engine/standings";
import { marketView } from "../src/engine/market";
import { trades } from "../src/engine/trades";
import type { GameState, Memo } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const LATE_SEASON = "2026-12-15";
const avgMood = (s: GameState, t: string) => {
  const ids = starters(s, t);
  return ids.reduce((a, id) => a + (s.players[id].morale ?? 70), 0) / ids.length;
};

describe("the locker room on the field", () => {
  it("wears losing clubs down and lifts winning ones, for every club", () => {
    const s = stateAt(TEAM, 5, LATE_SEASON);
    const table = standings(s);
    const order = Object.keys(TEAM_BY_ID).sort((a, b) => table[b].w - table[a].w);
    const best = order.slice(0, 6).reduce((a, t) => a + avgMood(s, t), 0) / 6;
    const worst = order.slice(-6).reduce((a, t) => a + avgMood(s, t), 0) / 6;
    expect(best - worst).toBeGreaterThan(4);
    // Moods spread out: some starters around the league are unhappy by December.
    const all = Object.keys(TEAM_BY_ID).flatMap((t) => starters(s, t).map((id) => s.players[id].morale ?? 70));
    expect(all.filter((m) => m < 50).length).toBeGreaterThan(5);
  });

  it("knows why a player is unhappy", () => {
    const s = stateAt(TEAM, 5, LATE_SEASON);
    const id = teamPlayerIds(s, TEAM)[0];
    const p = moodPull(s, id, TEAM);
    s.players[id].holdout = { since: s.date } as never;
    const worse = moodPull(s, id, TEAM);
    expect(worse.unrest).toBeLessThan(p.unrest);
    expect(moodTarget(worse)).toBeLessThan(moodTarget(p));
  });

  it("lets the owner meet an unhappy starter, back the coaches or shop him", () => {
    const s = stateAt(TEAM, 5, LATE_SEASON);
    const id = starters(s, TEAM)[0];
    const memo = { payload: { locker: id, why: "winning" } } as unknown as Memo;
    s.players[id].morale = 30;
    resolveLockerMemo(s, memo, 0);
    expect(s.players[id].morale!).toBeGreaterThan(36);
    resolveLockerMemo(s, memo, 2);
    expect(trades(s).block).toContain(id);
  });

  it("puts an unhappy starter of ours on the owner's desk", async () => {
    const s = stateAt(TEAM, 5, LATE_SEASON);
    const { advanceDay } = await import("../src/engine/season");
    // Only a starter the league thinks well of speaks up (lockerroom.ts).
    const id = starters(s, TEAM).find((x) => s.players[x].status === "active" && marketView(s, x) >= 75)!;
    // Low enough that Tuesday's move toward his target still leaves him under the line.
    s.players[id].morale = 5;
    for (let i = 0; i < 8 && !openMemos(s).some((m) => m.payload?.locker === id); i++) {
      s.players[id].morale = 5;
      advanceDay(s);
    }
    const m = openMemos(s).find((x) => x.payload?.locker === id);
    if (m) expect(decideMemo(s, m.id, 0)).toBeFalsy();
    else expect(s.clubhouse?.upset?.[id]).toBeDefined();
  });
});
