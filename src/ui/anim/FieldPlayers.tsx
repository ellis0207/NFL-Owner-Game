import { useEffect, useRef, useState } from "react";
import { TEAM_COLORS } from "../../engine/teamColors";
import { teamSheet, type AnimAssets } from "./assets";
import { ACT, type Track } from "./book";
import { Stage3D, type Model3D } from "./Players3D";

// The field drawing's own measure (GameCast.tsx): ten units to the yard, end zones included.
const W = 1200, H = 533, MID = H / 2;
const X = (x: number) => 100 + x * 10;
const Y = (y: number) => MID - y * 10;
// Players are drawn larger than life so they can be told apart from the upper deck.
const SCALE = 1.7;

interface Props {
  assets: AnimAssets;
  /** The 3D players, when the browser can draw them; otherwise the sprites. */
  model?: Model3D | null;
  /** The club that snaps or kicks the ball and the club across from it, and whether the first is the home team. */
  teams: [string, string];
  offenseHome: boolean;
  /** The stretch of the field drawing on show: left edge and width, in its units. */
  view: [number, number];
  /** A play too long for the close-up: the view travels with the ball instead of pulling back. */
  follow: boolean;
  /** The view the field drawing should have right now, kept up to date by the game view. */
  home: { current: [number, number] };
  track: Track;
  /** Run the play; otherwise both teams stand as they line up for it. */
  playing: boolean;
  speed: number;
  onEnd: () => void;
}

interface Figure { x: number; y: number; d: number; action: string; frame: number; down: boolean }

const facing = (vx: number, vy: number) => ((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8;

/** One player at one frame: where he is, which way he faces and which drawing of him fits what he is doing. */
function figureAt(a: AnimAssets, t: Track, i: number, f: number): Figure {
  const p = t.pos[i], last = p.length / 2 - 1;
  const velocity = (at: number): [number, number] => {
    const a0 = Math.max(0, at - 2), b0 = Math.min(last, at + 2);
    const dt = Math.max(1, b0 - a0) / t.rate;
    return [(p[b0 * 2] - p[a0 * 2]) / dt, (p[b0 * 2 + 1] - p[a0 * 2 + 1]) / dt];
  };
  const [vx, vy] = velocity(f);
  const speed = Math.hypot(vx, vy);
  const toward = (t.team[i] === 0 ? t.dir : -t.dir) > 0 ? 0 : 4;
  const stride = Math.floor(t.dist[i][f] / 0.55) % 8;
  const code = t.act[i][f];
  // How long he has been at it, which picks the frame of a throw, a kick or a fall.
  let start = f;
  while (start > 0 && t.act[i][start - 1] === code) start--;
  const el = (f - start) / t.rate;
  let d = t.face[i][f] >= 0 ? t.face[i][f] : speed > 1.2 ? facing(vx, vy) : toward;
  let action = "idle", frame = 0, down = false;
  const once = (name: string, over: number) => { action = name; frame = Math.min(a.index.actions[name][1] - 1, Math.floor(el / over * a.index.actions[name][1])); };
  if (code === ACT.fall) {
    // He goes down the way he was heading when he was hit.
    if (t.face[i][f] < 0) {
      const [fx, fy] = velocity(Math.max(0, start - 2));
      d = Math.hypot(fx, fy) > 0.5 ? facing(fx, fy) : toward;
    }
    if (el >= 0.3) { action = "down"; down = true; } else once("dive", 0.3);
  } else if (code === ACT.throw) once("throw", 0.3);
  else if (code === ACT.kick) once("kick", 0.35);
  else if (code === ACT.catch) { action = "catch"; frame = el < 0.12 ? 0 : 1; }
  else if (code === ACT.cheer) { action = "cheer"; frame = Math.floor(el / 0.25) % 2; }
  else if (code === ACT.kneel) action = "kneel";
  else if (code === ACT.set && speed <= 1.2) action = "set";
  else if (code === ACT.block && speed <= 3.5) { action = "block"; frame = Math.floor(el / 0.25) % 2; if (t.face[i][f] < 0) d = toward; }
  else if (speed > 1.2) { action = t.holder[f] === i ? "carry" : "run"; frame = stride; }
  return { x: p[f * 2], y: p[f * 2 + 1], d, action, frame, down };
}

/**
 * The players, drawn over the field: standing in formation before a snap, or
 * moving through a play. It draws on a canvas laid exactly over the field's
 * drawing and tells the game view when the play is over.
 */
export function FieldPlayers({ assets, model, teams, offenseHome, view, follow, home, track, playing, speed, onEnd }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const gl = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage3D | null>(null);
  const [ready, setReady] = useState(0);
  // One WebGL view for as long as the field is open; each play is dressed onto it.
  useEffect(() => {
    if (!model || !gl.current) return;
    try { stage.current = new Stage3D(gl.current, model); } catch { stage.current = null; }
    setReady((n) => n + 1);
    return () => { stage.current?.dispose(); stage.current = null; };
  }, [model]);
  const done = useRef(onEnd);
  done.current = onEnd;
  const rate = useRef(speed);
  rate.current = speed;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d")!;
    const { index } = assets;
    const colors = (team: string): [string, string] => TEAM_COLORS[team] ?? ["#2b3a4a", "#9aa5b1"];
    const body = (i: number) => (index.bodies.includes(track.body[i]) ? track.body[i] : "skill");
    // An official wears a white shirt with black cap and trousers, whoever is playing.
    const sheet = (i: number) => (track.team[i] === 2 ? teamSheet(assets, body(i), ["#f2f2f2", "#16181b"], true)
      : teamSheet(assets, body(i), colors(teams[track.team[i] as 0 | 1]), track.team[i] === 0 ? offenseHome : !offenseHome));
    const size = index.span * 10 * SCALE;
    const frames = track.pos[0].length / 2;
    const st = stage.current;
    // The camera. With the 3D players it comes in closer, like a broadcast's, and travels with the ball both ways;
    // with the sprites it shows the field's whole width and travels only on a play too long for the close-up.
    // Either way it is smoothed both ways in time so it neither lurches nor lags.
    const zoom = st ? 0.56 : 1;
    const vw = view[1] * zoom, vh = H * zoom;
    let camX: Float32Array | null = null, camY: Float32Array | null = null;
    const field = canvas.parentElement?.querySelector("svg.gridiron") ?? null;
    const smooth = (want: (f: number) => number, at: (f: number) => number, room: number, margin: number, lo: number, hi: number) => {
      const c = new Float32Array(frames);
      c[0] = want(0);
      for (let f = 1; f < frames; f++) c[f] = c[f - 1] + (want(f) - c[f - 1]) * 0.12;
      for (let f = frames - 2; f >= 0; f--) c[f] = c[f + 1] + (c[f] - c[f + 1]) * 0.88;
      // It never moves so fast that the ball leaves the picture.
      for (let f = 0; f < frames; f++) c[f] = Math.max(lo, Math.min(hi, Math.max(at(f) - room + margin, Math.min(at(f) - margin, c[f]))));
      return c;
    };
    const ballX = (f: number) => X(track.ball[f * 3]), ballY = (f: number) => Y(track.ball[f * 3 + 1]);
    if (st || (follow && playing)) {
      const centre = view[0] + view[1] / 2;
      camX = smooth((f) => Math.max(0, Math.min(W - vw, (follow || !st ? ballX(f) : (ballX(f) * 2 + centre) / 3) - vw / 2)), ballX, vw, 90 * zoom, 0, W - vw);
    }
    if (st) camY = smooth((f) => Math.max(0, Math.min(H - vh, ballY(f) - vh / 2)), ballY, vh, 60, 0, H - vh);
    const restore = () => { if ((camX || camY) && field) field.setAttribute("viewBox", `${home.current[0]} 0 ${home.current[1]} ${H}`); };

    if (st) st.setTrack(track, teams, offenseHome, Math.round(track.dur * 977 + track.pos.length * 31 + track.pos[0][0] * 13));

    const draw = (f: number, sec = f / track.rate) => {
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      // The same fit the field drawing uses: the stretch on show, whole and centered.
      const left = camX ? camX[f] : view[0], top = camY ? camY[f] : 0;
      if ((camX || camY) && field) field.setAttribute("viewBox", `${left} ${top} ${vw} ${vh}`);
      const k = Math.min(cw / vw, ch / vh);
      g.setTransform(k, 0, 0, k, (cw - vw * k) / 2 - left * k, (ch - vh * k) / 2 - top * k);
      g.imageSmoothingQuality = "high";
      if (st) st.draw(sec, [left, top, vw, vh], canvas.clientWidth, canvas.clientHeight, dpr);
      const figs = track.pos.map((_, i) => {
        if (!st) return figureAt(assets, track, i, f);
        const p = track.pos[i];
        return { x: p[f * 2], y: p[f * 2 + 1], d: 0, action: "idle", frame: 0, down: st.down(i, sec) };
      });
      // Men on the ground first, then far players before near ones, so the nearer overlap.
      const order = figs.map((_, i) => i).sort((a, b) => Number(figs[b].down) - Number(figs[a].down) || figs[b].y - figs[a].y);
      const s = size / index.size;
      if (!st) for (const i of order) {
        const fig = figs[i];
        const [c0] = index.actions[fig.action];
        g.fillStyle = "rgb(0 0 0 / 0.22)";
        g.beginPath(); g.ellipse(X(fig.x), Y(fig.y) + 1, size * 0.17, size * 0.08, 0, 0, Math.PI * 2); g.fill();
        g.drawImage(sheet(i), (c0 + fig.frame) * index.size, fig.d * index.size, index.size, index.size,
          X(fig.x) - index.foot[0] * s, Y(fig.y) - index.foot[1] * s, size, size);
      }
      // A flag thrown on the play lies where it landed.
      if (track.flag && f >= track.flag[0]) {
        g.fillStyle = "#ffd400"; g.strokeStyle = "rgb(0 0 0 / 0.6)"; g.lineWidth = 1;
        g.beginPath(); g.rect(X(track.flag[1]) - 4, Y(track.flag[2]) - 4, 8, 8); g.fill(); g.stroke();
      }
      // The ball, lifted off its shadow while it is in the air.
      const bx = X(track.ball[f * 3]), by = Y(track.ball[f * 3 + 1]), bh = track.ball[f * 3 + 2];
      if (!st && track.holder[f] < 0 && bh > 0.6) {
        g.fillStyle = "rgb(0 0 0 / 0.25)";
        g.beginPath(); g.ellipse(bx, by, 3.6, 2, 0, 0, Math.PI * 2); g.fill();
      }
      if (!st) {
        g.fillStyle = "#7a4521"; g.strokeStyle = "#fff"; g.lineWidth = 1;
        g.beginPath(); g.ellipse(bx, by - size * 0.12 - bh * 6, 4.2, 2.8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      // Numbers ride above each helmet; the men on the ball get their names.
      g.textAlign = "center"; g.lineJoin = "round";
      const names: [number, number, number][] = [];
      // Names go on last, so the numbers in a pile don't sit on top of them.
      for (const pass of [false, true]) for (const i of order) {
        const fig = figs[i], slot = track.slot[i];
        if (!slot) continue;
        const named = !!slot.name && track.named.some((n) => n.who === i && f >= n.from && f <= n.to);
        if (named !== pass) continue;
        const text = named ? `${slot.number ?? ""} ${slot.name}`.trim() : slot.number === null ? "" : String(slot.number);
        // The 3D players wear their numbers; only the men on the ball are labelled.
        if (!text || (st && !named)) continue;
        g.font = `${named ? 700 : 600} ${named ? 13 : 10.5}px system-ui, sans-serif`;
        g.lineWidth = 3; g.strokeStyle = "rgb(0 0 0 / 0.75)"; g.fillStyle = named ? "#ffe680" : "#fff";
        const head = st?.headAt(i);
        const tx = head ? head[0] : X(fig.x);
        let ty = head ? head[1] - (fig.down ? 6 : 9) - (named ? 4 : 0) : Y(fig.y) - size * (fig.down ? 0.3 : 0.52) - (named ? 4 : 0);
        if (named) {
          // Two names on the same pile: the second goes underneath.
          const w = g.measureText(text).width;
          while (names.some(([x, y, w2]) => Math.abs(x - tx) < (w + w2) / 2 + 2 && Math.abs(y - ty) < 13)) ty += 14;
          names.push([tx, ty, w]);
        }
        g.strokeText(text, tx, ty); g.fillText(text, tx, ty);
      }
      // Words over the top of the field: the call once the flag is down, or what became of a kick.
      if (track.caption && f >= track.caption[0]) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const text = track.caption[1];
        g.font = "700 13px system-ui, sans-serif";
        const w = g.measureText(text).width + 20, cx = canvas.clientWidth / 2;
        g.fillStyle = "#ffd400";
        g.beginPath(); g.roundRect(cx - w / 2, 8, w, 24, 5); g.fill();
        g.fillStyle = "#1a1a1a"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(text, cx, 20.5);
        g.textBaseline = "alphabetic";
      }
    };

    if (playing) {
      let raf = 0, last = performance.now(), s = 0, ended = false;
      const tick = (now: number) => {
        s += Math.min(0.1, (now - last) / 1000) * rate.current;
        last = now;
        draw(Math.min(frames - 1, Math.round(s * track.rate)), Math.min(track.dur, s));
        if (s >= track.dur) { if (!ended) { ended = true; done.current(); } return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // The field drawing gets its view back when the play is over or skipped: the view the game wants now, which
      // has usually moved on to where the play ended. Putting back the one from before the play left the yard lines
      // under the players in the wrong place.
      return () => { cancelAnimationFrame(raf); restore(); };
    }
    const paint = () => draw(0);
    paint();
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(paint);
    watch?.observe(canvas);
    return () => { watch?.disconnect(); restore(); };
  }, [assets, ready, teams[0], teams[1], offenseHome, view[0], view[1], follow, track, playing]);

  return (
    <>
      {model && <canvas ref={gl} className="gridiron-players" aria-hidden="true" />}
      <canvas ref={ref} className="gridiron-players" aria-hidden="true" />
    </>
  );
}
