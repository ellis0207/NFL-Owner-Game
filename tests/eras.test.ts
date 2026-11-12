import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

// Historical starts: each season's data pack (data/packs/<year>.json.gz, built
// by pipeline/history_pack.py) replaces the 2026 files. The engine reads the
// pack when its modules load, so every start gets fresh modules.
const YEARS = Array.from({ length: 15 }, (_, i) => 2011 + i);
const pack = (year: number) => JSON.parse(gunzipSync(readFileSync(new URL(`../data/packs/${year}.json.gz`, import.meta.url))).toString());

async function engineFor(year: number | null) {
  vi.resetModules();
  const g = globalThis as { __NFL_PACK__?: unknown };
  if (year) g.__NFL_PACK__ = pack(year);
  else delete g.__NFL_PACK__;
  // One at a time: parallel imports of modules that wait on the pack can stall the loader.
  const season = await import("../src/engine/season");
  const league = await import("../src/engine/league");
  const rules = await import("../src/engine/rules");
  const cap = await import("../src/engine/cap");
  const eras = await import("../src/engine/eras");
  const seasons = await import("../src/engine/seasons");
  const custom = await import("../src/engine/custompack");
  const codec = await import("../src/save/codec");
  const packMod = await import("../src/engine/pack");
  return { ...packMod, ...season, ...league, ...rules, ...cap, ...eras, ...seasons, ...custom, ...codec };
}

afterEach(() => {
  delete (globalThis as { __NFL_PACK__?: unknown }).__NFL_PACK__;
});

describe("historical starts", () => {
  for (const year of YEARS) {
    it(`a ${year} start has that year's cap, rosters, schedule, stadiums and format`, async () => {
      const e = await engineFor(year);
      const s = e.newGame("DAL", "Test", { capRules: "real" }, 3);
      expect(s.season).toBe(year);
      expect(s.era).toEqual({ start: year, alt: false });
      expect(e.RULES.salaryCap).toBe(e.REAL_CAPS[year]);
      // Every club has its roster. Through 2016 the source lists only the 53 and
      // the reserve lists at the first game, so those camps open nearer 53 than 90.
      for (const t of e.TEAMS) {
        const n = e.PLAYERS.filter((p) => p.team === t.id).length;
        expect(n, t.id).toBeGreaterThanOrEqual(year < 2017 ? 48 : 75);
        expect(n, t.id).toBeLessThanOrEqual(91);
      }
      // 16 games before 2021, 17 after; 12 playoff clubs before 2020.
      const games = year < 2021 ? 16 : 17;
      expect(e.rulesFor(s).games).toBe(games);
      expect(e.rulesFor(s).playoffTeams).toBe(year < 2020 ? 12 : 14);
      // The 2022 Bills-Bengals game was never finished and isn't in the schedule.
      expect(e.SCHEDULE.filter((g) => g.type === "REG").length).toBe(games * 16 - (year === 2022 ? 1 : 0));
      // The clubs were where they really were.
      expect(e.TEAM_BY_ID.LA.city).toBe(year < 2016 ? "St. Louis" : "Los Angeles");
      expect(e.TEAM_BY_ID.LAC.city).toBe(year < 2017 ? "San Diego" : "Los Angeles");
      expect(e.TEAM_BY_ID.LV.city).toBe(year < 2020 ? "Oakland" : "Las Vegas");
      expect(e.TEAM_BY_ID.WAS.name).toBe(e.washingtonName(year));
      if (year < 2016) expect(e.TEAM_BY_ID.LA.stadium).toBe("Edward Jones Dome");
      else if (year < 2020) expect(e.TEAM_BY_ID.LA.stadium).toBe("Los Angeles Memorial Coliseum");
      // A few days of camp run without trouble.
      for (let i = 0; i < 5; i++) e.advanceDay(s);
      expect(e.capSummary(s, "DAL").space).toBeGreaterThan(-5_000_000);
    }, 120_000);
  }

  it("a 2015 start plays into the 2016 league year: the Rams move, the cap is real", async () => {
    const e = await engineFor(2015);
    const s = e.newGame("NE", "Test", { capRules: "real" }, 5);
    let guard = 0;
    while (s.season === 2015 && guard++ < 400) e.advanceDay(s);
    expect(s.season).toBe(2016);
    expect(s.league?.caps[2016]).toBe(e.REAL_CAPS[2016]);
    expect(e.TEAM_BY_ID.LA.city).toBe("Los Angeles");
    expect(e.TEAM_BY_ID.LA.stadium).toBe("Los Angeles Memorial Coliseum");
    const last = e.history(s).seasons.at(-1)!;
    expect(Object.values(last.records).every((r) => r[0] + r[1] + (r[2] ?? 0) === 16)).toBe(true);
    expect(e.TEAMS.filter((t) => e.capSummary(s, t.id).space < 0).length).toBe(0);
  }, 600_000);

  it("alternate history keeps the start's rules, cities and names", async () => {
    const e = await engineFor(2015);
    const s = e.newGame("NE", "Test", { capRules: "real", altHistory: true }, 5);
    expect(s.era).toEqual({ start: 2015, alt: true });
    expect(e.ruleSeason(s, 2019)).toBe(2015);
    expect(e.realCap(s, 2016)).toBeUndefined();
    // Under real history a later season gets its own rules.
    expect(e.ruleSeason({ ...s, era: { start: 2015, alt: false } }, 2019)).toBe(2019);
    // Turned on later, the picture freezes where it was turned on.
    expect(e.ruleSeason({ ...s, era: { start: 2015, alt: true, altFrom: 2017 } }, 2020)).toBe(2017);
    // A season under alternate history: the Rams stay in St. Louis.
    s.season = 2017;
    e.applySeason(s);
    expect(e.TEAM_BY_ID.LA.city).toBe("St. Louis");
    expect(e.TEAM_BY_ID.WAS.name).toBe("Redskins");
  }, 120_000);

  it("the era rule overlay matches the real changes", async () => {
    const { eraRules, practiceSquadBase } = await import("../src/engine/eras");
    expect(eraRules(2014)).toMatchObject({ games: 16, playoffTeams: 12, touchback: 20, xpLine: 2, otMinutes: 15, hipDropBan: false });
    expect(eraRules(2020)).toMatchObject({ games: 16, touchback: 25 });
    expect(eraRules(2020).playoffTeams).toBeUndefined();
    expect(eraRules(2024)).toEqual({ touchback: 30 });
    expect(eraRules(2026)).toEqual({});
    const st = (start: number) => ({ era: { start, alt: false } }) as never;
    expect(practiceSquadBase(st(2011), 2011)).toBe(8);
    expect(practiceSquadBase(st(2011), 2020)).toBe(16);
  });

  it("the 2026 start carries no era and keeps its own data", async () => {
    const e = await engineFor(null);
    expect(e.HISTORICAL).toBe(false);
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 3);
    expect(s.era).toBeUndefined();
    expect(s.season).toBe(2026);
    expect(e.TEAM_BY_ID.WAS.name).toBe("Commanders");
  }, 120_000);
});

describe("custom league packs", () => {
  it("checks a pack and lays it over the clubs, and takes it off again", async () => {
    const e = await engineFor(null);
    const template = JSON.parse(e.packTemplate());
    expect(Object.keys(template.teams).length).toBe(32);
    expect(e.checkPack("not json").ok).toBe(false);
    expect(e.checkPack(JSON.stringify({ name: "x", version: 2, teams: {} })).errors[0]).toMatch(/version 1/);
    const bad = e.checkPack(JSON.stringify({ name: "x", version: 1, teams: { XXX: {}, DAL: { colors: ["red"] }, NYG: { city: "New York", name: "Jets" } } }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/XXX/);
    expect(bad.errors.join(" ")).toMatch(/hex/);
    expect(bad.errors.join(" ")).toMatch(/share a name/);
    const good = e.checkPack(JSON.stringify({ name: "Mine", version: 1, teams: { DAL: { city: "Austin", name: "Stars", colors: ["#112233", "#445566"], mascot: "x" } } }));
    expect(good.ok).toBe(true);
    expect(good.warnings.join(" ")).toMatch(/mascot/);
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 3);
    e.setCustomLeague(s, good.pack!);
    e.applySeason(s);
    expect(e.TEAM_BY_ID.DAL.city).toBe("Austin");
    expect(e.TEAM_BY_ID.DAL.name).toBe("Stars");
    // The save keeps the pack.
    const back = e.parseSaveFile(JSON.stringify(e.toSaveFile(s)));
    expect(back.customLeague?.teams.DAL.name).toBe("Stars");
    e.setCustomLeague(s, null);
    e.applySeason(s);
    expect(e.TEAM_BY_ID.DAL.city).toBe("Dallas");
    expect(e.TEAM_BY_ID.DAL.name).toBe("Cowboys");
  }, 120_000);
});

describe("a 2011 save", () => {
  const file = new URL("./saves/pr55-2011-07-31.json.gz", import.meta.url);
  it.skipIf(!existsSync(file))("loads with the 2011 pack and keeps playing", async () => {
    const e = await engineFor(2011);
    const s = e.parseSaveFile(gunzipSync(readFileSync(file)).toString());
    expect(s.era?.start).toBe(2011);
    e.applySeason(s);
    expect(e.TEAM_BY_ID.LA.city).toBe("St. Louis");
    const from = s.date;
    for (let i = 0; i < 10; i++) e.advanceDay(s);
    expect(s.date > from).toBe(true);
    expect(Number.isFinite(e.capSummary(s, s.userTeam).space)).toBe(true);
  }, 120_000);
});
