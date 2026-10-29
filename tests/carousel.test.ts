import { beforeAll, describe, expect, it } from "vitest";
import { BASE_KEY_DATES, RULES, TEAMS } from "../src/engine/league";
import { addDays } from "../src/engine/dates";
import { advanceDay, newGame } from "../src/engine/season";
import { askFor, candidates, decideProposal, fireStaff, makeOffer, openSearches, proposals, requestInterview } from "../src/engine/carousel";
import { staff } from "../src/engine/coaches";
import { compress, decompress } from "../src/save/codec";
import { stateAt } from "./fixtures";
import type { GameState, StaffRole } from "../src/engine/types";

const TEAM = "NYG";
const K = RULES.keyDates;

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

function holder(state: GameState, team: string, role: StaffRole) {
  return Object.values(staff(state).people).find((c) => c.team === team && c.role === role);
}

beforeAll(() => {
  stateAt(TEAM, 3);
}, 180_000);

describe("the coaching carousel", () => {
  it("starts every team with a full staff", () => {
    const state = newGame(TEAM, "Owner", { capRules: "real" }, 5);
    // A head coach who calls one side can run without that coordinator (Tampa Bay has no DC in 2026).
    for (const t of TEAMS) {
      for (const role of ["HC", "STC", "GM"] as StaffRole[]) expect(holder(state, t.id, role), `${t.id} ${role}`).toBeTruthy();
      expect(holder(state, t.id, "OC") ?? holder(state, t.id, "DC"), t.id).toBeTruthy();
    }
  });

  it("other teams' staff can't be interviewed during the season", () => {
    const state = stateAt(TEAM, 5, addDays(BASE_KEY_DATES.regularSeasonStart, 30));
    const hc = holder(state, TEAM, "HC")!;
    expect(fireStaff(state, hc.id).ok).toBe(true);
    // A coordinator steps in as interim and the search waits for the offseason.
    expect(holder(state, TEAM, "HC")).toBeTruthy();
    expect(openSearches(state, TEAM).some((s) => s.role === "HC")).toBe(true);
    const other = holder(state, "BUF", "OC")!;
    expect(requestInterview(state, "HC", other.id).ok).toBe(false);
  });

  it("turns over a realistic number of head coaches and fills every job by March", async () => {
    const state = stateAt(TEAM, 3);
    until(state, addDays(K.superBowl, 16));
    const log = staff(state).log.filter((l) => / hire .* as head coach/.test(l.text));
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log.length).toBeLessThanOrEqual(14);
    for (const t of TEAMS) {
      if (t.id === TEAM) continue;
      for (const role of ["HC", "GM"] as StaffRole[]) expect(holder(state, t.id, role), `${t.id} ${role}`).toBeTruthy();
      expect(holder(state, t.id, "OC") ?? holder(state, t.id, "DC"), t.id).toBeTruthy();
    }
  });

  it("lets the owner fire, interview and hire a head coach, who then proposes coordinators", async () => {
    const state = stateAt(TEAM, 3);
    until(state, addDays(K.superBowl, 2));
    const old = holder(state, TEAM, "HC")!;
    expect(fireStaff(state, old.id).ok).toBe(true);
    expect(staff(state).owed.some((o) => o.id === old.id)).toBe(true);
    const pool = candidates(state, TEAM, "HC");
    expect(pool.length).toBeGreaterThan(20);
    let set = 0;
    for (const id of pool) if (set < 4 && requestInterview(state, "HC", id).ok) set++;
    expect(set).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) advanceDay(state);
    const search = openSearches(state, TEAM).find((s) => s.role === "HC")!;
    const met = Object.entries(search.interviews).filter(([, iv]) => iv.report).map(([id]) => id);
    expect(met.length).toBeGreaterThan(0);
    // A rich offer to everyone we met: somebody says yes.
    for (const id of met) {
      if (holder(state, TEAM, "HC")) break;
      makeOffer(state, "HC", id, 6, Math.round(askFor(state, id, "HC") * 1.5));
      for (let i = 0; i < 4 && !holder(state, TEAM, "HC"); i++) advanceDay(state);
    }
    until(state, addDays(K.newLeagueYear, 4));
    const hc = holder(state, TEAM, "HC")!;
    expect(hc).toBeTruthy();
    expect(hc.id).not.toBe(old.id);
    expect(hc.contract!.through).toBeGreaterThan(RULES.season);
    // The new head coach brings proposals; approving one makes the hire.
    for (let i = 0; i < 10 && !proposals(state).length; i++) advanceDay(state);
    const p = proposals(state)[0];
    if (p) {
      expect(decideProposal(state, p.id, "approve").ok).toBe(true);
      for (let i = 0; i < 4 && holder(state, TEAM, p.role)?.id !== p.candidate; i++) advanceDay(state);
      expect(holder(state, TEAM, p.role)?.id).toBe(p.candidate);
    }
    // The staff survives a save.
    const back = await decompress(await compress(state));
    expect(holder(back, TEAM, "HC")?.id).toBe(hc.id);
    expect(Object.keys(back.staff!.people).length).toBe(Object.keys(state.staff!.people).length);
  }, 60_000);
});
