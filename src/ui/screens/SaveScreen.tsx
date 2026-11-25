import { useEffect, useState } from "react";
import { longDate } from "../../engine/dates";
import { teamLabel } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { parseSaveFile } from "../../save/codec";
import { connectCloud, connectDownloads, exportFileName, exportText, SLOTS, type Cloud, type Slot, type SlotInfo } from "../../save/cloud";
import { listRecovery, readRecovery, writeAutosave, writeRecoveryCopy, type RecoveryInfo } from "../../save/local";
import { IconHead, TeamBadge } from "../gfx";
import { FileButton, SaveRow } from "../kit";

export function SaveScreen({ game, onLoad, onQuit }: { game: GameState; onLoad: (s: GameState) => void; onQuit: () => void }) {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [slots, setSlots] = useState<Partial<Record<Slot, SlotInfo>>>({});
  const [canExport, setCanExport] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<Slot | null>(null);
  const [recovery, setRecovery] = useState<RecoveryInfo[]>([]);
  const refreshRecovery = () => void listRecovery().then(setRecovery, () => setRecovery([]));
  useEffect(refreshRecovery, []);

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
      {message && <p className={`notice ${message.error ? "error" : ""}`}>{message.text}</p>}
      <div className="split">
        <div className="panel stack">
          <IconHead icon="save">This browser</IconHead>
          <p className="muted">The game autosaves here after every day. Clearing site data or a private window loses it.</p>
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={() => act(async () => ((await writeAutosave(game)) ? "Saved in this browser." : "This browser blocked saving. Use a cloud save or export a file."))}>Save now</button>
            <button className="btn" disabled={busy} onClick={() => act(async () => { const ok = await writeRecoveryCopy(game); refreshRecovery(); return ok ? "Recovery copy saved." : "This browser blocked saving. Use a cloud save or export a file."; })}>Save a recovery copy</button>
          </div>
          <h4>Recovery copies</h4>
          <p className="muted">The game keeps three older copies here, one about every week of game time, and opens the newest one if the autosave is ever unreadable.</p>
          {recovery.length === 0 ? <p className="muted kit-none">None yet.</p> : (
            <div className="stack">
              {recovery.map((r) => (
                <SaveRow key={r.slot} actions={!game.settings.ironman && <button className="btn small" disabled={busy} onClick={() => act(async () => {
                    const got = await readRecovery(r.slot);
                    if (!got) throw new Error("That recovery copy can't be opened.");
                    onLoad(got.state);
                    return "Recovery copy opened.";
                  })}>Open</button>}>
                  <TeamBadge team={r.team} size={32} noTip />
                  <span>{teamLabel(r.team)}, {longDate(r.date)}<br /><span className="muted">Saved {new Date(r.savedAt).toLocaleString()}</span></span>
                </SaveRow>
              ))}
            </div>
          )}
        </div>
        <div className="panel stack">
          <IconHead icon="book">Save file</IconHead>
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
          {game.settings.ironman ? <p className="muted">Ironman: an exported file is a backup, not a way back. Opening saves from inside the game is off.</p> : <div className="btn-row">
            <FileButton id="import-in-game" label="Open a save file" disabled={busy} onFile={(f) => act(async () => { onLoad(parseSaveFile(await f.text())); return "Save file loaded."; })} />
          </div>}
        </div>
      </div>
      {!game.settings.ironman && <div className="panel stack">
        <IconHead icon="globe">Cloud slots</IconHead>
        {!cloud && <p className="muted">Cloud saves need you to be signed in on claude.ai.</p>}
        {cloud && SLOTS.map((s, i) => {
          const info = slots[s];
          return (
            <SaveRow key={s} actions={<>
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
            </>}>
              {info ? <TeamBadge team={info.team} size={32} noTip /> : <span className="kit-slot-empty">{i + 1}</span>}
              <span><strong>Slot {i + 1}</strong><br /><span className="muted">{info ? `${teamLabel(info.team)} · ${longDate(info.date)} · saved ${new Date(info.savedAt).toLocaleString()}` : "Empty"}</span></span>
            </SaveRow>
          );
        })}
      </div>}
      <div><button className="btn" onClick={onQuit}>Back to title screen</button></div>
    </section>
  );
}
