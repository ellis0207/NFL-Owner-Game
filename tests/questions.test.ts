import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { PRESS_Q, OWNER_Q } from "../src/engine/media/content/questions";
import { QA, SPEAKER_A, SPEAKER_Q } from "../src/engine/media/content/interviews";
import { render } from "../src/engine/media/grammar";
import { fillerTopics, ownerAnswers, ownerQuestion, ownerSlots, pickLine, qaFacts, questionMemory } from "../src/engine/media/questions";
import { writeStory } from "../src/engine/media/compose";
import { mediaState } from "../src/engine/outlets";
import { rngFor } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

/** The wording with names and numbers taken out, the way a player notices a repeat. */
const shape = (t: string) => t.replace(/\d[\d,.-]*/g, "#").replace(/(?<=\S\s+)[A-Z][\w.'-]*(\s+[A-Z][\w.'-]*)*/g, "X").toLowerCase();
const repeatRate = (xs: string[], f: (t: string) => string = (t) => t.toLowerCase()) => 1 - new Set(xs.map(f)).size / Math.max(1, xs.length);

describe("the question bank", () => {
  it("renders every line without a missing slot when its slots are there", () => {
    const state = stateAt("NYG", 7);
    const player = { name: "A Player", college: "State", pos: "WR", line: "x", draft: "a round 1 pick" };
    const owner = {
      ...ownerSlots(state),
      S: { ...player, name: "A Star" }, R: { ...player, name: "A Rookie" }, P: player,
      X: { nick: "Rivals", rec: "5-4" }, N: { nick: "Visitors", rec: "3-6" },
      L: { best: "Bests", bestRec: "8-1", champ: "Champs", mvp: { name: "M V", line: "x" }, trade: { player: "T P", from: "Froms", to: "Tos" }, deal: { player: "D P", team: "Deals", money: "$1" }, fired: { name: "F C", team: "Fires" } },
      me: { age: 60, heir: "H", season: 2026 }, title: "Will they?", label: "quarterback",
      M: { name: "A Mate" }, K: { name: "A Coach", role: "head coach" },
    };
    const press = { ...owner, P: "A Player", PR: "A Prospect", C: "A Coach", X: "Rivals", n: 3, how: "holding out" };
    const banks: [Record<string, string[]>, object][] = [[OWNER_Q, owner], [SPEAKER_Q, owner], [SPEAKER_A, owner], [PRESS_Q, press]];
    for (const [bank, slots] of banks) {
      for (const [k, lines] of Object.entries(bank)) {
        for (const line of lines) {
          const missing: string[] = [];
          const text = render(line, slots as never, { rng: rngFor(1, line), banks: {}, tone: "straight", missing });
          expect(missing, `${k}: ${line}`).toEqual([]);
          expect(text.length, `${k}: ${line}`).toBeGreaterThan(8);
        }
      }
    }
  });

  it("asks hundreds of different questions and offers six answers to each", () => {
    const owner = Object.values(OWNER_Q).reduce((a, l) => a + l.length, 0);
    expect(owner).toBeGreaterThanOrEqual(400);
    expect(Object.values(SPEAKER_Q).reduce((a, l) => a + l.length, 0)).toBeGreaterThan(90);
    const state = stateAt("NYG", 7);
    const slots = ownerSlots(state);
    const answers = ownerAnswers(state, rngFor(1, "a"), "p.city", slots);
    expect(answers.map((a) => a.tone)).toEqual(["candid", "confident", "deflect", "defiant", "gracious", "playful"]);
    expect(answers.every((a) => a.text.length > 10)).toBe(true);
  });

  it("puts a line asked lately at the back of the line", () => {
    const state = stateAt("NYG", 7);
    const lines = ["one", "two", "three", "four", "five", "six"];
    const got = new Set<string>();
    for (let d = 0; d < 6; d++) {
      state.date = addDays(state.date, 1);
      got.add(pickLine(state, rngFor(d, "p"), "test:lines", lines, {}, false));
    }
    expect(got.size).toBe(6);
  });
});

describe("a long save", () => {
  it("played a season with fresh questions and more ways to answer", () => {
    const state = stateAt("NYG", 7);
    const m = mediaState(state);
    const texts = [...m.questions.map((q) => q.question), ...(m.desk?.pressers ?? []).flatMap((p) => p.questions.map((q) => q.text))];
    expect(texts.length).toBeGreaterThan(40);
    expect(repeatRate(texts)).toBeLessThan(0.02);
    // Every daily question has a gracious and a playful answer besides its own.
    expect(m.questions.every((q) => q.options.some((o) => o.key === "tone:gracious") && q.options.some((o) => o.key === "tone:playful"))).toBe(true);
    expect((m.desk?.pressers ?? []).every((p) => p.questions.every((q) => q.options.length === 6))).toBe(true);
    // Other clubs' people got asked too, and the stories carry the question.
    const qa = m.stories.filter((s) => s.type?.startsWith("qa."));
    expect(qa.length).toBeGreaterThan(5);
    expect(Object.keys(questionMemory(state).used).filter((k) => k.startsWith("ctopic:")).length).toBeGreaterThan(20);
    expect(qa.some((s) => /Asked "|was the question/.test(s.body))).toBe(true);
  });

  it("rarely repeats a question over six more seasons of asking", () => {
    const state: GameState = stateAt("NYG", 7);
    const mem = questionMemory(state);
    // A season's asking, as the desk does it: the news questions about as often as their news comes
    // up in a season, and the rest (press conference fillers, quiet days) from the bank's topics.
    const perSeason: Record<string, number> = {
      win: 6, winBig: 2, lossWhat: 5, lossPatience: 2, injury: 3, coachSafe: 1, expect: 1, cuts: 1, deadline: 1, grade: 1,
      signed: 2, overpaid: 1, tradeAway: 1, tradeGet: 1, release: 1, contractStatus: 2, expiring: 1, faPlans: 1, prospect: 1, draftPick: 2, ticketsUp: 1, qb: 1,
    };
    const owner: string[] = [];
    const cpu: string[] = [];
    const asked: string[] = [];
    for (let season = 0; season < 6; season++) {
      const days = Array.from({ length: 365 }, (_, d) => d);
      const asks: string[] = Object.entries(perSeason).flatMap(([k, n]) => Array(n).fill(k));
      for (let k = 0; k < 90; k++) asks.push("filler");
      const rng = rngFor(7, `qtest:${season}`);
      // Spread the asks over the year.
      const when = asks.map(() => days[Math.floor(rng() * days.length)]);
      const order = asks.map((a, i) => [when[i], a] as const).sort((a, b) => a[0] - b[0]);
      const start = state.date;
      for (const [d, a] of order) {
        state.date = addDays(start, d);
        // Names change the way they do in a save: the opponent, the player, the prospect.
        const names = ["Hawks", "Bears", "Lions", "Jets", "Rams", "Colts", "Saints", "Bills", "Chiefs", "Eagles", "Titans", "Ravens"];
        const slots = { ...ownerSlots(state), P: `Player ${Math.floor(rng() * 30)}`, PR: `Prospect ${Math.floor(rng() * 30)}`, X: names[Math.floor(rng() * names.length)], C: "A Coach", n: 3 + Math.floor(rng() * 4), how: "holding out" };
        if (a === "filler") {
          const [t] = fillerTopics(state, rng, 1, ownerSlots(state));
          owner.push(ownerQuestion(state, rng, t.topic, ownerSlots(state)));
        } else owner.push(pickLine(state, rng, `p:${a}`, PRESS_Q[a], slots));
      }
      for (let d = 0; d < 365; d++) {
        state.date = addDays(start, d);
        for (const f of qaFacts(state, rngFor(7, `qa:${season}:${d}`))) {
          const who = (f.slots.P as { name?: string } | undefined)?.name ?? (f.slots.K as { name?: string } | undefined)?.name;
          cpu.push(String(f.slots.Q));
          asked.push(`${who}: ${f.slots.Q}`);
        }
      }
      state.date = addDays(start, 365);
    }
    expect(owner.length).toBeGreaterThan(700);
    // The same wording almost never; the same question with the names swapped rarely.
    expect(repeatRate(owner)).toBeLessThan(0.02);
    expect(repeatRate(owner, shape)).toBeLessThan(0.1);
    // Other clubs' people: the same person is almost never asked the same thing twice, and across
    // the league's 31 other clubs most wordings are new.
    expect(cpu.length).toBeGreaterThan(800);
    expect(repeatRate(asked)).toBeLessThan(0.03);
    expect(repeatRate(cpu)).toBeLessThan(0.25);
    // The memory stays bounded in a long save.
    expect(mem.seen.length).toBeLessThanOrEqual(3000);
    expect(mem.cseen?.length ?? 0).toBeLessThanOrEqual(3000);
  });

  it("writes the question-and-answer stories cleanly", () => {
    const state = stateAt("NYG", 7);
    state.date = addDays(state.date, 200);
    for (let d = 0; d < 20; d++) {
      for (const f of qaFacts(state, rngFor(d, "qa"))) {
        for (const format of QA.formats) {
          for (const angle of QA.angles) {
            const missing: string[] = [];
            const s = writeStory(state, f, angle, format, "ledger", rngFor(d, `qa:${format}`), missing);
            expect(s.body, f.type).not.toMatch(/\{|\}|\[|\]|<|>|undefined/);
            expect(s.headline, f.type).not.toMatch(/\{|\}|undefined/);
          }
        }
      }
      state.date = addDays(state.date, 1);
    }
  });
});
