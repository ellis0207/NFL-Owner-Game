import { useEffect, useRef } from "react";
import { TEAM_COLORS } from "../../engine/teamColors";
import { teamSheet, type AnimAssets } from "./assets";
import { ACT, type Track } from "./book";

// The field drawing's own measure (GameCast.tsx): ten units to the yard, end zones included.
const W = 1200, H = 533, MID = H / 2;
const X = (x: number) => 100 + x * 10;
const Y = (y: number) => MID - y * 10;
// Players are drawn larger than life so they can be told apart from the upper deck.
const SCALE = 1.7;

interface Props {
  assets: AnimAssets;
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
export function FieldPlayers({ assets, teams, offenseHome, view, follow, home, track, playing, speed, onEnd }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
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
    const sheet = (i: number) => teamSheet(assets, index.bodies.includes(track.body[i]) ? track.body[i] : "skill", colors(teams[track.team[i]]), track.team[i] === 0 ? offenseHome : !offenseHome);
    const size = index.span * 10 * SCALE;
    const frames = track.pos[0].length / 2;
    // The camera on a long play: it keeps the ball in the picture, smoothed both ways in time so it neither lurches nor lags.
    let cam: Float32Array | null = null;
    const field = canvas.parentElement?.querySelector("svg.gridiron") ?? null;
    if (follow && playing) {
      cam = new Float32Array(frames);
      const want = (f: number) => Math.max(0, Math.min(W - view[1], X(track.ball[f * 3]) - view[1] / 2));
      cam[0] = want(0);
      for (let f = 1; f < frames; f++) cam[f] = cam[f - 1] + (want(f) - cam[f - 1]) * 0.12;
      for (let f = frames - 2; f >= 0; f--) cam[f] = cam[f + 1] + (cam[f] - cam[f + 1]) * 0.88;
      // It never moves so fast that the ball leaves the picture.
      for (let f = 0; f < frames; f++) cam[f] = Math.max(X(track.ball[f * 3]) - view[1] + 90, Math.min(X(track.ball[f * 3]) - 90, cam[f]));
      for (let f = 0; f < frames; f++) cam[f] = Math.max(0, Math.min(W - view[1], cam[f]));
    }

    const draw = (f: number) => {
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      // The same fit the field drawing uses: the stretch on show, whole and centered.
      const left = cam ? cam[f] : view[0];
      if (cam && field) field.setAttribute("viewBox", `${left} 0 ${view[1]} ${H}`);
      const k = Math.min(cw / view[1], ch / H);
      g.setTransform(k, 0, 0, k, (cw - view[1] * k) / 2 - left * k, (ch - H * k) / 2);
      g.imageSmoothingQuality = "high";
      const figs = track.pos.map((_, i) => figureAt(assets, track, i, f));
      // Men on the ground first, then far players before near ones, so the nearer overlap.
      const order = figs.map((_, i) => i).sort((a, b) => Number(figs[b].down) - Number(figs[a].down) || figs[b].y - figs[a].y);
      const s = size / index.size;
      for (const i of order) {
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
      if (track.holder[f] < 0 && bh > 0.6) {
        g.fillStyle = "rgb(0 0 0 / 0.25)";
        g.beginPath(); g.ellipse(bx, by, 3.6, 2, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = "#7a4521"; g.strokeStyle = "#fff"; g.lineWidth = 1;
      g.beginPath(); g.ellipse(bx, by - size * 0.12 - bh * 6, 4.2, 2.8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      // Numbers ride above each helmet; the men on the ball get their names.
      g.textAlign = "center"; g.lineJoin = "round";
      const names: [number, number, number][] = [];
      for (const i of order) {
        const fig = figs[i], slot = track.slot[i];
        if (!slot) continue;
        const named = !!slot.name && track.named.some((n) => n.who === i && f >= n.from && f <= n.to);
        const text = named ? `${slot.number ?? ""} ${slot.name}`.trim() : slot.number === null ? "" : String(slot.number);
        if (!text) continue;
        g.font = `${named ? 700 : 600} ${named ? 13 : 10.5}px system-ui, sans-serif`;
        g.lineWidth = 3; g.strokeStyle = "rgb(0 0 0 / 0.75)"; g.fillStyle = named ? "#ffe680" : "#fff";
        let ty = Y(fig.y) - size * (fig.down ? 0.3 : 0.52) - (named ? 4 : 0);
        if (named) {
          // Two names on the same pile: the second goes underneath.
          const w = g.measureText(text).width;
          while (names.some(([x, y, w2]) => Math.abs(x - X(fig.x)) < (w + w2) / 2 + 2 && Math.abs(y - ty) < 13)) ty += 14;
          names.push([X(fig.x), ty, w]);
        }
        g.strokeText(text, X(fig.x), ty); g.fillText(text, X(fig.x), ty);
      }
    };

    if (playing) {
      let raf = 0, last = performance.now(), s = 0, ended = false;
      const tick = (now: number) => {
        s += Math.min(0.1, (now - last) / 1000) * rate.current;
        last = now;
        draw(Math.min(frames - 1, Math.round(s * track.rate)));
        if (s >= track.dur) { if (!ended) { ended = true; done.current(); } return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // The field drawing gets its view back when the play is over or skipped: the view the game wants now, which
      // has usually moved on to where the play ended. Putting back the one from before the play left the yard lines
      // under the players in the wrong place.
      return () => { cancelAnimationFrame(raf); if (cam && field) field.setAttribute("viewBox", `${home.current[0]} 0 ${home.current[1]} ${H}`); };
    }
    const paint = () => draw(0);
    paint();
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(paint);
    watch?.observe(canvas);
    return () => watch?.disconnect();
  }, [assets, teams[0], teams[1], offenseHome, view[0], view[1], follow, track, playing]);

  return <canvas ref={ref} className="gridiron-players" aria-hidden="true" />;
}
