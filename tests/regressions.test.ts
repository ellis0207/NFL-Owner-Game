import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capSummary } from "../src/engine/cap";
import { leagueYear } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { invariants } from "../src/engine/invariants";
import { RULES, TEAMS } from "../src/engine/league";
import { stateAt } from "./fixtures";

// Saves the long-run checks once caught in an invalid state (tests/regressions/),
// replayed to the date they were found. Historical-start cases run in the
// scheduled long run instead, since each start season loads its own data.
const dir = new URL("./regressions/", import.meta.url);
const cases = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ file: f, ...JSON.parse(readFileSync(new URL(f, dir), "utf8")) }));

describe("regression cases", () => {
  for (const c of cases.filter((x) => !x.era)) {
    it(`${c.file} stays fixed`, () => {
      const s = stateAt(c.team, c.seed, c.until);
      expect(invariants(s)).toEqual([]);
      if ((c.errors ?? []).some((e: string) => /over the cap/.test(e))) {
        expect(TEAMS.filter((t) => capSummary(s, t.id, leagueYear(s.date)).space < 0).map((t) => t.id)).toEqual([]);
      }
    }, 600_000);
  }
});

describe("league invariants", () => {
  for (const at of ["regularSeasonStart", "tradeDeadline", "newLeagueYear", "end"]) {
    it(`hold at ${at}`, () => {
      expect(invariants(stateAt("NYG", 7, at))).toEqual([]);
    }, 600_000);
  }
});

describe("cap compliance", () => {
  it("every club is under the cap once the new league year has opened", () => {
    const s = stateAt("NYG", 7, addDays(RULES.keyDates.newLeagueYear, 1));
    const y = leagueYear(s.date);
    expect(TEAMS.filter((t) => capSummary(s, t.id, y).space < 0).map((t) => t.id)).toEqual([]);
  }, 600_000);
});
