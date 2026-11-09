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

  it("a save with clubhouse programs, plans and a position change keeps them, and older saves get defaults", async () => {
    const state = load("pr35-2026-11-15");
    const c = state.clubhouse!;
    expect(c.programs.workload).toBe("heavy");
    expect(Object.keys(c.plans).length).toBe(3);
    const moved = Object.keys(state.players).find((id) => state.players[id].retrain)!;
    expect(state.players[moved].pos).toBe("S");
    const drag = state.players[moved].retrain!.drag;
    for (let i = 0; i < 9; i++) advanceDay(state);
    expect(state.players[moved].retrain!.drag).toBeLessThan(drag);
    const old = load("pr34-2026-11-15");
    expect(old.clubhouse?.programs.workload).toBe("normal");
    expect(Object.keys(old.clubhouse!.chem).length).toBe(32);
    const back = await decompress(await compress(state));
    expect(back.clubhouse?.plans).toEqual(state.clubhouse!.plans);
  }, 90_000);

  it("a save with a scouting staff, a practice plan and a per-game bonus keeps them, and older saves get a staff", async () => {
    const state = load("pr36-2026-11-15");
    expect(state.scouts?.emphasis).toBe("testing");
    expect(state.scouts?.staff[0].id).toBe("scout-6");
    expect(state.clubhouse?.programs.emphasis).toBe("plan");
    expect(state.contracts["00-0033106"]?.years.some((y) => y.perGame === 20_000)).toBe(true);
    for (let i = 0; i < 5; i++) advanceDay(state);
    expect(Object.keys(state.gameWeek?.reports ?? {}).length).toBeGreaterThan(0);
    const old = load("pr35-2026-11-15");
    expect(old.scouts?.staff.length).toBe(5);
    const back = await decompress(await compress(state));
    expect(back.scouts?.staff).toEqual(state.scouts!.staff);
  }, 90_000);

  it("an end-of-season save with honors and records keeps them and moves into the offseason", async () => {
    const state = load("pr37-2027-02-15");
    const season = 2026;
    expect(state.honors?.awards[season].length).toBe(7);
    expect(Object.keys(state.records?.h2h ?? {}).length).toBeGreaterThan(100);
    for (let i = 0; i < 3; i++) advanceDay(state);
    expect(state.records?.values[season]).toBeDefined();
    const back = await decompress(await compress(state));
    expect(back.honors?.allPro[season]).toEqual(state.honors!.allPro[season]);
    const old = load("pr36-2026-11-15");
    expect(old.honors).toBeUndefined();
  }, 90_000);

  it("a save with ticket office settings and seat licenses keeps them through renewals", async () => {
    const state = load("pr38-2027-02-15");
    const t = state.business!.tix!;
    expect(t.zones.lowerSide).toBe(1.2);
    expect(t.dynamic).toBe(true);
    expect(t.psl?.price).toBe(3000);
    expect(state.fans?.trust).toBeLessThan(60);
    const back = await decompress(await compress(state));
    expect(back.business!.tix!.tiers.marquee).toBe(1.15);
    // An older save gets the fan base, the ticket office and the new sponsor categories when it first needs them.
    const old = load("pr37-2027-02-15");
    expect(old.fans).toBeUndefined();
    expect(old.business!.tix).toBeUndefined();
    for (let i = 0; i < 3; i++) advanceDay(old);
    expect(old.fans).toBeDefined();
    expect(old.business!.local!.deals.some((d) => d.cat === "digital")).toBe(true);
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
