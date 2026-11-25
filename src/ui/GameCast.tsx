import { useEffect, useMemo, useRef, useState } from "react";
import { boxAt, castAt, nextDriveStop, nextQuarterStop, storylines, type Cast, type RunningBox } from "../engine/gamecast";
import { PLAYER_BY_ID, TEAM_BY_ID } from "../engine/league";
import { stat, type StatKey } from "../engine/stats";
import { downText, PLAY_FLAGS as F, spotText } from "../engine/playlog";
import { TEAM_COLORS } from "../engine/teamColors";
import type { BoxScore as FinalBox, GameLog, GameResult } from "../engine/types";
import { PlayerTables, TEAM_ROWS } from "./BoxScore";
import { onColor } from "./format";
import { PlayLine } from "./GameFeed";
import { animAssets, type AnimAssets } from "./anim/assets";
import { FieldPlayers } from "./anim/FieldPlayers";
import { playerModel, type Model3D } from "./anim/Players3D";
import { buildTrack } from "./anim/build";
import type { Track } from "./anim/book";
import { readPrefs } from "./prefs";

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
// With the players drawn, the view closes in on this much of the field's length so they can be made out.
const ZOOM = 800;

/**
 * The field from above: the ball, the line of scrimmage, the line to gain, the drive so far and the last play.
 * With `players` on, the animated players carry the ball themselves, so the large ball marker is left off;
 * `live` (a play in motion) also drops the last play's trail. `view` is the stretch of the drawing on show
 * (left edge and width); the frame keeps the close-up's shape either way so the page doesn't jump.
 */
export function Field({ r, cast, players, live, view }: { r: GameResult; cast: Cast; players?: boolean; live?: boolean; view?: [number, number] }) {
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
    <svg className="gridiron" viewBox={`${view?.[0] ?? 0} 0 ${view?.[1] ?? W} ${H}`} style={view ? { aspectRatio: `${ZOOM} / ${H}` } : undefined} role="img" aria-label={`The field. ${label}`}>
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

      {snap && !players && cast.driveStart !== null && Math.abs(cast.driveStart - cast.ball!) >= 1 && (
        <rect className="drive" x={Math.min(X(cast.driveStart), los!)} y={MID - 34} width={Math.abs(los! - X(cast.driveStart))} height={68} />
      )}
      {los !== null && <line className="los" x1={los} x2={los} y1={0} y2={H} />}
      {cast.toGain !== null && <line className="togain" x1={X(cast.toGain)} x2={X(cast.toGain)} y1={0} y2={H} />}
      {path && !live && !players && <path className={`trail ${last!.tone}`} d={path} markerEnd="url(#cast-arrow)" />}
      {cast.ball !== null && !players && (
        <g className="ball" style={{ transform: `translate(${X(cast.ball)}px, ${MID}px)` }}>
          <ellipse rx={17} ry={10.5} />
          <line x1={-7} x2={7} y1={0} y2={0} />
        </g>
      )}
      {snap && !players && (
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
/**
 * One game a play at a time. A live game passes `limit`, the rows played by
 * now on the clock: the view can't run past it, and the rest arrives as the
 * clock moves on.
 */
export function FollowGame({ r, log, box, onDone, limit, start, onClock }: { r: GameResult; log: GameLog; box?: FinalBox; onDone: () => void; limit?: number; start?: number; onClock?: (hours: number) => void }) {
  const total = log.plays.length;
  const live = limit !== undefined && limit < total;
  const avail = live ? limit : total;
  const ids = [r.away, r.home];
  const [at, setAt] = useState(Math.min(start ?? 0, avail));
  const [auto, setAuto] = useState(false);
  // Animated players: the art loads once, and `moving` is the play (by its count) being acted out.
  const [assets, setAssets] = useState<AnimAssets | null>(null);
  const [model, setModel] = useState<Model3D | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [trying, setTrying] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!readPrefs().animate || still) return;
    let open = true;
    // The 3D players come first when they can be had, so the field never shows the sprites and then swaps.
    void Promise.all([animAssets(), playerModel()]).then(([a, m]) => { if (open) { setModel(m); setAssets(a); } });
    return () => { open = false; };
  }, []);
  // Each row worked out as a play once, the first time it is asked for. Null is a row with nothing to act out.
  const tracks = useRef(new Map<number, Track | null>());
  useEffect(() => { tracks.current.clear(); }, [assets, log]);
  const trackFor = (n: number): Track | null => {
    if (!assets || n < 0 || n >= total) return null;
    let t = tracks.current.get(n);
    if (t === undefined) {
      // A row the builder can't make sense of falls back to the ball and arrow instead of stopping the game view.
      try { t = buildTrack(assets.book, log, n, box?.players); } catch { t = null; }
      tracks.current.set(n, t);
    }
    return t;
  };
  // The play in motion: the last row stepped to, acted out.
  const whole = moving === at && at >= 1 ? trackFor(at - 1) : null;
  // A touchdown is followed by its try, which the feed keeps on the same row.
  const play = whole && trying === at && whole.then ? whole.then : whole;
  // Until the play is over, everything on screen stays as it was before the snap.
  const seen = play ? at - 1 : at;
  const cast = castAt(log, seen);
  const done = at >= avail;
  const over = at >= total;
  const stories = useMemo(() => storylines(log, [r.away, r.home]), [log, r.away, r.home]);
  // At the end the finished box score takes over, so the totals match it to the yard.
  const running = useMemo(() => (seen >= total && box && log.box ? box : boxAt(log, seen)), [log, seen, total, box]);
  const hurt = useMemo(() => log.plays.slice(0, seen).filter((p) => p[8] & F.injury)
    .map((p) => /INJURY: (.*?) is down after the play, ([^.]*)\./.exec(p[7])).filter((m) => m).map((m) => `${m![1]}, ${m![2]}`), [log, seen]);
  const alerts = seen > 0 ? stories[seen - 1] : [];

  // Both teams lined up for the next snap. Notes between plays (a timeout, the two-minute warning) are looked past.
  let stage: { track: Track; row: number } | null = play ? { track: play, row: at - 1 } : null;
  for (let j = seen; !stage && j < Math.min(total, seen + 3); j++) {
    if (j > seen && (log.plays[j][2] !== log.plays[seen][2] || log.plays[j][5] !== log.plays[seen][5])) break;
    const t = trackFor(j);
    if (t) stage = { track: t, row: j };
  }
  const side = stage ? log.plays[stage.row][2] : 0;
  // The stretch of field on show: close in on the ball, or on the whole of a play in motion. A play too long for
  // the close-up (a kick, a long pass) starts on the ball and the view travels with it.
  let view: [number, number] | undefined, follow = false;
  if (assets) {
    const start = stage ? stage.track.ball[0] : cast.ball;
    const ends = play ? play.span : start !== null ? [start, start] : null;
    if (!ends) view = [0, W];
    else {
      follow = Math.abs(X(ends[1]) - X(ends[0])) > ZOOM - 240;
      const mid = follow ? X(start!) : (X(ends[0]) + X(ends[1])) / 2;
      view = [Math.max(0, Math.min(W - ZOOM, mid - ZOOM / 2)), ZOOM];
    }
  }

  const fieldView = useRef<[number, number]>([0, W]);
  fieldView.current = view ?? [0, W];

  // One play on: act it out if it can be; a second press while it is moving skips to its result.
  const step = () => {
    if (play) { setTrying(null); setMoving(null); return; }
    const next = Math.min(avail, at + 1);
    setAt(next);
    setMoving(assets ? next : null);
  };
  const jump = (n: number) => { setTrying(null); setMoving(null); setAt(Math.min(avail, n)); };
  const stepNow = useRef(step);
  stepNow.current = step;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); stepNow.current(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setTrying(null); setMoving(null); setAt((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // Auto runs a play every couple of seconds until the game ends or it's switched off, waiting for a play in motion to finish.
  useEffect(() => {
    if (!auto || done || play) return;
    const t = setTimeout(() => stepNow.current(), 1800);
    return () => clearTimeout(t);
  }, [auto, done, play, at]);

  const last = cast.last;
  const shown = log.plays.slice(0, seen).reverse();
  const wp = cast.wp;
  return (
    <section className="cast">
      <div className="cast-main stack">
        <ScoreBug r={r} cast={cast} />
        <div className="gridiron-wrap">
          <Field r={r} cast={cast} players={!!stage} live={!!play} view={view} />
          {assets && stage && (
            <FieldPlayers assets={assets} model={model} teams={[ids[side], ids[1 - side]]} offenseHome={side === 1} view={view ?? [0, W]}
              follow={follow} home={fieldView} track={stage.track} playing={!!play} speed={speed} onEnd={() => { if (whole?.then && trying !== at) setTrying(at); else { setTrying(null); setMoving(null); } }} />
          )}
        </div>
        {wp !== null && (
          <div className="cast-wp" role="img" aria-label={`Win probability: ${r.away} ${Math.round((1 - wp) * 100)}%, ${r.home} ${Math.round(wp * 100)}%`}>
            <span className="num">{r.away} {Math.round((1 - wp) * 100)}%</span>
            <span className="cast-wp-bar"><i style={{ width: `${(1 - wp) * 100}%`, background: colorOf(r.away) }} /><i style={{ flex: 1, background: colorOf(r.home) }} /></span>
            <span className="num">{Math.round(wp * 100)}% {r.home}</span>
          </div>
        )}
        <div className={`cast-play ${last?.tone ?? ""}`} aria-live="polite">
          {play ? <span className="muted">{log.plays[at - 1][11] === "No play" ? "A flag before the snap." : log.plays[at - 1][11] || (log.plays[at - 1][8] & F.kick || log.plays[at - 1][3] === 0 ? "The kick." : "The snap.")}</span> : last ? (
            <>
              {(last.label || (last.row[8] & F.injury) !== 0) && (
                <strong className="cast-result">{last.label}{(last.row[8] & F.injury) !== 0 && <> <span className="pill inj">Injury</span></>}</strong>
              )}
              <span>{last.row[7]}</span>
              {last.row[11] && <span className="muted small">{last.row[11]}</span>}
              {alerts.map((a, i) => <span key={i} className="cast-alert">{a}</span>)}
            </>
          ) : <span className="muted">{r.away} at {r.home}. {done && live ? "Kickoff: move the clock on to watch the game as it happens." : "Press Next play for the opening kickoff."}</span>}
        </div>
        <div className="btn-row cast-controls">
          {(!done || play) && <button className="btn primary" onClick={step}>{play ? "Skip to the result" : "Next play"}</button>}
          {!done && <button className="btn" onClick={() => jump(nextDriveStop(log, at))}>Next drive</button>}
          {!done && <button className="btn" onClick={() => jump(nextQuarterStop(log, at))}>Next quarter</button>}
          {!done && <button className="btn" onClick={() => jump(avail)}>{live ? "To now" : "To the end"}</button>}
          {!done && <button className="btn" aria-pressed={auto} onClick={() => setAuto(!auto)}>{auto ? "Pause" : "Auto"}</button>}
          {at > 0 && <button className="btn" onClick={() => { setAuto(false); jump(at - 1); }}>Back a play</button>}
          {done && live && !play && onClock && <>
            <button className="btn primary" onClick={() => onClock(0.25)} title="Moves the clock 15 minutes: about a dozen plays.">Watch 15 minutes</button>
            <button className="btn" onClick={() => onClock(1)} title="Moves the clock an hour: about a quarter.">Watch an hour</button>
          </>}
          {assets && <button className="btn" onClick={() => setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1)} aria-label={`Animation speed ${speed}x; press to change`}>Speed {speed}x</button>}
          {over && !play && <button className="btn primary" onClick={onDone}>Box score</button>}
        </div>
        {done && live && !play && <p className="muted small">You're caught up: this game is live. {onClock ? "Watch on to see more of it." : "Move the clock on to see more of it."}</p>}
        <span className="muted small">{live ? `Play ${seen}, live.` : `Play ${seen} of ${total}.`} The right and left arrow keys step forward and back.</span>
      </div>
      <RunningBoxScore r={r} box={running} final={over} period={Math.min(cast.q, 5)} injuries={hurt} />
      <div className="cast-feed stack tight">
        <h3>Plays so far</h3>
        {shown.length === 0 && <p className="muted kit-none">Nothing yet.</p>}
        <ol className="plays feed">{shown.map((p, i) => <PlayLine key={seen - i} r={r} p={p} alerts={stories[seen - i - 1]} />)}</ol>
      </div>
    </section>
  );
}
