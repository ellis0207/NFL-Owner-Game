import { useMemo, useState } from "react";
import { staff } from "../engine/coaches";
import { EXEC_ROLES } from "../engine/executives";
import { PLAYERS, TEAMS, teamLabel } from "../engine/league";
import type { GameState } from "../engine/types";
import { PAGE_HINT, SCREENS, groupOf, pageLabel, type Screen } from "./nav";
import { useUi } from "./ui";

interface Hit { label: string; detail: string; go: () => void }

/** One box that finds any player, coach, executive, team or message. */
export function SearchBox({ game, go }: { game: GameState; go: (s: Screen) => void }) {
  const ui = useUi();
  const [q, setQ] = useState("");
  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const out: Hit[] = [];
    // Pages come first, so typing "cap" or "tickets" jumps straight there.
    for (const s of SCREENS) {
      if (out.length >= 3) break;
      if (`${s} ${pageLabel(s)} ${PAGE_HINT[s]}`.toLowerCase().includes(t)) out.push({ label: pageLabel(s), detail: `${groupOf(s).label} page`, go: () => go(s) });
    }
    for (const p of PLAYERS) {
      if (out.length >= 11) break;
      if (!p.name.toLowerCase().includes(t)) continue;
      const st = game.players[p.id];
      if (!st) continue;
      out.push({ label: p.name, detail: `${p.position} · ${st.team ? teamLabel(st.team) : st.status === "retired" ? "retired" : "free agent"}`, go: () => ui.openPlayer(p.id) });
    }
    for (const c of Object.values(staff(game).people)) {
      if (out.length >= 12) break;
      if (c.name.toLowerCase().includes(t)) out.push({ label: c.name, detail: `${c.role ?? "coach"}${c.team ? ` · ${teamLabel(c.team)}` : ""}`, go: () => go("Staff") });
    }
    for (const e of Object.values(game.execs?.people ?? {})) {
      if (out.length >= 14) break;
      if (e.role && e.name.toLowerCase().includes(t)) out.push({ label: e.name, detail: EXEC_ROLES[e.role].label, go: () => go("Front office") });
    }
    for (const tm of TEAMS) if (`${tm.city} ${tm.name}`.toLowerCase().includes(t)) out.push({ label: `${tm.city} ${tm.name}`, detail: "Standings", go: () => go("Standings") });
    for (const m of game.inbox) {
      if (out.length >= 20) break;
      if (m.title.toLowerCase().includes(t)) out.push({ label: m.title, detail: `Inbox · ${m.date}`, go: () => go("Inbox") });
    }
    return out.slice(0, 20);
  }, [q, game, go, ui]);
  return (
    <div className="search-box">
      <input type="search" aria-label="Search pages, players, staff, executives, teams and messages" placeholder="Search pages, players, staff…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter" && hits[0]) { hits[0].go(); setQ(""); } }} />
      {hits.length > 0 && (
        <div className="search-results" role="listbox">
          {hits.map((h, i) => <button key={i} role="option" onClick={() => { h.go(); setQ(""); }}>{h.label} <span className="muted">· {h.detail}</span></button>)}
        </div>
      )}
    </div>
  );
}
