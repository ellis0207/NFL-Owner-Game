import { useEffect, useState } from "react";
import { longDate } from "../engine/dates";
import { teamLabel } from "../engine/league";
import type { GameState } from "../engine/types";
import { parseSaveFile } from "../save/codec";
import { connectCloud, SLOTS, type Cloud, type SlotInfo, type Slot } from "../save/cloud";
import { peekAutosave, readAutosave, type AutosaveInfo } from "../save/local";

export function TitleScreen({ onNew, onLoad }: { onNew: () => void; onLoad: (s: GameState) => void }) {
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
      <div className="title-card">
        <div className="wordmark">NFL Owner<br />Simulator<span>2026 season · day by day</span></div>
        <p className="lede">
          Buy into the real league as it stood when camps opened in July 2026: real rosters, real contracts and the
          real schedule. You hire the people, sign the checks and live with the results. Nobody hands you player
          ratings; you get stats and your staff's word.
        </p>
        {error && <p className="notice error">{error}</p>}
        <div className="split">
          <div className="panel stack">
            <h2>Start</h2>
            <div className="btn-row">
              <button className="btn primary" onClick={onNew}>New game</button>
              {auto && (
                <button className="btn" disabled={busy} onClick={() => run(async () => (await readAutosave())?.state)}>
                  Continue {auto.team} · {longDate(auto.date)}
                </button>
              )}
            </div>
            <label className="field">
              <span className="label">Open a save file</span>
              <input id="import-save" type="file" accept=".json,application/json" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
            </label>
          </div>
          {cloud && (
            <div className="panel stack">
              <h2>Cloud saves</h2>
              {filled.length === 0 && <p className="muted">No cloud saves yet. Save from the Save page during a game.</p>}
              {filled.map((s) => {
                const info = slots[s]!;
                return (
                  <button key={s} className="btn" disabled={busy} onClick={() => run(() => cloud.load(s))}>
                    {teamLabel(info.team)} · {longDate(info.date)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
