import { describe, expect, it } from "vitest";
import { withUs, writeStory } from "../src/engine/media/compose";
import { ANSWER, ASK, EXCLUSIVE, OPED, OWNER_CONTENT, OWNER_POST, OWNER_REPLY } from "../src/engine/media/content/ownerdesk";
import { corps } from "../src/engine/media/corps";
import { playerSlots, teamSlots, type Fact } from "../src/engine/media/facts";
import { FORMATS } from "../src/engine/media/formats";
import { render } from "../src/engine/media/grammar";
import {
  deskReporters, exclusiveTopics, giveExclusive, holdPresser, opEdOutlets, openPressers, ownerDesk, ownerPost, ownerPostOptions,
  requestInterview, setAccess, writeOpEd,
} from "../src/engine/media/ownerdesk";
import { mediaState } from "../src/engine/outlets";
import { rngFor } from "../src/engine/rng";
import { advanceDay } from "../src/engine/season";
import { stateAt } from "./fixtures";
import { absorb, climate } from "../src/engine/media/coverage";
import { leagueAttention, pressTone } from "../src/engine/media/climate";
import { fireChance } from "../src/engine/carousel";
import { teamStaff } from "../src/engine/staff";
import { franchiseReputation } from "../src/engine/playercare";
import { TEAMS } from "../src/engine/league";

const BAD = /undefined|NaN|\[object|[{}<>[\]]/;

describe("the owner's press desk", () => {
  it("writes every question, answer, post and owner story cleanly", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    const ids = Object.keys(state.players).filter((id) => state.players[id].team === "DET");
    const slots: Fact["slots"] = {
      T: teamSlots(state, "DET"), X: teamSlots(state, "GB"), P: playerSlots(state, ids[0]), C: { name: "Joe Smith" }, title: "Can the defense hold up?", label: "win streak",
      O: { name: "Pat Owner", title: "owner" }, R: { name: "Lou Roe", outlet: "The Ledger" }, quote: "We'll see.", occasion: "at the season-opening press conference",
      n: 4, topics: "the record and the stadium", head: "The Lions are shopping a pick", topic: "The stadium plan", lede: "This team belongs to you.", line: "Pat Owner told Lou Roe the plan.", score: "24-17",
    };
    const lines = [
      ...Object.values(ASK).flat(), ...Object.values(ANSWER).flatMap((a) => Object.values(a).flat()), ...Object.values(OWNER_POST).flatMap((p) => p.text),
      ...Object.values(OWNER_REPLY).flat(), ...Object.values(OPED).flatMap((o) => o.lede), ...Object.values(EXCLUSIVE).flatMap((o) => o.line),
    ];
    for (const line of lines) {
      for (let k = 0; k < 3; k++) {
        const missing: string[] = [];
        const text = render(line, slots, { rng: rngFor(k, line), banks: {}, tone: "lively", missing });
        expect(missing, `${line} -> ${text}`).toEqual([]);
        expect(text, line).not.toMatch(BAD);
      }
    }
    let written = 0;
    for (const [kind, c] of Object.entries(OWNER_CONTENT)) {
      for (const flag of [null, ...c.angles.map((a) => a.id), "deny", "unban", "skipped"]) {
        const tags: Record<string, boolean> = { ours: true, ...(flag ? { [flag]: true } : {}) };
        const f = withUs(state, { id: `t:${kind}:${flag}`, type: `owner.${kind}`, family: "owner", kind: "owner", teams: ["DET"], players: [ids[0]], value: 50, ours: true, tags, slots });
        for (const angle of c.angles.filter((a) => a.id === "plain" || a.when(f.tags) > 0)) {
          for (const format of c.formats) {
            const missing: string[] = [];
            const d = writeStory(state, f, angle, format, FORMATS[format].outlets[0][0], rngFor(1, `${f.id}:${angle.id}:${format}`), missing);
            expect(missing, `${d.type}: ${d.headline} ${d.body}`).toEqual([]);
            expect(`${d.headline} ${d.body}`, d.type).not.toMatch(BAD);
            written++;
          }
        }
      }
    }
    expect(written).toBeGreaterThan(40);
  });

  it("calls the opener press conference, files the coverage, and runs interviews, exclusives, posts, columns and bans", async () => {
    const state = await stateAt("DET", 7, "regularSeasonStart");
    // A season played to the opener has called the owner to the podium; this copy answers its own.
    const k = ownerDesk(state);
    const held = k.pressers.find((p) => p.occasion === "opener");
    expect(held, "opener presser").toBeTruthy();
    expect(held!.questions.length).toBeGreaterThanOrEqual(4);
    for (const q of held!.questions) {
      expect(q.text).not.toMatch(BAD);
      expect(q.options.map((o) => o.tone)).toEqual(["candid", "confident", "deflect", "defiant", "gracious", "playful"]);
    }
    // Skipped (the fixture never answered it): the coverage says so.
    expect(held!.skipped).toBe(true);
    expect(mediaState(state).stories.some((s) => s.type?.startsWith("owner.presser"))).toBe(true);

    const reps = deskReporters(state);
    const rep = reps[0];
    const before = rep.rel;
    const p = requestInterview(state, rep.id, false);
    expect(typeof p).toBe("object");
    if (typeof p === "string") return;
    expect(openPressers(state).some((x) => x.id === p.id)).toBe(true);
    expect(holdPresser(state, p.id, p.questions.map(() => 0))).toBeNull();
    expect(rep.rel).toBeGreaterThan(before);
    expect(mediaState(state).stories[0].type).toMatch(/^owner\.interview/);
    expect(requestInterview(state, rep.id, true)).toMatch(/next interview/i);

    const n = mediaState(state).stories.length;
    expect(giveExclusive(state, reps[1].id, exclusiveTopics(state)[0].id)).toBeNull();
    expect(mediaState(state).stories.length).toBe(n + 1);
    expect(mediaState(state).stories[0].outlet).toBe(reps[1].outlet);

    const opts = ownerPostOptions(state);
    expect(opts.length).toBeGreaterThan(0);
    expect(ownerPost(state, opts[0].key)).toBeNull();
    expect(state.media!.social!.posts.some((x) => x.kind === "owner")).toBe(true);
    expect(ownerPostOptions(state)).toEqual([]);

    expect(writeOpEd(state, opEdOutlets(state)[0].id, "fans")).toBeNull();
    expect(mediaState(state).stories[0].type).toMatch(/^owner\.oped/);

    const victim = reps[2];
    expect(setAccess(state, victim.id, "banned")).toBeNull();
    expect(victim.rel).toBeLessThanOrEqual(-20);
    expect(mediaState(state).stories[0].type).toMatch(/^owner\.ban/);
    expect(requestInterview(state, victim.id, false)).toMatch(/banned/);
    for (const r of reps.slice(3, 6)) setAccess(state, r.id, "favored");
    expect(setAccess(state, reps[6].id, "favored")).toMatch(/at most/);
    // Banned reporters never get a question in.
    for (let d = 0; d < 20; d++) advanceDay(state);
    for (const pc of ownerDesk(state).pressers.filter((x) => x.date > held!.date)) expect(pc.questions.every((q) => q.by !== victim.id)).toBe(true);
    expect(corps(state).people.length).toBeGreaterThan(0);
  }, 120_000);

  it("turns a season's coverage into tones that CPU owners, free agents and the league office feel", async () => {
    const state = await stateAt("DET", 7);
    const tones = TEAMS.map((t) => pressTone(state, t.id));
    expect(Math.max(...tones) - Math.min(...tones)).toBeGreaterThan(10);
    expect(Object.keys(climate(state).players).length).toBeGreaterThan(5);
    // A savaged club: its owner is less patient and free agents like it less.
    const cpu = TEAMS.find((t) => t.id !== "DET" && teamStaff(t.id).HC)!.id;
    const hc = teamStaff(cpu).HC!;
    const coach = state.staff!.people[hc.id];
    climate(state).tone[cpu] = 0;
    const calm = [fireChance(state, cpu, coach), franchiseReputation(state, cpu)];
    climate(state).tone[cpu] = -40;
    expect(fireChance(state, cpu, coach)).toBeGreaterThan(calm[0]);
    expect(franchiseReputation(state, cpu)).toBeLessThan(calm[1]);
    // Ripping the officials draws the league office's eye.
    const before = leagueAttention(state);
    absorb(state, [{ id: "t", type: "owner.post", family: "owner", kind: "owner", teams: ["DET"], players: [], value: 45, ours: true, tags: { refs: true }, slots: {} }]);
    expect(leagueAttention(state)).toBeGreaterThan(before);
    expect(pressTone(state, "DET")).toBeLessThan(50);
  });
});
