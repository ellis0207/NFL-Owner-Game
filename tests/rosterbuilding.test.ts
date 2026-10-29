import { beforeAll, describe, expect, it } from "vitest";
import { capHit, teamPlayerIds } from "../src/engine/cap";
import { dealOf } from "../src/engine/contracts";
import { market } from "../src/engine/freeagency";
import { RULES } from "../src/engine/league";
import { addDays } from "../src/engine/dates";
import { marketPrice } from "../src/engine/market";
import { NEXT } from "../src/engine/offseason";
import { advanceDay, isGameOver, newGame } from "../src/engine/season";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";
import { askPayCut, canJune1, june1Left, payCutInfo, releaseJune1 } from "../src/engine/capmoves";
import { scheduleVisit } from "../src/engine/freeagency";
import { sendCrew, upcomingProDays } from "../src/engine/prodays";
import { schoolName } from "../src/engine/collegeData";
import { writeDeal, writeExtension } from "../src/engine/contracts";
import { ageOn } from "../src/engine/dates";
import { PLAYER_BY_ID } from "../src/engine/league";
import { releasePlayer } from "../src/engine/roster";

const TEAM = "DET";
const K = RULES.keyDates;

/** Our save (seed 3) at the end of the 2026 season, or at a later key date. */
function at(when?: string): GameState {
  return stateAt(TEAM, 3, when);
}

function until(state: GameState, date: string): void {
  while (state.date < date && !isGameOver(state)) advanceDay(state);
}

beforeAll(() => {
  at();
}, 120_000);

describe("roster building", () => {
  it("a post-June 1 release holds the cap hit until June 2, then splits the dead money", async () => {
    const state = at("newLeagueYear");
    until(state, addDays(K.newLeagueYear, 1));
    const year = NEXT;
    // A player with bonus money left after this year, so the split matters.
    const id = teamPlayerIds(state, TEAM)
      .filter((x) => (dealOf(state, x)?.years.filter((y) => y.year > year).reduce((s, y) => s + y.proration, 0) ?? 0) > 1_000_000)
      .sort((a, b) => capHit(b, year, state) - capHit(a, year, state))[0];
    expect(id).toBeTruthy();
    expect(canJune1(state, TEAM, id).ok).toBe(true);
    const hit = capHit(id, year, state);
    const deadBefore = state.deadMoney[TEAM]?.[String(year)] ?? 0;
    const r = releaseJune1(state, id)!;
    expect(r.deadNext).toBeGreaterThan(0);
    expect(state.players[id].team).toBeNull();
    // Until June 2 the whole cap hit still counts.
    expect((state.deadMoney[TEAM]?.[String(year)] ?? 0) - deadBefore).toBe(Math.max(hit, r.dead));
    expect(state.deadMoney[TEAM]?.[String(year + 1)]).toBeGreaterThanOrEqual(r.deadNext);
    expect(june1Left(state, TEAM)).toBe(1);
    // Other moves over the spring can add dead money, so compare across June 2 only.
    until(state, `${year}-06-01`);
    const deadJune1 = state.deadMoney[TEAM]?.[String(year)] ?? 0;
    until(state, `${year}-06-03`);
    expect(state.league.june1?.find((j) => j.player === id)?.done).toBe(true);
    expect(deadJune1 - (state.deadMoney[TEAM]?.[String(year)] ?? 0)).toBeCloseTo(r.held, -5);
  }, 120_000);

  it("a veteran takes a reasonable pay cut but turns down an insulting one", async () => {
    const state = at();
    advanceDay(state);
    const year = NEXT;
    const vets = teamPlayerIds(state, TEAM)
      .map((id) => ({ id, info: payCutInfo(state, TEAM, id), age: ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 0 }))
      .filter((x) => x.info.ok && x.info.base - x.info.least > 1_000_000)
      .sort((a, b) => b.info.base - a.info.base);
    expect(vets.length).toBeGreaterThan(1);
    const insult = vets[0];
    const low = askPayCut(state, TEAM, insult.id, insult.info.least);
    expect(low.answer).not.toBe("accepted");
    expect(capHit(insult.id, year, state)).toBeGreaterThan(insult.info.least);
    // An overpaid veteran takes a token cut, and the cap hit falls by the same amount.
    const easy = vets.filter((x) => x.id !== insult.id).sort((a, b) => marketPrice(state, a.id, year).apy / a.info.base - marketPrice(state, b.id, year).apy / b.info.base)[0];
    expect(marketPrice(state, easy.id, year).apy).toBeLessThan(easy.info.base * 0.8);
    const before = capHit(easy.id, year, state);
    const ok = askPayCut(state, TEAM, easy.id, easy.info.base - 300_000);
    expect(ok.answer).toBe("accepted");
    expect(before - capHit(easy.id, year, state)).toBeGreaterThanOrEqual(250_000);
  });

  it("schools hold pro days after the combine, and our people learn more", async () => {
    const state = at("scoutingCombineStart");
    const upcoming = (() => { until(state, addDays(K.scoutingCombineStart, 5)); return upcomingProDays(state, 40); })();
    expect(upcoming.length).toBeGreaterThan(20);
    const target = upcoming[0];
    const k0 = Math.max(...target.prospects.map((id) => state.college!.scouting.know[id] ?? 0));
    expect(sendCrew(state, target.school, "director").ok).toBe(true);
    until(state, addDays(target.date, 1));
    expect(Object.keys(state.draft!.proDay ?? {}).length).toBeGreaterThan(0);
    const k1 = Math.max(...target.prospects.map((id) => state.college!.scouting.know[id] ?? 0));
    expect(k1).toBeGreaterThan(k0);
    expect(state.inbox.some((m) => m.title === `${schoolName(target.school)} pro day`)).toBe(true);
  }, 60_000);

  it("a free agent visit holds his decision for the day and sends us a report", async () => {
    const state = at("newLeagueYear");
    until(state, addDays(K.newLeagueYear, 1));
    const fa = Object.values(market(state)).filter((f) => f.status === "open").sort((a, b) => b.base - a.base)[0];
    expect(scheduleVisit(state, TEAM, fa.player).ok).toBe(true);
    expect(scheduleVisit(state, TEAM, fa.player).ok).toBe(false);
    advanceDay(state);
    advanceDay(state);
    expect(market(state)[fa.player].visits!.some((v) => v.team === TEAM && v.done)).toBe(true);
    expect(state.inbox.some((m) => m.title === `${PLAYER_BY_ID[fa.player].name} visited`)).toBe(true);
  }, 60_000);

  it("in-season releases don't leak into next year's rollover", async () => {
    const state = newGame(TEAM, "Owner", { capRules: "real" }, 4);
    const id = teamPlayerIds(state, "BUF").sort((a, b) => capHit(b, RULES.season, state) - capHit(a, RULES.season, state))[10];
    releasePlayer(state, id);
    expect(state.league?.rollover?.BUF?.[RULES.season + 1]).toBeUndefined();
  });

  it("an extension keeps old void-year money spread over the new years", () => {
    const current = writeDeal({ years: 2, total: 20_000_000, signingBonus: 10_000_000, guaranteed: 10_000_000, injuryGuaranteed: 0, voidYears: 3, shape: "flat" },
      { team: TEAM, date: "2026-03-20", kind: "veteran", firstYear: 2026, yearsExp: 5 });
    const voided = current.years.filter((y) => y.void).reduce((s, y) => s + y.proration, 0);
    expect(voided).toBeGreaterThan(0);
    const ext = writeExtension(current, { years: 3, total: 30_000_000, signingBonus: 6_000_000, guaranteed: 6_000_000, injuryGuaranteed: 0, voidYears: 0, shape: "flat" }, "2027-06-01", 6);
    // Nothing piles onto this year, and the money is all still there.
    expect(ext.years.find((y) => y.year === 2027)!.proration).toBeLessThan(current.years.find((y) => y.year === 2027)!.proration + voided);
    expect(ext.years.filter((y) => y.year >= 2028 && !y.void).reduce((s, y) => s + y.proration, 0)).toBeGreaterThanOrEqual(voided);
    const total = (d: typeof ext) => d.years.filter((y) => y.year >= 2027).reduce((s, y) => s + y.proration, 0);
    expect(total(ext)).toBe(total(current) + 6_000_000);
  });
});
