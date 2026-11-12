// Keeping the owner's game safe in the interface: the save indicator in the
// scoreboard, the panel shown when a simulation step fails, and the boundary
// that keeps one broken page from taking down the whole game.
import { Component, useEffect, useState, type ReactNode } from "react";
import type { GameState } from "../engine/types";
import { connectDownloads, exportFileName, exportText } from "../save/cloud";
import { holdAutosave, onSaveStatus, readAutosave, saveStatus, writeAutosave, type SaveStatus } from "../save/local";

/** Download the game as a save file: through claude.ai when it offers downloads, else a plain browser download. */
export async function downloadGame(game: GameState): Promise<string> {
  const d = await connectDownloads().catch(() => null);
  if (d) {
    await d.save({ filename: exportFileName(game), data: exportText(game) });
    return "Save file downloaded.";
  }
  const url = URL.createObjectURL(new Blob([exportText(game)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(game);
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "Save file downloaded.";
}

function useSaveStatus(): SaveStatus {
  const [s, set] = useState<SaveStatus>(saveStatus);
  useEffect(() => onSaveStatus(set), []);
  return s;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "Saving", "Saved" or "Save failed" with a retry and an export. */
export function SaveIndicator({ game }: { game: GameState }) {
  const s = useSaveStatus();
  const [note, setNote] = useState<string | null>(null);
  if (s.state === "idle") return null;
  if (s.state === "saving") return <span className="save-state" role="status">Saving…</span>;
  if (s.state === "saved") return <span className="save-state" role="status" title={`Saved in this browser at ${clock(s.at)}`}>Saved</span>;
  if (s.state === "held") return <span className="save-state warn" role="status" title={s.reason}>Autosave paused</span>;
  return (
    <span className="save-state bad" role="alert" title={s.error}>
      Save failed: {s.error}
      <button className="link" onClick={() => void writeAutosave(game)}>Retry</button>
      <button className="link" onClick={() => void downloadGame(game).then(setNote, (e) => setNote(e instanceof Error ? e.message : "Export failed."))}>Export</button>
      {note && <span className="muted"> {note}</span>}
    </span>
  );
}

export interface ActionFailure {
  message: string;
  date: string;
}

/**
 * Shown when a day (or a run of days) stopped with an error. Autosave is held,
 * so the last good save stays as it was; the owner picks what happens next.
 */
export function FailurePanel({ failure, game, onLoad, onClose }: { failure: ActionFailure; game: GameState; onLoad: (s: GameState) => void; onClose: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<string | void>) => {
    setBusy(true);
    fn().then((t) => t && setNote(t), (e) => setNote(e instanceof Error ? e.message : "That didn't work.")).finally(() => setBusy(false));
  };
  return (
    <div className="notice error stack failure-panel" role="alert">
      <strong>The simulation stopped on {failure.date}.</strong>
      <span>{failure.message}</span>
      <span className="muted">The game in memory may be partly through that day, so autosave is paused and your last save in this browser is kept as it was.</span>
      <div className="btn-row">
        <button className="btn primary" disabled={busy} onClick={() => run(async () => {
          const r = await readAutosave();
          if (!r) return "There is no save in this browser to go back to. Export this game instead.";
          holdAutosave(null);
          onLoad(r.state);
          onClose();
        })}>Go back to the last save</button>
        <button className="btn" disabled={busy} onClick={() => run(() => downloadGame(game))}>Export this game</button>
        <button className="btn" disabled={busy} onClick={() => { holdAutosave(null); onClose(); }}>Keep playing from here</button>
      </div>
      {note && <span className="muted">{note}</span>}
    </div>
  );
}

/** One page failing to draw shows a message instead of a blank game. */
export class PageBoundary extends Component<{ children: ReactNode; onHome: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="notice error stack" role="alert">
        <strong>This page couldn't be shown.</strong>
        <span className="muted">{this.state.error.message}</span>
        <span>The rest of the game still works, and nothing was saved from this page.</span>
        <div className="btn-row">
          <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="btn" onClick={this.props.onHome}>Go to Today</button>
        </div>
      </div>
    );
  }
}
