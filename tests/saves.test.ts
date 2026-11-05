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

  it("a mid-season save with club books, a term loan and an owner profile keeps playing to the next paydays", async () => {
    const state = load("pr30-2026-11-15");
    expect(state.debt?.loans.length).toBeGreaterThan(0);
    const balance = state.debt!.loans[0].balance;
    for (let i = 0; i < 17; i++) advanceDay(state);
    expect(state.date).toBe("2026-12-02");
    expect(state.business?.ledger.some((e) => e.cat === "interest" && e.date === "2026-12-01")).toBe(true);
    expect(state.debt!.loans[0].balance).toBeLessThanOrEqual(balance);
    const back = await decompress(await compress(state));
    expect(back.owner?.purchase).toBe(state.owner?.purchase);
    // Saves from before the front office get a staffed executive team and the old ways of deciding.
    expect(state.execs?.chart.CFO).toBeDefined();
    expect(state.office?.modes.trades).toBe("owner");
  }, 60_000);

  it("a save with an executive search, delegated bookings and a task keeps them", async () => {
    const state = load("pr31-2026-11-15");
    expect(state.execs?.searches[0]?.role).toBe("FOPS");
    expect(state.office?.modes.events).toBe("delegate");
    for (let i = 0; i < 50; i++) advanceDay(state);
    expect(state.office?.tasks[0].status).toBe("done");
    const back = await decompress(await compress(state));
    expect(back.office?.trail.length).toBe(state.office?.trail.length);
    // Saves from before the culture model start with ordinary readings.
    expect(state.culture?.history.length).toBeGreaterThan(0);
  }, 90_000);

  it("a save with culture, foggy scouting and ironman keeps them", async () => {
    const state = load("pr32-2026-11-15");
    expect(state.culture?.development).toBe(3);
    expect(state.settings.ironman).toBe(true);
    for (let i = 0; i < 20; i++) advanceDay(state);
    expect(state.culture?.history.at(-1)?.month).toBe("2026-12");
    const back = await decompress(await compress(state));
    expect(back.settings.scouting).toBe("foggy");
  }, 90_000);

  it("a save with play-by-play, game-day checks and a question to the league keeps them", async () => {
    const state = load("pr33-2026-11-15");
    expect(Object.keys(state.pbp ?? {}).length).toBeGreaterThan(0);
    expect(state.gameOps?.inquiries.length).toBe(1);
    for (let i = 0; i < 12; i++) advanceDay(state);
    expect(state.gameOps?.inquiries[0].answer).toBeDefined();
    // Week-old play-by-play is gone; the newest games have theirs.
    for (const log of Object.values(state.pbp!)) expect(log.date >= "2026-11-17").toBe(true);
    const back = await decompress(await compress(state));
    expect(Object.keys(back.pbp ?? {}).length).toBe(Object.keys(state.pbp!).length);
  }, 90_000);

  it("a save with an analytics staff and game plans keeps them, and older saves get a small staff", async () => {
    const state = load("pr34-2026-11-15");
    expect(state.analytics?.level).toBe(3);
    expect(state.analytics?.priority).toBe("players");
    const plans = Object.keys(state.analytics!.plans).length;
    expect(plans).toBeGreaterThan(0);
    for (let i = 0; i < 9; i++) advanceDay(state);
    expect(Object.keys(state.analytics!.plans).length).toBeGreaterThan(plans);
    const old = load("pr33-2026-11-15");
    expect(old.analytics?.level).toBe(1);
    const back = await decompress(await compress(state));
    expect(back.analytics?.credibility).toBe(state.analytics!.credibility);
  }, 90_000);

  it("an older save starts keeping play-by-play with its next games", () => {
    const state = load("pr32-2026-11-15");
    expect(state.pbp).toBeUndefined();
    for (let i = 0; i < 8; i++) advanceDay(state);
    expect(Object.keys(state.pbp ?? {}).length).toBeGreaterThan(0);
  }, 90_000);

  it("a save from when the game ended with the draft moves on to the next season", () => {
    const state = load("pr12-2027-05-02");
    expect(state.season).toBe(2027);
    expect(RULES.season).toBe(2027);
    for (let i = 0; i < 5; i++) advanceDay(state);
    expect(state.date).toBe("2027-05-07");
  }, 60_000);
});
