import { useState } from "react";
import { shortDate } from "../../engine/dates";
import type { GameState } from "../../engine/types";
import { messagePriority } from "../../engine/desk";
import { useUi } from "../ui";

export function InboxScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const [urgent, setUrgent] = useState(false);
  // Urgent first puts unread messages that need a decision soon at the top.
  // "Most urgent first" ranks by kind, urgency, age and whether it's been read (desk.ts).
  const list = urgent ? game.inbox.slice().sort((a, b) => messagePriority(game, b).score - messagePriority(game, a).score) : game.inbox;
  const [open, setOpen] = useState<string | null>(game.inbox[0]?.id ?? null);
  function toggle(id: string) {
    const item = game.inbox.find((i) => i.id === id)!;
    if (!item.read) { item.read = true; changed(); }
    setOpen(open === id ? null : id);
  }
  function markAll() {
    game.inbox.forEach((i) => (i.read = true));
    changed();
  }
  const shown = game.inbox.find((m) => m.id === open);
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="muted">{game.inbox.filter((m) => !m.read).length} unread of {game.inbox.length}</span>
        <div className="btn-row">
          <button className="btn small" aria-pressed={urgent} onClick={() => setUrgent(!urgent)}>{urgent ? "Newest first" : "Urgent first"}</button>
          <button className="btn small" onClick={markAll}>Mark all read</button>
        </div>
      </div>
      {game.inbox.length === 0 && <p className="muted">No messages yet.</p>}
      {game.inbox.length > 0 && (
        // A mail tray: the list on the left, the open letter on the right. On a phone the letter opens under its line.
        <div className="dk-mail">
          <div className="dk-tray" role="list">
            {list.map((m) => (
              <article key={m.id} role="listitem" className={`inbox-item dk-envelope${m.read ? "" : " unread"}${open === m.id ? " open" : ""}${(m.priority ?? 1) >= 3 && !m.read ? " urgent" : ""}`}>
                <button className="head" onClick={() => toggle(m.id)} aria-expanded={open === m.id}>
                  <span className="dk-sender" aria-hidden="true">{initials(m.from)}</span>
                  <span className="dk-envelope-text">
                    <span className="dk-envelope-top"><span className="dk-from">{m.from}</span><span className="muted num">{shortDate(m.date)}</span></span>
                    <span className="subject">{(m.priority ?? 1) >= 3 && !m.read ? "Urgent: " : ""}{m.title}</span>
                  </span>
                  {!m.read && <span className="dot" aria-label="Unread" />}
                </button>
                {open === m.id && <div className="dk-inline-letter"><Letter m={m} /></div>}
              </article>
            ))}
          </div>
          <div className="dk-reader" aria-live="polite">
            {shown ? <Letter m={shown} /> : <p className="muted">Pick a message to read it.</p>}
          </div>
        </div>
      )}
    </section>
  );

  function Letter({ m }: { m: GameState["inbox"][number] }) {
    return (
      <div className="dk-letter">
        <div className="dk-letterhead">
          <span className="label">From</span> <strong>{m.from}</strong>
          <span className="muted"> · {shortDate(m.date)}</span>
        </div>
        <h2 className="dk-letter-title">{m.title}</h2>
        <p className="body">{m.body}</p>
        {m.gameId && game.results[m.gameId] && <div><button className="btn small" onClick={() => ui.openBox(m.gameId!)}>Box score</button></div>}
      </div>
    );
  }
}

/** A sender's initials for the envelope: "Head coach Dan Quinn" gives "DQ", "League office" gives "LO". */
function initials(from: string): string {
  const words = from.replace(/[(),.]/g, "").split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  const pick = words.length >= 2 ? words.slice(-2) : from.split(/\s+/).slice(0, 2);
  return pick.map((w) => w[0]?.toUpperCase() ?? "").join("");
}
