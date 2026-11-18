import { describe, expect, it } from "vitest";
import { gateForecast, pnl } from "../src/engine/business";
import { leagueYear } from "../src/engine/contracts";
import { cashBalance } from "../src/engine/business";
import { addDays } from "../src/engine/dates";
import { invariants } from "../src/engine/invariants";
import { DEPOSIT, buildGarage, convertToPremium, garageCost, groundsDaily, groundsModel, leaseLot, parkingDay, seatsOn, siteOf } from "../src/engine/grounds";
import { SCHEDULE } from "../src/engine/league";
import { MARKETS, STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const nextHome = (date: string) => SCHEDULE.find((g) => g.home === TEAM && g.type === "REG" && !g.neutral && g.date > date)!;

describe("the stadium and its grounds", () => {
  it("one model: every seat in a section, every car in a lot, and the club paid only for its own lots", () => {
    const s = stateAt(TEAM, 3, "regularSeasonStart");
    const m = groundsModel(s);
    expect(m.sections.reduce((t, x) => t + x.seats, 0)).toBe(STADIUM_BY_TEAM[TEAM].capacity);
    expect(seatsOn(m).general + seatsOn(m).premium).toBe(m.capacity);
    const indep = m.lots.find((l) => l.control === "independent")!;
    expect(indep.share).toBe(0);
    // A downtown site: most cars end up in garages the club doesn't run.
    const day = parkingDay(m, m.capacity * 0.95, 40);
    expect(day.independent).toBeGreaterThan(day.club);
    const ours = m.lots.filter((l) => l.control !== "independent");
    const paid = ours.reduce((t, l) => t + Math.min(l.spaces, 1e9) * l.share, 0);
    expect(day.revenue).toBeLessThanOrEqual(paid * 40 + 1);
    // More independent spaces improve access but pay the club nothing.
    const wider = { ...m, lots: m.lots.map((l) => (l.control === "independent" ? { ...l, spaces: l.spaces * 2 } : l)) };
    expect(parkingDay(wider, m.capacity * 0.95, 40).revenue).toBe(day.revenue);
    // The gate reads the same lots.
    const g = nextHome(s.date);
    const f = gateForecast(s, g);
    expect(f.capacity).toBe(m.capacity);
    expect(f.parking).toBe(parkingDay(groundsModel(s, g.date), f.attendance, MARKETS[TEAM].parking, s.business!.prices.parking).revenue);
  }, 300_000);

  it("a garage moves cars from independent lots into ours, in the plan and in the gate", () => {
    const s = stateAt(TEAM, 3, "regularSeasonStart");
    const g = nextHome(s.date);
    const before = gateForecast(s, g).parking;
    const lotsBefore = groundsModel(s, g.date).lots.length;
    expect(buildGarage(s, 2000)).toBeNull();
    // Being built: drawn but not open, and the surface spaces under it are gone meanwhile.
    expect(groundsModel(s, g.date).lots.find((l) => l.id.startsWith("garage"))?.opens).toBeTruthy();
    expect(gateForecast(s, g).parking).toBeLessThan(before);
    s.grounds!.garages[0].opens = s.date;
    const m = groundsModel(s, g.date);
    expect(m.lots.length).toBe(lotsBefore + 1);
    expect(gateForecast(s, g).parking).toBeGreaterThan(before);
    expect(m.upkeep).toBeGreaterThan(0);
  }, 300_000);

  it("a leased lot adds our spaces and a yearly rent", () => {
    const s = stateAt(TEAM, 3, "regularSeasonStart");
    const g = nextHome(s.date);
    const before = gateForecast(s, g).parking;
    expect(leaseLot(s, 1000)).toBeNull();
    expect(groundsModel(s, g.date).lots.some((l) => l.control === "leased")).toBe(true);
    expect(gateForecast(s, g).parking).toBeGreaterThan(before);
    const y = leagueYear(s.date);
    const before2 = pnl(s, y).operating;
    s.date = `${s.date.slice(0, 4)}-10-01`;
    groundsDaily(s);
    expect(pnl(s, y).operating).toBeLessThan(before2);
  }, 300_000);

  it("club seats: a phased build closes the section now, then sells as premium", () => {
    const s = stateAt(TEAM, 3, "regularSeasonStart");
    const g = nextHome(s.date);
    const before = gateForecast(s, g);
    const m0 = groundsModel(s, g.date);
    expect(convertToPremium(s, 1000, true)).toBeNull();
    const m1 = groundsModel(s, g.date);
    expect(m1.sections.some((x) => x.closed)).toBe(true);
    expect(m1.capacity).toBe(m0.capacity - 1000);
    const during = gateForecast(s, g);
    expect(during.capacity).toBe(before.capacity - 1000);
    expect(during.sold).toBeLessThan(before.sold);
    // Finished: the seats are back, as clubs, and the premium money grows.
    s.grounds!.premium[0].opens = s.date;
    const m2 = groundsModel(s, g.date);
    expect(seatsOn(m2).premium).toBe(seatsOn(m0).premium + 1000);
    expect(m2.capacity).toBe(m0.capacity);
    expect(gateForecast(s, g).premium).toBeGreaterThan(before.premium);
  }, 300_000);

  it("the clubs and parking projects show in the plan", () => {
    const s = stateAt(TEAM, 3, "regularSeasonStart");
    const m0 = groundsModel(s);
    s.business!.projects = [
      { id: "clubs", started: "2026-03-01", opens: s.date, cost: 1, paid: 1, opened: true },
      { id: "parking", started: "2026-03-01", opens: s.date, cost: 1, paid: 1, opened: true },
    ];
    const m = groundsModel(s);
    expect(seatsOn(m).premium).toBeGreaterThan(seatsOn(m0).premium);
    expect(m.lots.some((l) => l.id === "project-garage" && !l.opens)).toBe(true);
  }, 300_000);

  it("parking never seats more cars than came, and the nearby lots to lease run out", () => {
    const s = stateAt("DAL", 3, "regularSeasonStart");
    const m0 = groundsModel(s);
    // Lease until the landlords have nothing left; each lot comes out of the independent ones.
    let leased = 0;
    while (leaseLot(s, 2000) === null) leased += 2000;
    expect(leased).toBeGreaterThan(0);
    expect(leaseLot(s, 2000)).toMatch(/lease/);
    const m = groundsModel(s);
    const indep = (x: typeof m) => x.lots.find((l) => l.control === "independent")!.spaces;
    expect(indep(m)).toBe(indep(m0) - leased);
    for (const mult of [0.5, 1, 1.8]) {
      const p = parkingDay(m, m.capacity, 40, mult);
      expect(p.club).toBeLessThanOrEqual(p.cars);
      expect(p.independent).toBeGreaterThanOrEqual(0);
      expect(Math.abs(p.club + p.independent + p.short - p.cars)).toBeLessThanOrEqual(2);
    }
    expect(invariants(s).filter((v) => v.rule === "parking" || v.rule === "grounds")).toEqual([]);
  }, 300_000);

  it("a garage takes a deposit, then monthly payments until it opens", () => {
    const s = stateAt(TEAM, 3, "regularSeasonStart");
    const cost = garageCost(s, 2000);
    const cash0 = cashBalance(s);
    expect(buildGarage(s, 2000)).toBeNull();
    expect(Math.round(cash0 - cashBalance(s))).toBe(Math.round(cost * DEPOSIT));
    const x = s.grounds!.garages[0];
    while (s.date <= x.opens) {
      groundsDaily(s);
      s.date = addDays(s.date, 1);
    }
    expect(x.paid).toBe(x.cost);
  }, 300_000);

  it("the land belongs to the building: a move or a new home leaves the old grounds behind", () => {
    const s = stateAt(TEAM, 3, "regularSeasonStart");
    expect(siteOf(s, TEAM).site).toBe("downtown");
    expect(buildGarage(s, 1000)).toBeNull();
    expect(leaseLot(s, 500)).toBeNull();
    const st = STADIUM_BY_TEAM[TEAM];
    const name = st.name;
    try {
      // The club plays somewhere else (a stopgap home, here a known old building).
      st.name = "Candlestick Park";
      expect(siteOf(s, TEAM)).toMatchObject({ site: "urban", acres: 77 });
      const m = groundsModel(s);
      expect(m.lots.some((l) => l.id.startsWith("garage") || l.control === "leased")).toBe(false);
    } finally {
      st.name = name;
    }
    expect(groundsModel(s).lots.some((l) => l.control === "leased")).toBe(true);
  }, 300_000);
});
