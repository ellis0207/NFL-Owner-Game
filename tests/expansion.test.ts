import { describe, expect, it } from "vitest";
import { buildSchedule } from "../src/engine/calendar";
import { teamPlayerIds } from "../src/engine/cap";
import { bindExpansion, expansion, forceExpansion, forceOpen } from "../src/engine/expansion";
import { invariants } from "../src/engine/invariants";
import { RULES, TEAMS, TEAM_BY_ID } from "../src/engine/league";
import { off } from "../src/engine/offseason";
import { VOTES_TO_PASS } from "../src/engine/owners";
import { applySeason } from "../src/engine/seasons";
import { parseSaveFile, toSaveFile } from "../src/save/codec";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const AT = "2027-02-20";

function opened(userMarket?: string): GameState {
  const s = stateAt("DET", 5, AT);
  forceExpansion(s, { joins: RULES.season + 1, ...(userMarket ? { userMarket } : {}) });
  forceOpen(s);
  return s;
}

describe("league expansion", () => {
  it("approves two clubs, one to each conference, and pays the fee share", () => {
    const s = stateAt("DET", 5, AT);
    const before = s.business!.ledger.filter((e) => e.cat === "expansion").length;
    const clubs = forceExpansion(s);
    expect(clubs.length).toBe(2);
    expect(new Set(clubs.map((c) => c.conference)).size).toBe(2);
    expect(clubs.every((c) => c.joins === RULES.season + 2)).toBe(true);
    expect(expansion(s).fee).toBeGreaterThan(3e9);
    expect(s.business!.ledger.filter((e) => e.cat === "expansion").length).toBe(before + 1);
    bindExpansion({ ...s, expansion: undefined } as GameState);
  });

  it("opens the clubs with staffs, an expansion draft and the top of the draft order", () => {
    const s = opened();
    const ids = expansion(s).clubs.map((c) => c.id);
    expect(TEAMS.length).toBe(34);
    expect(VOTES_TO_PASS).toBe(26);
    for (const id of ids) {
      const staff = Object.values(s.staff!.people).filter((p) => p.team === id);
      expect(staff.some((p) => p.role === "HC")).toBe(true);
      expect(staff.some((p) => p.role === "GM")).toBe(true);
      expect(teamPlayerIds(s, id).length).toBeGreaterThanOrEqual(12);
    }
    const lost: Record<string, number> = {};
    for (const p of expansion(s).picks) lost[p.from] = (lost[p.from] ?? 0) + 1;
    expect(Math.max(...Object.values(lost))).toBeLessThanOrEqual(2);
    expect(off(s).draftOrder!.slice(0, 2).sort()).toEqual([...ids].sort());
    expect(invariants(s)).toEqual([]);
    bindExpansion({ ...s, expansion: undefined } as GameState);
  });

  it("builds a fair schedule around two five-club divisions", () => {
    const s = opened();
    const place = Object.fromEntries(TEAMS.map((t) => [t.id, 1]));
    const games = buildSchedule(RULES.season + 1, 7, place).filter((g) => g.type === "REG");
    for (const t of TEAMS) {
      const mine = games.filter((g) => g.home === t.id || g.away === t.id);
      expect(mine.length, t.id).toBe(17);
      const home = mine.filter((g) => g.home === t.id).length;
      expect(home, t.id).toBeGreaterThanOrEqual(8);
      expect(home, t.id).toBeLessThanOrEqual(9);
      const mates = TEAMS.filter((x) => x.id !== t.id && x.conference === t.conference && x.division === t.division);
      for (const m of mates) expect(mine.filter((g) => g.home === m.id || g.away === m.id).length).toBe(2);
    }
    bindExpansion({ ...s, expansion: undefined } as GameState);
  });

  it("keeps the new clubs through a save and drops them for another game", () => {
    const s = opened();
    const back = parseSaveFile(JSON.stringify(toSaveFile(s)));
    bindExpansion({ ...s, expansion: undefined } as GameState);
    expect(TEAMS.length).toBe(32);
    applySeason(back);
    expect(TEAMS.length).toBe(34);
    expect(TEAM_BY_ID[expansion(back).clubs[0].id].name).toBe(expansion(back).clubs[0].name);
    bindExpansion({ ...back, expansion: undefined } as GameState);
    expect(TEAMS.length).toBe(32);
  });

  it("lets the owner buy a new club, selling the old one", () => {
    const s = opened("STL");
    const mine = expansion(s).clubs.find((c) => c.user);
    expect(mine).toBeDefined();
    expect(s.userTeam).toBe(mine!.id);
    expect(s.tenure!.clubs.some((c) => c.team === "DET" && c.to)).toBe(true);
    bindExpansion({ ...s, expansion: undefined } as GameState);
  });
});
