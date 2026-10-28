import { useMemo, useState } from "react";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID, teamLabel } from "../../engine/league";
import { seasonTotals, teamTotals, type SeasonLine, type StatKey, type StatLine } from "../../engine/stats";
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
  // A past season from this save's record books, or null for this one.
  const [year, setYear] = useState<number | null>(null);
  const past = game.history?.seasons ?? [];
  const archived = useMemo(() => (year === null ? null : pastTotals(game, year)), [game, year]);
  const totals = archived ?? seasonTotals(game, phase);
  const entries = Object.entries(totals);

  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>Stats</h2>
        {past.length > 0 && (
          <label className="muted">Season{" "}
            <select value={year ?? ""} onChange={(e) => { const y = e.target.value ? Number(e.target.value) : null; setYear(y); if (y !== null && view === "league") setView("leaders"); }}>
              <option value="">{RULES.season} (this season)</option>
              {[...past].reverse().map((r) => <option key={r.season} value={r.season}>{r.season} regular season</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="btn-row" style={{ justifyContent: "space-between" }}>
        {year === null ? (
          <div className="tabs" role="group" aria-label="Part of the season">
            {PHASES.map(([k, label]) => <button key={k} aria-pressed={phase === k} onClick={() => setPhase(k)}>{label}</button>)}
          </div>
        ) : <span className="muted">Regular-season totals from {year}.</span>}
        <div className="tabs" role="group" aria-label="View">
          {([["leaders", "League leaders"], ["team", TEAM_BY_ID[game.userTeam].name], ...(year === null ? [["league", "Team stats"]] : [])] as [View, string][]).map(([k, label]) => (
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

      {entries.length > 0 && view === "league" && year === null && <TeamTable game={game} phase={phase} />}
      {past.length > 0 && <RecordBook game={game} />}
      <p className="muted">Stats count every snap the game has simulated in this save. Tap a player for their game log.</p>
    </section>
  );
}

/** A past season's regular-season lines, from the record books. */
function pastTotals(game: GameState, year: number): Record<string, SeasonLine> {
  const out: Record<string, SeasonLine> = {};
  for (const [id, rows] of Object.entries(game.history?.stats ?? {})) {
    const row = rows.find((r) => r.season === year);
    if (!row || !PLAYER_BY_ID[id]) continue;
    const line: StatLine = {};
    for (const [k, val] of Object.entries(row)) if (typeof val === "number" && k !== "season") (line as Record<string, number>)[k] = val;
    const snaps = game.history?.snaps[id]?.[String(year)];
    if (snaps) Object.assign(line, { offSnaps: snaps.offense, defSnaps: snaps.defense, stSnaps: snaps.st });
    out[id] = { team: row.team, line };
  }
  return out;
}

/** Every season this save has played: champions and how we did. */
function RecordBook({ game }: { game: GameState }) {
  const us = game.userTeam;
  const label: Record<string, string> = { CHAMP: "Won the Super Bowl", SB: "Lost the Super Bowl", CONF: "Lost the conference title game", DIV: "Lost in the divisional round", WC: "Lost on Wild Card weekend" };
  return (
    <div className="stack tight">
      <h3>Record book</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Season</th><th>Champion</th><th>Runner-up</th><th className="num">Our record</th><th>Our finish</th></tr></thead>
          <tbody>
            {[...(game.history?.seasons ?? [])].reverse().map((r) => {
              const [w, l, t] = r.records[us];
              return (
                <tr key={r.season}>
                  <td>{r.season}</td>
                  <td className="name">{r.champion ? teamLabel(r.champion) : "—"}</td>
                  <td>{r.runnerUp ? teamLabel(r.runnerUp) : "—"}</td>
                  <td className="num">{w}-{l}{t ? `-${t}` : ""}</td>
                  <td className="muted">{label[r.playoffs[us]] ?? `${["", "1st", "2nd", "3rd", "4th"][r.place[us]]} in the division`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
