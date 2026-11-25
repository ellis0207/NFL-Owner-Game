import { longDate } from "../engine/dates";
import type { SimKind } from "../engine/season";
import { Icon } from "./gfx";

const LABEL: Record<SimKind, string> = { week: "Simulating a week", nextGame: "Simulating to kickoff", nextEvent: "Advancing to the next event" };
const SPAN: Record<SimKind, number> = { week: 7, nextGame: 7, nextEvent: 7 };

/** Covers the page while a multi-day sim runs: the day being played, how far along, and Stop. */
export function SimOverlay({ kind, date, days, stopping, onStop }: { kind: SimKind; date: string; days: number; stopping: boolean; onStop: () => void }) {
  const share = Math.min(1, days / SPAN[kind]);
  return (
    <div className="sim-overlay" role="dialog" aria-modal="true" aria-labelledby="sim-title">
      <div className="panel stack tight sim-box">
        <div className="sim-head">
          <span className="sim-ball" aria-hidden="true"><Icon name="football" size={26} /></span>
          <div>
            <h3 id="sim-title">{LABEL[kind]}</h3>
            <p className="sim-date" aria-live="polite">{days ? longDate(date) : "Starting…"}</p>
          </div>
          {days > 0 && <span className="sim-days"><b>{days}</b>day{days === 1 ? "" : "s"}</span>}
        </div>
        <div className="sim-bar" aria-hidden="true"><span style={{ width: `${Math.round(share * 100)}%` }} /></div>
        <div className="btn-row">
          <button className="btn" disabled={stopping} onClick={onStop}>{stopping ? "Stopping after this day…" : "Stop after this day"}</button>
        </div>
      </div>
    </div>
  );
}
