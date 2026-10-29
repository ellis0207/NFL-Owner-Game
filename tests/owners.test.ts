import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { RULES, SCHEDULE } from "../src/engine/league";
import { changeRapport, currentMeeting, LOBBY_CALLS, lobby, owners, proposable, proposeAlliance, setOurVote, submitProposal, whipCount } from "../src/engine/owners";
import { bindRules, LEAGUE_RULES, RULE_BY_ID, rulesFor } from "../src/engine/rules";
import { advanceDay, isGameOver } from "../src/engine/season";
import { simulateGame } from "../src/engine/sim";
import { stat } from "../src/engine/stats";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";

function until(state: GameState, date: string): void {
  while (state.date < date && !isGameOver(state)) advanceDay(state);
}

describe("owners and the league meeting", () => {
  it("publishes an agenda, takes our proposal and lobbying, votes, and binds the new rules next season", () => {
    const state = stateAt(TEAM, 5);
    const meeting = RULES.keyDates.annualLeagueMeeting;
    until(state, addDays(meeting, -20));
    const m = currentMeeting(state)!;
    expect(m.year).toBe(2027);
    expect(m.proposals.length).toBeGreaterThanOrEqual(4);
    // No two proposals change the same rule.
    const r = rulesFor(state, 2027);
    for (const p of m.proposals) {
      expect(RULE_BY_ID[p.rule].when(r)).toBe(true);
      RULE_BY_ID[p.rule].apply(r);
    }
    expect(state.inbox.some((x) => x.title.includes("proposals"))).toBe(true);

    const ours = proposable(state)[0];
    expect(submitProposal(state, ours)).toBeNull();
    expect(submitProposal(state, proposable(state)[0])).toMatch(/already/);
    const mine = m.proposals.find((p) => p.sponsor === TEAM)!;
    expect(mine.ourVote).toBe(true);

    // Lobbying moves owners toward our side and is capped.
    const w = whipCount(state, mine);
    const targets = [...w.undecided, ...w.no];
    for (const t of targets.slice(0, LOBBY_CALLS)) lobby(state, mine.id, t);
    expect(m.calls).toBe(Math.min(LOBBY_CALLS, targets.length));
    expect(Object.values(mine.lobby).every((v) => v > 0)).toBe(true);
    if (targets.length > LOBBY_CALLS) expect(lobby(state, mine.id, targets[LOBBY_CALLS])).toMatch(/all the calls/);

    for (const p of m.proposals) if (p.sponsor !== TEAM) setOurVote(state, p.id, false);
    until(state, addDays(m.voteDate, 1));
    expect(m.done).toBe(true);
    const o = owners(state);
    for (const p of m.proposals) {
      expect(Object.keys(p.votes!).length).toBe(32);
      expect(p.yes).toBe(Object.values(p.votes!).filter(Boolean).length);
      expect(p.passed).toBe(p.yes! >= 24);
      if (p.sponsor !== TEAM) expect(p.votes![TEAM]).toBe(false);
    }
    expect(o.history.filter((h) => h.year === 2027).length).toBe(m.proposals.length);
    const adopted = o.rules.filter((a) => a.year === 2027);
    expect(adopted.length).toBe(m.proposals.filter((p) => p.passed).length);
    // Adopted rules wait for the new league year's season.
    expect(LEAGUE_RULES).toEqual(rulesFor(state, 2026));

    until(state, addDays(RULES.keyDates.draftStart, 5));
    expect(RULES.season).toBe(2027);
    expect(LEAGUE_RULES).toEqual(rulesFor(state, 2027));
    expect(currentMeeting(state)).toBeUndefined();
  });

  it("turns rapport into alliances and rivalries", () => {
    const state = stateAt(TEAM, 5);
    const o = owners(state);
    // Division rivals start cooler than the rest of the league.
    const avg = (ids: string[]) => ids.reduce((s, id) => s + o.relations[id].rapport, 0) / ids.length;
    const others = Object.keys(o.relations).filter((t) => !["CHI", "GB", "MIN"].includes(t));
    expect(avg(["CHI", "GB", "MIN"])).toBeLessThan(avg(others));

    changeRapport(state, "SEA", 100);
    expect(proposeAlliance(state, "SEA")).toMatch(/agreed/);
    expect(o.relations.SEA.ally).toBe(true);
    changeRapport(state, "SEA", -150);
    expect(o.relations.SEA.ally).toBe(false);
    expect(o.relations.SEA.rival).toBe(true);
    changeRapport(state, "SEA", 90);
    expect(o.relations.SEA.rival).toBe(false);
  });

  it("changes how games are played under the new rules", () => {
    const state = stateAt(TEAM, 5);
    const games = SCHEDULE.filter((g) => g.type === "REG").slice(0, 48);
    const play = () => {
      let plays = 0, xpAtt = 0;
      for (const g of games) {
        const { box } = simulateGame(state, g, g.away, g.home);
        plays += box.team.away.plays + box.team.home.plays;
        xpAtt += [...Object.values(box.players.away), ...Object.values(box.players.home)].reduce((s, l) => s + stat(l, "xpa"), 0);
      }
      return { plays, xpAtt };
    };
    const before = play();
    owners(state).rules.push({ rule: "playClock35", year: 2026, yes: 26, sponsor: "committee" }, { rule: "xp25", year: 2026, yes: 25, sponsor: "committee" });
    bindRules(state);
    expect(LEAGUE_RULES.playClock).toBe(35);
    const after = play();
    owners(state).rules.length = 0;
    bindRules(state);
    // A shorter play clock means more snaps; a longer extra point means more teams go for two.
    expect(after.plays).toBeGreaterThan(before.plays * 1.02);
    expect(after.xpAtt).toBeLessThan(before.xpAtt);
  });
});
