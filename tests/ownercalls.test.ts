import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { mode, openMemos } from "../src/engine/delegation";
import { projectPayback } from "../src/engine/facilities";
import { BASE_SCHEDULE, BASE_KEY_DATES } from "../src/engine/league";
import { decideMemo } from "../src/engine/memos";
import { deptReturns, gameChoices } from "../src/engine/ownercalls";
import { PROJECTS } from "../src/engine/projects";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("owner calls that pay back", () => {
  it("brings a price call before each home game and checks it against the gate", () => {
    const g = BASE_SCHEDULE.find((x) => x.type === "REG" && x.home === TEAM && !x.neutral && x.date > "2026-10-01")!;
    const s = stateAt(TEAM, 5, addDays(g.date, -5));
    advanceDay(s);
    const m = openMemos(s).find((x) => x.payload?.gamePrice === g.id);
    expect(m).toBeDefined();
    expect(m!.options.length).toBe(3);
    // The staff's pick is the best of the choices on its own reckoning.
    const opts = gameChoices(s, g);
    expect(opts[0].value).toBeGreaterThanOrEqual(Math.max(...opts.map((o) => o.value)) - 1);
    expect(decideMemo(s, m!.id, 0)).toBeNull();
    expect(business(s).tix?.game?.id).toBe(g.id);
    while (!s.results[g.id]) advanceDay(s);
    const call = business(s).tix?.calls?.[0];
    expect(call?.game).toBe(g.id);
    expect(call!.actual / call!.forecast).toBeGreaterThan(0.6);
    expect(call!.actual / call!.forecast).toBeLessThan(1.6);
    expect(m!.notes.some((n) => n.startsWith("After the game"))).toBe(true);
  });

  it("prices building projects to pay for themselves in years, not decades", () => {
    const s = stateAt(TEAM, 5);
    for (const p of PROJECTS.filter((x) => x.effect.demand || x.effect.premium || x.effect.perCap || x.effect.sponsor)) {
      const { years } = projectPayback(s, p.id);
      expect(years, p.id).not.toBeNull();
      expect(years!, p.id).toBeLessThan(25);
      expect(years!, p.id).toBeGreaterThan(4);
    }
  });

  it("puts a budget review on the desk each spring with what each department bought", () => {
    const s = stateAt(TEAM, 5, addDays(BASE_KEY_DATES.newLeagueYear, 14));
    advanceDay(s);
    const m = openMemos(s).find((x) => x.payload?.budget);
    expect(m).toBeDefined();
    const rows = deptReturns(s);
    const mk = rows.find((r) => r.dept === "marketing")!;
    // A leaner marketing budget gives back revenue, and more marketing brings some in.
    expect(mk.down!.revenue).toBeLessThan(0);
    expect(mk.up!.revenue).toBeGreaterThan(0);
    const before = { ...business(s).budget };
    const lean = m!.options.length - 1;
    expect(decideMemo(s, m!.id, lean)).toBeNull();
    expect(business(s).budget.marketing).toBe(Math.max(0, before.marketing - 1));
    expect(s.causes?.find((c) => c.system === "budgets")?.forecast?.measure).toBe("revenue");
  });

  it("has the GM ask how to run free agency, and run it when the owner never answers", () => {
    const s = stateAt(TEAM, 5, BASE_KEY_DATES.franchiseTagWindowOpens);
    expect(mode(s, "signings")).toBe("owner");
    advanceDay(s);
    const m = openMemos(s).find((x) => x.payload?.faPlan);
    expect(m).toBeDefined();
    expect(m!.recommend).toBe(2);
    while (s.date <= addDays(m!.deadline, 1)) advanceDay(s);
    expect(m!.status).toBe("lapsed");
    expect(mode(s, "signings")).toBe("delegate");
  });
});
