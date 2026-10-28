import { beforeAll, describe, expect, it } from "vitest";
import { capHit, capSummary, teamPlayerIds } from "../src/engine/cap";
import { dealOf } from "../src/engine/contracts";
import { market, signFreeAgent } from "../src/engine/freeagency";
import { RULES, SCHEDULE, TEAMS } from "../src/engine/league";
import { addDays } from "../src/engine/dates";
import { marketPrice } from "../src/engine/market";
import { talksFor } from "../src/engine/negotiation";
import { applyTag, canTag, faClass, isPendingFreeAgent, NEXT, pendingFreeAgents, tagCost } from "../src/engine/offseason";
import { advanceDay, advanceToNextEvent, draftWaiting, isGameOver, isSeasonOver, newGame } from "../src/engine/season";
import { advanceToOurPick, currentSlot, makePick, staffRecommendations } from "../src/engine/draft";
import { rosterCount } from "../src/engine/roster";
import { compress, decompress } from "../src/save/codec";
import type { GameState, OfferTerms } from "../src/engine/types";
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
let endOfSeason: string;

async function clone(): Promise<GameState> {
  return decompress(await compress(JSON.parse(endOfSeason)));
}

function until(state: GameState, date: string): void {
  while (state.date < date && !isGameOver(state)) advanceDay(state);
}

/** The best expiring unrestricted free agent on a team. */
function bestUfa(state: GameState, team: string): string {
  const id = pendingFreeAgents(state, team).filter((id) => faClass(id) === "UFA")
    .sort((a, b) => marketPrice(state, b, NEXT).apy - marketPrice(state, a, NEXT).apy)[0];
  if (!id) throw new Error(`no UFA on ${team}`);
  return id;
}

beforeAll(() => {
  const state = newGame(TEAM, "Owner", { capRules: "real" }, 3);
  while (!isSeasonOver(state)) advanceDay(state);
  endOfSeason = JSON.stringify(state);
}, 120_000);

describe("the offseason", () => {
  it("opens after the Super Bowl with expiring deals and a rollover", async () => {
    const state = await clone();
    advanceDay(state);
    expect(state.offseason).toBeTruthy();
    expect(pendingFreeAgents(state, TEAM).length).toBeGreaterThan(5);
    expect(state.league?.rollover?.[TEAM]?.[NEXT]).toBeGreaterThanOrEqual(0);
  });

  it("a franchise tag keeps the player for a year at the tag price", async () => {
    const state = await clone();
    until(state, K.franchiseTagWindowOpens);
    const id = bestUfa(state, TEAM);
    expect(canTag(state, TEAM, id).ok).toBe(true);
    const cost = tagCost(state, id, "franchise");
    applyTag(state, TEAM, id, "franchise");
    expect(isPendingFreeAgent(state, id)).toBe(false);
    expect(capHit(id, NEXT, state)).toBe(cost);
    expect(canTag(state, TEAM, bestUfa(state, TEAM)).ok).toBe(false); // one tag a year
    until(state, K.newLeagueYear);
    advanceDay(state);
    expect(state.players[id].team).toBe(TEAM);
  });

  it("expiring deals end at the new league year and the players become free agents", async () => {
    const state = await clone();
    until(state, K.franchiseTagDeadline);
    const leaving = pendingFreeAgents(state, TEAM).filter((id) => faClass(id) === "UFA");
    until(state, K.newLeagueYear);
    advanceDay(state);
    const gone = leaving.filter((id) => state.players[id].status === "fa");
    expect(gone.length).toBeGreaterThan(0);
    for (const id of gone) {
      expect(state.players[id].lastTeam).toBe(TEAM);
      expect(dealOf(state, id)).toBeFalsy();
      expect(teamPlayerIds(state, TEAM)).not.toContain(id);
    }
    expect(capSummary(state, TEAM).limit).toBeGreaterThan(RULES.salaryCap);
  });

  it("other teams' free agents are off limits until the negotiating window", async () => {
    const state = await clone();
    until(state, K.scoutingCombineStart);
    const other = TEAMS.find((t) => t.id !== TEAM && pendingFreeAgents(state, t.id).some((id) => faClass(id) === "UFA"))!.id;
    const id = bestUfa(state, other);
    expect(talksFor(state, TEAM, id).ok).toBe(false);
    until(state, K.negotiatingWindowOpens);
    advanceDay(state);
    const fa = market(state)[id];
    if (fa?.status === "open") expect(talksFor(state, TEAM, id).ok).toBe(true);
  });

  it("deals agreed in the window are signed when the league year opens", async () => {
    const state = await clone();
    until(state, K.negotiatingWindowOpens);
    advanceDay(state);
    const id = Object.values(market(state)).find((f) => f.status === "open" && f.from !== TEAM)!.player;
    const t: OfferTerms = { years: 2, total: 4_000_000, signingBonus: 1_000_000, guaranteed: 1_000_000, injuryGuaranteed: 0, voidYears: 0, shape: "flat" };
    signFreeAgent(state, id, TEAM, t);
    expect(market(state)[id].status).toBe("agreed");
    expect(state.players[id].team).not.toBe(TEAM);
    until(state, K.newLeagueYear);
    advanceDay(state);
    expect(state.players[id].team).toBe(TEAM);
    expect(market(state)[id].status).toBe("signed");
    expect(dealOf(state, id)!.years[0].year).toBe(NEXT);
  });

  it("free agency plays out the same way for a seed", async () => {
    const run = async () => {
      const state = await clone();
      until(state, "2027-03-14");
      return JSON.stringify(state.signings.slice(0, 40).map((s) => [s.player, s.team, s.apy]));
    };
    expect(await run()).toBe(await run());
  }, 60_000);

  it("reaches draft day with the order, comp picks and mocks set", async () => {
    const state = await clone();
    until(state, K.draftStart);
    expect(isGameOver(state)).toBe(false);
    const d = state.draft!;
    expect(d.order!.length).toBe(256);
    expect(d.comp!.length).toBe(32);
    expect(d.mocks.length).toBeGreaterThanOrEqual(10);
    expect(d.mocks[0].rounds).toBe(4);
    expect(d.mocks[d.mocks.length - 1].rounds).toBe(1);
    // Comp picks come at the end of their round.
    const r3 = d.order!.filter((id) => id.startsWith("2027-3-"));
    expect(r3.slice(-4).every((id) => id.includes("-c"))).toBe(true);
    // The clock waits on draft day: advancing skips nothing until the owner moves the draft.
    expect(draftWaiting(state)).toBe(true);
    advanceToNextEvent(state);
    expect(state.date).toBe(K.draftStart);
    // Most top free agents have found teams by the draft (a few overpriced backup quarterbacks wait).
    const top = Object.values(market(state)).filter((f) => f.base >= 15_000_000);
    expect(top.filter((f) => f.status !== "open").length / Math.max(1, top.length)).toBeGreaterThan(0.7);
  }, 60_000);

  it("runs the draft at the owner's pace, then moves on to the next season", async () => {
    const state = await clone();
    const draftStart = K.draftStart;
    until(state, draftStart);
    const d = state.draft!;
    // Our staff weighs in when we're on the clock, and the owner can pick.
    advanceToOurPick(state);
    const slot = currentSlot(state)!;
    expect(slot.team).toBe(TEAM);
    const recs = staffRecommendations(state);
    expect(recs.map((r) => r.role)).toEqual(["GM", "HC", "OC", "DC"]);
    expect(makePick(state, recs[1].player, "owner")).toBeNull();
    const rookie = recs[1].player;
    expect(state.players[rookie].team).toBe(TEAM);
    expect(dealOf(state, rookie)!.kind).toBe("rookie");
    expect(dealOf(state, rookie)!.years.length).toBe(4);
    // Day 1 ends with grades; the GM takes over if the owner sims the rest of the day.
    advanceDay(state);
    expect(d.daysDone).toEqual([1]);
    expect(d.made.length).toBe(32);
    expect(d.made.every((m) => m.grade)).toBe(true);
    // A skipped pick of ours is the GM's.
    advanceDay(state);
    advanceDay(state);
    expect(d.made.length).toBe(256);
    expect(d.made.filter((m) => m.team === TEAM && m.overall > slot.overall).every((m) => m.by === "gm")).toBe(true);
    // The day after the draft the league moves on to the next season.
    expect(state.date).toBe(addDays(draftStart, 3));
    expect(state.season).toBe(2027);
    expect(RULES.season).toBe(2027);
    expect(isGameOver(state)).toBe(false);
    expect(state.history!.seasons[0].champion).toBeTruthy();
    expect(state.history!.drafts[0].picks.length).toBe(256);
    expect(SCHEDULE.filter((g) => g.type === "REG").length).toBe(272);
    // Undrafted free agents signed; nobody is over 90.
    expect(Object.keys(d.udfa ?? {}).length).toBeGreaterThan(100);
    for (const t of TEAMS) expect(rosterCount(state, t.id).roster).toBeLessThanOrEqual(90);
    // Draftees survive a save and load.
    const back = await decompress(await compress(state));
    expect(back.players[rookie].team).toBe(TEAM);
    expect(capHit(rookie, NEXT, back)).toBeGreaterThan(0);
    // The new season's clock runs.
    const date = state.date;
    advanceDay(state);
    expect(state.date).toBe(addDays(date, 1));
  }, 120_000);
});

describe("roster building", () => {
  it("a post-June 1 release holds the cap hit until June 2, then splits the dead money", async () => {
    const state = await clone();
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
    const state = await clone();
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
    const state = await clone();
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
    const state = await clone();
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
