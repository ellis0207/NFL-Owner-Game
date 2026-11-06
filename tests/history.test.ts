import { describe, expect, it } from "vitest";
import { bonusesDaily } from "../src/engine/bonuses";
import { teamPlayerIds } from "../src/engine/cap";
import { dealOf } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { careerScore, honors, honorsDaily, honorsOf, proBowls } from "../src/engine/honors";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "../src/engine/league";
import { marketPrice } from "../src/engine/market";
import { draftDeal, extensionEligibility, offerValue, openTalks, startYearFor } from "../src/engine/negotiation";
import { contractMilestones, eras, records, rivals, tradeOutcomes } from "../src/engine/records";
import { history } from "../src/engine/seasons";
import { newGame } from "../src/engine/season";
import { seasonTotals } from "../src/engine/stats";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("honors", () => {
  it("names Pro Bowl and All-Pro teams and hands out the awards from the season's results", () => {
    const s = stateAt(TEAM, 3);
    const h = honors(s);
    const season = RULES.season;
    expect(h.proBowl[season].length).toBeGreaterThan(80);
    expect(h.allPro[season].first.length).toBeGreaterThan(20);
    const both = new Set([...h.allPro[season].first, ...h.allPro[season].second]);
    expect(both.size).toBe(h.allPro[season].first.length + h.allPro[season].second.length);
    // Every first-team All-Pro quarterback had a real season.
    const totals = seasonTotals(s, "REG");
    const qb = h.allPro[season].first.find((id) => PLAYER_BY_ID[id].position === "QB")!;
    expect(Number(totals[qb].line.passYds)).toBeGreaterThan(2500);
    const awards = h.awards[season];
    expect(awards.map((a) => a.award).sort()).toEqual(["COY", "CPOY", "DPOY", "DROY", "MVP", "OPOY", "OROY"]);
    for (const a of awards.filter((x) => x.award === "OROY" || x.award === "DROY")) expect(PLAYER_BY_ID[a.winner].rookieYear).toBe(season);
    const mvp = awards.find((a) => a.award === "MVP")!;
    expect(honorsOf(s, mvp.winner)).toContain(`${season} Most Valuable Player`);
    expect(s.staff!.people[awards.find((a) => a.award === "COY")!.winner].role).toBe("HC");
    // The fifth-year option counts these Pro Bowls.
    expect(proBowls(s, h.proBowl[season][0])).toBe(1);
  }, 600_000);

  it("votes long, productive careers into the Hall of Fame five years after retirement", () => {
    const s = stateAt(TEAM, 3);
    const season = RULES.season;
    const pool = Object.keys(s.players).filter((id) => PLAYER_BY_ID[id] && (PLAYER_BY_ID[id].yearsExp ?? 0) >= 12);
    const best = pool.sort((a, b) => careerScore(s, b) - careerScore(s, a)).slice(0, 3);
    const short = Object.keys(s.players).find((id) => PLAYER_BY_ID[id] && PLAYER_BY_ID[id].yearsExp === 2)!;
    for (const id of [...best, short]) history(s).retired[id] = season - 5;
    const h = honors(s);
    delete h.hof.classes[season + 1];
    s.date = addDays(RULES.keyDates.superBowl, -3);
    honorsDaily(s);
    expect(h.hof.classes[season + 1].length).toBeGreaterThan(0);
    expect(h.hof.classes[season + 1]).not.toContain(short);
    for (const id of h.hof.classes[season + 1]) expect(best).toContain(id);
  }, 600_000);
});

describe("records and the league's memory", () => {
  it("keeps the best marks, rivalries, trade outcomes and eras", () => {
    const s = stateAt(TEAM, 3);
    const r = records(s);
    expect(r.season.passYds.value).toBeGreaterThan(3500);
    expect(r.game.rushYds.value).toBeGreaterThan(100);
    expect(Object.keys(r.h2h).length).toBeGreaterThan(150);
    const list = rivals(s, TEAM);
    const division = list.slice(0, 3).filter((x) => TEAM_BY_ID[x.team].division === TEAM_BY_ID[TEAM].division && TEAM_BY_ID[x.team].conference === TEAM_BY_ID[TEAM].conference);
    expect(division.length).toBeGreaterThanOrEqual(2);
    expect(list[0].games).toBeGreaterThanOrEqual(2);
    const done = (s.trades?.log ?? []).filter((t) => t.status === "done").length;
    const out = tradeOutcomes(s);
    expect(out.length).toBe(done);
    for (const o of out) expect(o.verdict.length).toBeGreaterThan(0);
    const e = eras(s, TEAM).find((x) => x.role === "HC")!;
    expect(e.w + e.l + e.t).toBe(17);
    expect(Array.isArray(contractMilestones(s))).toBe(true);
  }, 600_000);
});

describe("negotiable bonuses", () => {
  function fresh(): GameState { return newGame(TEAM, "Owner", { capRules: "real" }, 7); }

  it("writes the owner's per-game, workout and escalator terms, and agents price them", () => {
    const s = fresh();
    const id = teamPlayerIds(s, TEAM).filter((x) => extensionEligibility(s, x).ok && !s.players[x].holdout)
      .map((x) => ({ x, apy: marketPrice(s, x, startYearFor(s, x, "extension")).apy })).filter((o) => o.apy >= 4_000_000)
      .sort((a, b) => b.apy - a.apy)[0].x;
    const neg = openTalks(s, TEAM, id, "extension", "owner");
    const base = { ...neg.rounds[0].terms, years: Math.max(3, neg.rounds[0].terms.years) };
    const plain = { ...base, perGame: 0, workout: 0, escalator: 0 };
    const withBonuses = { ...base, perGame: 0.15, workout: 250_000, escalator: 1_000_000 };
    expect(offerValue(neg, { ...plain, escalator: 1_000_000 })).toBeGreaterThan(offerValue(neg, plain));
    expect(offerValue(neg, { ...plain, perGame: 0.15 })).toBeLessThan(offerValue(neg, plain));
    // A player who misses games prices per-game money lower still.
    expect(offerValue({ ...neg, missRisk: 0.4 }, { ...plain, perGame: 0.15 })).toBeLessThan(offerValue({ ...neg, missRisk: 0.05 }, { ...plain, perGame: 0.15 }));
    const deal = draftDeal(s, neg, withBonuses);
    const added = deal.years.filter((y) => !y.void && y.year > (dealOf(s, id)!.years.filter((v) => !v.void).slice(-1)[0].year));
    const open = added.filter((y) => !y.guaranteed && !y.injuryGuaranteed);
    expect(open.some((y) => y.perGame && y.workout === 250_000)).toBe(open.length > 0);
    expect(added.slice(0, -1).every((y) => y.escalator?.amount === 1_000_000)).toBe(true);
    expect(added[added.length - 1].escalator).toBeUndefined();
    const none = draftDeal(s, neg, plain);
    expect(none.years.some((y) => y.perGame || y.workout || y.escalator)).toBe(false);
  }, 120_000);

  it("raises next year's salary when an escalator is met", () => {
    const s = stateAt(TEAM, 3);
    const season = RULES.season;
    const totals = seasonTotals(s, "REG");
    const id = teamPlayerIds(s, TEAM).find((x) => {
      const d = dealOf(s, x);
      return d && d.years.some((y) => y.year === season + 1 && !y.void) && Number(totals[x]?.line.offSnaps ?? 0) > 900;
    })!;
    const deal = dealOf(s, id)!;
    s.contracts[id] = deal;
    const y = deal.years.find((v) => v.year === season)!;
    const next = deal.years.find((v) => v.year === season + 1)!;
    const before = next.base;
    y.escalator = { amount: 750_000, share: 0.65 };
    s.date = addDays(RULES.keyDates.superBowl, 2);
    bonusesDaily(s);
    expect(y.escalator.met).toBe(true);
    expect(next.base).toBe(before + 750_000);
  }, 600_000);
});
