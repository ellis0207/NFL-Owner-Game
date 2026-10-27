import { useEffect, useState } from "react";
import { longDate } from "../../engine/dates";
import { teamLabel } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { parseSaveFile } from "../../save/codec";
import { connectCloud, connectDownloads, exportFileName, exportText, SLOTS, type Cloud, type Slot, type SlotInfo } from "../../save/cloud";
import { writeAutosave } from "../../save/local";

export function SaveScreen({ game, onLoad, onQuit }: { game: GameState; onLoad: (s: GameState) => void; onQuit: () => void }) {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [slots, setSlots] = useState<Partial<Record<Slot, SlotInfo>>>({});
  const [canExport, setCanExport] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<Slot | null>(null);

  useEffect(() => {
    void connectCloud().then(async (c) => {
      setCloud(c);
      if (c) setSlots(await c.list().catch(() => ({})));
    });
    void connectDownloads().then((d) => setCanExport(!!d));
  }, []);

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await fn() });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setMessage({ text: code === "declined" ? "Export cancelled." : e instanceof Error ? e.message : "That didn't work. Try again.", error: code !== "declined" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <h2>Save</h2>
      {message && <p className={`notice ${message.error ? "error" : ""}`}>{message.text}</p>}
      <div className="split">
        <div className="panel stack">
          <h3>This browser</h3>
          <p className="muted">The game autosaves here after every day. Clearing site data or a private window loses it.</p>
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={() => act(async () => ((await writeAutosave(game)) ? "Saved in this browser." : "This browser blocked saving. Use a cloud save or export a file."))}>Save now</button>
          </div>
        </div>
        <div className="panel stack">
          <h3>Save file</h3>
          <p className="muted">Download your game as a file you can keep, back up or open on another device.</p>
          {canExport ? (
            <div className="btn-row">
              <button className="btn" disabled={busy} onClick={() => act(async () => {
                const d = await connectDownloads();
                if (!d) throw new Error("Downloads aren't available here.");
                await d.save({ filename: exportFileName(game), data: exportText(game) });
                return "Save file downloaded.";
              })}>Export save file</button>
            </div>
          ) : <p className="muted">File export works when the game is opened on claude.ai.</p>}
          <label className="field">
            <span className="label">Open a save file</span>
            <input id="import-in-game" type="file" accept=".json,application/json" disabled={busy} onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              act(async () => { onLoad(parseSaveFile(await f.text())); return "Save file loaded."; });
            }} />
          </label>
        </div>
      </div>
      <div className="panel stack">
        <h3>Cloud slots</h3>
        {!cloud && <p className="muted">Cloud saves need you to be signed in on claude.ai.</p>}
        {cloud && SLOTS.map((s, i) => {
          const info = slots[s];
          return (
            <div key={s} className="agenda-item">
              <span className="kind">Slot {i + 1}</span>
              <div className="stack" style={{ gap: "0.4rem" }}>
                <span>{info ? `${teamLabel(info.team)} · ${longDate(info.date)} · saved ${new Date(info.savedAt).toLocaleString()}` : "Empty"}</span>
                <div className="btn-row">
                  <button className="btn small" disabled={busy} onClick={() => act(async () => {
                    await cloud.save(s, game);
                    setSlots(await cloud.list());
                    return `Saved to slot ${i + 1}.`;
                  })}>{info ? "Overwrite" : "Save here"}</button>
                  {info && confirmLoad !== s && <button className="btn small" disabled={busy} onClick={() => setConfirmLoad(s)}>Load</button>}
                  {confirmLoad === s && (
                    <>
                      <span className="warn">Unsaved progress in this game will be lost.</span>
                      <button className="btn small danger" onClick={() => act(async () => { onLoad(await cloud.load(s)); return "Loaded."; })}>Load slot {i + 1}</button>
                      <button className="btn small" onClick={() => setConfirmLoad(null)}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div><button className="btn" onClick={onQuit}>Back to title screen</button></div>
    </section>
  );
}
