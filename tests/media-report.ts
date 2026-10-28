// Plays a save through the draft, answering every press question with a
// random answer, and prints what the media covered: stories by kind and
// outlet, a sample day, the questions asked, fines and the hidden effects.
// Run: npx vite-node tests/media-report.ts [seed]
import { advanceDay, isGameOver, newGame } from "../src/engine/season";
import { answerQuestion, openQuestions } from "../src/engine/press";
import { mediaState } from "../src/engine/outlets";
import { compress } from "../src/save/codec";
import type { Story } from "../src/engine/types";

const seed = Number(process.argv[2] ?? 7);
const t0 = Date.now();
const state = newGame("NYG", "Report", { capRules: "real" }, seed);
const all: Story[] = [];
const seen = new Set<string>();
let days = 0;
let i = 0;
while (!isGameOver(state)) {
  for (const q of openQuestions(state)) if (i++ % 4 !== 3) answerQuestion(state, q.id, (i * 7) % q.options.length);
  advanceDay(state);
  days++;
  for (const s of mediaState(state).stories) if (!seen.has(s.id)) { seen.add(s.id); all.push(s); }
}
console.log(`${days} days in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${all.length} stories (${(all.length / days).toFixed(1)} a day)`);
const count = (f: (s: Story) => string) => Object.entries(all.reduce<Record<string, number>>((a, s) => ((a[f(s)] = (a[f(s)] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(`By kind: ${count((s) => s.kind)}`);
console.log(`By outlet: ${count((s) => s.outlet)}`);
console.log(`By month: ${count((s) => s.date.slice(0, 7))}`);
const m = mediaState(state);
console.log(`\nQuestions: ${m.questions.length} (${count.call(null, () => "") && ""}${Object.entries(m.questions.reduce<Record<string, number>>((a, q) => ((a[q.topic] = (a[q.topic] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(", ")})`);
for (const q of m.questions.slice(0, 12)) console.log(`  ${q.date} [${q.topic}] ${q.question} -> ${q.answer === -1 ? "(no answer)" : q.options[q.answer!]?.text}`);
console.log(`\nFines: ${m.fines.map((f) => `${f.date} ${f.amount} ${f.reason}`).join("; ") || "none"}`);
console.log(`Coach faith ${m.coach.toFixed(0)}, rel ${JSON.stringify(m.rel)}, pressure ${JSON.stringify(state.pressure)}, leverage ${Object.keys(m.leverage).length}`);
const sample = (date: string) => {
  console.log(`\n=== ${date} ===`);
  for (const s of all.filter((x) => x.date === date)) console.log(`- [${s.outlet}/${s.kind}] ${s.headline}\n    ${s.body.replace(/\n/g, "\n    ").slice(0, 400)}`);
};
for (const d of ["2026-09-13", "2026-09-15", "2026-10-28", "2026-11-09", "2027-03-11", "2027-04-29"]) sample(d);
const owner = all.filter((s) => s.kind === "owner").slice(0, 8);
console.log("\n=== Owner stories ===");
for (const s of owner) console.log(`- ${s.date} [${s.outlet}] ${s.headline}\n    ${s.body}`);
const quiet = new Set<string>();
for (let d = "2026-07-20"; d < state.date; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) if (!all.some((s) => s.date === d)) quiet.add(d);
console.log(`\nDays with no stories: ${quiet.size}${quiet.size ? ` (${[...quiet].slice(0, 12).join(", ")}...)` : ""}`);
console.log(`Media JSON ${(JSON.stringify(state.media).length / 1024).toFixed(0)} KB of ${(JSON.stringify(state).length / 1024).toFixed(0)} KB`);
console.log(`\nSave size: ${((await compress(state)).length / 1024).toFixed(0)} KB, stories kept ${m.stories.length}`);
