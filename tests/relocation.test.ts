import { beforeAll, describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { construction, constructionDaily } from "../src/engine/construction";
import { addDays } from "../src/engine/dates";
import { fanBase, METRO } from "../src/engine/fans";
import {
  answerOffer, applyForRights, gamesAbroad, global, globalDaily, hedge, pathwayPlayers, planTrip, rateFor, restorePathway, setActivity, clearPathway,
} from "../src/engine/global";
import { PLAYER_BY_ID, RULES, SCHEDULE, TEAM_BY_ID } from "../src/engine/league";
import { clubTimeline } from "../src/engine/records";
import {
  bindRelocation, exitCosts, fileRelocation, forceMove, marketById, markets, marketStudy, moveGateFactor, proposeRealign, relocation, relocationDaily, relocationFee, withdrawBid,
} from "../src/engine/relocation";
import { psRoom } from "../src/engine/roster";
import { newGame } from "../src/engine/season";
import { MARKETS, STADIUM_BY_TEAM } from "../src/engine/stadiums";
import type { GameState } from "../src/engine/types";
import { compress, decompress } from "../src/save/codec";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const M = 1_000_000;

function inWindow(state: GameState): void {
  state.date = `${Number(state.date.slice(0, 4)) + (state.date.slice(5) > "02-15" ? 1 : 0)}-01-10`;
}

beforeAll(() => {
  stateAt(TEAM, 3, "2026-10-10");
}, 600_000);

describe("relocation", () => {
  it("lists open markets and second-team markets only where the metro is big enough", () => {
    const state = newGame(TEAM, "x", { capRules: "real" }, 1);
    const ids = markets(state).map((m) => m.id);
    for (const id of ["SAT", "STL", "SD", "OAK", "POR", "SLC", "TOR", "CLB"]) expect(ids).toContain(id);
    expect(ids).toContain("2-CHI");
    expect(ids).not.toContain("2-DET");
    expect(ids).not.toContain("2-NYG");
    expect(marketById(state, "TOR")!.country).toBe("CA");
  });

  it("a market study weighs size, money, attachment and nearby clubs; leaving costs the lease and any pledge", () => {
    const state = newGame(TEAM, "x", { capRules: "real" }, 1);
    expect(marketStudy(state, "STL")).toBeNull();
    const st = relocation(state).studies[0];
    expect(st.score).toBeGreaterThan(0);
    expect(st.competition.some((c) => c.includes("Kansas City"))).toBe(true);
    expect(marketStudy(state, "STL")).toMatch(/this year/);
    const base = exitCosts(state);
    expect(base.lease).toBeGreaterThan(0);
    construction(state).plan = { stayUntil: 2060, funding: { public: 600 * M } } as never;
    const pledged = exitCosts(state);
    expect(pledged.pledge).toBeGreaterThan(400 * M);
    expect(relocationFee(state, marketById(state, "2-CHI")!)).toBeGreaterThan(relocationFee(state, marketById(state, "SLC")!));
  });

  it("applications need the window and a study; the committee reviews and the owners vote", () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    expect(fileRelocation(state, "SAT")).toMatch(/January 1/);
    inWindow(state);
    expect(fileRelocation(state, "SAT")).toMatch(/market study/);
    marketStudy(state, "SAT");
    const trust = fanBase(state).trust;
    // Without trying at home first, the room is cold.
    expect(fileRelocation(state, "SAT", { identity: "rename" })).toMatch(/new name/);
    expect(fileRelocation(state, "SAT")).toBeNull();
    expect(fanBase(state).trust).toBeLessThan(trust);
    expect(moveGateFactor(state, state.date)).toBe(0.85);
    const bid = relocation(state).bids[0];
    while (bid.status === "filed") {
      state.date = addDays(state.date, 1);
      relocationDaily(state);
    }
    expect(bid.review!.concerns.some((c) => c.includes("home"))).toBe(true);
    expect(bid.yes).toBeDefined();
    // With the city's door closed (a failed public vote), the same bid does much better.
    const again = stateAt(TEAM, 3, "2026-10-10");
    inWindow(again);
    marketStudy(again, "SAT");
    construction(again).exploreRelocation = "2026-12-01";
    fileRelocation(again, "SAT");
    const b2 = relocation(again).bids[0];
    while (b2.status === "filed") {
      again.date = addDays(again.date, 1);
      relocationDaily(again);
    }
    expect(b2.yes!).toBeGreaterThan(bid.yes!);
    expect(b2.status).toBe("approved");
    expect(TEAM_BY_ID[TEAM].city).toBe("San Antonio");
    // Withdrawing is possible while the application is pending.
    const w = stateAt(TEAM, 3, "2026-10-10");
    inWindow(w);
    marketStudy(w, "STL");
    fileRelocation(w, "STL");
    expect(withdrawBid(w)).toBeNull();
    expect(moveGateFactor(w, w.date)).toBe(1);
  }, 120_000);

  it("a move rebinds the city, market, climate and stadium, pays the fee and costs, ends local deals, resets fans and keeps the history", async () => {
    const state = stateAt(TEAM, 3, "2026-10-10");
    const before = business(state).ledger.length;
    const deals = business(state).local!.deals.length;
    expect(deals).toBeGreaterThan(0);
    forceMove(state, TEAM, "STL", { identity: "rename", name: "Archers" });
    expect(TEAM_BY_ID[TEAM].city).toBe("St. Louis");
    expect(STADIUM_BY_TEAM[TEAM].name).toBe("The Dome at America's Center");
    expect(STADIUM_BY_TEAM[TEAM].roof).toBe("dome");
    expect(METRO[TEAM].pop).toBe(2.8);
    expect(MARKETS[TEAM].target).toBeGreaterThan(600 * M);
    expect(state.leases![TEAM].log[0].text).toMatch(/St. Louis/);
    const lines = business(state).ledger.slice(before);
    expect(lines.some((e) => e.cat === "relocation" && /installment 1 of 10/.test(e.note ?? ""))).toBe(true);
    expect(relocation(state).feeYears).toBe(9);
    expect(business(state).local!.deals).toHaveLength(0);
    expect(fanBase(state).core0).toBeLessThan(60);
    expect(state.merch!.rebrand!.name).toBe("Archers");
    expect(clubTimeline(state).some((x) => x.text.startsWith("Moved from Detroit to St. Louis"))).toBe(true);
    // New-market crowds start below a settled market and catch up.
    const season = relocation(state).moves[0].season;
    expect(moveGateFactor(state, `${season}-09-15`)).toBeGreaterThan(moveGateFactor(state, `${season + 1}-09-15`));
    expect(moveGateFactor(state, `${season + 1}-09-15`)).toBeLessThan(moveGateFactor(state, `${season + 5}-09-15`));
    expect(moveGateFactor(state, `${season + 7}-09-15`)).toBe(1);
    // Saved and loaded, the move is laid back over the data.
    const text = await compress(state);
    bindRelocation({ season: 2026 } as GameState);
    expect(TEAM_BY_ID[TEAM].city).toBe("Detroit");
    const back = await decompress(text);
    expect(TEAM_BY_ID[TEAM].city).toBe("St. Louis");
    expect(STADIUM_BY_TEAM[TEAM].name).toBe("The Dome at America's Center");
    expect(back.relocation!.moves).toHaveLength(1);
  }, 120_000);

  it("a stopgap venue for a CPU club comes with a new stadium; the club stays in its division unless owners realign", () => {
    const state = newGame(TEAM, "x", { capRules: "real" }, 2);
    const div = TEAM_BY_ID.GB.division;
    forceMove(state, "GB", "POR");
    expect(TEAM_BY_ID.GB.division).toBe(div);
    expect(construction(state).cpu.at(-1)!.team).toBe("GB");
    forceMove(state, TEAM, "SAT");
    expect(proposeRealign(state, "HOU")).toMatch(/annual meeting/);
    const x = relocation(state).realign[0];
    x.status = "approved";
    bindRelocation(state, x.season - 1);
    expect(TEAM_BY_ID[TEAM].conference).toBe("NFC");
    bindRelocation(state, x.season);
    expect(TEAM_BY_ID[TEAM].conference).toBe("AFC");
    expect(TEAM_BY_ID[TEAM].division).toBe("South");
    expect(TEAM_BY_ID.HOU.division).toBe("North");
    bindRelocation({ season: 2026 } as GameState);
  });

  it("CPU clubs move rarely, and only after a failed stadium plan", () => {
    let moves = 0;
    let failed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const state = newGame(TEAM, "x", { capRules: "real" }, seed);
      for (let y = 2027; y <= 2037; y++) {
        state.date = `${y}-02-01`;
        relocationDaily(state);
        state.date = `${y}-03-01`;
        constructionDaily(state);
        relocationDaily(state);
      }
      failed += construction(state).cpu.filter((b) => b.failed).length;
      const r = state.relocation;
      moves += r?.moves.length ?? 0;
      for (const m of r?.moves ?? []) expect(construction(state).cpu.some((b) => b.team === m.team && b.failed)).toBe(true);
      bindRelocation({ season: 2026 } as GameState);
    }
    expect(moves / 10).toBeLessThanOrEqual(1);
    expect(moves).toBeLessThanOrEqual(failed);
  });
});

describe("international growth", () => {
  it("rights come through the league; content and events build an audience over years; costs come first", () => {
    const state = newGame(TEAM, "x", { capRules: "real" }, 1);
    const g = global(state);
    state.date = "2026-10-01";
    expect(applyForRights(state, ["UK", "DE", "MX", "BR"])).toMatch(/at most three/);
    expect(applyForRights(state, ["UK", "MX"])).toMatch(/mid-December/);
    state.date = "2026-12-15";
    globalDaily(state);
    expect(g.rights.map((r) => r.market).sort()).toEqual(["MX", "UK"]);
    setActivity(state, "UK", { content: 3, events: 2, merch: true });
    const fans: number[] = [];
    let cost = 0;
    let income = 0;
    for (let i = 0; i < 48; i++) {
      state.date = addDays(state.date.slice(0, 8) + "01", 32).slice(0, 8) + "01";
      globalDaily(state);
      fans.push(g.rights.find((r) => r.market === "UK")!.fans);
      const y = g.net[Number(state.date.slice(0, 4))];
      if (i === 11) { cost = y.cost; income = y.income; }
      if (g.offer) answerOffer(state, true);
    }
    expect(fans[47]).toBeGreaterThan(fans[11]);
    expect(fans[11]).toBeGreaterThan(fans[0]);
    // The first year loses money.
    expect(cost).toBeGreaterThan(income);
    const uk = g.rights.find((r) => r.market === "UK")!;
    expect(uk.history[0].buyers).toBeGreaterThan(0);
    expect(uk.history.length).toBe(24);
    expect(business(state).ledger.some((e) => e.cat === "global" && e.amount > 0)).toBe(true);
  });

  it("exchange rates drift, and a hedge locks them for a year", () => {
    const state = newGame(TEAM, "x", { capRules: "real" }, 4);
    const g = global(state);
    g.rights.push({ market: "UK", since: state.date, until: 2031, content: 1, events: 1, merch: true, fans: 50_000, engagement: 40, history: [] });
    const start = g.fx.GBP;
    expect(hedge(state)).toBeNull();
    for (let i = 0; i < 6; i++) {
      state.date = addDays(state.date, 31).slice(0, 8) + "01";
      globalDaily(state);
    }
    expect(g.fx.GBP).not.toBe(start);
    expect(rateFor(state, "GBP")).toBe(start);
    expect(hedge(state)).toMatch(/locked/);
  });

  it("a game abroad can carry a full fan program", () => {
    const g0 = SCHEDULE.find((g) => g.neutral && g.type === "REG" && g.stadium?.includes("Tottenham"))!;
    const state = newGame(g0.home!, "x", { capRules: "real" }, 1);
    const t = gamesAbroad(state).find((x) => x.id === g0.id)!;
    expect(t.market).toBe("UK");
    expect(planTrip(state, "nope", "full")).toMatch(/isn't one of our games/);
    expect(planTrip(state, t.id, "full")).toBeNull();
    const reach = fanBase(state).reach.intl;
    state.date = t.date;
    globalDaily(state);
    expect(fanBase(state).reach.intl).toBeGreaterThan(reach);
    expect(business(state).ledger.some((e) => e.cat === "global" && e.note?.includes(t.city))).toBe(true);
  });

  it("the pathway places a handful of players a year, with an extra practice-squad spot, and they survive a reload", async () => {
    const state = stateAt(TEAM, 3, "superBowl");
    global(state).pathway.joined = true;
    global(state).pathway.scouting = 2;
    state.date = addDays(RULES.keyDates.draftStart, -15);
    const room = psRoom(state, "MIN");
    state.date = addDays(state.date, 1);
    globalDaily(state);
    const placed = global(state).pathway.players;
    expect(placed.length).toBeGreaterThanOrEqual(4);
    expect(placed.length).toBeLessThanOrEqual(5);
    const p = placed[0];
    expect(PLAYER_BY_ID[p.id].college).toMatch(/International Pathway/);
    expect(state.contracts[p.id].years).toHaveLength(3);
    state.players[p.id].status = "ps";
    expect(psRoom(state, p.team)).toBe(p.team === "MIN" ? room : psRoom(state, p.team));
    expect(pathwayPlayers(state, p.team)).toHaveLength(1);
    const text = await compress(state);
    clearPathway();
    expect(PLAYER_BY_ID[p.id]).toBeUndefined();
    await decompress(text);
    expect(PLAYER_BY_ID[p.id].name).toBe(p.name);
    restorePathway(state);
  }, 120_000);
});
