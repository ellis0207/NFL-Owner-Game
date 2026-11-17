import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { contentFor, withUs, writeStory } from "../src/engine/media/compose";
import { GENERIC, genericFits, roundupsDaily } from "../src/engine/media/blend";
import { collectFacts, type Fact } from "../src/engine/media/facts";
import { FORMATS } from "../src/engine/media/formats";
import { CONTEXT, NEXT, ROUNDUP, VOICE } from "../src/engine/media/content/blend";
import { render } from "../src/engine/media/grammar";
import { teamSlots } from "../src/engine/media/facts";
import { mediaState } from "../src/engine/outlets";
import { rngFor } from "../src/engine/rng";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";

const BAD = /undefined|NaN|\[object|[{}<>[\]]/;

function factsOf(state: Parameters<typeof collectFacts>[0], date: string): Fact[] {
  const now = state.date;
  state.date = date;
  try {
    return collectFacts(state);
  } finally {
    state.date = now;
  }
}

describe("story combinations", () => {
  it("writes the shared formats, second angles, voices and context lines cleanly for real facts", async () => {
    const state = await stateAt("DET", 7, "2026-11-20");
    const facts: Fact[] = [];
    for (let d = addDays(state.date, -12); d < state.date; d = addDays(d, 1)) facts.push(...factsOf(state, d));
    expect(facts.length).toBeGreaterThan(50);
    let written = 0;
    const types = new Set<string>();
    for (const raw of facts) {
      const f = withUs(state, raw);
      const c = contentFor(f);
      if (!c) continue;
      for (const format of [...GENERIC.filter((g) => genericFits(f, g)), ...c.formats.filter((x) => x !== "notebook" || f.ours)]) {
        for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0).slice(0, 4)) {
          for (let k = 0; k < 2; k++) {
            const missing: string[] = [];
            const d = writeStory(state, f, angle, format, FORMATS[format].outlets[0][0], rngFor(k, `${f.id}:${angle.id}:${format}`), missing);
            expect(missing, `${d.type}: ${d.headline} ${d.body}`).toEqual([]);
            expect(`${d.headline} ${d.body}`, d.type).not.toMatch(BAD);
            types.add(d.type);
            written++;
          }
        }
      }
    }
    expect(written).toBeGreaterThan(300);
    expect([...types].some((t) => t.includes("+"))).toBe(true);
    for (const g of GENERIC) expect([...types].some((t) => t.endsWith(`/${g}`)), g).toBe(true);
  }, 120_000);

  it("keeps every combination line clean", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const slots = { CX: teamSlots(state, "DET"), H: "The Lions win", K: "Not so fast", by: "Pat Doe", cohost: "Lou Roe", show: "The Show", n: 3, first: "The Lions win", more: 2, week: 4, next: 5 };
    const lines = [...Object.values(CONTEXT).flat(), ...Object.values(NEXT).flat(), ...Object.values(VOICE).flat(), ...Object.values(ROUNDUP).flatMap((r) => [...r.head, ...r.open, ...r.close])];
    for (const line of lines) {
      const missing: string[] = [];
      const text = render(line, slots, { rng: rngFor(1, line), banks: {}, tone: "straight", missing });
      expect(missing, line).toEqual([]);
      expect(text, line).not.toMatch(BAD);
    }
  });

  it("files roundups on a busy day", async () => {
    const state = await stateAt("DET", 7, "2026-11-20");
    const before = mediaState(state).stories.length;
    // A Sunday's facts: a week of games and the league's moves.
    let sunday = state.date;
    while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = addDays(sunday, -1);
    roundupsDaily(state, factsOf(state, sunday));
    const added = mediaState(state).stories.slice(0, mediaState(state).stories.length - before);
    expect(added.some((s) => s.type?.startsWith("roundup.week"))).toBe(true);
    for (const s of added) expect(`${s.headline} ${s.body}`).not.toMatch(BAD);
    // The live loop files them too.
    for (let i = 0; i < 7; i++) advanceDay(state);
    expect(mediaState(state).stories.some((s) => s.type?.startsWith("roundup.") && s.date > "2026-11-20")).toBe(true);
  }, 120_000);
});
