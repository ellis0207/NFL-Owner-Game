// The graphics kit: gauges, bars, rings, sparklines, team badges and icons
// that turn a page's figures into pictures, so the owner reads the club at a
// glance the way a game's HUD shows it. Every piece draws only what the page
// already showed as text (stats, money, counts, staff words), never a rating.
// Where the page only ever showed a word (a staff read, a trust level), the
// picture places that word on its scale and shows nothing finer than the word.
// Colors come from the room tokens, so each piece fits light and dark pages.
import type { ReactNode } from "react";
import { TEAM_COLORS } from "../engine/teamColors";
import { tip } from "./tip";

export type Tone = "good" | "bad" | "warn" | undefined;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

// ---- Icons ----------------------------------------------------------------

/** Simple line icons, drawn on a 24-unit grid in the current text color. */
const PATHS: Record<string, string> = {
  football: "M4 20C4 11 11 4 20 4c0 9-7 16-16 16zM9 15l6-6M10.5 10.5l1.5 1.5M12 9l1.5 1.5M9 12l1.5 1.5",
  helmet: "M3 14a9 9 0 0 1 18-2v4h-7l-2 3H6a3 3 0 0 1-3-3zM14 16v-4h7M8 9h3",
  whistle: "M3 12a5 5 0 1 0 10 0V9h8V6H8A5 5 0 0 0 3 12zM8 12h.01",
  money: "M12 3v18M16.5 7.5C16 6 14.3 5 12 5 9.5 5 8 6.3 8 8s1.5 2.6 4 3 4 1.4 4 3.2S14.5 19 12 19c-2.4 0-4.2-1-4.6-2.6",
  cap: "M4 19h16M6 19V9M10 19V5M14 19v-8M18 19v-5",
  cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  trophy: "M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6",
  stadium: "M2 10c0-2 4.5-4 10-4s10 2 10 4v6c0 2-4.5 4-10 4S2 18 2 16zM2 10c0 2 4.5 4 10 4s10-2 10-4M7 13.5V19M17 13.5V19M12 14v6",
  ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10",
  briefcase: "M3 8h18v11H3zM8 8V5h8v3M3 13h18",
  chart: "M4 4v16h16M8 16v-5M12 16V8M16 16v-8",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  megaphone: "M3 10v4h3l8 5V5L6 10zM18 9a4 4 0 0 1 0 6",
  mail: "M3 6h18v12H3zM3 6l9 7 9-7",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  check: "M4 12l5 5L20 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a7 7 0 0 1 4 7",
  handshake: "M2 11l4-4 4 2 3-2 4 1 5 4M2 11l7 7 2-1 2 2 2-1 2 1 5-6M9 10l3 3",
  scales: "M12 3v18M7 21h10M4 7h16M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z",
  building: "M4 21V5l8-3 8 3v16zM9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4",
  star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z",
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  flame: "M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-1 1-6 1-9z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  bank: "M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18",
  heart: "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11h.01",
  school: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6",
  clipboard: "M8 4h8v3H8zM6 5H5v16h14V5h-1M8 12h8M8 16h5",
  store: "M3 9l2-5h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5",
  tv: "M3 6h18v12H3zM8 21h8M9 2l3 3 3-3",
  gavel: "M14 4l6 6M11 7l6 6M12.5 5.5l-6 6 4 4 6-6M8.5 13.5L3 19l2 2 5.5-5.5M13 21h8",
  key: "M15 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM10 13l-7 7v2h3v-2h2v-2h2l1.5-1.5",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  save: "M4 4h13l3 3v13H4zM8 4v5h7V4M8 20v-6h8v6",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  book: "M4 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-6M20 4v15h-6",
  pick: "M5 3h14v18l-7-4-7 4z",
  swap: "M4 8h14l-4-4M20 16H6l4 4",
  pen: "M4 20l4-1 11-11-3-3L5 16zM14 7l3 3",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  flat: "M5 12h14",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className, title }: { name: IconName | string; size?: number; className?: string; title?: string }) {
  const d = PATHS[name] ?? PATHS.star;
  return (
    <svg className={`gx-icon${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={d} />
    </svg>
  );
}

/** A panel heading with its icon in a colored tile. */
export function IconHead({ icon, children, tone, sub }: { icon: IconName | string; children: ReactNode; tone?: Tone; sub?: ReactNode }) {
  return (
    <div className={`gx-head${tone ? ` ${tone}` : ""}`}>
      <span className="gx-head-icon"><Icon name={icon} size={18} /></span>
      <div className="gx-head-text"><strong>{children}</strong>{sub && <span className="muted">{sub}</span>}</div>
    </div>
  );
}

// ---- Team badges ----------------------------------------------------------

/** Light text on a dark color, dark text on a light one. */
function inkOn(hex: string): string {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#10161d" : "#ffffff";
}

/** A club's two colors, with a steady made-up pair for a club the table doesn't know (expansion, colleges). */
export function colorsOf(team: string): [string, string] {
  const known = TEAM_COLORS[team];
  if (known) return known;
  let h = 0;
  for (const ch of team) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return [`hsl(${h} 55% 32%)`, `hsl(${(h + 150) % 360} 60% 55%)`];
}

/** A club's shield in its colors with its abbreviation; hovering it opens the club's card. */
export function TeamBadge({ team, size = 26, label, noTip }: { team: string; size?: number; label?: string; noTip?: boolean }) {
  const [a, b] = colorsOf(team);
  const ink = a.startsWith("#") ? inkOn(a) : "#ffffff";
  const text = label ?? team;
  return (
    <span className="gx-badge" style={{ width: size, height: size * 1.1 }} {...(noTip || !TEAM_COLORS[team] ? {} : tip("team", team))}>
      <svg viewBox="0 0 40 44" width={size} height={size * 1.1} aria-hidden="true">
        <path d="M20 1l18 6v14c0 11-8 18-18 22C10 39 2 32 2 21V7z" fill={a} stroke={b} strokeWidth="3" />
        <path d="M20 5l14 4.6V21c0 8.6-6 14.3-14 17.6" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
        <text x="20" y={text.length > 3 ? 26 : 27} textAnchor="middle" fontSize={text.length > 3 ? 10 : text.length > 2 ? 12 : 14}
          fontWeight="700" fill={ink} fontFamily="Oswald, 'Barlow Condensed', sans-serif">{text}</text>
      </svg>
    </span>
  );
}

/** A badge with the club's name beside it. */
export function TeamTag({ team, name, size = 20 }: { team: string; name?: ReactNode; size?: number }) {
  return <span className="gx-teamtag"><TeamBadge team={team} size={size} noTip />{<span {...(TEAM_COLORS[team] ? tip("team", team) : {})}>{name ?? team}</span>}</span>;
}

/** Two clubs face to face: a matchup card head. */
export function Versus({ away, home, awayLabel, homeLabel, mid }: { away: string; home: string; awayLabel?: ReactNode; homeLabel?: ReactNode; mid?: ReactNode }) {
  return (
    <div className="gx-vs">
      <span className="gx-vs-side"><TeamBadge team={away} size={34} />{awayLabel && <span>{awayLabel}</span>}</span>
      <span className="gx-vs-mid">{mid ?? "@"}</span>
      <span className="gx-vs-side home">{homeLabel && <span>{homeLabel}</span>}<TeamBadge team={home} size={34} /></span>
    </div>
  );
}

// ---- Gauges and meters ----------------------------------------------------

function toneVar(t: Tone): string {
  return t === "good" ? "var(--good)" : t === "bad" ? "var(--bad)" : t === "warn" ? "var(--warn)" : "var(--room-accent, var(--team))";
}

/** A tone from a share where high is good (or bad, with `invert`). */
export function toneFor(v: number, invert = false, cut: [number, number] = [0.33, 0.66]): Tone {
  const x = invert ? 1 - v : v;
  return x < cut[0] ? "bad" : x < cut[1] ? "warn" : "good";
}

/**
 * A half-dial speedometer. `value` is a share from 0 to 1; the needle and the
 * colored arc show it, the big text is whatever the page showed before.
 */
export function Gauge({ value, label, text, tone, sub, size = 132, zones }: {
  value: number; label: ReactNode; text?: ReactNode; tone?: Tone; sub?: ReactNode; size?: number; zones?: boolean;
}) {
  const v = clamp01(value);
  const r = 40, cx = 50, cy = 50;
  const pt = (t: number, rr = r) => [cx - rr * Math.cos(Math.PI * t), cy - rr * Math.sin(Math.PI * t)];
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const [nx, ny] = pt(v, 33);
  return (
    <figure className={`gx-gauge${tone ? ` ${tone}` : ""}`} style={{ width: size }}>
      <svg viewBox="0 0 100 58" width={size} height={size * 0.58} role="img" aria-label={`${Math.round(v * 100)}%`}>
        <path d={arc(0, 1)} className="gx-gauge-track" />
        {zones && <>
          <path d={arc(0, 0.33)} className="gx-gauge-zone bad" />
          <path d={arc(0.33, 0.66)} className="gx-gauge-zone warn" />
          <path d={arc(0.66, 1)} className="gx-gauge-zone good" />
        </>}
        {!zones && v > 0.001 && <path d={arc(0, v)} className="gx-gauge-fill" style={{ stroke: toneVar(tone) }} />}
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="gx-gauge-needle" />
        <circle cx={cx} cy={cy} r="4" className="gx-gauge-hub" />
      </svg>
      {text !== undefined && <strong className="gx-gauge-text">{text}</strong>}
      <figcaption className="gx-gauge-label">{label}</figcaption>
      {sub && <span className="gx-gauge-sub">{sub}</span>}
    </figure>
  );
}

/** A ring that fills for a share: seats sold, a count against a limit. */
export function Ring({ value, label, text, tone, size = 84, sub }: { value: number; label?: ReactNode; text?: ReactNode; tone?: Tone; size?: number; sub?: ReactNode }) {
  const v = clamp01(value);
  const c = 2 * Math.PI * 15.5;
  return (
    <figure className={`gx-ring${tone ? ` ${tone}` : ""}`}>
      <span className="gx-ring-dial" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" width={size} height={size} role="img" aria-label={`${Math.round(v * 100)}%`}>
          <circle cx="18" cy="18" r="15.5" className="gx-ring-track" />
          <circle cx="18" cy="18" r="15.5" className="gx-ring-fill" style={{ stroke: toneVar(tone), strokeDasharray: `${(v * c).toFixed(2)} ${c.toFixed(2)}` }} />
        </svg>
        <strong className="gx-ring-text">{text ?? `${Math.round(v * 100)}%`}</strong>
      </span>
      {label && <figcaption className="gx-ring-label">{label}</figcaption>}
      {sub && <span className="gx-ring-sub">{sub}</span>}
    </figure>
  );
}

/** A row of gauges or rings. */
export function Dials({ children }: { children: ReactNode }) {
  return <div className="gx-dials">{children}</div>;
}

/**
 * Where a word sits on its scale: a gradient bar with a marker at the word's
 * step. Used for staff reads and moods the page shows only as words.
 */
export function WordScale({ steps, at, label, invert, compact }: { steps: string[]; at: number; label?: ReactNode; invert?: boolean; compact?: boolean }) {
  const i = Math.max(0, Math.min(steps.length - 1, at));
  const pos = steps.length > 1 ? i / (steps.length - 1) : 0.5;
  return (
    <div className={`gx-scale${invert ? " invert" : ""}${compact ? " compact" : ""}${label ? "" : " nolabel"}`}>
      {label && <span className="gx-scale-label">{label}</span>}
      <span className="gx-scale-bar" role="img" aria-label={steps[i]}>
        {steps.map((_, k) => <span key={k} className={`gx-scale-step${k === i ? " on" : ""}`} />)}
        <span className="gx-scale-mark" style={{ left: `${pos * 100}%` }} />
      </span>
      <span className="gx-scale-word">{steps[i]}</span>
    </div>
  );
}

/** Finds a word on its scale by the start of each step (case-insensitive); -1 when it isn't there. */
export function stepOf(steps: string[], word: string): number {
  const w = word.toLowerCase();
  return steps.findIndex((s) => w.startsWith(s.toLowerCase()) || s.toLowerCase().startsWith(w));
}

/** Discrete pips: three of five, timeouts left, stars earned. */
export function Pips({ n, of, tone, label }: { n: number; of: number; tone?: Tone; label?: ReactNode }) {
  return (
    <span className={`gx-pips${tone ? ` ${tone}` : ""}`} role="img" aria-label={`${n} of ${of}`}>
      {Array.from({ length: Math.max(0, of) }, (_, i) => <span key={i} className={i < n ? "on" : ""} />)}
      {label && <span className="gx-pips-label">{label}</span>}
    </span>
  );
}

// ---- Bars and charts -------------------------------------------------------

export interface BarRow { label: ReactNode; value: number; text?: ReactNode; tone?: Tone; color?: string; key?: string; icon?: ReactNode }

/**
 * A horizontal bar chart: one labeled bar per row, scaled to the largest (or
 * to `max`). Negative values draw to the left of a center line.
 */
export function Bars({ rows, max, signed }: { rows: BarRow[]; max?: number; signed?: boolean }) {
  const top = max ?? Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className={`gx-bars${signed ? " signed" : ""}`}>
      {rows.map((r, i) => {
        const w = clamp01(Math.abs(r.value) / top) * (signed ? 50 : 100);
        const style = signed
          ? { width: `${w}%`, left: r.value < 0 ? `${50 - w}%` : "50%", background: r.color ?? (r.value < 0 ? "var(--bad)" : toneVar(r.tone)) }
          : { width: `${w}%`, background: r.color ?? toneVar(r.tone) };
        return (
          <div className="gx-bar" key={r.key ?? i}>
            <span className="gx-bar-label">{r.icon}{r.label}</span>
            <span className="gx-bar-track"><span className="gx-bar-fill" style={style} /></span>
            <span className="gx-bar-text">{r.text ?? r.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface Part { label: string; value: number; color?: string; text?: string }

const PALETTE = ["var(--room-accent, var(--team))", "var(--team)", "var(--good)", "var(--warn)", "#7a6fd0", "#3a9bc4", "#c45a8a", "var(--muted)"];

/** One bar split into parts with a legend: cap by position group, revenue by source. */
export function Stacked({ parts, total, label }: { parts: Part[]; total?: number; label?: ReactNode }) {
  const pos = parts.filter((p) => p.value > 0);
  const sum = total ?? pos.reduce((s, p) => s + p.value, 0);
  return (
    <div className="gx-stack">
      {label && <span className="gx-stack-title">{label}</span>}
      <span className="gx-stack-bar" role="img" aria-label={pos.map((p) => p.label).join(", ")}>
        {pos.map((p, i) => <span key={p.label} title={`${p.label}: ${p.text ?? p.value}`} style={{ width: `${(p.value / Math.max(sum, 1e-9)) * 100}%`, background: p.color ?? PALETTE[i % PALETTE.length] }} />)}
      </span>
      <span className="gx-legend">
        {pos.map((p, i) => <span key={p.label}><i style={{ background: p.color ?? PALETTE[i % PALETTE.length] }} />{p.label}{p.text && <b>{p.text}</b>}</span>)}
      </span>
    </div>
  );
}

/** A donut of parts with the total in the middle. */
export function Donut({ parts, center, size = 120, label }: { parts: Part[]; center?: ReactNode; size?: number; label?: ReactNode }) {
  const pos = parts.filter((p) => p.value > 0);
  const sum = pos.reduce((s, p) => s + p.value, 0) || 1;
  const c = 2 * Math.PI * 15.5;
  let at = 0;
  return (
    <figure className="gx-donut">
      <span className="gx-ring-dial" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" width={size} height={size} role="img" aria-label={pos.map((p) => p.label).join(", ")}>
          <circle cx="18" cy="18" r="15.5" className="gx-ring-track" />
          {pos.map((p, i) => {
            const len = (p.value / sum) * c;
            const el = <circle key={p.label} cx="18" cy="18" r="15.5" className="gx-donut-part"
              style={{ stroke: p.color ?? PALETTE[i % PALETTE.length], strokeDasharray: `${len.toFixed(2)} ${c.toFixed(2)}`, strokeDashoffset: (-at).toFixed(2) }} />;
            at += len;
            return el;
          })}
        </svg>
        {center && <strong className="gx-ring-text">{center}</strong>}
      </span>
      <span className="gx-legend vertical">
        {pos.map((p, i) => <span key={p.label}><i style={{ background: p.color ?? PALETTE[i % PALETTE.length] }} />{p.label}{p.text && <b>{p.text}</b>}</span>)}
      </span>
      {label && <figcaption className="gx-ring-label">{label}</figcaption>}
    </figure>
  );
}

/** A small line of values over time, with the last point marked. */
export function Spark({ values, width = 110, height = 30, tone, label, fill = true }: { values: number[]; width?: number; height?: number; tone?: Tone; label?: ReactNode; fill?: boolean }) {
  const vs = values.filter((v) => Number.isFinite(v));
  if (vs.length < 2) return null;
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || 1;
  const pts = vs.map((v, i) => [(i / (vs.length - 1)) * (width - 4) + 2, height - 3 - ((v - lo) / span) * (height - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <span className={`gx-spark${tone ? ` ${tone}` : ""}`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend">
        {fill && <path d={`${line}L${lx.toFixed(1)} ${height}L2 ${height}Z`} className="gx-spark-area" style={{ fill: toneVar(tone) }} />}
        <path d={line} className="gx-spark-line" style={{ stroke: toneVar(tone) }} />
        <circle cx={lx} cy={ly} r="2.5" style={{ fill: toneVar(tone) }} />
      </svg>
      {label && <span className="gx-spark-label">{label}</span>}
    </span>
  );
}

/** Columns for a short series: seasons, months. Negative columns hang below the line. */
export function Columns({ values, labels, height = 90, tone, format }: { values: number[]; labels?: string[]; height?: number; tone?: Tone; format?: (v: number) => string }) {
  const top = Math.max(1e-9, ...values.map((v) => Math.abs(v)));
  const anyNeg = values.some((v) => v < 0);
  return (
    <div className="gx-cols" style={{ height }}>
      {values.map((v, i) => {
        const h = (Math.abs(v) / top) * (anyNeg ? 50 : 100);
        return (
          <span key={i} className="gx-col" title={`${labels?.[i] ?? ""} ${format ? format(v) : v}`}>
            <span className="gx-col-area">
              <span className={`gx-col-bar${v < 0 ? " neg" : ""}`} style={{ height: `${h}%`, bottom: anyNeg ? (v < 0 ? `${50 - h}%` : "50%") : 0, background: v < 0 ? "var(--bad)" : toneVar(tone) }} />
            </span>
            {labels && <span className="gx-col-label">{labels[i]}</span>}
          </span>
        );
      })}
    </div>
  );
}

// ---- Results and trends ---------------------------------------------------

/** Wins and losses as colored chips, oldest first. */
export function FormChips({ results }: { results: ("W" | "L" | "T")[] }) {
  return <span className="gx-form">{results.map((r, i) => <span key={i} className={`gx-form-${r}`}>{r}</span>)}</span>;
}

/** An arrow for which way something moved. */
export function Trend({ delta, text, invert }: { delta: number; text?: ReactNode; invert?: boolean }) {
  const up = delta > 0, flat = delta === 0;
  const good = flat ? undefined : up !== !!invert;
  return (
    <span className={`gx-trend${flat ? "" : good ? " good" : " bad"}`}>
      <Icon name={flat ? "flat" : up ? "up" : "down"} size={13} />{text}
    </span>
  );
}

/** A big figure with an icon, for a HUD strip across a page. */
export function HudStat({ icon, label, value, tone, sub }: { icon: IconName | string; label: ReactNode; value: ReactNode; tone?: Tone; sub?: ReactNode }) {
  return (
    <div className={`gx-hud-stat${tone ? ` ${tone}` : ""}`}>
      <span className="gx-hud-icon"><Icon name={icon} size={20} /></span>
      <span className="gx-hud-body">
        <span className="gx-hud-label">{label}</span>
        <strong className="gx-hud-value">{value}</strong>
        {sub && <span className="gx-hud-sub">{sub}</span>}
      </span>
    </div>
  );
}

/** The strip that holds HUD figures. */
export function Hud({ children }: { children: ReactNode }) {
  return <div className="gx-hud">{children}</div>;
}

/** A small rounded label with an icon: a status, a type, a flag. */
export function Chip({ icon, children, tone }: { icon?: IconName | string; children: ReactNode; tone?: Tone }) {
  return <span className={`gx-chip${tone ? ` ${tone}` : ""}`}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

/**
 * A row of milestones with today's place marked: the ones behind us filled,
 * the next one lit. Dates are ISO strings, compared as strings.
 */
export function Timeline({ points, today }: { points: { label: ReactNode; date: string; sub?: ReactNode }[]; today: string }) {
  const next = points.findIndex((p) => p.date > today);
  return (
    <ol className="gx-line">
      {points.map((p, i) => (
        <li key={i} className={p.date <= today ? "past" : i === next ? "next" : ""}>
          <span className="gx-line-dot" />
          <span className="gx-line-label">{p.label}</span>
          {p.sub && <span className="gx-line-sub">{p.sub}</span>}
        </li>
      ))}
    </ol>
  );
}

/** A person's initials in a disc, ringed in a color: staff cards, executives, partners. */
export function Avatar({ name, size = 44, icon, color }: { name: string; size?: number; icon?: IconName | string; color?: string }) {
  const initials = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="gx-avatar" style={{ width: size, height: size, fontSize: size * 0.36, ["--av" as string]: color ?? "var(--room-accent, var(--team))" }}>
      {initials || "?"}
      {icon && <span className="gx-avatar-icon"><Icon name={icon} size={Math.max(11, size * 0.3)} /></span>}
    </span>
  );
}

/**
 * A scatter of clubs (or anything) on two axes, each point drawn as its badge.
 * `invertY` puts low values at the top (defense allowed: lower is better).
 */
export function Scatter({ points, xLabel, yLabel, invertY, height = 320 }: {
  points: { x: number; y: number; team?: string; label?: string; key: string; mine?: boolean }[];
  xLabel: ReactNode; yLabel: ReactNode; invertY?: boolean; height?: number;
}) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const px = (x: number) => 4 + ((x - x0) / (x1 - x0 || 1)) * 92;
  const py = (y: number) => { const t = (y - y0) / (y1 - y0 || 1); return 4 + (invertY ? t : 1 - t) * 92; };
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  return (
    <figure className="gx-scatter" style={{ height }}>
      <div className="gx-scatter-plot">
        <span className="gx-scatter-axis v" style={{ left: `${px(mx)}%` }} />
        <span className="gx-scatter-axis h" style={{ top: `${py(my)}%` }} />
        {points.map((p) => (
          <span key={p.key} className={`gx-scatter-pt${p.mine ? " mine" : ""}`} style={{ left: `${px(p.x)}%`, top: `${py(p.y)}%` }}>
            {p.team ? <TeamBadge team={p.team} size={p.mine ? 26 : 20} /> : <span className="gx-scatter-dot" title={p.label} />}
          </span>
        ))}
      </div>
      <figcaption className="gx-scatter-x">{xLabel} →</figcaption>
      <figcaption className="gx-scatter-y">{yLabel} →</figcaption>
    </figure>
  );
}

/** A ranked leaderboard: rank, who, a bar against the leader, the figure. */
export function Leaderboard({ rows, onPick }: { rows: { key: string; who: ReactNode; team?: string; value: number; text?: ReactNode; sub?: ReactNode; mine?: boolean }[]; onPick?: (key: string) => void }) {
  const top = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ol className="gx-board">
      {rows.map((r, i) => (
        <li key={r.key} className={r.mine ? "mine" : undefined} onClick={onPick ? () => onPick(r.key) : undefined} style={onPick ? { cursor: "pointer" } : undefined}>
          <span className={`gx-board-rank r${i + 1}`}>{i + 1}</span>
          {r.team && <TeamBadge team={r.team} size={22} noTip />}
          <span className="gx-board-who">{r.who}{r.sub && <span className="muted">{r.sub}</span>}</span>
          <span className="gx-board-val">{r.text ?? r.value}</span>
          <span className="gx-board-bar"><span style={{ width: `${(Math.abs(r.value) / top) * 100}%` }} /></span>
        </li>
      ))}
    </ol>
  );
}

/** A letter grade as a colored tile: A green down to F red. */
export function Grade({ g, title }: { g: string; title?: string }) {
  const k = g.trim().charAt(0).toUpperCase();
  return <span className={`gx-grade g-${"ABCDF".includes(k) ? k : "C"}`} title={title}>{g}</span>;
}
