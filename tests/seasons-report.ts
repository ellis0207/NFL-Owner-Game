// Plays a save through several seasons and prints how the league holds up:
// champions, the talent level, ages, the free agent pool, retirements, the
// cap and money, so drift over the years shows.
// Run: npx vite-node tests/seasons-report.ts [seasons] [seed]
import { writeFileSync } from "node:fs";
import { capSummary } from "../src/engine/cap";
import { salaryCap } from "../src/engine/contracts";
import { ageOn } from "../src/engine/dates";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES, SCHEDULE, TEAMS } from "../src/engine/league";
import { rosterCount } from "../src/engine/roster";
import { advanceDay, newGame } from "../src/engine/season";
import { cashBalance } from "../src/engine/business";
import { compress, decompress } from "../src/save/codec";
import type { GameState } from "../src/engine/types";

const seasons = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 7);
const t0 = Date.now();
let state: GameState = newGame("NYG", "Report", { capRules: "real" }, seed);

function ability(id: string): number {
  return (HIDDEN_RATINGS[id]?.overall ?? 45) + (state.players[id]?.dev ?? 0);
}

function snapshot(label: string): void {
  const rostered = Object.entries(state.players).filter(([, p]) => p.team && p.status !== "fa" && p.status !== "retired");
  const fa = Object.values(state.players).filter((p) => p.status === "fa").length;
  const retired = Object.values(state.players).filter((p) => p.status === "retired").length;
  const byTeam: Record<string, number[]> = {};
  const ages: number[] = [];
  for (const [id, p] of rostered) {
    (byTeam[p.team!] ??= []).push(ability(id));
    const a = ageOn(PLAYER_BY_ID[id].birthDate, state.date);
    if (a) ages.push(a);
  }
  const top = TEAMS.map((t) => {
    const v = (byTeam[t.id] ?? []).sort((a, b) => b - a).slice(0, 30);
    return v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  });
  const mean = top.reduce((s, x) => s + x, 0) / top.length;
  const sd = Math.sqrt(top.reduce((s, x) => s + (x - mean) ** 2, 0) / top.length);
  const stars = rostered.filter(([id]) => ability(id) >= 85).length;
  const avgAge = ages.reduce((s, x) => s + x, 0) / ages.length;
  const rosters = TEAMS.map((t) => rosterCount(state, t.id).roster);
  const space = TEAMS.map((t) => capSummary(state, t.id).space);
  const worst = TEAMS.map((t) => [t.id, capSummary(state, t.id).space] as const).sort((a, b) => a[1] - b[1]).slice(0, 3);
  console.log(`${label} [${state.date}] players on teams ${rostered.length}, FA pool ${fa}, retired ${retired}, tracked ${Object.keys(state.players).length}`);
  console.log(`  top-30 ability: mean ${mean.toFixed(1)} sd ${sd.toFixed(2)}; 85+ players ${stars}; mean age ${avgAge.toFixed(1)}`);
  console.log(`  rosters ${Math.min(...rosters)}-${Math.max(...rosters)}; cap ${(salaryCap(state, RULES.season) / 1e6).toFixed(1)}M; space min ${(Math.min(...space) / 1e6).toFixed(1)}M median ${(space.sort((a, b) => a - b)[16] / 1e6).toFixed(1)}M; tightest ${worst.map(([t, v]) => `${t} ${(v / 1e6).toFixed(1)}M`).join(", ")}`);
  console.log(`  trades on record ${state.trades?.log.filter((t) => t.status === "done").length ?? 0}`);
  console.log(`  owner cash ${(cashBalance(state) / 1e6).toFixed(1)}M; elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

snapshot(`Start ${RULES.season}`);
for (let n = 0; n < seasons; n++) {
  const season = RULES.season;
  let guard = 0;
  while ((state.season ?? 2026) === season && guard++ < 400) advanceDay(state);
  const rec = state.history!.seasons.at(-1)!;
  const draft = state.history!.drafts.at(-1)!;
  const leaders = Object.entries(rec.leaders).map(([k, [id, , v]]) => `${k} ${PLAYER_BY_ID[id]?.name} ${v}`).join("; ");
  console.log(`\n== ${season} season: champion ${rec.champion}, runner-up ${rec.runnerUp}`);
  console.log(`  leaders: ${leaders}`);
  console.log(`  draft ${draft.year}: ${draft.picks.length} picks, ${draft.udfa.length} UDFAs, ${draft.returned.length} returned`);
  console.log(`  retired this year: ${Object.values(state.history!.retired).filter((y) => y === season).length}`);
  console.log(`  free agents who left in the spring, for the ${RULES.season + 1} comp picks: ${state.league?.cfa?.[RULES.season + 1]?.length ?? 0}`);
  const reg = SCHEDULE.filter((g) => g.type === "REG");
  console.log(`  ${RULES.season} schedule: ${reg.length} games, first ${reg[0]?.date}, SB ${RULES.keyDates.superBowl}`);
  snapshot(`After rollover to ${RULES.season}`);
  // A save and load each year, as a player would.
  state = await decompress(await compress(state));
  const packed = await compress(state);
  const size = packed.length;
  if (process.env.DUMP) writeFileSync(`${process.env.DUMP}-${RULES.season}.txt`, packed);
  console.log(`  save size ${(size / 1024).toFixed(0)} KB`);
}
