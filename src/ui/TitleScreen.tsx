import { useEffect, useState } from "react";
import { longDate } from "../engine/dates";
import { BASE_SEASON, teamLabel } from "../engine/league";
import { Icon, TeamBadge } from "./gfx";
import type { GameState } from "../engine/types";
import { parseSaveFile } from "../save/codec";
import { connectCloud, SLOTS, type Cloud, type SlotInfo, type Slot } from "../save/cloud";
import { peekAutosave, readAutosave, type AutosaveInfo } from "../save/local";
import { SOURCES, VERSION, WHATS_NEW } from "./release";

export function TitleScreen({ onNew, onLoad, onTutorial }: { onNew: () => void; onLoad: (s: GameState) => void; onTutorial: () => void }) {
  const [auto, setAuto] = useState<AutosaveInfo | null>(null);
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [slots, setSlots] = useState<Partial<Record<Slot, SlotInfo>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void peekAutosave().then(setAuto);
    void connectCloud().then(async (c) => {
      if (!c) return;
      setCloud(c);
      setSlots(await c.list().catch(() => ({})));
    });
  }, []);

  async function run(fn: () => Promise<GameState | null | undefined>) {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      if (s) onLoad(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That save could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    await run(async () => parseSaveFile(await file.text()));
  }

  const filled = SLOTS.filter((s) => slots[s]);

  return (
    <div className="title-page">
      <div className="title-card fd-title">
        <div className="wordmark">NFL Owner<br />Simulator<span>{BASE_SEASON} season · day by day</span></div>
        <p className="lede">
          Buy into the real league as it stood when camps opened in July {BASE_SEASON}: real rosters, real contracts and the
          real schedule. You hire the people, sign the checks and live with the results. Nobody hands you player
          ratings; you get stats and your staff's word.
        </p>
        {error && <p className="notice error">{error}</p>}
        <nav className="fd-menu" aria-label="Start">
          {auto && (
            <button className="fd-tile fd-continue" disabled={busy} onClick={() => run(async () => (await readAutosave())?.state)}>
              <TeamBadge team={auto.team} size={44} noTip />
              <span className="fd-tile-text"><b>Continue</b><small>{teamLabel(auto.team)} · {longDate(auto.date)}</small></span>
            </button>
          )}
          <button className="fd-tile fd-primary" onClick={onNew}>
            <span className="fd-tile-icon"><Icon name="key" size={22} /></span>
            <span className="fd-tile-text"><b>New game</b><small>Pick a club and take over</small></span>
          </button>
          <button className="fd-tile" onClick={onTutorial}>
            <span className="fd-tile-icon"><Icon name="book" size={22} /></span>
            <span className="fd-tile-text"><b>Tutorial</b><small>A practice game that walks through the job. It isn't saved.</small></span>
          </button>
          <label className={`fd-tile${busy ? " disabled" : ""}`}>
            <span className="fd-tile-icon"><Icon name="save" size={22} /></span>
            <span className="fd-tile-text"><b>Open a save file</b><small>A file exported from the Save page</small></span>
            <input id="import-save" className="fd-hidden-input" type="file" accept=".json,application/json" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          </label>
        </nav>
        {cloud && (
          <section className="fd-cloud">
            <h2 className="fd-heading">Cloud saves</h2>
            {filled.length === 0 && <p className="fd-note">No cloud saves yet. Save from the Save page during a game.</p>}
            <div className="fd-menu">
              {filled.map((s) => {
                const info = slots[s]!;
                return (
                  <button key={s} className="fd-tile" disabled={busy} onClick={() => run(() => cloud.load(s))}>
                    <TeamBadge team={info.team} size={40} noTip />
                    <span className="fd-tile-text"><b>{teamLabel(info.team)}</b><small>{longDate(info.date)}</small></span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <details className="fd-news">
          <summary>What's new in version {VERSION}</summary>
          <ul>{WHATS_NEW.map((n) => <li key={n.title}><b>{n.title}.</b> {n.text}</li>)}</ul>
        </details>
        <p className="fd-credit">Version {VERSION}. Real data from {SOURCES.slice(0, 3).map((s) => s.name).join(", ")} and more; the About page in the Game section lists them all. An unofficial fan game, not affiliated with the NFL.</p>
      </div>
    </div>
  );
}
