// Shared pieces for the rooms. Each takes its colors and type from the room
// it sits in (the data-room tokens in styles/rooms), so the same tile reads
// as a scoreboard figure in the League room and a ledger total in the cap
// office. They show only what the owner can see: stats, money, counts and
// staff reports, never a rating.
import type { ReactNode } from "react";

type Tone = "good" | "bad" | "warn" | undefined;

/** A headline figure: a big number, what it is, and a line under it. */
export function StatTile({ label, value, note, tone }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: Tone }) {
  return (
    <div className={`kit-tile${tone ? ` ${tone}` : ""}`}>
      <span className="kit-tile-label">{label}</span>
      <strong className="kit-tile-value">{value}</strong>
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
