import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { capSummary } from "../src/engine/cap";
import { RULES } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { compress, decompress, parseSaveFile } from "../src/save/codec";

// Saves written by earlier versions of the game (made with the code of the
// pull request in the name, and gzipped). Every version has been published,
// so players have saves like these.
function load(name: string) {
  return parseSaveFile(gunzipSync(readFileSync(new URL(`./saves/${name}.json.gz`, import.meta.url))).toString());
}

describe("saves from older versions", () => {
  it("a mid-season save from the first offseason version keeps playing", async () => {
    const state = load("pr5-2026-11-15");
    expect(state.date).toBe("2026-11-15");
    for (let i = 0; i < 10; i++) advanceDay(state);
    expect(state.date).toBe("2026-11-25");
    expect(Number.isFinite(capSummary(state, state.userTeam).space)).toBe(true);
    const back = await decompress(await compress(state));
    expect(back.date).toBe(state.date);
  }, 60_000);

  it("a save from when the game ended with the draft moves on to the next season", () => {
    const state = load("pr12-2027-05-02");
    expect(state.season).toBe(2027);
    expect(RULES.season).toBe(2027);
    for (let i = 0; i < 5; i++) advanceDay(state);
    expect(state.date).toBe("2027-05-07");
  }, 60_000);
});
