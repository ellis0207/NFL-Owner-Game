import { beforeAll, describe, expect, it } from "vitest";
import { superBowlSite } from "../src/engine/calendar";
import { addDays } from "../src/engine/dates";
import { canHostSuperBowl, hostBlackout, hostEffects, hosting, submitBid, upcomingVotes } from "../src/engine/hosting";
import { RULES, TEAMS } from "../src/engine/league";
import { stillPlaying } from "../src/engine/freeagency";
import { inPersonOk } from "../src/engine/hiring";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";
import type { GameState } from "../src/engine/types";

const TEAM = "DET";
const K = RULES.keyDates;

function at(when?: string): GameState {
  return stateAt(TEAM, 3, when);
}

beforeAll(() => {
  at("draftStart");
}, 600_000);

describe("hosting bids", () => {
  it("only domes and warm-weather stadiums a team controls can host a Super Bowl", () => {
    expect(canHostSuperBowl("DET")).toBe(true);
    expect(canHostSuperBowl("MIA")).toBe(true);
    expect(canHostSuperBowl("GB")).toBe(false);
    expect(canHostSuperBowl("LAC")).toBe(false); // a tenant at SoFi
  });

  it("the owners award a Super Bowl and a draft at the annual meeting, with our bid in the running", () => {
    const state = at("2027-03-01");
    const v = upcomingVotes(state);
    expect(submitBid(state, "sb", 1)).toBeNull();
    expect(submitBid(state, "draft", 0)).toBeNull();
    expect(submitBid(state, "draft", 0)).not.toBeNull();
    while (state.date <= addDays(K.annualLeagueMeeting, 3)) advanceDay(state);
    const h = hosting(state);
    const sb = h.sb[v.sbSeason];
    expect(sb.bidders).toContain(TEAM);
    expect(sb.bidders.length).toBeGreaterThanOrEqual(4);
    expect(h.draft[v.draftYear]).toBeDefined();
    expect(superBowlSite(v.sbSeason).city).toBe(sb.city);
    expect(h.bids).toEqual({});
    expect(state.inbox.some((m) => /bid/.test(m.title))).toBe(true);
  });

  it("a host's season lifts the team store and sponsors, and the league takes the stadium before the game", () => {
    const state = at();
    hosting(state).sb[RULES.season] = { team: TEAM, city: "Detroit", bidders: [TEAM], votes: 28, ballots: 1, ours: true };
    const fx = hostEffects(state, TEAM);
    expect(fx.merch).toBeGreaterThan(1.2);
    expect(fx.sponsor).toBeGreaterThan(0);
    expect(hostEffects(state, "GB").merch).toBe(1);
    expect(hostBlackout(state, TEAM, addDays(K.superBowl, -10))).toBe(true);
    expect(hostBlackout(state, TEAM, addDays(K.superBowl, -40))).toBe(false);
  });
});

describe("interview rules", () => {
  it("staff on a playoff team can be met in person only once it's out, or in the week before the Super Bowl", () => {
    const state = at("divisionalRound");
    const alive = TEAMS.map((t) => t.id).filter((t) => stillPlaying(state, t));
    const out = TEAMS.map((t) => t.id).find((t) => !stillPlaying(state, t))!;
    expect(alive.length).toBeGreaterThan(0);
    expect(inPersonOk(state, alive[0])).toBe(false);
    expect(inPersonOk(state, out)).toBe(true);
    state.date = addDays(K.conferenceChampionships, 2);
    expect(inPersonOk(state, alive[0])).toBe(true);
  });
});
