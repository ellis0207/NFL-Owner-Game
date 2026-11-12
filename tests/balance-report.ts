// The release check for long careers: plays one or more saves for several
// seasons and judges the league against documented ranges (docs/balance.md).
// Hard errors (an inconsistent state, see engine/invariants.ts, or a team
// over the cap when the league year opens) fail the run and are written to
// tests/regressions/ as cases the regression test replays. Balance warnings
// (implausible relocations, runaway contracts, thin talent) are reported but
// don't fail it.
//
// Run: npx vite-node tests/balance-report.ts [seasons] [seeds, comma separated]
//   ERA=<2011-2025> starts in a historical season; RECESSION=<year> forces a
//   downturn that year; OUT=<file> writes the summary as JSON.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const seasons = Number(process.argv[2] ?? 3);
const seeds = String(process.argv[3] ?? "7").split(",").map(Number);
const era = process.env.ERA ? Number(process.env.ERA) : null;
if (era) (globalThis as { __NFL_PACK__?: unknown }).__NFL_PACK__ = JSON.parse(gunzipSync(readFileSync(new URL(`../data/packs/${era}.json.gz`, import.meta.url))).toString());

// Engine modules wait on the pack, so they load one at a time after it is set.
const { capSummary } = await import("../src/engine/cap");
const { dealOf, leagueYear, salaryCap } = await import("../src/engine/contracts");
const { PLAYERS, RULES, TEAMS } = await import("../src/engine/league");
const { advanceDay, newGame } = await import("../src/engine/season");
const { trueValue } = await import("../src/engine/market");
const { invariants } = await import("../src/engine/invariants");
const { standings, winPct } = await import("../src/engine/standings");
const { economy, shockEconomy } = await import("../src/engine/economy");
const { compress, decompress } = await import("../src/save/codec");
type GameState = import("../src/engine/types").GameState;

/** The documented ranges (docs/balance.md). A value outside one is a warning. */
const RANGES = {
  secondsPerSeason: [0, 150],
  saveGrowthKB: [0, 300],
  hcFirings: [2, 12],
  trades: [20, 60],
  topQbShare: [0.12, 0.27],
  eliteChange: [-0.35, 0.35],
  winSpread: [0.13, 0.25],
  relocationsPerSeason: [0, 0.5],
  cpuClubsShortOfCash: [0, 4],
} as const;

interface SeasonRow {
  seed: number; season: number; secs: number; saveKB: number; hc: number; trades: number; topQb: number; elite: number;
  winSpread: number; overCapAtLeagueYear: number; relocations: number; cpuShort: number; errors: string[];
}

function spread(state: GameState): number {
  const st = standings(state);
  const p = TEAMS.map((t) => { const r = st[t.id]; return r && r.w + r.l + r.t ? winPct(r.w, r.l, r.t) : 0.5; });
  const m = p.reduce((a, b) => a + b, 0) / p.length;
  return Math.sqrt(p.reduce((a, b) => a + (b - m) ** 2, 0) / p.length);
}

const rows: SeasonRow[] = [];
const hard: { seed: number; date: string; team: string; errors: string[] }[] = [];

for (const seed of seeds) {
  let state: GameState = newGame("NYG", "Report", { capRules: "real" }, seed);
  let lastKB = 0;
  let elite0 = 0;
  for (let n = 0; n < seasons; n++) {
    const season = RULES.season;
    if (process.env.RECESSION && Number(process.env.RECESSION) === season) shockEconomy(state, { gap: -3, confidence: -12 });
    const t0 = Date.now();
    let guard = 0;
    let spreadAtEnd = 0;
    let overCap = 0;
    const errors: string[] = [];
    let firstBad = "";
    const checkAt = new Set([RULES.keyDates.regularSeasonStart, RULES.keyDates.tradeDeadline, RULES.keyDates.superBowl]);
    while ((state.season ?? RULES.season) === season && guard++ < 420) {
      const before = state.date;
      advanceDay(state);
      if (before <= RULES.keyDates.regularSeasonEnd && state.date > RULES.keyDates.regularSeasonEnd) spreadAtEnd = spread(state);
      // Cap compliance is required by 4 PM on the day the new league year opens,
      // so the check runs once that day has been played.
      if (before === RULES.keyDates.newLeagueYear) {
        const y = leagueYear(before);
        const over = TEAMS.filter((t) => capSummary(state, t.id, y).space < 0);
        overCap = over.length;
        if (overCap) { errors.push(`over the cap when the ${y} league year opened: ${over.map((t) => `${t.id} by ${Math.round(-capSummary(state, t.id, y).space / 1000)}K`).join(", ")}`); firstBad ||= state.date; }
      }
      if (checkAt.has(state.date)) for (const v of invariants(state)) { errors.push(`${state.date} ${v.rule}: ${v.detail}`); firstBad ||= state.date; }
    }
    const secs = (Date.now() - t0) / 1000;
    const year = leagueYear(state.date);
    const cap = salaryCap(state, year);
    for (const v of invariants(state)) { errors.push(`${state.date} ${v.rule}: ${v.detail}`); firstBad ||= state.date; }
    const hc = (state.staff?.log ?? []).filter((l) => (l.date.startsWith(String(season)) || l.date.startsWith(String(season + 1))) && /fire/i.test(l.text) && /head coach/i.test(l.text)).length;
    const trades = (state.trades?.log ?? []).filter((t) => leagueYear(t.date) === season).length;
    const topQb = PLAYERS.filter((p) => p.position === "QB").map((p) => dealOf(state, p.id)?.apy ?? 0).sort((a, b) => b - a)[0] / cap;
    const elite = Object.entries(state.players).filter(([id, p]) => p.team && trueValue(state, id, year) > cap * 0.08).length;
    if (!elite0) elite0 = elite;
    const relocations = (state.relocation?.moves ?? []).filter((m) => String((m as { date?: string }).date ?? "").startsWith(String(season + 1)) || String((m as { date?: string }).date ?? "").startsWith(String(season))).length;
    const cpuShort = Object.values(state.rivals?.clubs ?? {}).filter((c) => (c as { cash: number }).cash < 0).length;
    const packed = await compress(state);
    const kb = packed.length / 1024;
    state = await decompress(packed);
    const row: SeasonRow = { seed, season, secs, saveKB: kb, hc, trades, topQb, elite, winSpread: spreadAtEnd, overCapAtLeagueYear: overCap, relocations, cpuShort, errors };
    rows.push(row);
    console.log(`seed ${seed} ${season}: ${secs.toFixed(0)}s, save ${kb.toFixed(0)} KB (+${(kb - lastKB).toFixed(0)}), HC fired ${hc}, trades ${trades}, top QB ${(topQb * 100).toFixed(1)}%, elite ${elite}, win spread ${spreadAtEnd.toFixed(3)}, over cap at league year ${overCap}, relocations ${relocations}, CPU clubs short of cash ${cpuShort}${errors.length ? `, ERRORS ${errors.length}` : ""}`);
    if (errors.length) hard.push({ seed, date: firstBad, team: state.userTeam, errors: [...new Set(errors)].slice(0, 20) });
    lastKB = kb;
    void economy;
  }
}

// ---- Judge against the ranges ----
const warn: string[] = [];
const check = (name: keyof typeof RANGES, v: number, where: string) => {
  const [lo, hi] = RANGES[name];
  if (v < lo || v > hi) warn.push(`${where}: ${name} ${Number.isInteger(v) ? v : v.toFixed(3)} outside ${lo} to ${hi}`);
};
for (const r of rows) {
  const where = `seed ${r.seed} ${r.season}`;
  check("secondsPerSeason", r.secs, where);
  check("hcFirings", r.hc, where);
  // A new game starts in August, after the offseason's trades, so its first year runs light.
  if (r.season !== rows.find((x) => x.seed === r.seed)!.season) check("trades", r.trades, where);
  check("topQbShare", r.topQb, where);
  if (r.winSpread) check("winSpread", r.winSpread, where);
  check("cpuClubsShortOfCash", r.cpuShort, where);
}
for (const seed of seeds) {
  const mine = rows.filter((r) => r.seed === seed);
  if (mine.length > 1) {
    check("saveGrowthKB", (mine.at(-1)!.saveKB - mine[0].saveKB) / (mine.length - 1), `seed ${seed}`);
    check("eliteChange", mine.at(-1)!.elite / mine[0].elite - 1, `seed ${seed}`);
    check("relocationsPerSeason", mine.reduce((a, r) => a + r.relocations, 0) / mine.length, `seed ${seed}`);
  }
}

console.log(`\n${rows.length} seasons over ${seeds.length} seed(s)${era ? `, starting ${era}` : ""}${process.env.RECESSION ? `, recession in ${process.env.RECESSION}` : ""}.`);
console.log(hard.length ? `HARD ERRORS: ${hard.length}` : "Hard errors: none");
for (const h of hard) console.log(`  seed ${h.seed} by ${h.date}: ${h.errors.join("; ")}`);
console.log(warn.length ? `Balance warnings: ${warn.length}` : "Balance warnings: none");
for (const w of warn) console.log(`  ${w}`);

if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ seasons, seeds, era, recession: process.env.RECESSION ?? null, rows, hard, warn }, null, 2));
// Each failure becomes a regression case: the save, the date, what broke.
if (hard.length) {
  mkdirSync(new URL("./regressions/", import.meta.url), { recursive: true });
  for (const h of hard) writeFileSync(new URL(`./regressions/seed${h.seed}-${h.date}${era ? `-era${era}` : ""}.json`, import.meta.url), JSON.stringify({ team: h.team, seed: h.seed, until: h.date, era, errors: h.errors }, null, 2));
  process.exitCode = 1;
}
