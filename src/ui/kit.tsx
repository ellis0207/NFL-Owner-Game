// Shared pieces for the rooms. Each takes its colors and type from the room
// it sits in (the data-room tokens in styles/rooms), so the same tile reads
// as a scoreboard figure in the League room and a ledger total in the cap
// office. They show only what the owner can see: stats, money, counts and
// staff reports, never a rating.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Voice } from "../engine/types";

type Tone = "good" | "bad" | "warn" | undefined;

/** A headline figure: a big number, what it is, and a line under it. */
export function StatTile({ label, value, note, tone }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: Tone }) {
  return (
    <div className={`kit-tile${tone ? ` ${tone}` : ""}`}>
      <span className="kit-tile-label">{label}</span>
      <strong className="kit-tile-value">{typeof value === "string" ? <CountUp text={value} fromZero /> : value}</strong>
      {note !== undefined && <span className="kit-tile-note">{note}</span>}
    </div>
  );
}

/** A row of headline figures. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="kit-tiles">{children}</div>;
}

/** A panel with a small kicker over its title and room for actions. */
export function Card({ title, kicker, actions, children, className }: {
  title?: ReactNode; kicker?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={`kit-card${className ? ` ${className}` : ""}`}>
      {(title || kicker || actions) && (
        <header className="kit-card-head">
          <div>
            {kicker && <span className="kit-card-kicker">{kicker}</span>}
            {title && <h3 className="kit-card-title">{title}</h3>}
          </div>
          {actions && <div className="btn-row">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A note set apart from the page: a warning, a good sign, or plain information. */
export function Callout({ tone, title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`kit-callout${tone ? ` ${tone}` : ""}`} role="note">
      {title && <strong className="kit-callout-title">{title}</strong>}
      {children}
    </div>
  );
}

/** What a list or page shows when there's nothing in it yet. */
export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="kit-empty">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

/** A filled bar for a share of something: cap used, seats sold, a count against a limit. */
export function Meter({ value, label, tone }: { value: number; label?: ReactNode; tone?: Tone }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`kit-meter${tone ? ` ${tone}` : ""}`}>
      {label && <span className="kit-meter-label">{label}</span>}
      <span className="kit-meter-bar" role="img" aria-label={`${Math.round(pct)}%`}><span style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

// A figure that counts to its new value instead of jumping: the number inside
// a label such as "$11.8M" or "20" moves over about half a second, keeping
// its prefix, suffix, decimals and commas. Units that change ($850K to $1.2M)
// or a reader who prefers reduced motion get the new text at once.
const NUM = /-?[\d,]*\.?\d+/;

function parts(text: string) {
  const m = NUM.exec(text);
  if (!m) return null;
  const raw = m[0];
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { pre: text.slice(0, m.index), post: text.slice(m.index + raw.length), n: Number(raw.replace(/,/g, "")), decimals, commas: raw.includes(",") };
}

function stillPlease(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
}

/** Counts up from zero when it first shows if `fromZero`, and from the old value whenever it changes. */
export function CountUp({ text, fromZero = false }: { text: string; fromZero?: boolean }) {
  const [shown, setShown] = useState(() => (fromZero && !stillPlease() && parts(text) ? text.replace(NUM, "0") : text));
  const last = useRef<string>(fromZero ? text.replace(NUM, "0") : text);
  useEffect(() => {
    const to = parts(text);
    const from = parts(last.current);
    last.current = text;
    if (!to || !from || from.pre !== to.pre || from.post !== to.post || from.n === to.n || stillPlease()) { setShown(text); return; }
    const start = performance.now();
    const fmt = (v: number) => to.pre + v.toLocaleString("en-US", { minimumFractionDigits: to.decimals, maximumFractionDigits: to.decimals, useGrouping: to.commas }) + to.post;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 550);
      const ease = 1 - Math.pow(1 - t, 3);
      setShown(t >= 1 ? text : fmt(from.n + (to.n - from.n) * ease));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text]);
  return <>{shown}</>;
}

/**
 * A crossroads laid out: what's at stake, then one column per option with the
 * people backing it in their own words, and what that choice costs with the
 * people it goes against. Read by the memo card and the decision queue.
 */
export function Crossroads({ voices, options, stakes }: { voices: Voice[]; options: { label: string; effect: string }[]; stakes?: string }) {
  return (
    <div className="kit-x">
      {stakes && <strong className="kit-x-stakes">{stakes}</strong>}
      <div className="kit-x-grid">
        {options.map((o, i) => {
          const backers = voices.filter((v) => v.side === i);
          const against = voices.filter((v) => v.side !== i);
          return (
            <section key={i} className="kit-x-opt">
              <div className="kit-x-opt-head">
                <span className="kit-x-kicker">Option {i + 1}</span>
                <strong>{o.label}</strong>
                <span className="muted">{o.effect}</span>
              </div>
              {backers.length ? backers.map((v) => (
                <div key={v.who} className={`kit-x-voice ${v.kind}`}>
                  <span className="kit-x-role">{v.role}</span>
                  <span className="kit-x-who">{v.who}</span>
                  <q className="kit-x-quote">{v.says.replace(/^"|"$/g, "")}</q>
                </div>
              )) : <span className="muted">Nobody in the building is arguing for this.</span>}
              {against.length > 0 && (
                <div className="kit-x-cost">
                  <span className="kit-x-kicker">What it costs</span>
                  <ul>{against.map((v) => <li key={v.who}><strong>{v.role}:</strong> {v.ifOverruled}</li>)}</ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
