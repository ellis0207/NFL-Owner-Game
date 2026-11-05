import { beforeAll, describe, expect, it } from "vitest";
import { teamPlayerIds } from "../src/engine/cap";
import { addDays } from "../src/engine/dates";
import { gameConditions, weatherFor } from "../src/engine/gameday";
import { healInjuries, injure } from "../src/engine/injuries";
import { PLAYER_BY_ID, RULES, SCHEDULE } from "../src/engine/league";
import { makeRng } from "../src/engine/rng";
import { depthChart, IR_RETURNS } from "../src/engine/roster";
import { advanceDay } from "../src/engine/season";
import { ability, rustDrag } from "../src/engine/staff";
import { stateAt } from "./fixtures";
import type { GameState, ScheduledGame } from "../src/engine/types";

const TEAM = "DET";
const K = RULES.keyDates;

function at(when?: string): GameState {
  return stateAt(TEAM, 3, when);
}

beforeAll(() => {
  at();
}, 600_000);

const game = (home: string, date: string, extra: Partial<ScheduledGame> = {}): ScheduledGame => ({
  id: `t_${home}_${date}`, type: "REG", week: 15, date, weekday: "Sunday", timeET: "13:00", away: "MIA", home, neutral: false, ...extra,
});

describe("weather", () => {
  it("plays domes indoors and makes Green Bay in January colder than Miami", () => {
    const state = at();
    expect(weatherFor(state, game("DET", "2026-12-20"), "DET").indoor).toBe(true);
    let gb = 0, mia = 0;
    for (let d = 0; d < 40; d++) {
      gb += weatherFor(state, game("GB", addDays("2027-01-01", d)), "GB").temp;
      mia += weatherFor(state, game("MIA", addDays("2027-01-01", d)), "MIA").temp;
    }
    expect(gb / 40).toBeLessThan(35);
    expect(mia / 40).toBeGreaterThan(65);
  });

  it("a windy day cuts the deep ball and the kicker's range more than a calm one", () => {
    const state = at();
    let windy: ReturnType<typeof gameConditions> | undefined, calm: typeof windy;
    for (let d = 0; d < 200 && (!windy || !calm); d++) {
      const c = gameConditions(state, game("CHI", addDays("2026-11-01", d % 60), { id: `w${d}` }), "MIA", "CHI");
      if (c.weather.wind >= 20) windy = c;
      if (c.weather.wind <= 8 && c.weather.precip === "none" && c.weather.temp > 40) calm = c;
    }
    expect(windy!.comp.deep).toBeGreaterThan(calm!.comp.deep);
    expect(windy!.kickRange).toBeGreaterThan(calm!.kickRange);
  });

  it("a road team on a short week starts at a small disadvantage, not a big one", () => {
    const state = at();
    const thu = SCHEDULE.find((g) => g.type === "REG" && g.weekday === "Thursday" && (g.week ?? 0) > 2 && g.away && g.home)!;
    const c = gameConditions(state, thu, thu.away!, thu.home!);
    expect(c.edge.away).toBeLessThan(0);
    expect(c.edge.away).toBeGreaterThan(-1.2);
  });
});

describe("injuries", () => {
  it("severe injuries can take ability away for good; sprains never do", () => {
    const state = at();
    const ids = teamPlayerIds(state, TEAM).slice(0, 40);
    const lost: Record<string, number[]> = {};
    const rng = makeRng(99);
    for (let i = 0; i < 3000; i++) {
      const id = ids[i % ids.length];
      const before = state.players[id].dev ?? 0;
      delete state.players[id].injury;
      const { injury } = injure(state, id, TEAM, rng);
      (lost[injury.type] ??= []).push(before - (state.players[id].dev ?? 0));
    }
    expect(lost["Ankle sprain"].every((x) => x === 0)).toBe(true);
    const achilles = lost["Torn Achilles"] ?? [];
    expect(achilles.length).toBeGreaterThan(5);
    expect(achilles.filter((x) => x > 0).length / achilles.length).toBeGreaterThan(0.4);
  });

  it("players back from long injuries often start slow, and it wears off", () => {
    const state = at();
    const ids = teamPlayerIds(state, TEAM).slice(0, 40);
    for (const id of ids) state.players[id].injury = { type: "Knee sprain (MCL)", date: addDays(state.date, -40), returnDate: state.date, seasonEnding: false };
    healInjuries(state);
    const rusty = ids.filter((id) => rustDrag(state, id) > 0);
    expect(rusty.length).toBeGreaterThan(12);
    expect(rusty.length).toBeLessThan(40);
    const id = rusty[0];
    const now = ability(state, id);
    state.date = addDays(state.date, 120);
    expect(ability(state, id)).toBeGreaterThan(now);
    expect(rustDrag(state, id)).toBe(0);
  });
});

describe("reserve lists", () => {
  it("each team uses at most eight IR return designations, and teams use them", () => {
    const state = at();
    const used = Object.values(state.irReturns ?? {});
    expect(used.length).toBeGreaterThan(20);
    expect(Math.max(...used)).toBeLessThanOrEqual(IR_RETURNS);
    expect(used.reduce((a, b) => a + b, 0)).toBeGreaterThan(25);
  });

  it("a player still hurt from before camp goes on PUP at the cutdown, and his return doesn't use a designation", () => {
    const state = at("rosterCutdown");
    // A starter: the coaches keep him rather than cut him.
    const id = depthChart(state, TEAM).WR.find((x) => !state.players[x].injury)!;
    state.players[id].injury = { type: "Hamstring strain", date: addDays(K.rosterCutdown, -60), returnDate: addDays(K.rosterCutdown, 40), seasonEnding: false };
    while (state.date <= addDays(K.rosterCutdown, 1)) advanceDay(state);
    expect(state.players[id].status).toBe("ir");
    expect(state.players[id].reserve).toBe("pup");
  });
});
