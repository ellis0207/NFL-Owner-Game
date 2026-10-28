// Prints how free agency, waivers and practice squads play out over a simulated season.
// Run: npx vite-node tests/fa-report.ts [seed] [stopDate]
import { teamPlayerIds } from "../src/engine/cap";
import { PLAYER_BY_ID, RULES, TEAMS } from "../src/engine/league";
import { rosterCount } from "../src/engine/roster";
import { advanceDay, isGameOver, newGame } from "../src/engine/season";

const seed = Number(process.argv[2] ?? 7);
const stop = process.argv[3] ?? RULES.keyDates.draftStart;
const t0 = Date.now();
const state = newGame("DET", "Report", { capRules: "real" }, seed);
const checkpoints = [RULES.keyDates.rosterCutdown, RULES.keyDates.cutdownWaiversExpire, "2026-09-02", "2026-10-15", "2026-12-01", RULES.keyDates.regularSeasonEnd, "2027-02-20", "2027-03-20", stop];
const fa = () => Object.values(state.players).filter((p) => p.status === "fa").length;
console.log(`start ${state.date}: ${fa()} free agents`);
while (!isGameOver(state) && state.date < stop) {
  advanceDay(state);
  if (checkpoints.includes(state.date)) {
    const tx = state.transactions ?? [];
    const kinds: Record<string, number> = {};
    for (const t of tx) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
    const sizes = TEAMS.map((t) => rosterCount(state, t.id));
    const r = sizes.map((s) => s.roster);
    const ps = sizes.map((s) => s.ps);
    console.log(`${state.date} (${((Date.now() - t0) / 1000).toFixed(0)}s): FA ${fa()}, on waivers ${Object.keys(state.waivers ?? {}).length}, ` +
      `rosters ${Math.min(...r)}-${Math.max(...r)}, PS ${Math.min(...ps)}-${Math.max(...ps)}, moves ${JSON.stringify(kinds)}`);
  }
}
const claims = (state.transactions ?? []).filter((t) => t.kind === "claimed");
console.log(`claims: ${claims.length}`, claims.slice(-12).map((t) => `${t.date} ${t.team} ${t.text}`).join("\n"));
const signed = (state.transactions ?? []).filter((t) => t.kind === "signed" && t.date <= RULES.keyDates.regularSeasonEnd && PLAYER_BY_ID[t.player].team === null);
console.log(`pool players signed in 2026: ${new Set(signed.map((t) => t.player)).size}`);
console.log(signed.slice(-25).map((t) => `${t.date} ${t.team} ${t.text}`).join("\n"));
const street = state.signings.filter((s) => s.date <= RULES.keyDates.regularSeasonEnd && s.kind === "free-agent");
console.log(`street deals over the minimum: ${street.length}`, street.slice(0, 10).map((s) => `${s.date} ${s.team} ${PLAYER_BY_ID[s.player].name} ${(s.total / 1e6).toFixed(2)}M`).join("; "));
void teamPlayerIds;
