// Hall of Fame calibration: runs the vote ahead on a new game's candidates and
// prints each class, the finalists and why the ones left out were left out.
// npx vite-node tests/hof-report.ts [years] [seed]
import { hofCase, hofMerit, projectClasses, stillWaiting } from "../src/engine/halloffame";
import { honors } from "../src/engine/honors";
import { newGame } from "../src/engine/season";

const years = Number(process.argv[2] ?? 8);
const seed = Number(process.argv[3] ?? 7);
const s = newGame("DET", "Report", { capRules: "real" }, seed);
const t0 = Date.now();
const proj = projectClasses(s, years);
console.log(`projected ${years} classes in ${Date.now() - t0} ms`);
for (const p of proj) console.log(p.year, p.ids.map((id) => { const c = hofCase(s, id)!; return `${c.name} (${c.pos ?? c.kind}, ${hofMerit(c).toFixed(1)})`; }).join(", "));
console.log("\nStill waiting:");
for (const w of stillWaiting(s, 15)) console.log(`  ${w.c.name} ${w.c.pos} ${hofMerit(w.c).toFixed(1)} waited ${w.years}`);
void honors;

// One real vote in detail: the class of next February.
import { hallOfFameDaily } from "../src/engine/halloffame";
import { addDays } from "../src/engine/dates";
import { RULES } from "../src/engine/league";
s.date = addDays(RULES.keyDates.superBowl, -3);
hallOfFameDaily(s);
const b = honors(s).hof.ballots![RULES.season + 1];
console.log(`\nVote for ${RULES.season + 1}, panel of ${b.panel.length}: ${b.panel.slice(0, 8).map((id) => hofCase(s, id)!.name).join(", ")}...`);
for (const e of [...b.modern.filter((x) => x.stage <= 15), ...b.seniors, ...b.builders]) console.log(`  ${hofCase(s, e.id)!.name.padEnd(22)} stage ${e.stage} yr ${e.year} ${e.share ?? ""}% ${e.elected ? "ELECTED" : e.why}`);
