// How many retired players start coaching each spring, where, and how far they rise.
// npx vite-node tests/formerplayers-report.ts [seasons] [seed]
// Calibration: ~6-8 a year start in the NFL and about as many in college (a
// fifth of real NFL position coaches played in the league); a lead room job
// takes a few years; coordinators are rare, head coaches rarer.
import { coachingChance } from "../src/engine/formerplayers";
import { RULES } from "../src/engine/league";
import { rngFor } from "../src/engine/rng";
import { advanceDay, isGameOver } from "../src/engine/season";
import { stateAt } from "./fixtures";

const seasons = Number(process.argv[2] ?? 1);
const seed = Number(process.argv[3] ?? 3);
const state = stateAt("DET", seed, "draftStart");
const seen = new Set<string>();
for (let y = 0; y < seasons; y++) {
  const hist = state.history!;
  let n = 0, expect = 0, rolls = 0;
  for (const [id, yr] of Object.entries(hist.retired)) {
    if (state.players[id]?.status !== "retired") continue;
    const p = coachingChance(state, id, RULES.season - yr);
    if (p) { n++; expect += p; if (rngFor(state.seed, `pc:${RULES.season}:${id}`)() < p) rolls++; }
  }
  const people = Object.values(state.staff!.people).filter((c) => c.formerPlayer);
  const fresh = people.filter((c) => !seen.has(c.id));
  fresh.forEach((c) => seen.add(c.id));
  const nfl = fresh.filter((c) => c.job?.kind === "assistant").length;
  const live = people.filter((c) => !c.retired);
  const lead = live.filter((c) => c.job?.lead).length;
  const coord = live.filter((c) => c.role === "OC" || c.role === "DC" || c.role === "STC").length;
  const hc = live.filter((c) => c.role === "HC").length;
  const college = live.filter((c) => c.job?.kind === "college").length;
  const nflAsst = live.filter((c) => c.job?.kind === "assistant" && !c.job.lead).length;
  console.log(`spring ${RULES.season + 1}: ${n} eligible (expected ${expect.toFixed(1)}, rolls ${rolls}), new ${fresh.length} (NFL ${nfl}, college ${fresh.length - nfl}); ` +
    `now ${live.length}: NFL assistants ${nflAsst}, room leads ${lead}, coordinators ${coord}, HC ${hc}, college ${college}`);
  if (y === 0) for (const c of fresh) console.log(`  ${c.name} (${c.background}) -> ${c.job?.title} ${c.job?.team}`);
  if (y === seasons - 1) break;
  const target = `${RULES.season + 2}-04-20`;
  while (state.date < target && !isGameOver(state)) advanceDay(state);
}
