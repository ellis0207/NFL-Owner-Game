// Plays a save through many seasons and prints what decides whether a long
// career stays realistic: tags used, what new deals cost against the player's
// true worth, every team's cap this year and next, and the owner's books.
// Run: [FROM=<key date|date|end>] npx vite-node tests/longrun-report.ts [seasons] [seed]
import { writeFileSync } from "node:fs";
import { capSummary, deadMoney } from "../src/engine/cap";
import { dealOf, leagueYear, salaryCap } from "../src/engine/contracts";
import { cashBalance, pnl } from "../src/engine/business";
import { cashPaid } from "../src/engine/finance";
import { marketPrice, trueValue } from "../src/engine/market";
import { PLAYER_BY_ID, PLAYERS, RULES, TEAMS } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { compress, decompress } from "../src/save/codec";
import type { GameState } from "../src/engine/types";
import { reportStart } from "./fixtures";

const seasons = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 7);
const t0 = Date.now();
let state: GameState = reportStart("NYG", seed);
const M = (n: number) => `${(n / 1e6).toFixed(1)}M`;
const WATCH = ["Mac Jones", "Daniel Jones", "Tyrique Stevenson", "Cody Mauch"];
const watchIds = WATCH.map((n) => PLAYERS.find((p) => p.name === n)?.id).filter(Boolean) as string[];

function capLine(label: string): void {
  const yr = leagueYear(state.date);
  const now = TEAMS.map((t) => [t.id, capSummary(state, t.id, yr).space] as const).sort((a, b) => a[1] - b[1]);
  const next = TEAMS.map((t) => [t.id, capSummary(state, t.id, yr + 1).space] as const).sort((a, b) => a[1] - b[1]);
  const dead = TEAMS.map((t) => [t.id, deadMoney(state, t.id, yr)] as const).sort((a, b) => b[1] - a[1]);
  console.log(`  ${label} [${state.date}] cap ${M(salaryCap(state, yr))}: space min ${M(now[0][1])} median ${M(now[16][1])}, over ${now.filter((x) => x[1] < 0).length}; ` +
    `tightest ${now.slice(0, 3).map(([t, v]) => `${t} ${M(v)}`).join(", ")}`);
  console.log(`    ${yr + 1} (top 51): min ${M(next[0][1])} median ${M(next[16][1])}, below zero ${next.filter((x) => x[1] < 0).length}; ` +
    `tightest ${next.slice(0, 3).map(([t, v]) => `${t} ${M(v)}`).join(", ")}; most dead ${dead.slice(0, 3).map(([t, v]) => `${t} ${M(v)}`).join(", ")}`);
}

/** Top and fifth-best APY as a share of the cap, from live veteran deals, at the positions that set markets. */
function tops(): void {
  const by: Record<string, number[]> = {};
  for (const p of PLAYERS) {
    const d = dealOf(state, p.id);
    if (!d || (d.kind !== "veteran" && d.kind !== "extension") || !d.apy) continue;
    (by[p.position] ??= []).push(d.apy / salaryCap(state, Math.max(2026, leagueYear(d.signed) + (d.kind === "extension" && d.signed > "2026-04-01" ? 1 : 0))));
  }
  console.log(`  market tops (top/5th % of cap): ${["QB", "EDGE", "WR", "IDL", "OT", "CB", "OG", "S"].map((pos) => { const a = (by[pos] ?? []).sort((x, y) => y - x); return `${pos} ${(100 * a[0]).toFixed(1)}/${(100 * a[4]).toFixed(1)}`; }).join(" ")}`);
}

function books(year: number): void {
  const p = pnl(state, year);
  const payroll = TEAMS.map((t) => cashPaid(state, t.id, year)).sort((a, b) => a - b);
  // The report's owner never signs anyone, so the team's own payroll runs light; the books at a league-median payroll show what an active owner would see.
  const ours = -(p.expenses.find((e) => e.cat === "players")?.amount ?? 0);
  console.log(`  books ${year}: revenue ${M(p.totalRevenue)}, expenses ${M(p.totalExpenses)} (players ${M(ours)}), operating ${M(p.operating)}, at a median payroll ${M(p.operating + ours - payroll[16])}, cash ${M(cashBalance(state))}; ` +
    `player cash paid league-wide min ${M(payroll[0])} median ${M(payroll[16])} max ${M(payroll[31])}`);
}

function deals(year: number): void {
  const signed = state.signings.filter((s) => leagueYear(s.date) === year);
  // Tags go on in the weeks before the new league year opens.
  const tags = state.signings.filter((s) => s.kind === "tag" && s.date.slice(0, 4) === String(year));
  console.log(`  tags ${tags.length}: ${tags.map((s) => `${s.team} ${PLAYER_BY_ID[s.player].position} ${PLAYER_BY_ID[s.player].name} ${dealOf(state, s.player)?.kind ?? ""}`).join("; ")}`);
  const vets = signed.filter((s) => (s.kind === "free-agent" || s.kind === "extension") && s.apy >= 4_000_000);
  const cap = salaryCap(state, year);
  const byPos: Record<string, number[]> = {};
  for (const s of vets) (byPos[PLAYER_BY_ID[s.player].position] ??= []).push(s.apy / Math.max(1, s.valueAtSigning));
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`  veteran deals $4M+: ${vets.length}; APY / team value by position: ${Object.entries(byPos).map(([p, a]) => `${p} ${med(a).toFixed(2)} (${a.length})`).join(", ")}`);
  const over = vets.map((s) => ({ s, r: s.apy / Math.max(1, trueValue(state, s.player, year)) })).filter((x) => x.r > 1.6).sort((a, b) => b.r - a.r);
  console.log(`  ${over.length} deals over 1.6x true value: ${over.slice(0, 8).map(({ s, r }) => `${PLAYER_BY_ID[s.player].position} ${PLAYER_BY_ID[s.player].name} ${M(s.apy)} (${(100 * s.apy / cap).toFixed(1)}% cap, ${r.toFixed(1)}x)`).join("; ")}`);
}

console.log(`watch: ${watchIds.map((id) => `${PLAYER_BY_ID[id].name} ${M(marketPrice(state, id, RULES.season + 1).apy)}`).join(", ")}`);
for (let n = 0; n < seasons; n++) {
  const season = RULES.season;
  let guard = 0;
  let checked = false;
  while ((state.season ?? 2026) === season && guard++ < 400) {
    advanceDay(state);
    // Just before free agency opens: what the market asks for the players under watch.
    if (!checked && state.date >= RULES.keyDates.negotiatingWindowOpens) {
      checked = true;
      console.log(`  asking ${state.date}: ${watchIds.filter((id) => dealOf(state, id)).map((id) => `${PLAYER_BY_ID[id].name} ${M(marketPrice(state, id, season + 1).apy)} (worth ${M(trueValue(state, id, season + 1))})`).join(", ")}`);
    }
  }
  console.log(`\n== after the ${season} season (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  books(season);
  deals(season + 1);
  capLine("new season");
  tops();
  state = await decompress(await compress(state));
  if (process.env.DUMP) writeFileSync(`${process.env.DUMP}-${RULES.season}.txt`, await compress(state));
}
