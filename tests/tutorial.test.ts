import { describe, expect, it } from "vitest";
import { LESSONS, METRICS, finishLesson, lessonView, newTutorial } from "../src/engine/tutorial";
import { decideMemo } from "../src/engine/memos";
import { setSinglePrice, business } from "../src/engine/business";
import { backCoach } from "../src/engine/people";
import { advanceDay } from "../src/engine/season";
import { checkAchievements } from "../src/engine/achievements";

describe("tutorial", () => {
  it("walks every lesson, puts its decision on the desk and shows what the decision moved", () => {
    const s = newTutorial();
    expect(s.tutorial!.lesson).toBe(0);
    for (const l of LESSONS) for (const k of l.metrics) expect(METRICS[k]).toBeDefined();
    // Lesson 1: the calendar moves.
    expect(lessonView(s, 0).ready).toBe(false);
    advanceDay(s);
    expect(lessonView(s, 0).ready).toBe(true);
    finishLesson(s, "made");
    // Lesson 2: a crossroads memo is on the desk; deciding it finishes the lesson and moves the GM's trust.
    const ref = s.tutorial!.marks.crossroads.ref!;
    expect(s.office!.memos.find((m) => m.id === ref)?.status).toBe("open");
    expect(decideMemo(s, ref, 1)).toBeNull();
    const v = lessonView(s, 1);
    expect(v.ready).toBe(true);
    expect(v.rows.every((r) => r.hidden ? !/\d/.test(r.now) || r.label === "Cap space next year" : true)).toBe(true);
    finishLesson(s, "made");
    for (let i = 2; i < LESSONS.length; i++) {
      const id = LESSONS[i].id;
      if (id === "tickets") {
        setSinglePrice(s, 1.25);
        const t = lessonView(s, i);
        expect(t.ready).toBe(true);
        expect(t.rows.find((r) => r.label.startsWith("Single-game"))!.dir).toBe("up");
      }
      if (id === "homeprice" || id === "locker") {
        // The price call and the unhappy starter are put on the desk; deciding them finishes the lesson.
        const m = s.tutorial!.marks[id].ref!;
        expect(s.office!.memos.find((x) => x.id === m)?.status).toBe("open");
        expect(decideMemo(s, m, 0)).toBeNull();
        expect(lessonView(s, i).ready).toBe(true);
      }
      if (id === "coach") { expect(backCoach(s)).toBeNull(); expect(lessonView(s, i).ready).toBe(true); }
      if (id === "board") {
        const m = s.tutorial!.marks.board.ref!;
        expect(decideMemo(s, m, 0)).toBeNull();
        expect(lessonView(s, i).ready).toBe(true);
      }
      finishLesson(s, lessonView(s, i).ready ? "made" : "skipped");
      expect(s.tutorial!.marks[id].after).toBeDefined();
    }
    expect(business(s).prices.single).toBeGreaterThan(0);
    // Practice games earn nothing.
    expect(checkAchievements(s)).toEqual([]);
    expect(s.achievements).toBeUndefined();
  }, 600_000);
});
