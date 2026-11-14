// How much of the play-by-play the field view can act out.
//   npx vite-node tests/anim-report.ts [games] [seed]
// Every row of the first games of the season is read and built as a play. The
// report counts rows that fall back to the ball and arrow (target: under 2% of
// plays), rows the builder choked on, players moving faster than a man can run
// and plays whose ball ends away from the spot the log gives.
import { readFileSync } from "node:fs";
import { castAt } from "../src/engine/gamecast";
import { SCHEDULE } from "../src/engine/league";
import { PLAY_FLAGS as F } from "../src/engine/playlog";
import { newGame } from "../src/engine/season";
import { simulateGame } from "../src/engine/sim";
import type { PlayBook, Track } from "../src/ui/anim/book";
import { buildTrack } from "../src/ui/anim/build";

export interface AnimReport { rows: number; plays: number; built: number; fallback: Record<string, number>; errors: string[]; fast: string[]; off: string[]; seconds: number; kinds: Record<string, number> }

/** The fastest any player moves in a track, in yards a second, over half-second stretches. */
export function topSpeed(t: Track): number {
  let top = 0;
  const w = Math.round(t.rate / 2);
  for (const p of t.pos) for (let f = w; f < p.length / 2; f++) top = Math.max(top, Math.hypot(p[f * 2] - p[(f - w) * 2], p[f * 2 + 1] - p[(f - w) * 2 + 1]) * t.rate / w);
  return top;
}

export function animReport(games: number, seed: number): AnimReport {
  const book = JSON.parse(readFileSync("assets/anim/plays.json", "utf8")) as PlayBook;
  const s = newGame("DET", "Owner", { capRules: "real" } as never, seed);
  const out: AnimReport = { rows: 0, plays: 0, built: 0, fallback: {}, errors: [], fast: [], off: [], seconds: 0, kinds: {} };
  for (const g of SCHEDULE.filter((x) => x.type === "REG").slice(0, games)) {
    const { log, box } = simulateGame(s, g, g.away, g.home) as { log: import("../src/engine/types").GameLog; box: { players: never } };
    log.plays.forEach((row, n) => {
      out.rows++;
      if (row[8] & (F.note | F.story)) return;
      out.plays++;
      const where = `${g.away}@${g.home} #${n}: ${row[7].slice(0, 90)}`;
      let t: Track | null = null;
      try { t = buildTrack(book, log, n, box?.players); } catch (e) { out.errors.push(`${where} :: ${(e as Error).message}`); return; }
      if (!t) {
        const why = /BLOCKED/.test(row[7]) ? "blocked kick" : row[3] === 0 && !/kicks off/.test(row[7]) ? "onside or free kick" : `other: ${row[7].replace(/\d+/g, "#").slice(0, 50)}`;
        out.fallback[why] = (out.fallback[why] ?? 0) + 1;
        return;
      }
      out.built++; out.seconds += t.dur;
      const kind = row[11] === "No play" ? "flag" : row[3] === 0 ? "kickoff" : row[8] & F.kick ? "kick" : / pass /.test(row[7]) ? "pass" : "run";
      out.kinds[kind] = (out.kinds[kind] ?? 0) + 1;
      for (const p of t.pos) for (const v of p) if (!Number.isFinite(v)) { out.errors.push(`${where} :: a player's spot is not a number`); return; }
      for (const v of t.ball) if (!Number.isFinite(v)) { out.errors.push(`${where} :: the ball's spot is not a number`); return; }
      // The players line up where the scoreboard says the ball is.
      const snap = castAt(log, n).ball;
      if (row[3] > 0 && snap !== null && Math.abs(t.ball[0] - snap) > 1.5) out.off.push(`lined up ${Math.abs(t.ball[0] - snap).toFixed(1)} yd off ${where}`);
      const top = topSpeed(t);
      if (top > 10.8) out.fast.push(`${top.toFixed(1)} yd/s ${where}`);
      // Scrimmage plays that stand should leave the ball where the log spots it next.
      const to = castAt(log, n + 1).last?.to;
      const end = t.ball[(t.pos[0].length / 2 - 1) * 3];
      // A kick or an interception ends where the next drive starts.
      const next = log.plays.slice(n + 1).find((p) => !(p[8] & (F.note | F.story)));
      if (((kind === "kickoff" && /returns it/.test(row[7])) || / punts /.test(row[7]) || /INTERCEPTED/.test(row[7])) && !/FUMBLES|MUFFS|Penalty|PENALTY|TOUCHDOWN|touchback|BLOCKED/.test(row[7]) && next && next[3] > 0 && next[2] !== row[2]) {
        const spot = next[2] === 0 ? next[5] : 100 - next[5];
        if (Math.abs(end - spot) > 1.5) out.off.push(`${Math.abs(end - spot).toFixed(1)} yd ${where}`);
      }
      if (kind !== "kick" && kind !== "kickoff" && kind !== "flag" && row[11] !== "Play called back" && typeof to === "number" && !/incomplete|INTERCEPTED|FUMBLES|throws it away|PENALTY|TOUCHDOWN|end zone|SAFETY/.test(row[7]) && Math.abs(end - to) > 1.5)
        out.off.push(`${Math.abs(end - to).toFixed(1)} yd ${where}`);
    });
  }
  return out;
}

// Run as a report, not when the tests borrow the checks.
if (process.argv[1]?.endsWith("vite-node")) {
  const args = process.argv.slice(2);
  const r = animReport(Number(args[0] ?? 32), Number(args[1] ?? 7));
  const missed = Object.values(r.fallback).reduce((a, b) => a + b, 0) + r.errors.length;
  console.log(`${r.rows} rows, ${r.plays} plays, ${r.built} acted out, ${missed} fall back (${(missed / r.plays * 100).toFixed(2)}%)`);
  console.log("by kind", r.kinds, "average seconds", (r.seconds / r.built).toFixed(1));
  console.log("fallbacks", r.fallback);
  for (const [name, list] of [["errors", r.errors], ["too fast", r.fast], ["ball off the spot", r.off]] as const) {
    console.log(`${name}: ${list.length}`);
    for (const x of list.slice(0, 12)) console.log("  ", x);
  }
}
