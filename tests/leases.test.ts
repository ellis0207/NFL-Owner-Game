import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { acceptLease, bindLeases, counterLease, lease, leasesDaily, leased } from "../src/engine/leases";
import { RULES, TEAMS } from "../src/engine/league";
import { projectTerms } from "../src/engine/projects";
import { STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";

function atLeagueYear(): GameState {
  const state = stateAt(TEAM, 3, "superBowl");
  state.date = RULES.keyDates.newLeagueYear;
  return state;
}

beforeAll(() => {
  stateAt(TEAM, 3, "superBowl");
}, 600_000);

describe("stadium leases", () => {
  it("covers the publicly owned stadiums, with the Titans' new lease already signed", () => {
    const state = atLeagueYear();
    const teams = TEAMS.filter((t) => leased(t.id));
    expect(teams.length).toBeGreaterThanOrEqual(20);
    expect(lease(state, "TEN")!.through).toBe(2056);
    expect(lease(state, "MIA")).toBeUndefined();
  });

  it("opens talks three seasons out; pushing gets an answer a week later; signing extends the lease and funds renovations", () => {
    const state = atLeagueYear();
    const next = Number(state.date.slice(0, 4));
    const l = lease(state)!;
    l.through = next + 1;
    leasesDaily(state);
    expect(l.talks).toBeTruthy();
    expect(state.inbox[0].title).toBe("Talks on a new lease");
    const money = l.talks!.offer.publicMoney;
    expect(counterLease(state, "money").ok).toBe(true);
    state.date = addDays(state.date, 7);
    leasesDaily(state);
    if (l.talks) {
      expect(l.talks.waiting).toBeUndefined();
      expect(l.talks.offer.publicMoney >= money).toBe(true);
      const years = l.talks.offer.years;
      const before = projectTerms(state, "boards").ours;
      expect(acceptLease(state).ok).toBe(true);
      expect(l.through).toBe(next + 1 + years);
      expect(l.fund).toBeGreaterThan(0);
      expect(STADIUM_BY_TEAM[TEAM].rent).toBe(l.rent);
      expect(projectTerms(state, "boards").ours).toBeLessThan(before);
    }
    bindLeases({ ...state, leases: undefined });
  });

  it("other teams settle near the end, and a lease that runs out rolls over a year at a higher rent", () => {
    const state = atLeagueYear();
    const next = Number(state.date.slice(0, 4));
    const near = TEAMS.filter((t) => t.id !== TEAM && leased(t.id)).map((t) => t.id);
    for (const t of near) lease(state, t)!.through = next;
    const cle = lease(state, "CLE")!;
    cle.through = next - 1;
    const rent = cle.rent;
    leasesDaily(state);
    const signed = near.filter((t) => lease(state, t)!.signed).length;
    console.log(`CPU leases signed with one season left: ${signed} of ${near.length}`);
    expect(signed).toBeGreaterThan(near.length * 0.4);
    if (!cle.signed) {
      expect(cle.holdover).toBe(true);
      expect(cle.rent).toBeGreaterThan(rent);
    }
    expect(cle.through).toBeGreaterThanOrEqual(next);
    bindLeases({ ...state, leases: undefined });
  });
});
