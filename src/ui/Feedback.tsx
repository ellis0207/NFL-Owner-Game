// What the game says back when something happens: a toast and a sound for our
// final scores and achievements, and a recap of the season once the Super
// Bowl is played. It watches the game between renders and compares it with
// what it saw last time, so the engine doesn't need to know it exists.
import { useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS } from "../engine/achievements";
import { GAME_BY_ID, RULES, TEAM_BY_ID, PLAYER_BY_ID } from "../engine/league";
import { seasonRecord } from "../engine/seasons";
import { seasonTotals } from "../engine/stats";
import type { GameState } from "../engine/types";
import { CountUp } from "./kit";
import { readPrefs, writePrefs } from "./prefs";
import { cue } from "./sound";
import { VERSION } from "./release";
import type { Screen } from "./nav";

export interface Toast {
  id: number;
  kind: "win" | "loss" | "tie" | "achievement" | "news";
  title: string;
  body: string;
  go?: Screen;
}

interface Seen {
  key: string;
  date: string;
  results: number;
  earned: Set<string>;
}

const ours = (g: GameState) => Object.entries(g.results).filter(([, r]) => r.home === g.userTeam || r.away === g.userTeam);

/** The id of this season's Super Bowl once it has been played. */
function superBowlPlayed(g: GameState): boolean {
  return Object.keys(g.results).some((id) => GAME_BY_ID[id]?.round === "SB");
}

/** Watches the game for news worth a toast or a sound, and for the end of a season. */
export function useFeedback(game: GameState) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recap, setRecap] = useState(false);
  const seen = useRef<Seen | null>(null);
  const next = useRef(1);

  // Once per version, a notice pointing at what's new (not in a tutorial game, which is about the basics).
  useEffect(() => {
    const p = readPrefs();
    if (p.seenVersion === VERSION || game.tutorial) return;
    writePrefs({ ...p, seenVersion: VERSION });
    setToasts((t) => [...t, { id: next.current++, kind: "news", go: "About", title: `What's new in version ${VERSION}`, body: "A quieter inbox, a fuller tutorial, sound and a lighter page. Click for the notes and credits." }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = `${game.seed}:${game.userTeam}`;
    const results = ours(game);
    const earned = new Set(Object.keys(game.achievements?.earned ?? {}));
    const last = seen.current;
    seen.current = { key, date: game.date, results: results.length, earned };
    // The season's recap, once: on the day the Super Bowl is played, or the first time a save from after it opens.
    const tag = `${game.seed}:${RULES.season}`;
    if (!game.tutorial && superBowlPlayed(game) && !readPrefs().recaps.includes(tag)) setRecap(true);
    // A new game, another club or an earlier save loaded: start watching from here.
    if (!last || last.key !== key || game.date < last.date || game.tutorial) return;
    const add: Toast[] = [];
    if (results.length > last.results) {
      // Several days at once can hold more than one game; the latest one is the news.
      const [id, r] = results.reduce((a, b) => (GAME_BY_ID[b[0]]?.date ?? "") > (GAME_BY_ID[a[0]]?.date ?? "") ? b : a);
      const home = r.home === game.userTeam;
      const us = home ? r.homeScore : r.awayScore;
      const them = home ? r.awayScore : r.homeScore;
      const kind = us > them ? "win" : us < them ? "loss" : "tie";
      const g = GAME_BY_ID[id];
      const word = g?.type === "PRE" ? "Preseason final" : g?.type === "POST" ? "Playoff final" : "Final";
      add.push({ id: next.current++, kind, go: "Schedule", title: `${word}: ${kind === "win" ? "a win" : kind === "loss" ? "a loss" : "a tie"}`,
        body: `${TEAM_BY_ID[r.away]?.name ?? r.away} ${r.awayScore}, ${TEAM_BY_ID[r.home]?.name ?? r.home} ${r.homeScore}${r.overtime ? " (OT)" : ""}` });
    }
    const fresh = [...earned].filter((a) => !last.earned.has(a));
    for (const a of fresh.slice(0, 3)) {
      const def = ACHIEVEMENTS.find((x) => x.id === a);
      if (def) add.push({ id: next.current++, kind: "achievement", go: "Achievements", title: `Achievement: ${def.title}`, body: def.what });
    }
    if (add.length) {
      setToasts((t) => [...t, ...add].slice(-4));
      cue(add.some((t) => t.kind === "achievement") ? "achievement" : add[0].kind === "win" ? "win" : add[0].kind === "loss" ? "loss" : "notify");
    }
  });

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const closeRecap = () => {
    const p = readPrefs();
    const tag = `${game.seed}:${RULES.season}`;
    writePrefs({ ...p, recaps: [...p.recaps.filter((x) => x !== tag), tag].slice(-40) });
    setRecap(false);
  };
  return { toasts, dismiss, recap, closeRecap };
}

/** The stack of notices in the corner. Each goes after a few seconds, or on a click. */
export function Toasts({ toasts, dismiss, go }: { toasts: Toast[]; dismiss: (id: number) => void; go: (s: Screen) => void }) {
  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setTimeout(() => dismiss(toasts[0].id), 6500);
    return () => window.clearTimeout(t);
  }, [toasts, dismiss]);
  return (
    <div className="fb-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`fb-toast fb-${t.kind}`}>
          <button className="fb-toast-main" onClick={() => { if (t.go) go(t.go); dismiss(t.id); }}>
            <span className="fb-toast-mark" aria-hidden="true">{t.kind === "achievement" ? "★" : t.kind === "news" ? "i" : t.kind === "win" ? "W" : t.kind === "loss" ? "L" : "T"}</span>
            <span className="fb-toast-text"><b>{t.title}</b><small>{t.body}</small></span>
          </button>
          <button className="fb-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

const FINISH: Record<string, string> = {
  CHAMP: "Won the Super Bowl",
  SB: "Lost in the Super Bowl",
  CONF: "Lost in the conference championship",
  DIV: "Lost in the divisional round",
  WC: "Lost in the wild-card round",
};

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

/** The season in one page, once the Super Bowl is over. */
export function SeasonRecap({ game, onClose, go }: { game: GameState; onClose: () => void; go: (s: Screen) => void }) {
  const rec = seasonRecord(game);
  const us = game.userTeam;
  const team = TEAM_BY_ID[us];
  const [w, l, t, pf, pa] = rec.records[us] ?? [0, 0, 0, 0, 0];
  const went = rec.playoffs[us];
  const champ = rec.champion ? TEAM_BY_ID[rec.champion] : undefined;
  const totals = Object.entries(seasonTotals(game, "REG")).filter(([, row]) => row.team === us);
  const lead = (key: string, label: string) => {
    let best: [string, number] | null = null;
    for (const [id, row] of totals) {
      const v = (row.line as Record<string, number>)[key] ?? 0;
      if (v > 0 && (!best || v > best[1])) best = [id, v];
    }
    return best ? { label, who: PLAYER_BY_ID[best[0]]?.name ?? "", v: best[1] } : null;
  };
  const leaders = [lead("passYds", "passing yards"), lead("rushYds", "rushing yards"), lead("recYds", "receiving yards"), lead("sacks", "sacks"), lead("defInt", "interceptions")].filter((x) => x);
  const from = `${RULES.season}-07-01`;
  const won = Object.entries(game.achievements?.earned ?? {}).filter(([, e]) => e.date >= from).map(([id]) => ACHIEVEMENTS.find((a) => a.id === id)?.title).filter((x): x is string => !!x);
  useEffect(() => {
    cue(went === "CHAMP" ? "achievement" : w > l ? "win" : "notify");
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fb-recap-veil" role="dialog" aria-modal="true" aria-labelledby="fb-recap-title" onClick={onClose}>
      <div className="fb-recap" onClick={(e) => e.stopPropagation()}>
        <span className="fb-recap-kicker">The {RULES.season} season</span>
        <h2 id="fb-recap-title">{team?.city} {team?.name}</h2>
        <div className="fb-recap-record">
          <div><b><CountUp text={String(w)} fromZero /></b><small>won</small></div>
          <div><b><CountUp text={String(l)} fromZero /></b><small>lost</small></div>
          {t > 0 && <div><b>{t}</b><small>tied</small></div>}
          <div><b><CountUp text={String(pf)} fromZero /></b><small>points for</small></div>
          <div><b><CountUp text={String(pa)} fromZero /></b><small>against</small></div>
        </div>
        <p className="fb-recap-finish">
          {ORD[rec.place[us] ?? 0] ? `${ORD[rec.place[us]]} in the division. ` : ""}{went ? FINISH[went] ?? "Made the playoffs" : "Missed the playoffs"}.
          {champ && went !== "CHAMP" ? ` The ${champ.city} ${champ.name} won it all.` : ""}
        </p>
        {leaders.length > 0 && (
          <ul className="fb-recap-leaders">
            {leaders.map((x) => <li key={x!.label}><b>{x!.v.toLocaleString()}</b> {x!.label}<span>{x!.who}</span></li>)}
          </ul>
        )}
        {won.length > 0 && <p className="fb-recap-medals">Achievements this season: {won.join(", ")}.</p>}
        <p className="fb-recap-next">Next comes the offseason: tags, free agency and the draft.</p>
        <div className="btn-row">
          <button className="btn primary" onClick={onClose}>On to the offseason</button>
          <button className="btn" onClick={() => { go("Stats"); onClose(); }}>Season stats</button>
        </div>
      </div>
    </div>
  );
}
