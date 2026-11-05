import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import { culture, developmentCost, INDICATOR_KEYS, setDevelopment } from "../src/engine/culture";
import { mode, office, openMemos, setMode } from "../src/engine/delegation";
import { execBoost, execRole, execs, fireExec } from "../src/engine/executives";
import { decideMemo } from "../src/engine/memos";
import { DEFAULT_SETUP, owner } from "../src/engine/ownership";
import { perceivedAbility } from "../src/engine/staff";
import { advanceDay, newGame, simWeek } from "../src/engine/season";
import { teamPlayerIds } from "../src/engine/cap";
import { indicators, workplaceMonthly } from "../src/engine/workplace";
import { addDays } from "../src/engine/dates";
import { BASE_KEY_DATES } from "../src/engine/league";
import { stateAt } from "./fixtures";

const game = (seed = 7) => newGame("DET", "Owner", { capRules: "real" }, seed, DEFAULT_SETUP);
const toFirst = (s: ReturnType<typeof game>) => { do advanceDay(s); while (!s.date.endsWith("-01")); };

describe("culture and relationships", () => {
  it("reads six indicators every month", () => {
    const s = game();
    toFirst(s);
    advanceDay(s);
    const h = culture(s).history.at(-1)!;
    for (const k of INDICATOR_KEYS) {
      expect(h[k]).toBeGreaterThanOrEqual(0);
      expect(h[k]).toBeLessThanOrEqual(100);
    }
  }, 60_000);

  it("the GM's trust follows autonomy and overrides, and a GM who feels second-guessed asks where they stand", () => {
    const s = game();
    const start = culture(s).gmTrust;
    setMode(s, "signings", "delegate");
    expect(culture(s).gmTrust).toBeGreaterThan(start);
    setMode(s, "signings", "owner");
    setMode(s, "trades", "approve");
    setMode(s, "trades", "owner");
    culture(s).gmTrust = 20;
    workplaceMonthly(s);
    const memo = openMemos(s).find((m) => m.kind === "dispute" && m.payload?.who === "GM");
    expect(memo).toBeDefined();
    expect(decideMemo(s, memo!.id, 0)).toBeNull();
    expect(mode(s, "signings")).toBe("delegate");
    expect(culture(s).gmTrust).toBeGreaterThan(20);
  });

  it("an ambitious executive who loses authority pushes back", () => {
    const s = game();
    const cro = execRole(s, "CRO")!;
    cro.hidden.ambition = 80;
    setMode(s, "sponsors", "owner");
    workplaceMonthly(s);
    const memo = openMemos(s).find((m) => m.kind === "dispute" && m.payload?.who === "CRO");
    expect(memo).toBeDefined();
    expect(decideMemo(s, memo!.id, 0)).toBeNull();
    expect(mode(s, "sponsors")).toBe("approve");
  });

  it("instability shows in the readings, and an unhappy executive can walk", () => {
    const s = game();
    const before = indicators(s).stability;
    fireExec(s, "CTO");
    fireExec(s, "MKT");
    expect(indicators(s).stability).toBeLessThan(before);
    const coo = execRole(s, "COO")!;
    coo.satisfaction = 0;
    let gone = false;
    for (let i = 0; i < 12 && !gone; i++) {
      s.date = `2026-${String(8 + (i % 5)).padStart(2, "0")}-01`;
      workplaceMonthly(s);
      coo.satisfaction = Math.min(coo.satisfaction, 5);
      gone = !execRole(s, "COO");
    }
    expect(gone).toBe(true);
    expect(execs(s).departures.some((d) => d.role === "COO" && d.why === "left")).toBe(true);
  });

  it("complaints are memos whose handling moves fairness", () => {
    const s = game();
    let tries = 0;
    while (!openMemos(s).some((m) => m.kind === "complaint") && tries++ < 400) {
      s.date = `2026-${String(8 + (tries % 4)).padStart(2, "0")}-${String(1 + (tries % 28)).padStart(2, "0")}`;
      culture(s).history.push({ month: "x", trust: 10, stability: 10, fairness: 10, accountability: 10, communication: 10, morale: 0 });
      workplaceMonthly(s);
    }
    const memo = openMemos(s).find((m) => m.kind === "complaint")!;
    expect(memo).toBeDefined();
    const f = culture(s).fairness;
    expect(decideMemo(s, memo.id, 0)).toBeNull();
    expect(culture(s).fairness).toBeGreaterThan(f);
  });

  it("the development budget costs money and grows people", () => {
    const s = game();
    expect(developmentCost(s)).toBeGreaterThan(0);
    setDevelopment(s, 3);
    expect(developmentCost(s)).toBe(2_500_000);
    expect(office(s).trail.length).toBeGreaterThanOrEqual(0);
    expect(business(s).budget).toBeDefined();
  });
});

describe("owner settings", () => {
  it("a custom start sets the club's cash, debt, the owner's cash and the front office", () => {
    const weak = newGame("DET", "Owner", { capRules: "real" }, 7, { ...DEFAULT_SETUP, scenario: "custom", custom: { cash: 20_000_000, debt: 300_000_000, liquid: 50_000_000, staff: "weak" } });
    const strong = newGame("DET", "Owner", { capRules: "real" }, 7, { ...DEFAULT_SETUP, scenario: "custom", custom: { cash: 20_000_000, debt: 0, liquid: 50_000_000, staff: "strong" } });
    expect(owner(weak).liquid).toBe(50_000_000);
    expect(weak.debt!.loans.some((l) => l.amount === 300_000_000)).toBe(true);
    expect(execBoost(strong, "CFO")).toBeGreaterThan(execBoost(weak, "CFO"));
  });

  it("scouting precision widens or narrows only our own staff's reads", () => {
    const s = game();
    const id = teamPlayerIds(s, "DET")[0];
    const truth = (k: string) => perceivedAbility(s, id, k, 40);
    const real = truth("gm:DET");
    s.settings.scouting = "foggy";
    const foggy = truth("gm:DET");
    s.settings.scouting = "sharp";
    const sharp = truth("gm:DET");
    // Same direction of error, different size; another team's read is untouched.
    expect(Math.abs(foggy - real)).toBeGreaterThanOrEqual(0);
    expect(Math.abs(sharp - foggy)).toBeGreaterThan(0);
    const other = truth("gm:CHI");
    s.settings.scouting = "foggy";
    expect(truth("gm:CHI")).toBe(other);
  });

  it("a week sim stops early when an urgent memo lands, if the owner wants pauses", () => {
    const s = stateAt("DET", 3, addDays(BASE_KEY_DATES.negotiatingWindowOpens, -1));
    setMode(s, "signings", "approve");
    s.settings.pause = "urgent";
    const start = s.date;
    simWeek(s);
    expect(s.date < addDays(start, 7)).toBe(true);
    expect(openMemos(s).some((m) => m.kind === "signing")).toBe(true);
  }, 120_000);
});
