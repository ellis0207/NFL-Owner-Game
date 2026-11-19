// Links between systems found missing by the connectivity check
// (tests/connect-report.ts): each test changes one system and checks that the
// one it should feed moves.
import { describe, expect, it } from "vitest";
import { teamPlayerIds } from "../src/engine/cap";
import { marketability } from "../src/engine/clubhouse";
import { localDeals, refillCategory } from "../src/engine/commerce";
import { leagueYear } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { PLAYER_BY_ID } from "../src/engine/league";
import { climate } from "../src/engine/media/coverage";
import { medicalDaily } from "../src/engine/medical";
import { care } from "../src/engine/playercare";
import { decisionQueue } from "../src/engine/queue";
import { coachRoom } from "../src/engine/coachroom";
import { scoutOps } from "../src/engine/scoutops";
import { newGame } from "../src/engine/season";
import { switchClub } from "../src/engine/takeover";
import { openFindings, treasury, treasuryDaily } from "../src/engine/treasury";
import type { GameState } from "../src/engine/types";

function fresh(seed = 3, team = "DET"): GameState {
  return newGame(team, "x", { capRules: "real" }, seed);
}

describe("connectivity", () => {
  it("a club the owner moves to brings its own coach's room, scouts, analysts and doctors", () => {
    const state = fresh();
    coachRoom(state).preseason = "rest";
    scoutOps(state);
    const before = care(state).doctors.map((d) => d.name).join();
    switchClub(state, "KC");
    expect(state.coachRoom).toBeUndefined();
    expect(state.scoutOps).toBeUndefined();
    expect(state.analysts).toBeUndefined();
    expect(care(state).doctors.map((d) => d.name).join()).not.toBe(before);
  });

  it("the rehab staff sets the pace of a long rehab", () => {
    const back = (skill: number) => {
      const state = fresh();
      const id = teamPlayerIds(state, "DET").find((x) => PLAYER_BY_ID[x]?.position === "WR")!;
      care(state).doctors.forEach((d) => (d.skill = skill));
      state.players[id].injury = { type: "Hamstring", date: addDays(state.date, -40), returnDate: addDays(state.date, 60), seasonEnding: false, mid: state.date };
      medicalDaily(state);
      return state.players[id].injury!.returnDate;
    };
    expect(back(90) < back(30)).toBe(true);
  });

  it("weeks of good press sell a player's jersey", () => {
    const state = fresh();
    const id = teamPlayerIds(state, "DET")[0];
    const quiet = marketability(state, id);
    climate(state).players[id] = 40;
    expect(marketability(state, id)).toBeGreaterThan(quiet);
  });

  it("a sponsor default outside the renewal window gets a stand-in partner instead of a dark year", () => {
    const state = fresh();
    const l = localDeals(state);
    const year = leagueYear(state.date);
    const d = l.deals.find((x) => x.cat === "radio")!;
    d.ended = state.date;
    d.years = Math.max(0, year - d.start);
    refillCategory(state, "radio");
    const stand = l.deals.find((x) => x.cat === "radio" && x !== d);
    expect(stand?.start).toBe(year);
    expect(stand?.value).toBeGreaterThan(0);
  });

  it("audit findings reach the desk, and the finance chief fixes the serious ones the owner leaves", () => {
    const state = fresh();
    const t = treasury(state);
    t.findings.unshift({ year: 2026, text: "Suite revenue booked early", severity: "material", cost: 250_000 }, { year: 2026, text: "Missing signatures", severity: "minor", cost: 50_000 });
    t.letter = state.date;
    expect(decisionQueue(state, true).some((q) => q.id === "problem:audit")).toBe(true);
    state.date = addDays(state.date, 61);
    treasuryDaily(state);
    expect(openFindings(state).map((x) => x.f.severity)).toEqual(["minor"]);
  });
});
