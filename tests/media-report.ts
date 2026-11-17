// Plays a save through the draft, answering every press question with a
// random answer, and prints what the media covered: stories by kind and
// outlet, a sample day, the questions asked, fines and the hidden effects.
// Run: [FROM=<key date|date|end>] npx vite-node tests/media-report.ts [seed]
import { advanceDay } from "../src/engine/season";
import { answerQuestion, openQuestions } from "../src/engine/press";
import { mediaState } from "../src/engine/outlets";
import { compress } from "../src/save/codec";
import type { Story } from "../src/engine/types";
import { reportStart } from "./fixtures";
import { arcState } from "../src/engine/media/arcs";

const seed = Number(process.argv[2] ?? 7);
const t0 = Date.now();
const state = reportStart("NYG", seed);
const all: Story[] = [];
const seen = new Set<string>();
let days = 0;
let i = 0;
// One season: through the draft, until the league moves on.
while ((state.season ?? 2026) === 2026) {
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
// The story engine: distinct story types (fact/angle/format) and repeated headlines.
const typed = all.filter((s) => s.type);
const types = new Set(typed.map((s) => s.type));
console.log(`\nStory engine: ${typed.length} stories, ${types.size} distinct types, ${new Set(typed.map((s) => s.type!.split("/")[0])).size} fact types, ${new Set(typed.map((s) => s.angle)).size} angles`);
console.log(`By format: ${count((s) => s.format ?? "(hand-written)")}`);
let repeats = 0;
const lastSeen = new Map<string, string>();
for (const s of all.slice().sort((a, b) => a.date.localeCompare(b.date))) {
  const prev = lastSeen.get(s.headline);
  if (prev && Date.parse(s.date) - Date.parse(prev) < 30 * 86400000) repeats++;
  lastSeen.set(s.headline, s.date);
}
console.log(`Headlines repeated within 30 days: ${repeats} of ${all.length}`);
const arcs = arcState(state).list;
const tally = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(", ");
console.log(`\nArcs: ${arcs.length} kept (${arcs.filter((x) => !x.ending).length} open), ${typed.filter((x) => x.type!.startsWith("arc.")).length} arc stories`);
console.log(`  By kind: ${tally(arcs.map((x) => x.kind))}`);
console.log(`  Endings: ${tally(arcs.filter((x) => x.ending).map((x) => `${x.kind}:${x.ending}`))}`);
const narr = typed.filter((x) => x.type!.startsWith("season."));
console.log(`\nSeason narratives: ${narr.length} stories. By kind: ${tally(narr.map((x) => x.type!.split("/")[0].slice(7)))}`);
const shown = new Set<string>();
for (const x of narr) {
  const k = x.type!.split("/")[0];
  if (shown.has(k)) continue;
  shown.add(k);
  console.log(`  ${x.date} [${x.outlet}] ${x.headline}\n      ${x.body.slice(0, 260)}`);
}
for (const x of typed.filter((x) => x.type!.startsWith("arc.")).slice(0, 4)) console.log(`  ${x.date} [${x.outlet}] ${x.headline}\n      ${x.body.slice(0, 220)}`);
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
