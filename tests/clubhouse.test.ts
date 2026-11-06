import { describe, expect, it } from "vitest";
import { teamPlayerIds } from "../src/engine/cap";
import { chemistryEdge, chemistryWord, clubhouse, lockerDaily, marketability, mentors, personality, posOf, trustOf } from "../src/engine/clubhouse";
import { dealOf } from "../src/engine/contracts";
import { addDays, ageOn, weekday } from "../src/engine/dates";
import { injure } from "../src/engine/injuries";
import { PLAYER_BY_ID, PLAYERS, TEAM_BY_ID } from "../src/engine/league";
import { askEarlyReturn, insure, insurableBase, insuranceFloor, knownReturn, medicalDaily } from "../src/engine/medical";
import { depthChart } from "../src/engine/roster";
import { makeRng } from "../src/engine/rng";
import { growthFactor, MAX_PLANS, retrain, riskFactor, setPlan, setPrograms, trainingDaily } from "../src/engine/training";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const ours = (s: GameState) => teamPlayerIds(s, TEAM).filter((id) => s.players[id].status === "active");
const nextTuesday = (d: string) => { let x = addDays(d, 1); while (weekday(x) !== "Tuesday") x = addDays(x, 1); return x; };

describe("the locker room", () => {
  it("gives every player a lasting character, spread around the middle", () => {
    const ids = PLAYERS.slice(0, 2000).map((p) => p.id);
    const avg = ids.reduce((s, id) => s + personality(id).learning, 0) / ids.length;
    expect(avg).toBeGreaterThan(0.45);
    expect(avg).toBeLessThan(0.55);
    expect(personality(ids[0])).toEqual(personality(ids[0]));
    expect(ids.some((id) => personality(id).learning > 0.75)).toBe(true);
  });

  it("builds chemistry, coach trust and mentors over a season, with a small on-field edge", () => {
    const s = stateAt(TEAM, 3);
    const c = clubhouse(s);
    const chem = Object.values(c.chem);
    expect(chem.length).toBe(Object.keys(TEAM_BY_ID).length);
    expect(Math.max(...chem) - Math.min(...chem)).toBeGreaterThan(5);
    for (const t of Object.keys(TEAM_BY_ID)) expect(Math.abs(chemistryEdge(s, t))).toBeLessThanOrEqual(0.4);
    expect(chemistryWord(c.chem[TEAM])).toMatch(/\w/);
    const trusts = ours(s).map((id) => trustOf(s, id));
    expect(Math.max(...trusts)).toBeGreaterThan(55);
    expect(Object.keys(c.core[TEAM] ?? []).length).toBeGreaterThan(10);
    expect(mentors(s, TEAM).length).toBeGreaterThan(0);
    const [, pupil] = mentors(s, TEAM)[0];
    expect(growthFactor(s, pupil, true)).toBeGreaterThan(growthFactor(s, pupil, false));
    expect(ours(s).some((id) => marketability(s, id) > 0.4)).toBe(true);
  }, 300_000);

  it("now and then excuses a player for a personal matter, and says only that", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    let d = s.date;
    let leaves = 0;
    for (let i = 0; i < 10; i++) {
      d = nextTuesday(d);
      s.date = d;
      lockerDaily(s);
      leaves += Object.values(s.players).filter((p) => p.injury?.type === "Personal matter" && p.injury.date === d).length;
    }
    expect(leaves).toBeGreaterThan(5);
    expect(leaves).toBeLessThan(80);
  }, 300_000);
});

describe("training", () => {
  it("practice load trades injuries for growth, only for our team", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const id = ours(s)[0];
    const other = teamPlayerIds(s, "CHI")[0];
    setPrograms(s, { workload: "light" });
    const light = riskFactor(s, id, TEAM, true);
    const lightGrow = growthFactor(s, id, false);
    setPrograms(s, { workload: "heavy" });
    expect(riskFactor(s, id, TEAM, true)).toBeGreaterThan(light);
    expect(growthFactor(s, id, false)).toBeGreaterThan(lightGrow);
    expect(riskFactor(s, other, "CHI", true)).toBe(1);
  }, 300_000);

  it("limits development plans and speeds the players on them", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const ids = ours(s).filter((id) => (ageOn(PLAYER_BY_ID[id].birthDate, s.date) ?? 30) <= 26);
    expect(setPlan(s, ours(s).find((id) => (ageOn(PLAYER_BY_ID[id].birthDate, s.date) ?? 0) > 28)!, "technique", 60)).not.toBeNull();
    const before = growthFactor(s, ids[0], false);
    for (let i = 0; i < MAX_PLANS; i++) expect(setPlan(s, ids[i], "technique", 60)).toBeNull();
    expect(setPlan(s, ids[MAX_PLANS], "playbook", 60)).not.toBeNull();
    expect(growthFactor(s, ids[0], false)).toBeGreaterThan(before);
  }, 300_000);

  it("moves a player to a new position, where he learns it over the weeks", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const cb = ours(s).find((id) => PLAYER_BY_ID[id].position === "CB" && !s.players[id].injury)!;
    expect(retrain(s, cb, "S")).toBeNull();
    expect(posOf(s, cb)).toBe("S");
    expect(depthChart(s, TEAM).S).toContain(cb);
    expect(depthChart(s, TEAM).CB).not.toContain(cb);
    const drag = s.players[cb].retrain!.drag;
    let d = s.date;
    for (let i = 0; i < 6; i++) { d = nextTuesday(d); s.date = d; trainingDaily(s); }
    expect(s.players[cb].retrain!.drag).toBeLessThan(drag / 2);
    expect(retrain(s, cb, "WR")).not.toBeNull();
    retrain(s, cb, null);
    expect(posOf(s, cb)).toBe("CB");
  }, 300_000);
});

describe("the medical side", () => {
  it("firms up a first diagnosis with follow-up tests", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const rng = makeRng(5);
    let found = false;
    for (const id of ours(s).filter((x) => !s.players[x].injury)) {
      const { injury, days } = injure(s, id, TEAM, rng);
      if (days < 6 || injury.seasonEnding) continue;
      expect(injury.est && injury.testsOn).toBeTruthy();
      expect(knownReturn(s, injury)).toBe(injury.est);
      const inbox = s.inbox.length;
      s.date = injury.testsOn!;
      medicalDaily(s);
      expect(s.inbox.length).toBeGreaterThan(inbox);
      expect(s.inbox.some((m) => m.title.endsWith("test results"))).toBe(true);
      expect(knownReturn(s, injury)).toBe(injury.returnDate);
      found = true;
      break;
    }
    expect(found).toBe(true);
  }, 300_000);

  it("leaves clearance to the doctors, and a concussion to the independent consultant", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const [a, b] = ours(s).filter((x) => !s.players[x].injury);
    s.players[a].injury = { type: "Concussion", date: s.date, returnDate: addDays(s.date, 10), seasonEnding: false };
    const r = askEarlyReturn(s, a);
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/independent/);
    expect(s.players[a].injury!.returnDate).toBe(addDays(s.date, 10));
    s.players[b].injury = { type: "Hamstring strain", date: s.date, returnDate: addDays(s.date, 14), seasonEnding: false };
    const r2 = askEarlyReturn(s, b);
    if (r2.ok) expect(s.players[b].fragile! > s.date).toBe(true);
    expect(askEarlyReturn(s, b).ok).toBe(false);
  }, 300_000);

  it("insures a big salary and pays claims after three weeks out", () => {
    const s = stateAt(TEAM, 3, "2026-10-31");
    const id = ours(s).filter((x) => !s.players[x].injury && insurableBase(s, x) >= insuranceFloor(s))
      .sort((x, y) => insurableBase(s, y) - insurableBase(s, x))[0];
    expect(dealOf(s, id)).toBeTruthy();
    const cash = s.business!.ledger.length;
    expect(insure(s, id)).toBeNull();
    expect(insure(s, id)).not.toBeNull();
    expect(s.business!.ledger.length).toBe(cash + 1);
    s.players[id].injury = { type: "Torn pectoral", date: s.date, returnDate: addDays(s.date, 70), seasonEnding: false };
    for (let i = 0; i < 7; i++) { s.date = nextTuesday(s.date); medicalDaily(s); }
    const pol = clubhouse(s).policies[id];
    expect(pol.paid).toBeGreaterThan(0);
    expect(s.business!.ledger.some((e) => e.note?.startsWith("Insurance claim") && e.amount > 0)).toBe(true);
  }, 300_000);
});
