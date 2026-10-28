import { describe, expect, it } from "vitest";
import { morale } from "../src/engine/agents";
import { addDays } from "../src/engine/dates";
import { GAMES_BY_DATE, RULES, SCHEDULE } from "../src/engine/league";
import { mediaState, ownerLeverage } from "../src/engine/outlets";
import { answerQuestion, openQuestions, pressDaily } from "../src/engine/press";
import { advanceDay, newGame } from "../src/engine/season";
import type { GameState, PressQuestion } from "../src/engine/types";
import { compress, decompress } from "../src/save/codec";

const KEY = RULES.keyDates;
const opener = SCHEDULE.find((g) => g.type === "REG" && (g.home === "DET" || g.away === "DET"))!;

function ask(state: GameState, q: Partial<PressQuestion> & Pick<PressQuestion, "topic" | "options">): PressQuestion {
  const full: PressQuestion = {
    id: `q-test-${mediaState(state).questions.length}`, date: state.date, expires: addDays(state.date, 3), outlet: "ledger", by: "Sam Okafor",
    context: "Test.", question: "Test?", ...q,
  };
  mediaState(state).questions.unshift(full);
  return full;
}

describe("the media", () => {
  it("covers every game and files every day", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 7);
    const quiet: string[] = [];
    while (state.date <= addDays(opener.date, 21)) {
      const date = state.date;
      advanceDay(state);
      if (!mediaState(state).stories.some((s) => s.date === date)) quiet.push(date);
    }
    expect(quiet).toEqual([]);
    const games = GAMES_BY_DATE[opener.date].filter((g) => g.type === "REG");
    const recaps = mediaState(state).stories.filter((s) => s.kind === "recap" && s.gameId);
    for (const g of games) expect(recaps.some((s) => s.gameId === g.id)).toBe(true);
    expect(mediaState(state).stories.some((s) => s.kind === "rankings")).toBe(true);
    // Options are words only: nothing about what they do.
    for (const q of mediaState(state).questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(4);
      expect(q.options.length).toBeLessThanOrEqual(6);
      for (const o of q.options) expect(Object.keys(o).sort()).toEqual(["key", "text"]);
    }
  });

  it("a question nobody answers lapses into no comment and costs a little with that outlet", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 3);
    const q = ask(state, { topic: "loss", options: [{ key: "takeBlame", text: "On me." }, { key: "noComment", text: "No comment." }, { key: "humble", text: "x" }, { key: "x", text: "y" }] });
    for (let i = 0; i < 4; i++) advanceDay(state);
    expect(q.answer).toBe(-1);
    expect(openQuestions(state).some((x) => x.id === q.id)).toBe(false);
    expect(mediaState(state).rel.ledger).toBeLessThan(0);
    expect(mediaState(state).stories.some((s) => s.kind === "owner" && /declines to comment/.test(s.headline))).toBe(true);
  });

  it("promising to pay a player gives his agent leverage; calling out a player hurts his mood", () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 5);
    const ids = Object.keys(state.players).filter((id) => state.players[id].team === "DET");
    const star = ids[0];
    const q = ask(state, { topic: "contract", player: star, options: [{ key: "willPay", text: "We'll pay him." }, { key: "noComment", text: "No comment." }, { key: "firm", text: "x" }, { key: "private", text: "y" }] });
    expect(answerQuestion(state, q.id, 0)).toBeNull();
    expect(ownerLeverage(state, star, "DET")).toBeGreaterThan(0);
    expect(ownerLeverage(state, star, "GB")).toBe(0);
    expect(mediaState(state).stories[0].kind).toBe("owner");
    expect(answerQuestion(state, q.id, 1)).not.toBeNull();

    const before = morale(state, ids[1]);
    const q2 = ask(state, { topic: "contract", player: ids[1], options: [{ key: "explore", text: "We'll explore every option." }, { key: "noComment", text: "No comment." }, { key: "a", text: "a" }, { key: "b", text: "b" }] });
    answerQuestion(state, q2.id, 0);
    expect(morale(state, ids[1])).toBeLessThan(before);
    expect(state.trades?.block).toContain(ids[1]);
  });

  it("tampering talk can bring a league fine days later", () => {
    let fined = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = newGame("DET", "Owner", { capRules: "real" }, seed);
      const other = Object.keys(state.players).find((id) => state.players[id].team === "GB")!;
      const q = ask(state, { topic: "tamper", player: other, team: "GB", options: [{ key: "firstCall", text: "We'll be the first call." }, { key: "noComment", text: "No comment." }, { key: "a", text: "a" }, { key: "b", text: "b" }] });
      answerQuestion(state, q.id, 0);
      for (let i = 0; i < 8; i++) {
        pressDaily(state);
        state.date = addDays(state.date, 1);
      }
      if (mediaState(state).fines.length) {
        fined++;
        expect(state.inbox.some((m) => m.title === "Fine notice")).toBe(true);
      }
    }
    expect(fined).toBeGreaterThanOrEqual(2);
  });

  it("saves keep the coverage and the open questions", async () => {
    const state = newGame("DET", "Owner", { capRules: "real" }, 9);
    while (state.date < addDays(KEY.rosterCutdown, 3)) advanceDay(state);
    ask(state, { topic: "win", options: [{ key: "humble", text: "One game at a time." }, { key: "noComment", text: "No comment." }, { key: "a", text: "a" }, { key: "b", text: "b" }] });
    const back = await decompress(await compress(state));
    expect(back.media?.stories.length).toBe(state.media?.stories.length);
    expect(openQuestions(back).length).toBe(openQuestions(state).length);
  });
});
