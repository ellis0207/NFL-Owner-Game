import { describe, expect, it } from "vitest";
import { battleStandings, program } from "../src/engine/camp";
import { teamPlayerIds } from "../src/engine/cap";
import { addDays } from "../src/engine/dates";
import { answerDecision, openDecisions } from "../src/engine/discipline";
import { PLAYER_BY_ID, RULES } from "../src/engine/league";
import { depthChart, rosterCount } from "../src/engine/roster";
import { advanceDay, agenda, isGameOver, playEvent, veteranReportDate } from "../src/engine/season";
import { campChange } from "../src/engine/staff";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const K = RULES.keyDates;

function until(state: GameState, date: string): void {
  while (state.date < date && !isGameOver(state)) advanceDay(state);
}

describe("spring and summer football", () => {
  it("runs OTAs and minicamp: attendance, installs, fines and reps", () => {
    const state = stateAt(TEAM, 3, "draftStart");
    until(state, addDays(K.draftStart, 5));
    expect(RULES.season).toBe(2027);
    until(state, K.otasStart);
    const item = agenda(state).find((a) => a.id === "practice:ota");
    expect(item).toBeTruthy();
    expect(playEvent(state, "practice:ota")).toMatch(/at the voluntary session/);
    const installBefore = structuredClone(state.staff!.install);
    until(state, addDays(K.minicampStart, 3));
    const p = program(state);
    expect(p.springSet).toBe(true);
    const plans = Object.values(p.spring);
    // Most players are there every day; a handful stay away over money or train on their own.
    expect(plans.filter((x) => x.reason === "contract").length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThan(600);
    const ours = teamPlayerIds(state, TEAM).filter((id) => state.players[id].status !== "fa");
    expect(ours.some((id) => (p.reps[`${TEAM}:${id}`] ?? 0) >= 3)).toBe(true);
    for (const [team, v] of Object.entries(installBefore)) {
      if (v.offense < 1) expect(state.staff!.install[team].offense).toBeGreaterThan(v.offense);
    }
    // Minicamp absentees on other teams are fined; ours wait on the owner until the decision expires.
    expect(plans.every((x) => x.minicamp !== "absent" || openDecisions(state).some((d) => d.kind === "minicamp"))).toBe(true);
  }, 300_000);

  it("opens camp battles, reports on them weekly, and settles them before the cutdown", () => {
    const state = stateAt(TEAM, 3, "draftStart");
    until(state, addDays(K.draftStart, 5));
    const report = veteranReportDate(TEAM);
    until(state, addDays(report, 15));
    const p = program(state);
    const teams = new Set(p.battles.map((b) => b.team));
    expect(teams.size).toBeGreaterThan(20);
    expect(p.battles.filter((b) => b.pos === "QB").length).toBeLessThan(16);
    expect(state.inbox.some((m) => m.title === "Camp report")).toBe(true);
    // The coaches' read has moved for players who practiced.
    const moved = teamPlayerIds(state, TEAM).filter((id) => Math.abs(campChange(state, TEAM, id)) > 0.5);
    expect(moved.length).toBeGreaterThan(10);
    until(state, addDays(K.rosterCutdown, 1));
    for (const b of p.battles.filter((x) => x.team === TEAM)) {
      expect(b.winner).toBeTruthy();
      if (battleStandings(state, b).includes(b.winner!)) {
        const chart = depthChart(state, TEAM);
        expect(chart[b.pos]).toContain(b.winner);
      }
    }
    expect(rosterCount(state, TEAM).roster).toBeLessThanOrEqual(53);
    expect(state.inbox.some((m) => m.title === "Camp battles decided")).toBe(true);
  }, 300_000);

  it("a suspended player stays off the 53 and out of games, then comes back", () => {
    const state = stateAt(TEAM, 3, addDays(RULES.keyDates.rosterCutdown, -2));
    const id = depthChart(state, TEAM).WR[0];
    state.players[id].suspended = { games: 2, reason: "test" };
    until(state, addDays(K.rosterCutdown, 1));
    expect(state.players[id].team).toBe(TEAM);
    expect(rosterCount(state, TEAM).roster).toBeLessThanOrEqual(53);
    until(state, addDays(K.regularSeasonStart, 1));
    expect(depthChart(state, TEAM).WR).not.toContain(id);
    until(state, addDays(K.regularSeasonStart, 16));
    expect(state.players[id].suspended).toBeUndefined();
    expect(depthChart(state, TEAM).WR).toContain(id);
    expect(rosterCount(state, TEAM).roster).toBeLessThanOrEqual(53);
  }, 300_000);

  it("keeps discipline to a realistic handful and lets the owner make the call", () => {
    const state = stateAt(TEAM, 3);
    const p = program(state);
    expect(p.incidents.length).toBeGreaterThan(3);
    expect(p.incidents.length).toBeLessThan(45);
    const id = depthChart(state, TEAM).QB[0];
    const before = state.players[id].morale ?? 70;
    p.decisions.push({
      id: "test", date: state.date, expires: addDays(state.date, 3), player: id, kind: "comments", title: "t", body: "b",
      options: [{ key: "fine", label: "Fine" }, { key: "meet", label: "Meet" }, { key: "coach", label: "Coach" }], fallback: "coach",
    });
    expect(answerDecision(state, "test", "fine")).toMatch(new RegExp(PLAYER_BY_ID[id].name));
    expect(state.players[id].morale ?? 70).toBeLessThan(before);
    expect(answerDecision(state, "test", "meet")).toBeNull();
  }, 300_000);
});
