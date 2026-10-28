import { useState } from "react";
import { PLAYER_BY_ID, TEAM_BY_ID } from "../../engine/league";
import { seasonTotals, teamTotals, type StatKey, type StatLine } from "../../engine/stats";
import type { GameState, GameType } from "../../engine/types";
import { useUi } from "../ui";

const PHASES: [GameType, string][] = [["PRE", "Preseason"], ["REG", "Regular season"], ["POST", "Playoffs"]];
type View = "leaders" | "team" | "league";

const v = (l: StatLine, k: StatKey | "g") => l[k] ?? 0;
const tackles = (l: StatLine) => v(l, "tklSolo") + v(l, "tklAst");

const LEADERS: { title: string; value: (l: StatLine) => number; fmt?: (l: StatLine) => string; min?: (l: StatLine) => boolean }[] = [
  { title: "Passing yards", value: (l) => v(l, "passYds"), fmt: (l) => `${v(l, "cmp")}/${v(l, "att")}, ${v(l, "passTd")} TD, ${v(l, "int")} INT` },
  { title: "Passing touchdowns", value: (l) => v(l, "passTd") },
  { title: "Rushing yards", value: (l) => v(l, "rushYds"), fmt: (l) => `${v(l, "car")} car, ${(v(l, "rushYds") / Math.max(1, v(l, "car"))).toFixed(1)} avg` },
  { title: "Rushing touchdowns", value: (l) => v(l, "rushTd") },
  { title: "Receptions", value: (l) => v(l, "rec"), fmt: (l) => `${v(l, "tgt")} targets` },
  { title: "Receiving yards", value: (l) => v(l, "recYds"), fmt: (l) => `${v(l, "rec")} rec, ${v(l, "recTd")} TD` },
  { title: "Receiving touchdowns", value: (l) => v(l, "recTd") },
  { title: "Sacks", value: (l) => v(l, "sacks"), fmt: (l) => `${v(l, "qbHits")} QB hits` },
  { title: "Interceptions", value: (l) => v(l, "defInt"), fmt: (l) => `${v(l, "pd")} passes defended` },
  { title: "Tackles", value: tackles, fmt: (l) => `${v(l, "tklSolo")} solo, ${v(l, "tfl")} TFL` },
  { title: "Field goals", value: (l) => v(l, "fgm"), fmt: (l) => `${v(l, "fgm")}/${v(l, "fga")}, long ${v(l, "fgLong")}` },
];

const TEAM_COLS: { label: string; value: (l: StatLine) => string | number; has: (l: StatLine) => boolean }[] = [
  { label: "G", value: (l) => v(l, "g"), has: () => true },
  { label: "Pass", value: (l) => (v(l, "att") ? `${v(l, "cmp")}/${v(l, "att")}, ${v(l, "passYds")} yds, ${v(l, "passTd")} TD, ${v(l, "int")} INT` : ""), has: (l) => v(l, "att") > 0 },
  { label: "Rush", value: (l) => (v(l, "car") ? `${v(l, "car")}-${v(l, "rushYds")}, ${v(l, "rushTd")} TD` : ""), has: (l) => v(l, "car") > 0 },
  { label: "Receiving", value: (l) => (v(l, "tgt") ? `${v(l, "rec")}/${v(l, "tgt")}, ${v(l, "recYds")} yds, ${v(l, "recTd")} TD` : ""), has: (l) => v(l, "tgt") > 0 },
  { label: "Defense", value: (l) => (v(l, "defSnaps") ? `${tackles(l)} tkl, ${v(l, "sacks")} sk, ${v(l, "defInt")} INT, ${v(l, "pd")} PD` : ""), has: (l) => v(l, "defSnaps") > 0 },
  { label: "Kicking", value: (l) => (v(l, "fga") + v(l, "xpa") ? `FG ${v(l, "fgm")}/${v(l, "fga")}, XP ${v(l, "xpm")}/${v(l, "xpa")}` : v(l, "punts") ? `${v(l, "punts")} punts, ${(v(l, "puntYds") / v(l, "punts")).toFixed(1)} avg` : ""), has: (l) => v(l, "fga") + v(l, "xpa") + v(l, "punts") > 0 },
  { label: "Snaps", value: (l) => `${v(l, "offSnaps") + v(l, "defSnaps")}${v(l, "stSnaps") ? ` + ${v(l, "stSnaps")} ST` : ""}`, has: () => true },
];

export function StatsScreen({ game }: { game: GameState }) {
  const ui = useUi();
  const started = (t: GameType) => Object.keys(seasonTotals(game, t)).length > 0;
  const [phase, setPhase] = useState<GameType>(started("POST") ? "POST" : started("REG") ? "REG" : "PRE");
  const [view, setView] = useState<View>("leaders");
  const totals = seasonTotals(game, phase);
  const entries = Object.entries(totals);

  return (
    <section className="stack">
      <h2>Stats</h2>
      <div className="btn-row" style={{ justifyContent: "space-between" }}>
        <div className="tabs" role="group" aria-label="Part of the season">
          {PHASES.map(([k, label]) => <button key={k} aria-pressed={phase === k} onClick={() => setPhase(k)}>{label}</button>)}
        </div>
        <div className="tabs" role="group" aria-label="View">
          {([["leaders", "League leaders"], ["team", TEAM_BY_ID[game.userTeam].name], ["league", "Team stats"]] as [View, string][]).map(([k, label]) => (
            <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
      </div>
      {entries.length === 0 && <p className="muted">No games played yet in this part of the season.</p>}

      {entries.length > 0 && view === "leaders" && (
        <div className="split">
          {LEADERS.map((cat) => {
            const top = entries.filter(([, s]) => cat.value(s.line) > 0).sort((a, b) => cat.value(b[1].line) - cat.value(a[1].line)).slice(0, 8);
            return (
              <div key={cat.title} className="stack tight">
                <h3>{cat.title}</h3>
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {top.map(([pid, s], i) => (
                        <tr key={pid} className={`clickable ${s.team === game.userTeam ? "mine" : ""}`} onClick={() => ui.openPlayer(pid)}>
                          <td className="num muted">{i + 1}</td>
                          <td className="name">{PLAYER_BY_ID[pid].name} <span className="muted">{s.team}</span>{cat.fmt && <div className="muted" style={{ fontWeight: 400 }}>{cat.fmt(s.line)}</div>}</td>
                          <td className="num"><strong>{cat.value(s.line)}</strong></td>
                        </tr>
                      ))}
                      {top.length === 0 && <tr><td className="muted">None yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && view === "team" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Player</th>{TEAM_COLS.map((c) => <th key={c.label} className={c.label === "G" || c.label === "Snaps" ? "num" : undefined}>{c.label}</th>)}</tr></thead>
            <tbody>
              {entries.filter(([, s]) => s.team === game.userTeam)
                .sort((a, b) => v(b[1].line, "offSnaps") + v(b[1].line, "defSnaps") - v(a[1].line, "offSnaps") - v(a[1].line, "defSnaps"))
                .map(([pid, s]) => (
                  <tr key={pid} className="clickable" onClick={() => ui.openPlayer(pid)}>
                    <td className="name">{PLAYER_BY_ID[pid].name} <span className="muted">{PLAYER_BY_ID[pid].position}</span></td>
                    {TEAM_COLS.map((c) => <td key={c.label} className={c.label === "G" || c.label === "Snaps" ? "num" : "muted"}>{c.has(s.line) ? c.value(s.line) : ""}</td>)}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length > 0 && view === "league" && <TeamTable game={game} phase={phase} />}
      <p className="muted">Stats count every snap the game has simulated in this save. Tap a player for their game log.</p>
    </section>
  );
}

function TeamTable({ game, phase }: { game: GameState; phase: GameType }) {
  const rows = Object.entries(teamTotals(game, phase)).sort((a, b) => b[1].pf / b[1].g - a[1].pf / a[1].g);
  const per = (n: number, g: number) => (n / Math.max(1, g)).toFixed(1);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Team</th><th className="num">G</th><th className="num">Pts/G</th><th className="num">Opp/G</th><th className="num">Yds/G</th><th className="num">Pass/G</th><th className="num">Rush/G</th><th className="num">Allowed/G</th><th className="num">TO</th><th className="num">Take</th><th className="num">Sacks</th></tr></thead>
        <tbody>
          {rows.map(([team, t]) => (
            <tr key={team} className={team === game.userTeam ? "mine" : undefined}>
              <td className="name">{TEAM_BY_ID[team].name}</td>
              <td className="num">{t.g}</td><td className="num">{per(t.pf, t.g)}</td><td className="num">{per(t.pa, t.g)}</td>
              <td className="num">{per(t.yards, t.g)}</td><td className="num">{per(t.passYds, t.g)}</td><td className="num">{per(t.rushYds, t.g)}</td>
              <td className="num">{per(t.yardsAllowed, t.g)}</td><td className="num">{t.turnovers}</td><td className="num">{t.takeaways}</td><td className="num">{t.sacks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
