import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { conditionalValue, conditionProblem } from "../src/engine/conditions";
import { RULES } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { pickId, pickOwner, pickValue, trades } from "../src/engine/trades";
import { teamPlayerIds } from "../src/engine/cap";
import { stateAt } from "./fixtures";
import type { GameState, TradeDeal } from "../src/engine/types";

const TEAM = "DET";
const K = RULES.keyDates;

function at(when?: string): GameState {
  return stateAt(TEAM, 3, when);
}

beforeAll(() => {
  at("superBowl");
}, 600_000);

describe("conditional picks", () => {
  it("are worth more than the plain pick and less than the pick a round up", () => {
    const state = at("superBowl");
    const y = RULES.season + 2;
    const plain = pickValue(state, "DET", pickId(y, 4, "DET"));
    const up = pickValue(state, "DET", pickId(y, 3, "DET"));
    const v = conditionalValue(state, "DET", pickId(y, 4, "DET"), { kind: "playoffs", threshold: 0 });
    expect(v).toBeGreaterThan(plain);
    expect(v).toBeLessThan(up);
  });

  it("follow the rules on what can carry a condition", () => {
    const state = at("superBowl");
    const y = RULES.season + 2;
    const theirs = teamPlayerIds(state, "MIA")[0];
    const ours = teamPlayerIds(state, TEAM)[0];
    const deal: TradeDeal = { teams: [TEAM, "MIA"], send: [[{ kind: "pick", pick: pickId(y, 4, TEAM) }], [{ kind: "player", id: theirs }]] };
    const ok = { kind: "pick" as const, pick: pickId(y, 4, TEAM), cond: { kind: "snaps" as const, threshold: 0.5, player: theirs } };
    expect(conditionProblem(state, deal, 0, ok)).toBeNull();
    expect(conditionProblem(state, deal, 0, { ...ok, cond: { ...ok.cond, player: ours } })).not.toBeNull();
    expect(conditionProblem(state, deal, 0, { kind: "pick", pick: pickId(y, 1, TEAM), cond: { kind: "snaps", threshold: 0.5, player: theirs } })).not.toBeNull();
    expect(conditionProblem(state, deal, 0, { kind: "pick", pick: pickId(y, 1, TEAM), cond: { kind: "protect", threshold: 10 } })).toBeNull();
  });

  it("settle the day after the Super Bowl, swapping in the pick a round up", () => {
    const state = at("superBowl");
    const ts = trades(state);
    const y = RULES.season + 2;
    const pick = pickId(y, 4, "MIA");
    const better = pickId(y, 3, "MIA");
    expect(pickOwner(state, better)).toBe("MIA");
    ts.picks[pick] = TEAM;
    // Any player who played at all clears a 0% snap mark.
    const player = teamPlayerIds(state, "MIA").find((id) => state.players[id].status === "active")!;
    (ts.conditional ??= []).push({ pick, from: "MIA", to: TEAM, cond: { kind: "snaps", threshold: 0, player }, season: RULES.season, traded: "2026-10-01", status: "open" });
    while (state.date <= addDays(K.superBowl, 1)) advanceDay(state);
    const c = ts.conditional!.find((x) => x.pick === pick)!;
    expect(c.status).toBe("met");
    expect(pickOwner(state, better)).toBe(TEAM);
    expect(pickOwner(state, pick)).toBe("MIA");
  });

  it("show up in CPU trades", () => {
    const state = at();
    const n = trades(state).conditional?.length ?? 0;
    console.log(`conditional picks in CPU trades: ${n} of ${trades(state).log.length} trades`);
    expect(n).toBeGreaterThan(0);
  });
});
