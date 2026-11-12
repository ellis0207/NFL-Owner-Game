import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { BASE_KEY_DATES } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { parseSaveFile, toSaveFile } from "../src/save/codec";
import { stateAt } from "./fixtures";

// A save loaded tomorrow has to play on exactly like a game left running.
// Anything the engine keeps outside the state (caches keyed on the state
// object) must give the same answers after a reload, or long runs drift
// apart depending on when the player saved.
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
const same = (x: object) => JSON.stringify(canon(JSON.parse(JSON.stringify(x))));

describe("saving and reloading changes nothing", () => {
  for (const [label, from, days] of [["through the cutdown and waivers", addDays(BASE_KEY_DATES.rosterCutdown, -3), 14], ["through the cap deadline and free agency", addDays(BASE_KEY_DATES.newLeagueYear, -4), 10]] as const) {
    it(label, () => {
      const kept = stateAt("NYG", 7, from);
      let reloaded = stateAt("NYG", 7, from);
      for (let i = 0; i < days; i++) {
        advanceDay(kept);
        reloaded = parseSaveFile(JSON.stringify(toSaveFile(reloaded)));
        advanceDay(reloaded);
        expect(same(reloaded), `after ${kept.date}`).toBe(same(kept));
      }
    }, 900_000);
  }
});
