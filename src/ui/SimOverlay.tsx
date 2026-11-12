import { longDate } from "../engine/dates";
import type { SimKind } from "../engine/season";

const LABEL: Record<SimKind, string> = { week: "Simulating a week", nextGame: "Simulating to game day", nextEvent: "Advancing to the next event" };
const SPAN: Record<SimKind, number> = { week: 7, nextGame: 7, nextEvent: 7 };

/** Covers the page while a multi-day sim runs: the day being played, how far along, and Stop. */
export function SimOverlay({ kind, date, days, stopping, onStop }: { kind: SimKind; date: string; days: number; stopping: boolean; onStop: () => void }) {
  const share = Math.min(1, days / SPAN[kind]);
  return (
    <div className="sim-overlay" role="dialog" aria-modal="true" aria-labelledby="sim-title">
      <div className="panel stack tight sim-box">
        <h3 id="sim-title">{LABEL[kind]}</h3>
        <p aria-live="polite">{days ? `Played through ${longDate(date)} (${days} day${days === 1 ? "" : "s"})` : "Starting…"}</p>
        <div className="sim-bar" aria-hidden="true"><span style={{ width: `${Math.round(share * 100)}%` }} /></div>
        <div className="btn-row">
          <button className="btn" disabled={stopping} onClick={onStop}>{stopping ? "Stopping after this day…" : "Stop after this day"}</button>
        </div>
      </div>
    </div>
  );
}
