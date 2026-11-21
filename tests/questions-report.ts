// Plays several seasons answering every press question and press conference,
// and counts how often a question comes back: the owner's (the daily press
// desk and press conferences) and the ones other clubs' players, coaches and
// owners get. "Exact" is the same wording; "shape" is the same wording once
// names and numbers are taken out, the way a player notices a repeat.
// Run: npx vite-node tests/questions-report.ts [seasons] [seed]
import { advanceDay, isGameOver } from "../src/engine/season";
import { answerQuestion, openQuestions } from "../src/engine/press";
import { holdPresser, openPressers } from "../src/engine/media/ownerdesk";
import { mediaState } from "../src/engine/outlets";
import { bankSize } from "../src/engine/media/questions";
import { reportStart } from "./fixtures";

const seasons = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 7);
const t0 = Date.now();
const state = reportStart("NYG", seed);
const first = state.season ?? 2026;
const owner: { season: number; text: string; how: string }[] = [];
const cpu: { season: number; text: string }[] = [];
const seenQ = new Set<string>();
const seenP = new Set<string>();
const seenS = new Set<string>();
let i = 0;
let options = 0;
let asked = 0;
while ((state.season ?? 2026) < first + seasons && !isGameOver(state)) {
  const season = state.season ?? 2026;
  const m = mediaState(state);
  for (const q of m.questions) if (!seenQ.has(q.id)) { seenQ.add(q.id); owner.push({ season, text: q.question, how: "press" }); options += q.options.length; asked++; }
  for (const p of m.desk?.pressers ?? []) if (!seenP.has(p.id)) { seenP.add(p.id); for (const q of p.questions) { owner.push({ season, text: q.text, how: "presser" }); options += q.options.length; asked++; } }
  for (const s of m.stories) {
    if (seenS.has(s.id)) continue;
    seenS.add(s.id);
    const hit = s.type?.startsWith("qa.") ? /Asked "([^"]+)"|"([^"]+)" was the question/.exec(s.body) : null;
    if (hit) cpu.push({ season, text: hit[1] ?? hit[2] });
  }
  for (const q of openQuestions(state)) answerQuestion(state, q.id, i++ % q.options.length);
  for (const p of openPressers(state)) holdPresser(state, p.id, p.questions.map((q, j) => (i + j) % q.options.length));
  advanceDay(state);
}

/** The wording with names and numbers taken out. */
const shape = (t: string) => t.replace(/\d[\d,.-]*/g, "#").replace(/(?<=\S\s+)[A-Z][\w.'-]*(\s+[A-Z][\w.'-]*)*/g, "X").toLowerCase();
function repeats(xs: { text: string }[], f: (t: string) => string): { n: number; top: [string, number][] } {
  const c = new Map<string, number>();
  for (const x of xs) c.set(f(x.text), (c.get(f(x.text)) ?? 0) + 1);
  let n = 0;
  for (const v of c.values()) n += v - 1;
  return { n, top: [...c.entries()].filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 8) };
}
const pct = (a: number, b: number) => `${b ? ((100 * a) / b).toFixed(1) : "0"}%`;
const size = bankSize();
console.log(`${seasons} seasons, seed ${seed}, ${((Date.now() - t0) / 1000).toFixed(0)}s. Bank: ${size.owner} owner lines, ${size.speaker} speaker lines.`);
for (const [label, xs] of [["Owner", owner], ["Other clubs", cpu]] as const) {
  const ex = repeats(xs, (t) => t.toLowerCase());
  const sh = repeats(xs, shape);
  console.log(`\n${label}: ${xs.length} questions (${[...new Set(xs.map((x) => x.season))].map((s) => `${s}: ${xs.filter((x) => x.season === s).length}`).join(", ")})`);
  console.log(`  exact repeats ${ex.n} (${pct(ex.n, xs.length)}), same shape ${sh.n} (${pct(sh.n, xs.length)})`);
  for (const [t, n] of sh.top) console.log(`    ${n}x ${t}`);
}
console.log(`\nOwner answers per question: ${(options / Math.max(1, asked)).toFixed(1)}`);
console.log("\nSample owner questions:");
for (const q of owner.filter((_, k) => k % Math.max(1, Math.floor(owner.length / 12)) === 0).slice(0, 12)) console.log(`  [${q.how}] ${q.text}`);
console.log("\nSample questions to other clubs:");
for (const q of cpu.filter((_, k) => k % Math.max(1, Math.floor(cpu.length / 8)) === 0).slice(0, 8)) console.log(`  ${q.text}`);
