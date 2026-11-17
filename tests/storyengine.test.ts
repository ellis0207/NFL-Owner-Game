import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { FAMILIES, writeStory } from "../src/engine/media/compose";
import { collectFacts, emit, type Fact } from "../src/engine/media/facts";
import { FORMATS } from "../src/engine/media/formats";
import { render, tidy, type RenderContext } from "../src/engine/media/grammar";
import { mediaState } from "../src/engine/outlets";
import { rngFor } from "../src/engine/rng";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";

const ctx = (seed = 1): RenderContext => ({ rng: rngFor(seed, "t"), banks: { v: ["won"], "v.hot": ["crushed it"] }, tone: "straight", missing: [] });

describe("the writing grammar", () => {
  it("fills slots, conditions, choices, banks and modifiers", () => {
    const c = ctx();
    const slots = { P: { name: "Amon-Ra St. Brown", pos: "WR" }, injury: "ankle sprain", n: 1, m: 3, gone: 0 };
    expect(render("{P.name} has {an:injury}.", slots, c)).toBe("Amon-Ra St. Brown has an ankle sprain.");
    expect(render("<gone?never><!gone?always> {n} year{s:n}, {m} year{s:m}, the {ord:m} time", slots, c)).toBe("Always 1 year, 3 years, the 3rd time");
    expect(render("They {@v}.", slots, c)).toBe("They won.");
    expect(render("They {@v}.", slots, { ...c, tone: "hot" })).toBe("They crushed it.");
    expect(["A", "B"]).toContain(render("[a|b]", slots, c));
    expect(render("{nope}", slots, c)).toBe("");
    expect(c.missing).toEqual(["nope"]);
    expect(tidy("chris Godwin Jr. caught it. then he scored .")).toBe("Chris Godwin Jr. caught it. Then he scored.");
  });
});

/** Facts for a day already played: the engine reads them for the day's date. */
function factsOf(state: Parameters<typeof collectFacts>[0], date: string): Fact[] {
  const now = state.date;
  state.date = date;
  try {
    return collectFacts(state);
  } finally {
    state.date = now;
  }
}

describe("the story engine", () => {
  it("writes every applicable angle in every format without empty slots or leftover marks", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const facts: Fact[] = [];
    for (let i = 0; i < 12; i++) {
      const date = state.date;
      advanceDay(state);
      facts.push(...factsOf(state, date));
    }
    const families = new Set(facts.map((f) => f.family));
    for (const fam of ["game", "performance", "injury", "signing"]) expect(families.has(fam as Fact["family"])).toBe(true);
    let written = 0;
    for (const f of facts) {
      const c = FAMILIES[f.family]!;
      for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0)) {
        for (const format of c.formats) {
          const missing: string[] = [];
          const fake = format === "notebook" ? { ...f, ours: true, slots: { ...f.slots, US: f.slots.W ?? f.slots.T ?? f.slots.A, THEM: f.slots.L ?? f.slots.O ?? f.slots.B } } : f;
          const outlet = FORMATS[format].outlets[0][0];
          const d = writeStory(state, fake, angle, format, outlet, rngFor(1, `${f.id}:${angle.id}:${format}`), missing);
          const text = `${d.headline} ${d.body}`;
          expect(missing, `${d.type}: ${text}`).toEqual([]);
          expect(text, d.type).not.toMatch(/undefined|NaN|\[object|[{}<>[\]]|\brating\b|\boverall\b|\bpotential\b/);
          expect(d.headline.length, d.type).toBeGreaterThan(10);
          written++;
        }
      }
    }
    expect(written).toBeGreaterThan(300);
  });

  it("files the day's coverage with story types, every game gets a story, and other systems can hand over facts", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const start = state.date;
    for (let i = 0; i < 6; i++) advanceDay(state);
    const typed = mediaState(state).stories.filter((s) => s.type && s.date >= start);
    expect(typed.length).toBeGreaterThan(20);
    expect(new Set(typed.map((s) => s.type)).size).toBeGreaterThan(15);
    for (const s of typed) expect(s.type!.split("/")).toHaveLength(3);
    // Our beat writers cover our games.
    expect(typed.some((s) => s.outlet === "beat" && s.format === "notebook")).toBe(true);
    emit(state, { type: "test.note", text: "Something happened", teams: ["DET"], value: 50 });
    expect(mediaState(state).queue).toHaveLength(1);
    advanceDay(state);
    expect(mediaState(state).queue ?? []).toHaveLength(0);
    expect(addDays(start, 7)).toBe(state.date);
  });
});
