import { describe, expect, it } from "vitest";
import { attachBonuses, bonusesDaily, cashSpending, periodOf } from "../src/engine/bonuses";
import { teamPlayerIds } from "../src/engine/cap";
import { dealOf, yearCapHit } from "../src/engine/contracts";
import { addDays, weekday } from "../src/engine/dates";
import { advanceToOurPick, currentSlot, draftState, setGmFrom } from "../src/engine/draft";
import { cashPaid } from "../src/engine/finance";
import { signStreetFreeAgent } from "../src/engine/freeagency";
import { emergencyList, gameWeek, gameWeekDaily, nextGame } from "../src/engine/gameweek";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES } from "../src/engine/league";
import { draftClass } from "../src/engine/prospects";
import { depthChart } from "../src/engine/roster";
import { perceivedValue } from "../src/engine/scouting";
import { leanBias, replaceScout, scouts, setEmphasis } from "../src/engine/scouts";
import { gameDayActives, simulateGame } from "../src/engine/sim";
import { matchup } from "../src/engine/standings";
import { gamePlan } from "../src/engine/strategy";
import { setPrograms } from "../src/engine/training";
import type { GameState } from "../src/engine/types";
import { claimOdds, subjectToWaivers } from "../src/engine/waivers";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const ours = (s: GameState) => teamPlayerIds(s, TEAM).filter((id) => s.players[id].status === "active");

describe("the game week", () => {
  it("files practice reports in the days before a game, with injured players held out", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const g = nextGame(s, TEAM, 10)!;
    const id = ours(s).find((x) => !s.players[x].injury)!;
    s.players[id].injury = { type: "Hamstring strain", date: s.date, returnDate: addDays(g.date, 7), seasonEnding: false };
    // Refile the whole week with the injury in place.
    gameWeek(s).reports = {};
    for (let d = addDays(g.date, -4); d < g.date; d = addDays(d, 1)) { s.date = d; gameWeekDaily(s); }
    const r = gameWeek(s).reports[TEAM];
    expect(r.gameId).toBe(g.id);
    expect(Object.keys(r.days).length).toBe(3);
    for (const day of Object.values(r.days)) expect(day[id][0]).toBe("DNP");
    expect(Object.keys(gameWeek(s).reports).length).toBeGreaterThan(20);
  }, 300_000);

  it("keeps a third quarterback as the emergency quarterback and lists free agents at thin spots", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const chart = depthChart(s, TEAM);
    const qbs = Object.keys(s.players).filter((id) => s.players[id].status === "fa" && PLAYER_BY_ID[id]?.position === "QB").slice(0, 3);
    chart.QB = [...chart.QB.slice(0, 2), qbs[0]];
    const { inactive, emergency } = gameDayActives(chart);
    expect(emergency).toBe(qbs[0]);
    expect(inactive).toContain(qbs[0]);
    const list = emergencyList(s);
    expect(list.map((x) => x.pos)).toEqual(["QB", "K", "P", "LS"]);
    expect(list[0].ids.length).toBeGreaterThan(0);
  }, 300_000);

  it("doesn't let a player signed on game day play that day", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const g = nextGame(s, TEAM, 10)!;
    s.date = g.date;
    const fa = Object.keys(s.players).find((id) => s.players[id].status === "fa" && PLAYER_BY_ID[id]?.position === "WR" && !s.players[id].injury)!;
    signStreetFreeAgent(s, TEAM, fa);
    expect(s.players[fa].team).toBe(TEAM);
    const m = matchup(s, g)!;
    const out = simulateGame(s, g, m.away, m.home);
    const side = m.home === TEAM ? "home" : "away";
    expect(out.box.inactives[side]).toContain(fa);
    expect(out.box.players[side][fa]).toBeUndefined();
  }, 300_000);

  it("reads waiver risk and lets the practice plan sharpen the game plan", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const odds = ours(s).filter((id) => subjectToWaivers(s, id)).map((id) => claimOdds(s, id));
    expect(odds.length).toBeGreaterThan(5);
    for (const p of odds) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1); }
    expect(odds.some((p) => p > 0)).toBe(true);
    const g = nextGame(s, TEAM, 10)!;
    const m = matchup(s, g)!;
    const opp = m.home === TEAM ? m.away : m.home;
    const quality = (e: "plan" | "fundamentals") => {
      const c = structuredClone(s);
      setPrograms(c, { emphasis: e });
      return gamePlan(c, TEAM, opp, g).quality;
    };
    expect(quality("plan")).toBeGreaterThan(quality("fundamentals"));
    void GAMES_BY_DATE; void weekday;
  }, 300_000);
});

describe("scouting staff", () => {
  it("has a scout for each position group, with leans that move our board", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const sc = scouts(s);
    expect(sc.staff.length).toBe(5);
    const ids = draftClass(s.seed).prospects.slice(0, 300).map((p) => p.id);
    const spread = (e: "tape" | "testing") => { setEmphasis(s, e); return ids.reduce((t, id) => t + Math.abs(leanBias(s, id)), 0) / ids.length; };
    expect(spread("testing")).toBeGreaterThan(spread("tape"));
    const before = perceivedValue(s, ids[0]);
    setEmphasis(s, "production");
    expect(perceivedValue(s, ids[0])).not.toBe(before);
    const old = sc.staff[0].name;
    const spent = s.college!.scouting.spent;
    replaceScout(s, sc.staff[0].id);
    expect(sc.staff[0].id).not.toBe("scout-1");
    expect(s.college!.scouting.spent).toBeGreaterThan(spent);
    void old;
  }, 300_000);

  it("lets the GM make our picks from a chosen round", () => {
    const s = stateAt(TEAM, 3, "draftStart");
    setGmFrom(s, 1);
    advanceToOurPick(s);
    expect(currentSlot(s)).toBeNull();
    expect(draftState(s).made.filter((m) => m.team === TEAM).every((m) => m.by === "gm")).toBe(true);
  }, 300_000);
});

describe("contract bonuses and the cash floor", () => {
  it("writes per-game roster bonuses into veteran deals and settles them after the season", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const season = RULES.season;
    let id = "";
    for (const x of Object.keys(s.players)) {
      const d = dealOf(s, x);
      if (!d || d.kind !== "veteran" || s.players[x].status !== "active") continue;
      const y = d.years.find((v) => v.year === season);
      if (!y || y.guaranteed || y.injuryGuaranteed || y.base < 2_000_000) continue;
      // Force both bonuses by trying seeds of the date until one takes.
      for (let i = 0; i < 30 && !y.perGame; i++) { s.date = addDays("2026-10-31", i); attachBonuses(s, x, d, season); }
      if (y.perGame) { id = x; break; }
    }
    expect(id).not.toBe("");
    const y = dealOf(s, id)!.years.find((v) => v.year === season)!;
    expect(yearCapHit(y)).toBeGreaterThan(0);
    const team = dealOf(s, id)!.team;
    const paid = cashPaid(s, team, season);
    s.date = addDays(RULES.keyDates.superBowl, 2);
    bonusesDaily(s);
    expect(y.perGameSettled).toBeDefined();
    expect(cashPaid(s, team, season)).toBeGreaterThanOrEqual(paid + y.perGame! * (y.perGameSettled ?? 0));
  }, 300_000);

  it("counts cash spending in four-year periods", () => {
    expect(periodOf(2026)).toEqual([2027, 2030]);
    expect(periodOf(2027)).toEqual([2027, 2030]);
    expect(periodOf(2031)).toEqual([2031, 2034]);
    const s = stateAt(TEAM, 3, "2026-10-31");
    expect(cashSpending(s, TEAM).paid).toBe(0);
    s.finance[TEAM].paid[2027] = 200_000_000;
    const d = cashSpending(s, TEAM, 2027);
    expect(d.from).toBe(2027);
    expect(d.paid).toBe(200_000_000);
    expect(d.floor).toBeCloseTo(d.caps * 0.89);
  }, 300_000);
});
