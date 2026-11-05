import { useEffect, useRef, useState } from "react";
import { askLeague, inquiryFor } from "../engine/gameops";
import { clockText, downText, PLAY_FLAGS as F, playsByDrive, spotText } from "../engine/playlog";
import type { GameLog, GameResult, GameState, PlayRow } from "../engine/types";

function teams(r: GameResult, row: PlayRow | { 0: 0 | 1 }): [string, string] {
  return row[0] === 0 ? [r.away, r.home] : [r.home, r.away];
}

function quarterName(q: number): string {
  return q <= 4 ? ["", "First quarter", "Second quarter", "Third quarter", "Fourth quarter"][q] : q === 5 ? "Overtime" : `Overtime ${q - 4}`;
}

/** One play, as the feed shows it. */
export function PlayLine({ r, p }: { r: GameResult; p: PlayRow }) {
  const [off, def] = teams(r, [p[2]]);
  const cls = p[8] & F.score ? "play score" : p[8] & F.turnover ? "play turnover" : "play";
  return (
    <li className={cls}>
      <span className="num muted">{clockText(p[0], p[1])}</span>
      <span>
        <span className="muted">{off}{p[3] ? ` · ${downText(p[3], p[4], p[5])} at ${spotText(p[5], off, def)}` : ""}</span>
        {(p[8] & F.review) !== 0 && <> <span className="pill">Review</span></>}
        {(p[8] & F.penalty) !== 0 && <> <span className="pill ps">Flag</span></>}
        <br />{p[7]}
        {p[11] && <><br /><span className="muted small">{p[11]}</span></>}
      </span>
      <span className="num">{p[8] & F.score ? `${p[9]}-${p[10]}` : ""}</span>
    </li>
  );
}

type Filter = "all" | "key" | "big";
const FILTERS: [Filter, string][] = [["all", "Every play"], ["key", "Scores and turnovers"], ["big", "Big plays"]];

export function PlayByPlay({ r, log }: { r: GameResult; log: GameLog }) {
  const [filter, setFilter] = useState<Filter>("all");
  const keep = (p: PlayRow) => filter === "all" || (filter === "key" ? (p[8] & (F.score | F.turnover)) !== 0 : (p[8] & (F.score | F.turnover | F.big | F.review)) !== 0);
  const rows = log.plays.filter(keep);
  const quarters = [...new Set(rows.map((p) => p[0]))];
  return (
    <section className="stack">
      <div className="tabs" role="group" aria-label="Which plays">
        {FILTERS.map(([k, label]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
      </div>
      {quarters.map((q) => (
        <div key={q} className="stack tight">
          <h3>{quarterName(q)}</h3>
          <ol className="plays feed">{rows.filter((p) => p[0] === q).map((p, i) => <PlayLine key={i} r={r} p={p} />)}</ol>
        </div>
      ))}
    </section>
  );
}

export function DriveChart({ r, log }: { r: GameResult; log: GameLog }) {
  return (
    <section className="stack tight">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th><th>Started</th><th>From</th><th className="num">Plays</th><th className="num">Yards</th><th className="num">Time</th><th>Result</th><th className="drive-col">Field</th></tr></thead>
          <tbody>
            {log.drives.map((d, i) => {
              const [off, def] = teams(r, d);
              const end = Math.max(0, Math.min(100, d[3] + d[5]));
              const lo = Math.min(d[3], end);
              const w = Math.max(1, Math.abs(end - d[3]));
              const scored = d[7] === "Touchdown" || d[7] === "Field goal";
              return (
                <tr key={i}>
                  <td className="name">{off}</td>
                  <td className="num">{clockText(d[1], d[2])}</td>
                  <td>{spotText(d[3], off, def)}</td>
                  <td className="num">{d[4]}</td>
                  <td className="num">{d[5]}</td>
                  <td className="num">{Math.floor(d[6] / 60)}:{String(d[6] % 60).padStart(2, "0")}</td>
                  <td className={scored ? "good" : d[7] === "Interception" || d[7] === "Fumble" ? "bad" : ""}>{d[7]}</td>
                  <td className="drive-col">
                    <div className="drive-bar" aria-hidden="true">
                      <span className={scored ? "scored" : ""} style={{ left: `${d[0] === 0 ? lo : 100 - lo - w}%`, width: `${w}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="muted">On the field bar the away team drives left to right and the home team right to left.</span>
    </section>
  );
}

/** The game-day operations check and disputed calls, for one of the owner's games. */
export function GameDay({ game, id, changed }: { game: GameState; id: string; changed: () => void }) {
  const check = game.gameOps?.checks.find((c) => c.gameId === id);
  const calls = (game.box[id]?.calls ?? []).map((c, i) => ({ ...c, i })).filter((c) => c.team === game.userTeam);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="stack">
      {check && (
        <div className="panel stack tight">
          <h3>Game-day operations</h3>
          <dl className="kv">
            {check.areas.map(([area, status, note]) => (
              <div key={area} style={{ display: "contents" }}>
                <dt>{area}</dt>
                <dd className={status === "problem" ? "bad" : status === "minor" ? "" : "good"}>{status === "ready" ? "Ready" : note}</dd>
              </div>
            ))}
          </dl>
          <span className="muted">{check.incidents.length ? `Cost of the problems: $${Math.round(check.cost / 1000)}K.` : "Your stadium operations staff ran the check before kickoff. Nothing reached the field."}</span>
        </div>
      )}
      {calls.length > 0 && (
        <div className="panel stack tight">
          <h3>Calls that went against us</h3>
          <span className="muted">The football staff flagged these. You can ask the league office about any of them; it answers within a few days.</span>
          {calls.map((c) => {
            const q = inquiryFor(game, id, c.i);
            return (
              <div key={c.i} className="btn-row" style={{ alignItems: "center" }}>
                <span>{clockText(c.q, c.clock)}: {c.text}.</span>
                {q ? <span className="muted">{q.answer ?? "Asked; waiting on the league."}</span>
                  : <button className="btn small" onClick={() => { setMsg(askLeague(game, id, c.i)); changed(); }}>Ask the league</button>}
              </div>
            );
          })}
          {msg && <span className="warn">{msg}</span>}
        </div>
      )}
      {!check && !calls.length && <p className="muted">Nothing to report from game day.</p>}
    </section>
  );
}

/**
 * Follows a game a drive at a time, as if it were coming in live. The result
 * is already decided; this only holds back what you haven't reached yet.
 */
export function FollowGame({ r, log, onDone }: { r: GameResult; log: GameLog; onDone: () => void }) {
  const groups = playsByDrive(log);
  const [shown, setShown] = useState(1);
  const visible = groups.slice(0, shown);
  const last = visible.at(-1)?.rows.at(-1);
  const done = shown >= groups.length;
  const newest = useRef<HTMLDivElement>(null);
  // Bring the drive that just came in to the top of the view.
  useEffect(() => {
    const first = newest.current?.querySelector("li");
    first?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [shown]);
  const nextQuarter = () => {
    const q = last?.[0] ?? 1;
    let n = shown;
    while (n < groups.length && (groups[n].rows[0][0] <= q)) n++;
    setShown(Math.min(groups.length, n + 1));
  };
  return (
    <section className="stack">
      <div className="follow-score">
        <strong>{r.away} {last?.[9] ?? 0}</strong>
        <span className="muted">{done ? (r.overtime ? "Final/OT" : "Final") : last ? clockText(last[0], last[1]) : ""}</span>
        <strong>{r.home} {last?.[10] ?? 0}</strong>
      </div>
      <ol className="plays feed">
        {visible.map((g, gi) => (
          <div key={g.drive} ref={gi === visible.length - 1 ? newest : undefined} style={{ display: "contents" }}>
            {g.rows.map((p, i) => <PlayLine key={i} r={r} p={p} />)}
          </div>
        ))}
      </ol>
      <div className="btn-row follow-controls">
        {!done && <button className="btn primary" onClick={() => setShown(shown + 1)}>Next drive</button>}
        {!done && <button className="btn" onClick={nextQuarter}>To the next quarter</button>}
        {!done && <button className="btn" onClick={() => setShown(groups.length)}>To the end</button>}
        {done && <button className="btn primary" onClick={onDone}>Box score</button>}
      </div>
    </section>
  );
}

/** Home win probability across the game, with the quarter breaks. */
export function WinChart({ r, log }: { r: GameResult; log: GameLog }) {
  const pts = log.plays.filter((p) => p[13] !== undefined);
  if (pts.length < 10) return null;
  const W = 600, H = 120;
  const total = (p: PlayRow) => (p[0] <= 4 ? (p[0] - 1) * 900 + (900 - p[1]) : 3600 + (600 - Math.min(600, p[1])));
  const end = Math.max(3600, total(pts[pts.length - 1]));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${((total(p) / end) * W).toFixed(1)},${((1 - p[13]!) * H).toFixed(1)}`).join(" ");
  return (
    <figure className="stack tight" style={{ margin: 0 }}>
      <svg className="wp-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Win probability: ${r.home} at the top, ${r.away} at the bottom`}>
        <line className="mid" x1={0} x2={W} y1={H / 2} y2={H / 2} />
        {[900, 1800, 2700].map((x) => <line key={x} className="mid" x1={(x / end) * W} x2={(x / end) * W} y1={0} y2={H} />)}
        <path className="line" d={path} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="muted">Win probability: {r.home} wins at the top, {r.away} at the bottom; dashed lines mark the quarters.</figcaption>
    </figure>
  );
}

/** Why a play turned the game, in the words a film session would use. */
function filmNote(p: PlayRow): string {
  const t = p[7];
  const look = p[11] ?? "";
  if (t.includes("analysts said")) return "A fourth-down call.";
  if (t.includes("INTERCEPTED")) return look.includes("blitz") ? "The blitz got home fast enough to hurry the throw." : look.includes("Cover 2") || look.includes("Cover 4") ? "Two deep safeties were waiting on the throw." : "A throw into coverage the defense read.";
  if (t.includes("sacked")) return t.includes("beating") ? "A lost one-on-one up front." : "Coverage held long enough for the rush to arrive.";
  if (t.includes("FUMBLE")) return "Ball security.";
  if (t.includes(" pass ") && !t.includes("incomplete")) return look.includes("Cover 1") || look.includes("2-man") || look.includes("Cover 0") ? "Won one-on-one against man coverage." : look.includes("Cover 3") ? "Found the soft spot between the zones." : "Beat the coverage.";
  if (t.includes(" runs ") || t.includes("keeps it")) return look.includes("nickel") || look.includes("dime") ? "Ran against a light box." : "Blocked up well.";
  if (p[8] & F.kick) return "Special teams swing.";
  if (p[8] & F.penalty) return "A penalty that moved the game.";
  return "";
}

/** The plays that moved win probability the most, with a film note on each. */
export function KeyPlays({ r, log }: { r: GameResult; log: GameLog }) {
  const swings: { p: PlayRow; d: number }[] = [];
  let prev = 0.5;
  for (const p of log.plays) {
    if (p[13] === undefined) continue;
    swings.push({ p, d: p[13] - prev });
    prev = p[13];
  }
  const top = swings.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5);
  if (!top.length) return null;
  return (
    <section className="stack tight">
      <h3>Plays that turned it</h3>
      <ol className="plays feed">
        {top.map(({ p, d }, i) => (
          <li key={i}>
            <span className="num muted">{clockText(p[0], p[1])}</span>
            <span>{p[7]}<br /><span className="muted small">{filmNote(p)} {Math.abs(Math.round(d * 100))} points of win probability toward {d > 0 ? r.home : r.away}.{p[12] !== undefined ? ` EPA ${p[12] >= 0 ? "+" : ""}${p[12].toFixed(2)}.` : ""}</span></span>
            <span />
          </li>
        ))}
      </ol>
    </section>
  );
}
