import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { contentFor, withUs, writeStory } from "../src/engine/media/compose";
import { campFact, seatFact, talkFacts } from "../src/engine/media/desks";
import { TEAMS } from "../src/engine/league";
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
    for (const raw of facts) {
      const f = withUs(state, raw);
      const c = contentFor(f)!;
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

  it("writes every wire topic and angle cleanly", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const lines: [string, string][] = [
      ["coaching", "The Chicago Bears fire Ben Johnson; Joe Smith is the interim head coach"], ["coaching", "Speculation grows about Dan Campbell's future with the Lions"],
      ["coaching", "The Detroit Lions hire Sam Lee as offensive coordinator"],
      ["contracts", "Jared Goff is not attending Detroit Lions OTAs while he seeks a new contract"], ["contracts", "The Green Bay Packers place the franchise tag on Jordan Love ($40.0M for 2027)"],
      ["contracts", "Jared Goff takes a pay cut to stay with the Detroit Lions"], ["contracts", "The Dallas Cowboys are still over the cap after the league year opened"],
      ["freeagency", "Bidding war: Josh Allen's price is past $50M a year with the Bills"], ["freeagency", "QB Josh Allen visits the Detroit Lions"],
      ["trades", "A trade between the Detroit Lions and Chicago Bears is called off: failed physical"], ["trades", "The trade deadline passes at 4 PM ET: 9 trades in the final week"],
      ["league", "Owners approve a new kickoff rule by a 26-6 vote"], ["league", "The league sets the 2027 salary cap at $300.0M"], ["league", "The league signs new national TV deals; rights fees rise about 10%"],
      ["labor", "The owners lock out the players"], ["labor", "Owners and players agree to a new labor deal"],
      ["discipline", "Jared Goff (Detroit Lions) suspended 6 games under the league's gambling policy"], ["discipline", "The league fines Detroit Lions owner Pat Doe $100K for tampering comments"],
      ["business", "Acme files for bankruptcy, leaving a hole in the Detroit Lions' sponsorship roster"], ["business", "Detroit Lions stadium damaged: a roof leak"],
      ["stadiums", "Officials approve the Chicago Bears' new stadium: $3.0B, opening in 2030"], ["stadiums", "The Chicago Bears' new-stadium plan stalls after public money falls through"], ["stadiums", "The Chicago Bears open Lakefront Field"],
      ["relocation", "The Detroit Lions apply to relocate to San Antonio"], ["relocation", "Owners reject the Detroit Lions' move to San Antonio, 20-12"], ["relocation", "The Detroit Lions withdraw their relocation application"],
      ["ownership", "The Chicago Bears owners are said to be exploring a sale after years of losses"], ["ownership", "The league steps in to supervise the Detroit Lions' finances"], ["ownership", "Lions sell a 10% stake to Big Fund"],
      ["frontoffice", "Lions name Pat Doe chief financial officer"], ["frontoffice", "Lions chief financial officer Pat Doe leaves to become a CFO elsewhere"],
      ["honors", "The Pro Football Hall of Fame class of 2027: A, B, C."], ["honors", "Jared Goff misses the Hall of Fame again."], ["honors", "Jared Goff reached 40,000 career passing yards."],
      ["retirement", "QB Jared Goff of the Detroit Lions retires at 34 after 12 seasons"], ["camp", "Jared Goff wins the Detroit Lions starting quarterback job over Kyle Allen"],
    ];
    for (const [topic, text] of lines) emit(state, { type: `${topic}.test`, text });
    const facts = factsOf(state, state.date).filter((f) => f.family === "wire");
    expect(facts.length).toBe(lines.length);
    let written = 0;
    for (const raw of facts) {
      const f = withUs(state, raw);
      const c = contentFor(f)!;
      for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0)) {
        for (const format of c.formats.filter((x) => x !== "notebook" || f.ours)) {
          const missing: string[] = [];
          const d = writeStory(state, f, angle, format, FORMATS[format].outlets[0][0], rngFor(1, `${f.id}:${angle.id}:${format}`), missing);
          const text = `${d.headline} ${d.body}`;
          expect(missing, `${d.type}: ${text}`).toEqual([]);
          expect(text, d.type).not.toMatch(/undefined|NaN|\[object|[{}<>[\]]/);
          written++;
        }
      }
    }
    expect(written).toBeGreaterThan(150);
  });

  it("writes press conferences, camp notebooks and the hot seat cleanly", async () => {
    const camp = await stateAt("DET", 7, "2026-08-10");
    const season = await stateAt("DET", 7);
    const facts: Fact[] = [];
    for (const t of TEAMS) {
      const f = campFact(camp, t.id, rngFor(3, t.id));
      if (f) facts.push(f);
    }
    for (let i = 0; i < 6; i++) facts.push(...talkFacts(season, rngFor(i, "talk")));
    for (let i = 0; i < 6; i++) {
      const f = seatFact(season, rngFor(i, "seat"));
      if (f) facts.push(f);
    }
    for (const fam of ["talk", "camp", "seat"]) expect(facts.some((f) => f.family === fam), fam).toBe(true);
    let written = 0;
    for (const raw of facts) {
      const state = raw.family === "camp" ? camp : season;
      const f = withUs(state, raw);
      const c = contentFor(f)!;
      for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0)) {
        for (const format of c.formats.filter((x) => x !== "notebook" || f.ours)) {
          const missing: string[] = [];
          const d = writeStory(state, f, angle, format, FORMATS[format].outlets[0][0], rngFor(1, `${f.id}:${angle.id}:${format}`), missing);
          const text = `${d.headline} ${d.body}`;
          expect(missing, `${d.type}: ${text}`).toEqual([]);
          expect(text, d.type).not.toMatch(/undefined|NaN|\[object|[{}<>[\]]|\brating\b|\boverall\b|\bpotential\b/);
          written++;
        }
      }
    }
    expect(written).toBeGreaterThan(80);
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
