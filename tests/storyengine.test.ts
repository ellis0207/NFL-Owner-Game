import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { contentFor, withUs, writeStory } from "../src/engine/media/compose";
import { campFact, seatFact, talkFacts } from "../src/engine/media/desks";
import { TEAMS } from "../src/engine/league";
import { RUMOR_CONTENT } from "../src/engine/media/content/rumors";
import { ARC_CONTENT } from "../src/engine/media/content/arcs";
import { SEASON_CONTENT } from "../src/engine/media/content/season";
import { MAIL, OPINION_CONTENT } from "../src/engine/media/content/opinion";
import { ALERT, CLUB, FAN, NEWS_TAKE, PLAYER } from "../src/engine/media/content/social";
import { fanAccounts, sentiment, social, trending } from "../src/engine/media/social";
import { opinionState } from "../src/engine/media/opinion";
import { ARC_LABEL, ARCS, arcState } from "../src/engine/media/arcs";
import { narrState } from "../src/engine/media/narratives";
import { playerSlots, teamSlots } from "../src/engine/media/facts";
import { corps, localStaff, outletOf } from "../src/engine/media/corps";
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
    expect(render("{uncap:a} and {uncap:b}", { a: "People say", b: "QB Joe" }, c)).toBe("People say and QB Joe");
  });

  it("puts modifiers before the slot in every template, so lines that only show late in the season don't break", () => {
    const dir = "src/engine/media/content";
    for (const file of readdirSync(dir)) {
      const text = readFileSync(`${dir}/${file}`, "utf8");
      expect(text.match(/\{[A-Za-z][\w.]*:(last|cap|lower|an|ord|s|uncap)\}/g), file).toBeNull();
    }
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

  it("writes every kind of sourced report cleanly", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const rep = corps(state).people.find((p) => p.role === "insider")!;
    const qb = Object.keys(state.players).find((id) => state.players[id].team === "CHI")!;
    let written = 0;
    for (const [kind, c] of Object.entries(RUMOR_CONTENT)) {
      for (const flags of [{}, { ours: true, star: true, deadline: true, denied: true, hot: true, localReporter: true }]) {
        const raw: Fact = {
          id: `t:${kind}:${Object.keys(flags).length}`, type: `rumor.${kind}`, family: "rumor", kind: "rumor", teams: ["CHI", "GB"], players: [qb], value: 60,
          ours: !!(flags as { ours?: boolean }).ours, tags: { [kind]: true, ...flags },
          slots: {
            R: { name: rep.name, outlet: outletOf(rep.outlet).name }, T: teamSlots(state, "CHI"), P: playerSlots(state, qb), X: teamSlots(state, "GB"),
            list: "the Bears and Packers", C: { name: "Joe Smith" }, pos: "edge rusher", text: "People inside the building say the staff is split", headline: "a split staff",
          },
        };
        const f = withUs(state, raw);
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
    }
    expect(written).toBeGreaterThan(150);
  });

  it("writes every arc's opening, chapters and endings cleanly", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const ids = Object.keys(state.players).filter((id) => state.players[id].team === "CHI");
    let written = 0;
    expect(Object.keys(ARC_CONTENT).sort()).toEqual(ARCS.map((d) => d.kind).sort());
    for (const kind of Object.keys(ARC_CONTENT)) expect(ARC_LABEL[kind], kind).toBeTruthy();
    for (const [kind, c] of Object.entries(ARC_CONTENT)) {
      const beats = c.angles.map((a) => a.id).filter((id) => id !== "plain" && id !== "ours");
      for (const beat of ["open", ...beats.filter((b) => b !== "open")]) {
        for (const ours of [false, true]) {
          const raw: Fact = {
            id: `t:${kind}:${beat}:${ours}`, type: `arc.${kind}`, family: "arc", kind: "trend", teams: ["CHI", "GB"], players: [ids[0]], value: 60, ours,
            tags: { [beat]: true, beat, ending: beat !== "open" && !["pressure", "rolling"].includes(beat), opening: beat === "open", ours, star: ours },
            slots: {
              T: teamSlots(state, "CHI"), X: teamSlots(state, "GB"), P: playerSlots(state, ids[0]), W: playerSlots(state, ids[1]), C: { name: "Joe Smith" },
              days: 40, n: 3, title: "Is Joe Smith the answer at quarterback?", text: "The council has questions",
            },
          };
          const f = withUs(state, raw);
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
      }
    }
    expect(written).toBeGreaterThan(1000);
  });

  it("writes every season narrative cleanly", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const ids = Object.keys(state.players).filter((id) => state.players[id].team === "CHI");
    const flags = ["newLeader", "holds", "climber", "rookie", "late", "early", "final", "today", "eve", "buyer", "seller", "rise", "fall", "firstRound", "gone", "top10", "fromNowhere",
      "round", "long", "fresh", "firstWasBest", "hasFirst", "close", "champion", "runnerUp", "playoffs", "beat", "fell", "bad", "good", "repeat", "legend", "oneTeam", "ring", "honored"];
    let written = 0;
    for (const [kind, c] of Object.entries(SEASON_CONTENT)) {
      for (const [ours, on, trim] of [[false, false, false], [true, true, false], [false, true, true]] as const) {
        const tags: Record<string, boolean> = { [kind]: true, ours };
        if (on) for (const t of flags) tags[t] = true;
        const slots: Fact["slots"] = {
          T: teamSlots(state, "CHI"), X: teamSlots(state, "GB"), Y: teamSlots(state, "MIN"), P: playerSlots(state, ids[0]), Q: playerSlots(state, ids[1]), W: playerSlots(state, ids[2]),
          D: { name: "Joe Smith", pos: "QB", school: "Ohio State" }, award: "Most Valuable Player", short: "MVP", week: 6, list: "1. A; 2. B", div: "NFC North", conf: "NFC",
          line: "1. Lions (5-1)", left: 3, bubble: "Packers, Vikings", days: 3, buyers: "Lions, Eagles", sellers: "Jets, Giants", now: 12, was: 30, analyst: "Pat Doe", outlet: "The Ledger",
          years: 5, headline: "Bears trade for a quarterback", then: "2021-11-17", title: "The seat license fight", year: 2016, pb: 4, size: 32, mark: "10,000", need: "120",
          what: "rushing yards", holder: "Emmitt Smith", season: 2026, seasons: 12, ap: 1, rings: 1, from: 2014, to: 2026, clubs: 2,
        };
        // Optional people and clubs drop out in the trimmed pass.
        if (trim) {
          for (const k of ["Q", "W", "Y", "T"]) delete slots[k];
          tags.newLeader = tags.climber = false;
        }
        const raw: Fact = { id: `t:${kind}:${ours}:${on}:${trim}`, type: `season.${kind}`, family: "season", kind: "trend", teams: trim ? [] : ["CHI"], players: [ids[0]], value: 60, ours, tags, slots };
        const f = ours ? withUs(state, raw) : raw;
        for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0)) {
          for (const format of c.formats.filter((x) => x !== "notebook" || f.ours)) {
            const missing: string[] = [];
            const d = writeStory(state, f, angle, format, FORMATS[format].outlets[0][0], rngFor(1, `${f.id}:${angle.id}:${format}`), missing);
            const text = `${d.headline} ${d.body}`;
            if (!trim || !["clinch", "eliminated", "playoffs", "deadline", "anniversary", "saga", "retro", "yearinreview", "milestone", "recordwatch"].includes(kind)) expect(missing, `${d.type}: ${text}`).toEqual([]);
            expect(text, d.type).not.toMatch(/undefined|NaN|\[object|[{}<>[\]]/);
            written++;
          }
        }
      }
    }
    expect(written).toBeGreaterThan(300);
  });

  it("writes every Huddle post and opinion piece cleanly", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const ids = Object.keys(state.players).filter((id) => state.players[id].team === "CHI");
    const slots: Fact["slots"] = {
      T: teamSlots(state, "CHI"), X: teamSlots(state, "GB"), P: playerSlots(state, ids[0]), Q: playerSlots(state, ids[1]), O: "Packers", score: "24-17", total: "$40M", coach: "Joe Smith",
      yearsWord: "four", injury: "torn ACL", span: "about 6 weeks", head: "The Bears trade a pick to the Packers", text: "the Bears fired their coordinator",
      R: { name: "Pat Doe", outlet: "The Ledger" }, S: { name: "Lou Roe", outlet: "The Blitz" }, stance: "for real", weeks: 4, since: "Oct 1", list: "Bears, Packers, Lions", topic: "Bears",
      stanceR: "They're for real", stanceS: "Not buying it", mail: "Q? A.", A: "@Fan", C: { name: "Joe Smith" },
    };
    const lines = [
      ...Object.values(FAN).flatMap((x) => [...x.good, ...x.bad, ...x.chat]), ...Object.values(NEWS_TAKE).flatMap((x) => [...x.good, ...x.bad]),
      ...Object.values(PLAYER).flat(), ...Object.values(ALERT).flat(), ...Object.values(CLUB).flat(), ...Object.values(MAIL).flatMap((x) => [...x.q, ...x.a]),
    ];
    for (const line of lines) {
      for (let k = 0; k < 4; k++) {
        const missing: string[] = [];
        const text = render(line, slots, { rng: rngFor(k, line), banks: {}, tone: "lively", missing });
        expect(missing, `${line} -> ${text}`).toEqual([]);
        expect(text, line).not.toMatch(/undefined|NaN|\[object|[{}<>[\]]/);
      }
    }
    expect(new Set(fanAccounts(state, "CHI").map((a) => a.handle)).size).toBe(8);
    let written = 0;
    const flags = ["open", "holding", "shaky", "right", "wrong", "real", "fraud", "pod", "local", "team", "mvp"];
    for (const [kind, c] of Object.entries(OPINION_CONTENT)) {
      for (const on of [false, true]) {
        const tags: Record<string, boolean> = { [kind]: true, ours: on };
        if (on) for (const t of flags) tags[t] = true;
        const raw: Fact = { id: `t:${kind}:${on}`, type: `opinion.${kind}`, family: "opinion", kind: "trend", teams: ["CHI"], players: [ids[0]], value: 50, ours: on, tags, slots };
        const f = on ? withUs(state, raw) : raw;
        for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0)) {
          for (const format of c.formats.filter((x) => x !== "notebook" || f.ours)) {
            const missing: string[] = [];
            const d = writeStory(state, f, angle, format, FORMATS[format].outlets[0][0], rngFor(1, `${f.id}:${angle.id}:${format}`), missing);
            expect(missing, `${d.type}: ${d.headline} ${d.body}`).toEqual([]);
            expect(`${d.headline} ${d.body}`, d.type).not.toMatch(/undefined|NaN|\[object|[{}<>[\]]/);
            written++;
          }
        }
      }
    }
    expect(written).toBeGreaterThan(40);
  });

  it("runs storylines through a season: they open, move and end, and get written up", async () => {
    const state = await stateAt("DET", 7);
    const list = arcState(state).list;
    const kinds = new Set(list.map((a) => a.kind));
    expect(kinds.size, [...kinds].join(",")).toBeGreaterThanOrEqual(8);
    expect(list.some((a) => a.ending && a.beats.length >= 2)).toBe(true);
    expect(list.some((a) => a.kind === "question")).toBe(true);
    expect(mediaState(state).stories.filter((s) => s.type?.startsWith("arc.")).length).toBeGreaterThan(20);
    // The calendar's stories: ladders, the playoff picture, the deadline, retrospectives and more.
    const season = new Set(mediaState(state).stories.filter((s) => s.type?.startsWith("season.")).map((s) => s.type!.split("/")[0]));
    expect(season.has("season.retro"), [...season].join(",")).toBe(true);
    // The playoff picture: the race itself, or our club clinching or falling out of it.
    expect(["playoffs", "clinch", "eliminated"].some((k) => season.has(`season.${k}`)), [...season].join(",")).toBe(true);
    // Stories older than the kept window survive only when they're about our club, so the weekly
    // award ladders show up in the saved stories only when one of ours leads a race; the races themselves always ran.
    expect(season.has("season.award") || Object.keys(narrState(state).ladder).length === 5, [...season].join(",")).toBe(true);
    // The Huddle: fans, players, reporters and clubs all post; moods spread; something is trending; columnists hold theses.
    const posts = social(state).posts;
    for (const k of ["fan", "club", "press"]) expect(posts.some((p) => p.kind === k), k).toBe(true);
    const moods = TEAMS.map((t) => sentiment(state, t.id));
    expect(Math.max(...moods) - Math.min(...moods)).toBeGreaterThan(10);
    expect(trending(state).length).toBeGreaterThan(0);
    expect(opinionState(state).theses.length).toBeGreaterThan(3);
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
    expect(typed.some((s) => s.outlet === "local:DET" && s.format === "notebook")).toBe(true);
    emit(state, { type: "test.note", text: "Something happened", teams: ["DET"], value: 50 });
    expect(mediaState(state).queue).toHaveLength(1);
    advanceDay(state);
    expect(mediaState(state).queue ?? []).toHaveLength(0);
    expect(addDays(start, 7)).toBe(state.date);
  });
});
