// The connectivity check: plays a save for several seasons with an owner who
// acts (decides every memo the way the executive recommends) and records, at
// each season's end, the numbers each system hands the others: money by
// ledger line, fans, the building's trust, the media climate, the desk, the
// state's slices by size. It flags what never moves (a system nobody feeds),
// what keeps growing (a list nothing trims), and numbers that aren't numbers.
//
// Run: npx vite-node tests/connect-report.ts [seasons] [seed] [team] [idle]
//   idle: the owner never decides anything (memos lapse, delegated calls run).
const seasons = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 7);
const team = String(process.argv[4] ?? "DET");
const idle = process.argv[5] === "idle";

const { advanceDay, isGameOver } = await import("../src/engine/season");
const { reportStart } = await import("./fixtures");
const { RULES } = await import("../src/engine/league");
const { cashBalance, pnl } = await import("../src/engine/business");
const { openMemos } = await import("../src/engine/delegation");
const { decideMemo } = await import("../src/engine/memos");
const { openQuestions, answerQuestion } = await import("../src/engine/press");
const { openProblems } = await import("../src/engine/problems");
const { decisionQueue } = await import("../src/engine/queue");
const { invariants } = await import("../src/engine/invariants");
const { teamPlayerIds } = await import("../src/engine/cap");
const { morale } = await import("../src/engine/agents");
const { netWorth } = await import("../src/engine/wealth");
const { ownerStanding, franchiseReputation } = await import("../src/engine/playercare");
const { communityScore, cityGoodwill } = await import("../src/engine/community");
const { toSaveFile } = await import("../src/save/codec");
const { writeFileSync } = await import("node:fs");
const { gzipSync } = await import("node:zlib");
type GameState = import("../src/engine/types").GameState;

const state: GameState = reportStart(team, seed);
const rows: Record<string, number>[] = [];
const sizes: Record<string, number>[] = [];
const notes: string[] = [];

function nonNumbers(o: unknown, path: string, out: string[]): void {
  if (out.length > 20) return;
  if (typeof o === "number") { if (!Number.isFinite(o)) out.push(path); return; }
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) nonNumbers(v, `${path}.${k}`, out);
}

function snapshot(year: number): void {
  const r: Record<string, number> = {};
  const p = pnl(state, year);
  for (const x of [...p.revenue, ...p.expenses]) r[`ledger.${x.cat}`] = Math.round(x.amount / 1e5) / 10;
  r["money.cash"] = Math.round(cashBalance(state) / 1e6);
  r["money.net"] = Math.round(p.net / 1e6);
  r["money.netWorth"] = Math.round(netWorth(state).total / 1e6);
  const f = state.fans!;
  r["fans.trust"] = Math.round(f.trust); r["fans.core"] = Math.round(f.core); r["fans.scar"] = Math.round(f.scar);
  r["pressure.fans"] = Math.round(state.pressure.fans); r["pressure.media"] = Math.round(state.pressure.media);
  const c = state.culture!;
  r["culture.gmTrust"] = Math.round(c.gmTrust); r["culture.cooperation"] = Math.round(c.cooperation); r["culture.fairness"] = Math.round(c.fairness);
  const ids = teamPlayerIds(state, team);
  r["players.morale"] = Math.round(ids.reduce((t, id) => t + morale(state, id), 0) / Math.max(1, ids.length));
  r["owner.standing"] = Math.round(ownerStanding(state).score);
  r["owner.reputation"] = Math.round(franchiseReputation(state, team) * 100) / 100;
  r["community.score"] = Math.round(communityScore(state));
  r["community.goodwill"] = Math.round(cityGoodwill(state) * 100) / 100;
  const st = state.standing;
  const h = st?.history.at(-1);
  if (h) for (const [k, v] of Object.entries(h)) if (typeof v === "number") r[`standing.${k}`] = Math.round(v);
  r["media.tone"] = Math.round(state.media?.climate?.tone[team] ?? 0);
  r["desk.openMemos"] = openMemos(state).length;
  r["desk.problems"] = openProblems(state).length;
  r["desk.queue"] = decisionQueue(state, true).length;
  r["desk.inbox"] = state.inbox.length;
  r["desk.unread"] = state.inbox.filter((m) => !m.read).length;
  r["achievements"] = state.achievements?.earned ? Object.keys(state.achievements.earned).length : 0;
  r["save.rawKB"] = Math.round(JSON.stringify(toSaveFile(state)).length / 1024);
  const rel = Object.values(state.media?.rel ?? {});
  r["media.relAvg"] = Math.round(rel.reduce((a, b) => a + b, 0) / Math.max(1, rel.length));
  r["office.complianceIncidents"] = (state.office?.incidents ?? []).filter((i) => i.kind === "compliance" && i.date >= `${year}-05-01`).length;
  r["press.unanswered"] = (state.media?.questions ?? []).filter((q) => q.answer === -1).length;
  rows.push(r);
  const s: Record<string, number> = {};
  for (const [k, v] of Object.entries(state)) s[k] = Math.round(JSON.stringify(v ?? null).length / 1024);
  sizes.push(s);
  const bad: string[] = [];
  nonNumbers(state, "state", bad);
  if (bad.length) notes.push(`${year}: non-numbers at ${bad.slice(0, 8).join(", ")}`);
  const v = invariants(state);
  if (v.length) notes.push(`${year}: invariants ${v.slice(0, 5).map((x) => JSON.stringify(x)).join("; ")}`);
}

const t0 = Date.now();
let season = RULES.season;
let decided = 0, refused = 0;
const start = RULES.season;
while (!isGameOver(state) && RULES.season < start + seasons) {
  advanceDay(state);
  if (!idle && new Date(state.date + "T12:00:00Z").getUTCDay() === 1) {
    for (const m of openMemos(state)) {
      const err = decideMemo(state, m.id, m.recommend ?? 0, "probe");
      if (err) refused++; else decided++;
    }
  }
  // A plain answer to every question the press asks, the day it's asked.
  if (!idle) for (const q of openQuestions(state)) answerQuestion(state, q.id, 0);
  if (RULES.season !== season) {
    snapshot(season);
    console.log(`season ${season} done at ${state.date} (${Math.round((Date.now() - t0) / 1000)} s), memos decided ${decided}, refused ${refused}`);
    season = RULES.season;
  }
}

const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
console.log("\nmetric".padEnd(34) + rows.map((_, i) => String(start + i).padStart(9)).join(""));
for (const k of keys) {
  const vals = rows.map((r) => r[k]);
  const flat = vals.every((v) => v === vals[0]) && rows.length > 1;
  console.log((flat ? "= " : "  ") + k.padEnd(32) + vals.map((v) => String(v ?? "-").padStart(9)).join(""));
}
console.log("\nstate slices (KB), growing every season:");
const sk = Object.keys(sizes[0] ?? {});
for (const k of sk) {
  const v = sizes.map((s) => s[k] ?? 0);
  if (v.at(-1)! >= 20 && v.every((x, i) => i === 0 || x > v[i - 1])) console.log("  " + k.padEnd(20) + v.map((x) => String(x).padStart(7)).join(""));
}
if (process.env.SAVE) writeFileSync(process.env.SAVE, gzipSync(JSON.stringify(toSaveFile(state))));
console.log("\nnotes:\n" + (notes.join("\n") || "  none"));
