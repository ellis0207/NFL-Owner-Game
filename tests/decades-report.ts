// Plays a save for decades and prints one line a season: how long the season
// took to sim, the compressed save size, head-coach changes, trades, teams
// over the cap at the rollover, the top QB deal's share of the cap, top
// talent, owner interference and clubs changing hands. For the 50-season
// target: steady speed, a bounded save, and a league that stays healthy.
// Run: npx vite-node tests/decades-report.ts [seasons] [seed]
import { capSummary } from "../src/engine/cap";
import { dealOf, leagueYear, salaryCap } from "../src/engine/contracts";
import { PLAYERS, RULES, TEAMS } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { trueValue } from "../src/engine/market";
import { compress, decompress } from "../src/save/codec";
import type { GameState } from "../src/engine/types";
import { reportStart } from "./fixtures";

const seasons = Number(process.argv[2] ?? 50);
const seed = Number(process.argv[3] ?? 7);
let state: GameState = reportStart("NYG", seed);

for (let n = 0; n < seasons; n++) {
  const season = RULES.season;
  const t0 = Date.now();
  let guard = 0;
  while ((state.season ?? 2026) === season && guard++ < 420) advanceDay(state);
  const secs = (Date.now() - t0) / 1000;
  const year = leagueYear(state.date);
  const over = TEAMS.filter((t) => capSummary(state, t.id, year).space < 0).length;
  const hc = (state.staff?.log ?? []).filter((l) => l.date.startsWith(String(season + 1)) || l.date.startsWith(String(season))).filter((l) => /fire/i.test(l.text) && /head coach/i.test(l.text)).length;
  const trades = (state.trades?.log ?? []).filter((t) => leagueYear(t.date) === season).length;
  const qb = PLAYERS.filter((p) => p.position === "QB").map((p) => dealOf(state, p.id)?.apy ?? 0).sort((a, b) => b - a)[0] / salaryCap(state, year);
  const elite = Object.entries(state.players).filter(([id, p]) => p.team && trueValue(state, id, year) > salaryCap(state, year) * 0.08).length;
  const meddles = Object.values(state.rivals?.clubs ?? {}).reduce((t, c) => t + c.meddles.filter((m) => m.date.startsWith(String(season)) || m.date.startsWith(String(season + 1))).length, 0);
  const sales = (state.franchise?.sales ?? []).filter((s) => !s.real).length;
  const packed = await compress(state);
  console.log(`${season}: ${secs.toFixed(0)}s, save ${(packed.length / 1024).toFixed(0)} KB, HC fired ${hc}, trades ${trades}, over cap ${over}, top QB ${(qb * 100).toFixed(1)}% cap, elite ${elite}, meddles ${meddles}, club sales ${sales}, owner ${state.ownerName}`);
  state = await decompress(packed);
}
