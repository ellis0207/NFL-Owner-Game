import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

// Historical starts: each season's data pack (data/packs/<year>.json.gz, built
// by pipeline/history_pack.py) replaces the 2026 files. The engine reads the
// pack when its modules load, so every start gets fresh modules.
const YEARS = Array.from({ length: 32 }, (_, i) => 1994 + i);
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
  it("a 2011 start has the Hall as it stood, and votes the later real greats in itself", async () => {
    const e = await engineFor(2011);
    const hof = await import("../src/engine/halloffame");
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 3);
    const classes = hof.hofClasses(s);
    expect(classes[2011].length).toBe(7);
    expect(classes[2012]).toBeUndefined();
    // Retired before 2011 and inducted later in real life: a candidate here.
    expect(hof.hofCase(s, "hof:curtis-martin")!.hofYear).toBeUndefined();
    const proj = hof.projectClasses(s, 3).flatMap((p) => p.ids);
    expect(proj.length).toBeGreaterThan(5);
    // Still playing in 2011: his career is this save's to finish, not the data's.
    expect(proj).not.toContain("hof:peyton-manning");
  }, 120_000);

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
      // 28 clubs in 1994, 30 from 1995 (Carolina, Jacksonville; the Browns gone 1996-98, the new Browns in 1999), 31 to 2001, 32 after.
      expect(e.TEAMS.length).toBe(year < 1995 ? 28 : year < 1999 ? 30 : year < 2002 ? 31 : 32);
      expect(e.SCHEDULE.filter((g) => g.type === "REG").length).toBe(games * e.TEAMS.length / 2 - (year === 2022 ? 1 : 0));
      // The clubs were where they really were.
      expect(e.TEAM_BY_ID.LA.city).toBe(year < 1995 ? "Los Angeles" : year < 2016 ? "St. Louis" : "Los Angeles");
      expect(e.TEAM_BY_ID.LAC.city).toBe(year < 2017 ? "San Diego" : "Los Angeles");
      expect(e.TEAM_BY_ID.LV.city).toBe(year < 1995 ? "Los Angeles" : year < 2020 ? "Oakland" : "Las Vegas");
      expect(`${e.TEAM_BY_ID.TEN.city} ${e.TEAM_BY_ID.TEN.name}`).toBe(year < 1997 ? "Houston Oilers" : year < 1999 ? "Tennessee Oilers" : "Tennessee Titans");
      expect(`${e.TEAM_BY_ID.BAL.city} ${e.TEAM_BY_ID.BAL.name}`).toBe(year < 1996 ? "Cleveland Browns" : "Baltimore Ravens");
      expect(e.TEAM_BY_ID.WAS.name).toBe(e.washingtonName(year));
      if (year < 1995) expect(e.TEAM_BY_ID.LA.stadium).toBe("Anaheim Stadium");
      else if (year < 2002) expect(e.TEAM_BY_ID.LA.stadium).toBe("Trans World Dome");
      else if (year === 2002) expect(e.TEAM_BY_ID.LA.stadium).toBe("Dome at America's Center");
      else if (year < 2016) expect(e.TEAM_BY_ID.LA.stadium).toBe("Edward Jones Dome");
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

  it("a 1994 start: 28 clubs, then Carolina and Jacksonville open and the Rams and Raiders move for 1995", async () => {
    const e = await engineFor(1994);
    const coaches = await import("../src/engine/coaches");
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 5);
    expect(e.TEAMS.length).toBe(28);
    expect(s.expansion).toMatchObject({ stage: "approved", clubs: [{ id: "CAR", joins: 1995 }, { id: "JAX", joins: 1995 }] });
    expect(e.TEAM_BY_ID.LV.stadium).toBe("Los Angeles Memorial Coliseum");
    expect(e.TEAM_BY_ID.TEN.stadium).toBe("Astrodome");
    let guard = 0;
    while (s.season === 1994 && guard++ < 400) e.advanceDay(s);
    expect(s.season).toBe(1995);
    expect(e.TEAMS.length).toBe(30);
    expect(e.TEAM_BY_ID.CAR).toMatchObject({ city: "Carolina", conference: "NFC", division: "West", stadium: "Memorial Stadium (Clemson)" });
    expect(e.TEAM_BY_ID.JAX).toMatchObject({ conference: "AFC", division: "Central", stadium: "Jacksonville Municipal Stadium" });
    expect(e.TEAM_BY_ID.LA).toMatchObject({ city: "St. Louis", stadium: "Trans World Dome" });
    expect(e.TEAM_BY_ID.LV.city).toBe("Oakland");
    const car = Object.values(coaches.staff(s).people).filter((p) => p.team === "CAR").map((p) => `${p.role} ${p.name}`);
    expect(car).toContain("HC Dom Capers");
    expect(car).toContain("GM Bill Polian");
    expect(s.schedule!.filter((g) => g.type === "REG").length).toBe(240);
    expect(e.TEAMS.filter((t) => e.capSummary(s, t.id).space < 0).length).toBe(0);
  }, 600_000);

  it("a 1995 start: the Browns move to Baltimore for 1996 and Cleveland's new club is awarded", async () => {
    const e = await engineFor(1995);
    const s = e.newGame("NE", "Test", { capRules: "real" }, 5);
    expect(`${e.TEAM_BY_ID.BAL.city} ${e.TEAM_BY_ID.BAL.name}`).toBe("Cleveland Browns");
    let guard = 0;
    while (s.season === 1995 && guard++ < 400) e.advanceDay(s);
    expect(s.season).toBe(1996);
    expect(e.TEAM_BY_ID.BAL).toMatchObject({ city: "Baltimore", name: "Ravens", stadium: "Memorial Stadium" });
    expect(e.TEAM_BY_ID.CLE).toBeUndefined();
    expect(s.expansion!.clubs.find((c) => !c.activated)).toMatchObject({ id: "CLE", joins: 1999 });
    expect(s.expansion!.clubs.filter((c) => c.activated).length).toBe(0);
    expect(e.TEAMS.length).toBe(30);
    expect(e.TEAMS.filter((t) => e.capSummary(s, t.id).space < 0).length).toBe(0);
  }, 600_000);

  it("a 1997 start: the Oilers become the Titans and the new Browns open for 1999, then Houston is awarded", async () => {
    const e = await engineFor(1997);
    const coaches = await import("../src/engine/coaches");
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 5);
    expect(e.TEAM_BY_ID.TEN).toMatchObject({ city: "Tennessee", name: "Oilers", stadium: "Liberty Bowl Memorial Stadium" });
    let guard = 0;
    while (s.season < 1999 && guard++ < 800) e.advanceDay(s);
    expect(s.season).toBe(1999);
    expect(e.TEAMS.length).toBe(31);
    expect(e.TEAM_BY_ID.TEN.name).toBe("Titans");
    expect(e.TEAM_BY_ID.CLE).toMatchObject({ city: "Cleveland", name: "Browns", conference: "AFC", division: "Central" });
    const cle = Object.values(coaches.staff(s).people).filter((p) => p.team === "CLE").map((p) => `${p.role} ${p.name}`);
    expect(cle).toContain("HC Chris Palmer");
    expect(s.expansion!.clubs.map((c) => c.id)).toEqual(["CLE", "HOU"]);
    expect(s.expansion!.clubs[1]).toMatchObject({ joins: 2002 });
    expect(e.TEAMS.filter((t) => e.capSummary(s, t.id).space < 0).length).toBe(0);
  }, 900_000);

  it("a 2001 start: 31 clubs in six divisions, then Houston opens and the league realigns for 2002", async () => {
    const e = await engineFor(2001);
    const standings = await import("../src/engine/standings");
    const coaches = await import("../src/engine/coaches");
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 5);
    expect(e.TEAMS.length).toBe(31);
    expect(e.TEAM_BY_ID.HOU).toBeUndefined();
    expect(standings.divisionStandings(s).map((d) => d.rows.length)).toEqual([5, 6, 5, 5, 5, 5]);
    expect(s.expansion).toMatchObject({ stage: "approved", clubs: [{ id: "HOU", joins: 2002 }] });
    expect(e.TEAM_BY_ID.SEA.stadium).toBe("Husky Stadium");
    let guard = 0;
    let seeds = s.seeds;
    while (s.season === 2001 && guard++ < 400) {
      e.advanceDay(s);
      seeds = s.seeds ?? seeds;
    }
    // Three division winners and three wild cards a conference.
    expect(seeds?.AFC.length).toBe(6);
    expect(seeds?.NFC.length).toBe(6);
    expect(s.season).toBe(2002);
    expect(e.TEAMS.length).toBe(32);
    expect(e.TEAM_BY_ID.HOU).toMatchObject({ city: "Houston", name: "Texans", conference: "AFC", division: "South", stadium: "Reliant Stadium" });
    expect(standings.divisionStandings(s).map((d) => d.rows.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    expect(e.TEAM_BY_ID.SEA).toMatchObject({ conference: "NFC", division: "West", stadium: "Seahawks Stadium" });
    const hou = Object.values(coaches.staff(s).people).filter((p) => p.team === "HOU").map((p) => `${p.role} ${p.name}`);
    expect(hou).toContain("HC Dom Capers");
    expect(hou).toContain("GM Charley Casserly");
    expect(s.expansion!.picks.filter((x) => x.club === "HOU").length).toBeGreaterThan(10);
    expect(e.SCHEDULE.length).toBeGreaterThan(0);
    expect(s.schedule!.filter((g) => g.type === "REG").length).toBe(256);
    expect(e.TEAMS.filter((t) => e.capSummary(s, t.id).space < 0).length).toBe(0);
  }, 600_000);

  it("a 2010 start is uncapped, then the 2011 lockout runs March 12 to July 25", async () => {
    const e = await engineFor(2010);
    const cba = await import("../src/engine/cbaterms");
    const labor = await import("../src/engine/labor");
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 5);
    expect(labor.labor(s).agreements.at(-1)).toMatchObject({ from: 2010, through: 2010 });
    expect(cba.termsFor(2010)).toMatchObject({ uncapped: true, ufaSeasons: 6, noWageScale: true });
    // A first-round pick before the wage scale: five years, no option, far richer at the top.
    const { rookieScale } = await import("../src/engine/contracts");
    expect(rookieScale(1, 2010)).toMatchObject({ years: 5, option: false });
    expect(rookieScale(1, 2010).total).toBeGreaterThan(0.4 * e.REAL_CAPS[2010]);
    while (s.date < "2011-03-13") e.advanceDay(s);
    expect(labor.lockedOut(s)).toBe(true);
    while (s.date < "2011-07-26") e.advanceDay(s);
    expect(labor.lockedOut(s)).toBe(false);
    expect(labor.currentAgreement(s)).toMatchObject({ from: 2011, through: 2020 });
    expect(s.league?.caps[2011]).toBe(e.REAL_CAPS[2011]);
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
    expect(eraRules(2024)).toEqual({ touchback: 30, otRule: "modified", sackRate: 0.88 });
    expect(eraRules(2008)).toMatchObject({ otRule: "sudden", playoffTeams: 12, xpLine: 2 });
    expect(eraRules(2025)).toEqual({ touchback: 35, otRule: "both", sackRate: 0.88 });
    expect(eraRules(2026)).toEqual({});
    const st = (start: number) => ({ era: { start, alt: false } }) as never;
    expect(practiceSquadBase(st(2002), 2002)).toBe(5);
    expect(practiceSquadBase(st(2002), 2004)).toBe(8);
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

describe("a 1994 save from version 1.3", () => {
  const file = new URL("./saves/pr138-1994-10-02.json.gz", import.meta.url);
  it.skipIf(!existsSync(file))("loads with the 1994 pack, picks up era scoring and keeps playing", async () => {
    const e = await engineFor(1994);
    const s = e.parseSaveFile(gunzipSync(readFileSync(file)).toString());
    expect(s.era?.start).toBe(1994);
    e.applySeason(s);
    expect(e.TEAMS.length).toBe(28);
    expect(e.TEAM_BY_ID.TEN.city).toBe("Houston");
    expect(e.rulesFor(s).passEra).toBeLessThan(0);
    expect(e.rulesFor(s).sackRate).toBeLessThan(1);
    const from = s.date;
    for (let i = 0; i < 10; i++) e.advanceDay(s);
    expect(s.date > from).toBe(true);
    expect(Number.isFinite(e.capSummary(s, s.userTeam).space)).toBe(true);
  }, 120_000);
});

describe("era scoring and the pack scale", () => {
  it("an early pack sits on the 2026 scale, and Modern scoring turns the era's passing off", async () => {
    const e = await engineFor(1996);
    // The top five corners a club read like 2026's (mean about 78), not the Week 1 list's ~70.
    const cbs = e.PLAYERS.filter((p) => p.team && p.position === "CB").map((p) => e.HIDDEN_RATINGS[p.id]?.overall ?? 0)
      .sort((a, b) => b - a).slice(0, 5 * e.TEAMS.length);
    const mean = cbs.reduce((a, b) => a + b, 0) / cbs.length;
    expect(Math.abs(mean - 78.3)).toBeLessThan(1.5);
    const s = e.newGame("DAL", "Test", { capRules: "real" }, 3);
    expect(e.rulesFor(s).passEra).toBeCloseTo(-0.085);
    expect(e.rulesFor(s).sackRate).toBeCloseTo(0.88);
    s.settings.eraScoring = "modern";
    expect(e.rulesFor(s).passEra).toBe(0);
  }, 120_000);
});
