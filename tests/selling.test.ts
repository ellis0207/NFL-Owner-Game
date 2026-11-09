import { describe, expect, it } from "vitest";
import { business, gateForecast, pnl } from "../src/engine/business";
import { forecast } from "../src/engine/books";
import { categories, dealFor, localDeals } from "../src/engine/commerce";
import { leagueYear, salaryCap } from "../src/engine/contracts";
import { addDays } from "../src/engine/dates";
import { fanBase, fanDemand, lifetimeValue, survey, trustHit } from "../src/engine/fans";
import { RULES, SCHEDULE } from "../src/engine/league";
import { newGame } from "../src/engine/season";
import { deliveryCheck, dropPartner, namingIncome, rightsConflict } from "../src/engine/sponsors";
import { STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { launchPSL, planRenewals, sellGeneral, tix, type SaleInputs } from "../src/engine/ticketing";
import { stateAt } from "./fixtures";

const TEAM = "DET";
const base: SaleInputs = { general: 57_000, holders: 45_000, want: 60_000, base: 150, price: 1, elastic: 1, pre: false, cold: false, win: 1 };

describe("the ticket office", () => {
  it("sells zone by zone, and promotions and dynamic prices behave like the real thing", () => {
    const plain = sellGeneral(base);
    expect(plain.singleSold).toBe(plain.singleSeats);
    // Raising the cheap seats loses more buyers than raising the best ones.
    const slow = { ...base, want: 50_000 };
    const upper = sellGeneral({ ...slow, zones: { lowerSide: 1, lowerEnd: 1, upperSide: 1, upperEnd: 1.3 } });
    const lower = sellGeneral({ ...slow, zones: { lowerSide: 1.3, lowerEnd: 1, upperSide: 1, upperEnd: 1 } });
    const flat = sellGeneral(slow);
    expect(flat.singleSold - upper.singleSold).toBeGreaterThan(0);
    expect(lower.singleRevenue).toBeGreaterThan(flat.singleRevenue);
    // A promotion at a sellout gives money away; at a slow game it fills seats.
    expect(sellGeneral({ ...base, promo: "family" }).singleRevenue).toBeLessThan(plain.singleRevenue);
    const promoSlow = sellGeneral({ ...slow, promo: "family" });
    expect(promoSlow.singleSold).toBeGreaterThan(flat.singleSold);
    // Groups fill only seats that would be empty.
    expect(sellGeneral({ ...base, groups: true }).groups).toBe(0);
    expect(sellGeneral({ ...slow, groups: true }).groups).toBeGreaterThan(0);
    // Dynamic pricing charges more when demand runs hot.
    const hot = sellGeneral({ ...base, want: 80_000, dynamic: true });
    expect(hot.dynamic).toBeGreaterThan(1);
    expect(hot.singleRevenue).toBeGreaterThan(sellGeneral({ ...base, want: 80_000 }).singleRevenue);
    // Weak demand: more holders list seats nobody buys, and more seats sit empty.
    expect(sellGeneral({ ...slow, want: 40_000, win: 0.9 }).noShow).toBeGreaterThan(plain.noShow);
    expect(hot.resale.price).toBeGreaterThan(plain.singlePrice);
  });

  it("renews holders by tenure, refills from the waiting list, and seat licenses cost holders", () => {
    const s = newGame(TEAM, "Owner", {}, 7);
    const t = tix(s);
    const p = planRenewals(s, 0.03, 0.5, false);
    expect(p.long).toBeGreaterThan(p.mid);
    expect(p.mid).toBeGreaterThan(p.recent);
    expect(planRenewals(s, 0.15, 0.5, false).rate).toBeLessThan(p.rate);
    t.waitlist = 20_000;
    const refill = planRenewals(s, 0.03, 0.5, false);
    expect(refill.fromWaitlist).toBeGreaterThan(0);
    const psl = planRenewals(s, 0.03, 0.5, false, 3_000);
    expect(psl.rate).toBeLessThan(refill.rate);
    expect(psl.pslBuyers).toBe(psl.holders);
    expect(launchPSL(s, 3_000)).not.toBeNull(); // only in the offseason window
  });

  it("plays a season with tiers, no-shows, resale and premium use on every home gate", () => {
    const s = stateAt(TEAM, 3);
    const regs = business(s).gates.filter((g) => g.type === "REG");
    expect(regs.length).toBeGreaterThanOrEqual(8);
    for (const g of regs) {
      expect(g.attendance!).toBeLessThan(g.sold);
      expect(g.attendance!).toBeGreaterThan(g.sold * 0.8);
      expect(g.premiumUse!).toBeGreaterThan(0.5);
      expect(g.tier).toBeDefined();
    }
    expect(fanBase(s).surveys.length).toBeGreaterThanOrEqual(8);
  }, 600_000);
});

describe("fans and the market", () => {
  it("starts neutral, and trust and surveys move demand", () => {
    const s = newGame(TEAM, "Owner", {}, 7);
    fanBase(s);
    expect(fanDemand(s, TEAM)).toBeCloseTo(1, 2);
    trustHit(s, -20, 5, "test");
    expect(fanDemand(s, TEAM)).toBeLessThan(0.98);
    expect(fanBase(s).scar).toBe(5);
    const g = SCHEDULE.find((x) => x.home === TEAM && x.type === "REG")!;
    const before = fanBase(s).sat.families;
    business(s).prices.single = 1.6;
    survey(s, g, 64_000, 1.6, () => 0.5);
    expect(fanBase(s).surveys[0].scores.value).toBeLessThan(5);
    expect(fanBase(s).sat.families).toBeLessThan(before);
    const clv = lifetimeValue(s);
    expect(clv.find((c) => c.seg === "subscribers")!.value).toBeGreaterThan(clv.find((c) => c.seg === "casual")!.value);
  });

  it("other teams feel market growth: a growing metro sells more over the years", () => {
    const s = newGame("HOU", "Owner", {}, 7);
    const now = fanDemand(s, "DAL");
    s.date = "2031-09-01";
    expect(fanDemand(s, "DAL")).toBeGreaterThan(now);
    expect(fanDemand(s, "CLE")).toBeLessThanOrEqual(1);
  });
});

describe("sponsorships", () => {
  it("knows its rights: naming where the club controls it, conflicts and exclusivity", () => {
    const s = newGame(TEAM, "Owner", {}, 7);
    const year = leagueYear(s.date);
    expect(categories(s)).toContain("naming");
    expect(namingIncome(s, year)).toBeCloseTo(STADIUM_BY_TEAM[TEAM].naming * STADIUM_BY_TEAM[TEAM].namingShare, -3);
    expect(rightsConflict(s, "sportsbook", true)).not.toBeNull();
    expect(rightsConflict(s, "bank", true)).toBeNull();
    // A tenant's pouring rights belong to the operator.
    const tenant = Object.keys(STADIUM_BY_TEAM).find((t) => STADIUM_BY_TEAM[t].structure === "tenant" || STADIUM_BY_TEAM[t].structure === "publicAuthority")!;
    const t = newGame(tenant, "Owner", {}, 7);
    expect(rightsConflict(t, "beer", false)).not.toBeNull();
    expect(categories(t)).not.toContain("naming");
  });

  it("charges make-goods for audiences not delivered, and lets the owner drop a partner in trouble", () => {
    const s = stateAt(TEAM, 3);
    const year = leagueYear(s.date);
    const l = localDeals(s);
    for (const d of l.deals) delete d.delivered;
    for (const g of business(s).gates) if (g.attendance) g.attendance = Math.round(g.capacity * 0.6);
    const before = pnl(s, year).expenses.find((e) => e.cat === "marketing")?.amount ?? 0;
    s.date = addDays(RULES.keyDates.regularSeasonEnd, 1);
    deliveryCheck(s);
    const after = pnl(s, leagueYear(s.date)).expenses.find((e) => e.cat === "marketing")?.amount ?? 0;
    expect(after).toBeLessThan(before);
    const d = dealFor(s, "bank", leagueYear(s.date))!;
    expect(d.delivered![leagueYear(s.date)]).toBeLessThan(0.93);
    d.scandal = s.date;
    expect(dropPartner(s, "bank")).toBeNull();
    expect(dealFor(s, "bank", leagueYear(s.date))).toBeUndefined();
  }, 600_000);
});

describe("the forecast", () => {
  it("plans player pay from how the club spends, not the whole cap", () => {
    const s = stateAt(TEAM, 3);
    const f = forecast(s, 4);
    const now = leagueYear(s.date);
    for (const y of f.slice(1)) expect(-y.players).toBeLessThanOrEqual(salaryCap(s, y.year) * 0.95 + 1);
    // Revenue keeps up: operating income doesn't fall away year after year.
    expect(f[3].operating).toBeGreaterThan(f[1].operating * 0.8);
    expect(f[0].year).toBe(now);
    expect(gateForecast(s, SCHEDULE.find((g) => g.home === TEAM && g.type === "REG")!).tickets).toBeGreaterThan(0);
  }, 600_000);
});
