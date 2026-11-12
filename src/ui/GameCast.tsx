import { useEffect, useMemo, useState } from "react";
import { boxAt, castAt, nextDriveStop, nextQuarterStop, storylines, type Cast, type RunningBox } from "../engine/gamecast";
import { PLAYER_BY_ID, TEAM_BY_ID } from "../engine/league";
import { stat, type StatKey } from "../engine/stats";
import { downText, PLAY_FLAGS as F, spotText } from "../engine/playlog";
import { TEAM_COLORS } from "../engine/teamColors";
import type { BoxScore as FinalBox, GameLog, GameResult } from "../engine/types";
import { PlayerTables, TEAM_ROWS } from "./BoxScore";
import { onColor } from "./format";
import { PlayLine } from "./GameFeed";

const colorOf = (team: string): string => TEAM_COLORS[team]?.[0] ?? "#2b3a4a";

function quarterText(q: number): string {
  return q <= 4 ? ["", "1st", "2nd", "3rd", "4th"][q] : q === 5 ? "OT" : `${q - 4}OT`;
}

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
}

/** The score graphic a broadcast keeps on screen: teams, score, timeouts, possession, clock, down and distance. */
export function ScoreBug({ r, cast }: { r: GameResult; cast: Cast }) {
  const ids = [r.away, r.home];
  const flag = !!cast.last && (cast.last.row[8] & F.penalty) !== 0;
  const situation = cast.final ? (r.overtime ? "Final/OT" : "Final")
    : cast.down ? downText(cast.down, cast.dist, cast.ydl)
    : cast.at === 0 ? "Kickoff" : cast.last?.tone === "score" ? cast.last.label : "Kickoff";
  const spot = cast.down && cast.poss !== null ? `Ball on ${spotText(cast.ydl, ids[cast.poss], ids[1 - cast.poss])}` : "";
  return (
    <div className="bug" role="group" aria-label="Scoreboard">
      {ids.map((id, i) => {
        const bg = colorOf(id);
        const left = cast.timeouts?.[i];
        return (
          <div key={i} className="bug-team" style={{ background: bg, color: onColor(bg) }}>
            <span className="bug-id">
              <span className="bug-abbr">{id}{cast.poss === i && <span className="bug-poss" role="img" aria-label="has the ball" />}</span>
              {left !== undefined && (
                <span className="bug-to" role="img" aria-label={`${left} timeouts left`}>
                  {[0, 1, 2].map((k) => <i key={k} className={k < left ? "on" : ""} />)}
                </span>
              )}
            </span>
            <span className="bug-pts">{i === 0 ? cast.away : cast.home}</span>
          </div>
        );
      })}
      <div className="bug-clock">
        <span className="bug-q">{cast.final ? "End" : quarterText(cast.q)}</span>
        <span className="bug-time">{cast.final ? "0:00" : clock(cast.clock)}</span>
      </div>
      <div className={`bug-down${flag ? " flag" : ""}`}>
        <span className="bug-dd">{flag && !cast.final ? "Flag · " : ""}{situation}</span>
        <span className="bug-spot">{spot}</span>
      </div>
    </div>
  );
}

// The drawing is ten units to the yard: 120 yards with the end zones by 53 1/3.
const W = 1200, H = 533;
const X = (x: number) => 100 + x * 10;
const MID = H / 2;

/** The field from above: the ball, the line of scrimmage, the line to gain, the drive so far and the last play. */
export function Field({ r, cast }: { r: GameResult; cast: Cast }) {
  const ids = [r.away, r.home];
  const last = cast.last;
  const snap = cast.down > 0 && cast.poss !== null && cast.ball !== null;
  const los = snap ? X(cast.ball!) : null;
  const dir = cast.poss === 0 ? 1 : -1;
  // Throws and kicks travel in an arc on the drawing; runs go straight.
  const airborne = !!last && (last.row[3] === 0 || / pass |punts|field goal/i.test(last.row[7]));
  let path = "";
  if (last && last.to !== null && Math.abs(last.to - last.from) >= 1) {
    const a = X(last.from), b = X(last.to);
    path = airborne ? `M${a},${MID} Q${(a + b) / 2},${MID - Math.min(190, 40 + Math.abs(b - a) * 0.3)} ${b},${MID}` : `M${a},${MID} L${b},${MID}`;
  }
  const label = cast.final ? "The game is over." : snap
    ? `${ids[cast.poss!]} ball, ${downText(cast.down, cast.dist, cast.ydl)} at the ${spotText(cast.ydl, ids[cast.poss!], ids[1 - cast.poss!])}.`
    : "Kickoff.";
  return (
    <svg className="field" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The field. ${label}`}>
      <defs>
        <marker id="cast-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={X(i * 10)} y={0} width={100} height={H} className={i % 2 ? "turf alt" : "turf"} />)}
      {ids.map((id, i) => {
        const bg = colorOf(id);
        const cx = i === 0 ? 50 : W - 50;
        return (
          <g key={i}>
            <rect x={i === 0 ? 0 : W - 100} y={0} width={100} height={H} fill={bg} />
            <text className="endzone" x={cx} y={MID} fill={onColor(bg)} transform={`rotate(${i === 0 ? -90 : 90} ${cx} ${MID})`}>{TEAM_BY_ID[id]?.name ?? id}</text>
            <line className="post" x1={i === 0 ? 6 : W - 6} x2={i === 0 ? 6 : W - 6} y1={MID - 31} y2={MID + 31} />
          </g>
        );
      })}
      {Array.from({ length: 21 }, (_, i) => <line key={i} className={i === 0 || i === 20 ? "goal" : "yard"} x1={X(i * 5)} x2={X(i * 5)} y1={0} y2={H} />)}
      {Array.from({ length: 99 }, (_, i) => i + 1).filter((y) => y % 5).map((y) => (
        <g key={y} className="hash">
          <line x1={X(y)} x2={X(y)} y1={4} y2={14} /><line x1={X(y)} x2={X(y)} y1={H - 14} y2={H - 4} />
          <line x1={X(y)} x2={X(y)} y1={203} y2={213} /><line x1={X(y)} x2={X(y)} y1={H - 213} y2={H - 203} />
        </g>
      ))}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => (
        <g key={y} className="yardno">
          <text x={X(y)} y={H - 52}>{y <= 50 ? y : 100 - y}</text>
          <text x={X(y)} y={52} transform={`rotate(180 ${X(y)} 52)`}>{y <= 50 ? y : 100 - y}</text>
        </g>
      ))}
      <rect x={1} y={1} width={W - 2} height={H - 2} className="edge" />

      {snap && cast.driveStart !== null && Math.abs(cast.driveStart - cast.ball!) >= 1 && (
        <rect className="drive" x={Math.min(X(cast.driveStart), los!)} y={MID - 34} width={Math.abs(los! - X(cast.driveStart))} height={68} />
      )}
      {los !== null && <line className="los" x1={los} x2={los} y1={0} y2={H} />}
      {cast.toGain !== null && <line className="togain" x1={X(cast.toGain)} x2={X(cast.toGain)} y1={0} y2={H} />}
      {path && <path className={`trail ${last!.tone}`} d={path} markerEnd="url(#cast-arrow)" />}
      {cast.ball !== null && (
        <g className="ball" style={{ transform: `translate(${X(cast.ball)}px, ${MID}px)` }}>
          <ellipse rx={17} ry={10.5} />
          <line x1={-7} x2={7} y1={0} y2={0} />
        </g>
      )}
      {snap && (
        <g className="tag" transform={`translate(${Math.max(150, Math.min(W - 150, los!))}, ${MID - 74})`}>
          <rect x={-46} y={-20} width={92} height={36} rx={5} fill={colorOf(ids[cast.poss!])} />
          <text y={7} fill={onColor(colorOf(ids[cast.poss!]))}>{dir < 0 ? "◂ " : ""}{ids[cast.poss!]}{dir > 0 ? " ▸" : ""}</text>
        </g>
      )}
    </svg>
  );
}

type Side = "away" | "home";
const SIDES: Side[] = ["away", "home"];

/** The player with the most of a stat on one side, and his line in a few words. */
function leader(players: Record<string, number[]>, by: StatKey, line: (v: number[]) => string): string | null {
  let best: [string, number[]] | null = null;
  for (const e of Object.entries(players)) if (stat(e[1], by) > (best ? stat(best[1], by) : 0)) best = e;
  return best ? `${PLAYER_BY_ID[best[0]]?.name ?? "?"}: ${line(best[1])}` : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const LEADERS: [string, StatKey, (v: number[]) => string][] = [
  ["Passing", "att", (v) => `${stat(v, "cmp")}/${stat(v, "att")}, ${stat(v, "passYds")} yds${stat(v, "passTd") ? `, ${stat(v, "passTd")} TD` : ""}${stat(v, "int") ? `, ${stat(v, "int")} INT` : ""}`],
  ["Rushing", "rushYds", (v) => `${plural(stat(v, "car"), "carry").replace("carrys", "carries")}, ${stat(v, "rushYds")} yds${stat(v, "rushTd") ? `, ${stat(v, "rushTd")} TD` : ""}`],
  ["Receiving", "recYds", (v) => `${stat(v, "rec")} rec, ${stat(v, "recYds")} yds${stat(v, "recTd") ? `, ${stat(v, "recTd")} TD` : ""}`],
  ["Tackles", "tklSolo", (v) => `${stat(v, "tklSolo") + stat(v, "tklAst")} tkl${stat(v, "sacks") ? `, ${plural(stat(v, "sacks"), "sack")}` : ""}${stat(v, "defInt") ? `, ${stat(v, "defInt")} INT` : ""}`],
];

/** The box score as it stands at this point in the game: line score, leaders, team totals and every player's line. */
export function RunningBoxScore({ r, box, final, period, injuries }: { r: GameResult; box: RunningBox | null; final: boolean; period: number; injuries: string[] }) {
  const [side, setSide] = useState<Side>("away");
  if (!box) return <aside className="cast-box stack tight"><h3>Box score</h3><p className="muted">This game was played before the box score was kept play by play. The full box score opens when you reach the end.</p></aside>;
  const periods = Math.max(4, box.quarters.away.length, box.quarters.home.length);
  const total = (s: Side) => box.quarters[s].reduce((a, b) => a + b, 0);
  return (
    <aside className="cast-box stack tight" aria-label="Running box score">
      <h3>Box score <span className="muted small">{final ? "final" : "so far"}</span></h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th>{Array.from({ length: periods }, (_, i) => <th key={i} className="num">{i < 4 ? i + 1 : "OT"}</th>)}<th className="num">T</th></tr></thead>
          <tbody>
            {SIDES.map((s) => (
              <tr key={s}><td className="name">{r[s]}</td>{Array.from({ length: periods }, (_, i) => <td key={i} className="num">{final || i < period ? box.quarters[s][i] ?? 0 : ""}</td>)}<td className="num"><strong>{total(s)}</strong></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cast-leaders">
        {SIDES.map((s) => (
          <div key={s} className="stack tight">
            <span className="label">{r[s]}</span>
            {LEADERS.map(([title, by, line]) => {
              const text = leader(box.players[s], by, line);
              return text && <span key={title} className="small"><span className="muted">{title}</span> {text}</span>;
            })}
            {!Object.keys(box.players[s]).length && <span className="muted small">No stats yet.</span>}
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table className="dense">
          <thead><tr><th></th><th className="num">{r.away}</th><th className="num">{r.home}</th></tr></thead>
          <tbody>
            {TEAM_ROWS.map(([label, f]) => <tr key={label}><td>{label}</td><td className="num">{f(box.team.away)}</td><td className="num">{f(box.team.home)}</td></tr>)}
          </tbody>
        </table>
      </div>
      {injuries.length > 0 && <p className="small"><span className="label">Injuries</span> {injuries.join("; ")}</p>}
      <details>
        <summary>Every player's line</summary>
        <div className="stack">
          <div className="tabs" role="group" aria-label="Team">
            {SIDES.map((s) => <button key={s} aria-pressed={side === s} onClick={() => setSide(s)}>{TEAM_BY_ID[r[s]]?.name ?? r[s]}</button>)}
          </div>
          <PlayerTables players={box.players[side]} />
        </div>
      </details>
    </aside>
  );
}

/**
 * Follows a game one play at a time, as if it were coming in live: the score
 * graphic and the field on the left, the plays so far on the right. The result
 * is already decided; this only holds back what you haven't reached yet.
 */
export function FollowGame({ r, log, box, onDone }: { r: GameResult; log: GameLog; box?: FinalBox; onDone: () => void }) {
  const total = log.plays.length;
  const [at, setAt] = useState(0);
  const [auto, setAuto] = useState(false);
  const cast = castAt(log, at);
  const done = at >= total;
  const stories = useMemo(() => storylines(log, [r.away, r.home]), [log, r.away, r.home]);
  // At the end the finished box score takes over, so the totals match it to the yard.
  const running = useMemo(() => (at >= total && box && log.box ? box : boxAt(log, at)), [log, at, total, box]);
  const hurt = useMemo(() => log.plays.slice(0, at).filter((p) => p[8] & F.injury)
    .map((p) => /INJURY: (.*?) is down after the play, ([^.]*)\./.exec(p[7])).filter((m) => m).map((m) => `${m![1]}, ${m![2]}`), [log, at]);
  const alerts = at > 0 ? stories[at - 1] : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); setAt((n) => Math.min(total, n + 1)); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setAt((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // Auto runs a play every couple of seconds until the game ends or it's switched off.
  useEffect(() => {
    if (!auto || done) return;
    const t = setInterval(() => setAt((n) => Math.min(total, n + 1)), 1800);
    return () => clearInterval(t);
  }, [auto, done, total]);

  const last = cast.last;
  const shown = log.plays.slice(0, at).reverse();
  const wp = cast.wp;
  return (
    <section className="cast">
      <div className="cast-main stack">
        <ScoreBug r={r} cast={cast} />
        <Field r={r} cast={cast} />
        {wp !== null && (
          <div className="cast-wp" role="img" aria-label={`Win probability: ${r.away} ${Math.round((1 - wp) * 100)}%, ${r.home} ${Math.round(wp * 100)}%`}>
            <span className="num">{r.away} {Math.round((1 - wp) * 100)}%</span>
            <span className="cast-wp-bar"><i style={{ width: `${(1 - wp) * 100}%`, background: colorOf(r.away) }} /><i style={{ flex: 1, background: colorOf(r.home) }} /></span>
            <span className="num">{Math.round(wp * 100)}% {r.home}</span>
          </div>
        )}
        <div className={`cast-play ${last?.tone ?? ""}`} aria-live="polite">
          {last ? (
            <>
              {(last.label || (last.row[8] & F.injury) !== 0) && (
                <strong className="cast-result">{last.label}{(last.row[8] & F.injury) !== 0 && <> <span className="pill inj">Injury</span></>}</strong>
              )}
              <span>{last.row[7]}</span>
              {last.row[11] && <span className="muted small">{last.row[11]}</span>}
              {alerts.map((a, i) => <span key={i} className="cast-alert">{a}</span>)}
            </>
          ) : <span className="muted">{r.away} at {r.home}. Press Next play for the opening kickoff.</span>}
        </div>
        <div className="btn-row cast-controls">
          {!done && <button className="btn primary" onClick={() => setAt(at + 1)}>Next play</button>}
          {!done && <button className="btn" onClick={() => setAt(nextDriveStop(log, at))}>Next drive</button>}
          {!done && <button className="btn" onClick={() => setAt(nextQuarterStop(log, at))}>Next quarter</button>}
          {!done && <button className="btn" onClick={() => setAt(total)}>To the end</button>}
          {!done && <button className="btn" aria-pressed={auto} onClick={() => setAuto(!auto)}>{auto ? "Pause" : "Auto"}</button>}
          {at > 0 && <button className="btn" onClick={() => { setAuto(false); setAt(at - 1); }}>Back a play</button>}
          {done && <button className="btn primary" onClick={onDone}>Box score</button>}
        </div>
        <span className="muted small">Play {at} of {total}. The right and left arrow keys step forward and back.</span>
      </div>
      <RunningBoxScore r={r} box={running} final={done} period={Math.min(cast.q, 5)} injuries={hurt} />
      <div className="cast-feed stack tight">
        <h3>Plays so far</h3>
        {shown.length === 0 && <p className="muted">Nothing yet.</p>}
        <ol className="plays feed">{shown.map((p, i) => <PlayLine key={at - i} r={r} p={p} alerts={stories[at - i - 1]} />)}</ol>
      </div>
    </section>
  );
}
