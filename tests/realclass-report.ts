// Real draft classes (realclasses.ts): how a real class drafts in the game.
// Starts a save (ERA=<season> for a historical start), optionally picks another
// year's class, plays to draft day, runs the draft with every pick made by the
// clubs' own boards, and prints how close the game's order came to the real one
// and where the real gems and busts went.
// Run: ERA=2015 npx vite-node tests/realclass-report.ts [seed] [class year] [cache.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const era = process.env.ERA ? Number(process.env.ERA) : null;
if (era) (globalThis as { __NFL_PACK__?: unknown }).__NFL_PACK__ = JSON.parse(gunzipSync(readFileSync(`data/packs/${era}.json.gz`)).toString());
const seed = Number(process.argv[2] ?? 7);
const pickYear = process.argv[3] ? Number(process.argv[3]) : null;
const cache = process.argv[4];

const { RULES } = await import("../src/engine/league");
const { advanceDay, newGame } = await import("../src/engine/season");
const { draftClass } = await import("../src/engine/prospects");
const { advanceToEndOfDay, DRAFT_DAYS } = await import("../src/engine/draft");
const { chooseDraftClass, classSource } = await import("../src/engine/classpick");
const { mediaRank } = await import("../src/engine/college");
const { compress, decompress } = await import("../src/save/codec");
type GameState = import("../src/engine/types").GameState;

const t0 = Date.now();
let state: GameState;
if (cache && existsSync(cache)) state = await decompress(readFileSync(cache, "utf8"));
else {
  state = newGame("NYG", "Report", { capRules: "real" }, seed);
  if (pickYear !== null) {
    const err = chooseDraftClass(state, pickYear);
    if (err) throw new Error(err);
  }
  const dc0 = draftClass(state.seed);
  console.log(`Class for ${RULES.season + 1}: source ${classSource(state)}, ${dc0.prospects.length} prospects`);
  // Preseason media board against the real draft.
  const real = dc0.prospects.filter((p) => p.real?.pick);
  console.log(`Preseason media rank vs real pick, rank correlation: ${spearman(real.map((p) => mediaRank(state, p.id)), real.map((p) => p.real!.pick)).toFixed(2)}`);
  if (!process.env.QUICK) {
    while (state.date < RULES.keyDates.draftStart) advanceDay(state);
    if (cache) writeFileSync(cache, await compress(state));
  }
}
if (process.env.QUICK) process.exit(0);
console.log(`To draft day in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const dc = draftClass(state.seed);
const before = dc.prospects.filter((p) => p.real?.pick);
console.log(`Draft-day media rank vs real pick: ${spearman(before.map((p) => mediaRank(state, p.id)), before.map((p) => p.real!.pick)).toFixed(2)}`);
for (const day of DRAFT_DAYS) {
  while (state.date < day) advanceDay(state);
  advanceToEndOfDay(state);
}
const made = state.draft!.made;
const at: Record<string, number> = Object.fromEntries(made.map((m) => [m.player, m.overall]));
const pairs = before.filter((p) => at[p.id]);
console.log(`Drafted ${made.length}; real draftees taken ${pairs.length} of ${before.length}`);
console.log(`Game pick vs real pick, rank correlation: ${spearman(pairs.map((p) => at[p.id]), pairs.map((p) => p.real!.pick)).toFixed(2)}`);
const gap = pairs.map((p) => Math.abs(at[p.id] - p.real!.pick));
gap.sort((a, b) => a - b);
console.log(`Median distance from the real pick: ${gap[Math.floor(gap.length / 2)]}; first round within 10 picks: ${pairs.filter((p) => p.real!.pick <= 32 && Math.abs(at[p.id] - p.real!.pick) <= 10).length} of ${before.filter((p) => p.real!.pick <= 32).length}`);
const H = dc.hidden;
const gems = dc.prospects.filter((p) => p.real && (H[p.id].nfl?.potential ?? 0) >= 85 && (p.real.pick === 0 || p.real.pick > 100));
console.log(`Real gems (became 85+ from after pick 100 or undrafted): ${gems.length}`);
for (const p of gems.slice(0, 25)) console.log(`  ${p.name.padEnd(24)} ${p.position.padEnd(4)} real ${p.real!.pick || "UDFA"} -> game ${at[p.id] ?? (state.draft!.udfa?.[p.id] ? "UDFA" : "unsigned")}, became ${H[p.id].nfl!.potential}`);
const busts = dc.prospects.filter((p) => p.real && p.real.pick && p.real.pick <= 20 && (H[p.id].nfl?.potential ?? 99) < 72);
console.log(`Top-20 busts: ${busts.map((p) => `${p.name} (real ${p.real!.pick}, game ${at[p.id] ?? "-"})`).join(", ")}`);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const o = xs.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(xs.length);
    o.forEach(([, i], k) => { r[i] = k; });
    return r as number[];
  };
  const ra = rank(a), rb = rank(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
