import { useEffect, useRef } from "react";
import { TEAM_COLORS } from "../../engine/teamColors";
import { teamSheet, type AnimAssets } from "./assets";
import type { Slot, Track } from "./stage";

// The field drawing's own measure (GameCast.tsx): ten units to the yard, end zones included.
const H = 533, MID = H / 2;
const X = (x: number) => 100 + x * 10;
const Y = (y: number) => MID - y * 10;
// Players are drawn larger than life so they can be told apart from the upper deck.
const SCALE = 1.7;

/** Both teams before the snap. */
export interface Still {
  roles: string[];
  offense: number;
  spots: [number, number][];
  dir: 1 | -1;
}

interface Props {
  assets: AnimAssets;
  /** The clubs on offense and defense, and whether the offense is the home team. */
  teams: [string, string];
  offenseHome: boolean;
  slots: Record<string, Slot>;
  /** The stretch of the field drawing on show: left edge and width, in its units. */
  view: [number, number];
  still: Still | null;
  track: Track | null;
  speed: number;
  onEnd: () => void;
}

interface Figure { x: number; y: number; d: number; action: string; frame: number; role: string; team: 0 | 1; label: string }

const facing = (vx: number, vy: number) => ((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8;

function figuresAt(a: AnimAssets, t: Track, s: number): { figs: Figure[]; ball: [number, number] } {
  const f = Math.min(t.pos[0].length / 2 - 1, Math.max(0, Math.round(s * t.rate)));
  const figs: Figure[] = t.roles.map((role, r) => {
    const p = t.pos[r];
    const a0 = Math.max(0, f - 2), b0 = Math.min(p.length / 2 - 1, f + 2);
    const vx = (p[b0 * 2] - p[a0 * 2]) / ((b0 - a0) / t.rate), vy = (p[b0 * 2 + 1] - p[a0 * 2 + 1]) / ((b0 - a0) / t.rate);
    const team: 0 | 1 = r < t.offense ? 0 : 1;
    const home = team === 0 ? t.dir : -t.dir;
    let action = "idle", frame = 0, d = home > 0 ? 0 : 4;
    if (Math.hypot(vx, vy) > 1.2) {
      d = facing(vx, vy);
      action = r === t.carrier && s >= t.handoff ? "carry" : "run";
      frame = Math.floor(t.dist[r][f] / 0.55) % 8;
    }
    // Going to ground: the carrier at the whistle, the tackler a beat before it.
    const fall = r === t.carrier && !t.score ? s - t.end : r === t.tackler ? s - t.end + 0.15 : -1;
    if (fall >= 0) {
      const e = Math.max(1, Math.round(t.end * t.rate) - 3);
      d = facing(p[e * 2 + 2] - p[e * 2 - 2] || home, p[e * 2 + 3] - p[e * 2 - 1]);
      const n = a.index.actions.dive[1];
      const k = Math.floor(fall / 0.3 * n);
      action = k >= n ? "down" : "dive";
      frame = k >= n ? 0 : k;
    }
    return { x: p[f * 2], y: p[f * 2 + 1], d, action, frame, role, team, label: "" };
  });
  // The ball: snapped to the quarterback, handed to the carrier.
  const snap = Math.min(1, s / 0.25);
  const c = t.roles.indexOf("C");
  const who = s >= t.handoff ? t.carrier : t.from;
  const hx = figs[who].x, hy = figs[who].y;
  const ball: [number, number] = s >= t.handoff || c < 0 ? [hx, hy] : [figs[c].x + (hx - figs[c].x) * snap, figs[c].y + (hy - figs[c].y) * snap];
  return { figs, ball };
}

/**
 * The players, drawn over the field: standing in formation before a snap, or
 * moving through a play. It draws on a canvas laid exactly over the field's
 * drawing and tells the game view when the play is over.
 */
export function FieldPlayers({ assets, teams, offenseHome, slots, view, still, track, speed, onEnd }: Props) {
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
    const sheet = (role: string, team: 0 | 1) => teamSheet(assets, assets.book.bodies[role] ?? "skill", colors(teams[team]), team === 0 ? offenseHome : !offenseHome);
    const size = index.span * 10 * SCALE;

    const draw = (figs: Figure[], ball: [number, number] | null, tags: number[]) => {
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      // The same fit the field drawing uses: the stretch on show, whole and centered.
      const k = Math.min(cw / view[1], ch / H);
      g.setTransform(k, 0, 0, k, (cw - view[1] * k) / 2 - view[0] * k, (ch - H * k) / 2);
      g.imageSmoothingQuality = "high";
      // Far players first, so nearer ones overlap them.
      const order = figs.map((_, i) => i).sort((a, b) => figs[b].y - figs[a].y);
      for (const i of order) {
        const f = figs[i];
        const [c0] = index.actions[f.action];
        const s = size / index.size;
        g.fillStyle = "rgb(0 0 0 / 0.22)";
        g.beginPath(); g.ellipse(X(f.x), Y(f.y) + 1, size * 0.17, size * 0.08, 0, 0, Math.PI * 2); g.fill();
        g.drawImage(sheet(f.role, f.team), (c0 + f.frame) * index.size, f.d * index.size, index.size, index.size,
          X(f.x) - index.foot[0] * s, Y(f.y) - index.foot[1] * s, size, size);
      }
      if (ball) {
        g.fillStyle = "#7a4521"; g.strokeStyle = "#fff"; g.lineWidth = 1;
        g.beginPath(); g.ellipse(X(ball[0]), Y(ball[1]) - size * 0.2, 4.2, 2.8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      // Numbers ride above each helmet; the men on the ball get their names.
      g.textAlign = "center"; g.lineJoin = "round";
      for (const i of order) {
        const f = figs[i], slot = slots[`${f.team}:${f.role}`];
        if (!slot) continue;
        const named = tags.includes(i) && slot.name;
        const text = named ? `${slot.number ?? ""} ${slot.name}`.trim() : slot.number === null ? "" : String(slot.number);
        if (!text) continue;
        g.font = `${named ? 700 : 600} ${named ? 13 : 10.5}px system-ui, sans-serif`;
        g.lineWidth = 3; g.strokeStyle = "rgb(0 0 0 / 0.75)"; g.fillStyle = named ? "#ffe680" : "#fff";
        const ty = Y(f.y) - size * (f.action === "down" ? 0.3 : 0.52) - (named ? 4 : 0);
        g.strokeText(text, X(f.x), ty); g.fillText(text, X(f.x), ty);
      }
    };

    if (track) {
      let raf = 0, last = performance.now(), s = 0, ended = false;
      const tick = (now: number) => {
        s += Math.min(0.1, (now - last) / 1000) * rate.current;
        last = now;
        const { figs, ball } = figuresAt(assets, track, s);
        draw(figs, ball, [s >= track.handoff ? track.carrier : track.from, ...(s >= track.end && track.tackler >= 0 ? [track.tackler] : [])]);
        if (s >= track.dur) { if (!ended) { ended = true; done.current(); } return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const paint = () => {
      if (!still) { draw([], null, []); return; }
      const figs: Figure[] = still.roles.map((role, r) => {
        const team: 0 | 1 = r < still.offense ? 0 : 1;
        return { x: still.spots[r][0], y: still.spots[r][1], d: (team === 0 ? still.dir : -still.dir) > 0 ? 0 : 4, action: "idle", frame: 0, role, team, label: "" };
      });
      const c = still.roles.indexOf("C");
      draw(figs, c < 0 ? null : [still.spots[c][0] + still.dir * 0.4, still.spots[c][1] - 0.5], [still.roles.indexOf("QB")]);
    };
    paint();
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(paint);
    watch?.observe(canvas);
    return () => watch?.disconnect();
  }, [assets, teams[0], teams[1], offenseHome, slots, view[0], view[1], still, track]);

  return <canvas ref={ref} className="gridiron-players" aria-hidden="true" />;
}
