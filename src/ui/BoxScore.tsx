import { useEffect, useState } from "react";
import { kickoff, longDate } from "../engine/dates";
import { GAME_BY_ID, PLAYER_BY_ID, TEAM_BY_ID } from "../engine/league";
import { gameTypeLabel } from "../engine/season";
import { stat, type StatKey } from "../engine/stats";
import type { GameState, TeamBox } from "../engine/types";
import { useUi } from "./ui";

type Side = "away" | "home";

function clockText(q: number, sec: number): string {
  const quarter = q <= 4 ? `Q${q}` : q === 5 ? "OT" : `${q - 4}OT`;
  return `${quarter} ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function top(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

const TEAM_ROWS: [string, (t: TeamBox) => string][] = [
  ["First downs", (t) => `${t.firstDowns}`],
  ["Total yards", (t) => `${t.yards}`],
  ["Passing", (t) => `${t.passYds - t.sackYds}`],
  ["Comp-Att", (t) => `${t.cmp}-${t.passAtt}`],
  ["Sacked-Yards", (t) => `${t.sacked}-${t.sackYds}`],
  ["Rushing", (t) => `${t.rushAtt}-${t.rushYds}`],
  ["Third down", (t) => `${t.thirdConv}-${t.thirdAtt}`],
  ["Fourth down", (t) => `${t.fourthConv}-${t.fourthAtt}`],
  ["Red zone (TD-trips)", (t) => `${t.redZoneTd}-${t.redZoneAtt}`],
  ["Turnovers", (t) => `${t.turnovers}`],
  ["Penalties-Yards", (t) => `${t.penalties}-${t.penYds}`],
  ["Possession", (t) => top(t.top)],
];

interface Col { label: string; value: (v: number[]) => string | number }
const g = (k: StatKey) => (v: number[]) => stat(v, k);
const SECTIONS: { title: string; has: StatKey; sort: StatKey; cols: Col[] }[] = [
  { title: "Passing", has: "att", sort: "passYds", cols: [
    { label: "C/Att", value: (v) => `${stat(v, "cmp")}/${stat(v, "att")}` }, { label: "Yds", value: g("passYds") }, { label: "TD", value: g("passTd") },
    { label: "Int", value: g("int") }, { label: "Sk", value: (v) => `${stat(v, "sacked")}-${stat(v, "sackYds")}` }, { label: "Long", value: g("passLong") }] },
  { title: "Rushing", has: "car", sort: "rushYds", cols: [
    { label: "Car", value: g("car") }, { label: "Yds", value: g("rushYds") }, { label: "Avg", value: (v) => (stat(v, "rushYds") / Math.max(1, stat(v, "car"))).toFixed(1) },
    { label: "TD", value: g("rushTd") }, { label: "Long", value: g("rushLong") }, { label: "Fum", value: (v) => (stat(v, "fumLost") ? `${stat(v, "fum")}-${stat(v, "fumLost")}` : stat(v, "fum")) }] },
  { title: "Receiving", has: "tgt", sort: "recYds", cols: [
    { label: "Rec", value: g("rec") }, { label: "Tgt", value: g("tgt") }, { label: "Yds", value: g("recYds") },
    { label: "Avg", value: (v) => (stat(v, "rec") ? (stat(v, "recYds") / stat(v, "rec")).toFixed(1) : "-") }, { label: "TD", value: g("recTd") }, { label: "Long", value: g("recLong") }] },
  { title: "Defense", has: "defSnaps", sort: "tklSolo", cols: [
    { label: "Tkl", value: (v) => stat(v, "tklSolo") + stat(v, "tklAst") }, { label: "Solo", value: g("tklSolo") }, { label: "Sack", value: g("sacks") },
    { label: "TFL", value: g("tfl") }, { label: "QB hit", value: g("qbHits") }, { label: "Int", value: g("defInt") }, { label: "PD", value: g("pd") }, { label: "FF", value: g("ff") }] },
  { title: "Kicking", has: "xpa", sort: "fgm", cols: [
    { label: "FG", value: (v) => `${stat(v, "fgm")}/${stat(v, "fga")}` }, { label: "Long", value: g("fgLong") }, { label: "XP", value: (v) => `${stat(v, "xpm")}/${stat(v, "xpa")}` },
    { label: "Pts", value: (v) => stat(v, "fgm") * 3 + stat(v, "xpm") }] },
  { title: "Punting", has: "punts", sort: "punts", cols: [
    { label: "No", value: g("punts") }, { label: "Yds", value: g("puntYds") }, { label: "Avg", value: (v) => (stat(v, "puntYds") / Math.max(1, stat(v, "punts"))).toFixed(1) },
    { label: "In 20", value: g("puntIn20") }, { label: "TB", value: g("puntTb") }, { label: "Long", value: g("puntLong") }] },
  { title: "Returns", has: "kr", sort: "krYds", cols: [
    { label: "KR", value: g("kr") }, { label: "Yds", value: g("krYds") }, { label: "PR", value: g("pr") }, { label: "Yds", value: g("prYds") }, { label: "TD", value: (v) => stat(v, "krTd") + stat(v, "prTd") }] },
];

export function BoxScore({ game, id, onClose }: { game: GameState; id: string; onClose: () => void }) {
  const ui = useUi();
  const sched = GAME_BY_ID[id];
  const r = game.results[id];
  const box = game.box[id];
  const [side, setSide] = useState<Side>(r?.home === game.userTeam ? "home" : "away");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!r) return null;
  const teams = { away: TEAM_BY_ID[r.away], home: TEAM_BY_ID[r.home] };
  const periods = box ? Math.max(box.quarters.away.length, box.quarters.home.length) : 0;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer wide" role="dialog" aria-label="Box score" onClick={(e) => e.stopPropagation()}>
        <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="label">{sched.label ?? gameTypeLabel(sched)} · {longDate(sched.date)} · {kickoff(sched.timeET)}</span>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <header className="box-head">
          <div className={r.awayScore > r.homeScore ? "win" : ""}><span className="label">{teams.away.city}</span><strong>{teams.away.name}</strong><span className="pts">{r.awayScore}</span></div>
          <span className="muted">{r.overtime ? "Final/OT" : "Final"}</span>
          <div className={r.homeScore > r.awayScore ? "win" : ""}><span className="label">{teams.home.city}</span><strong>{teams.home.name}</strong><span className="pts">{r.homeScore}</span></div>
        </header>
        <span className="muted">{sched.stadium ?? teams.home.stadium}{sched.city ? `, ${sched.city}` : ""}</span>
        {!box && <p className="muted">This game was played before box scores were kept in this save.</p>}
        {box && (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Team</th>{Array.from({ length: periods }, (_, i) => <th key={i} className="num">{i < 4 ? i + 1 : "OT"}</th>)}<th className="num">T</th></tr></thead>
                <tbody>
                  {(["away", "home"] as Side[]).map((s) => (
                    <tr key={s}><td className="name">{r[s]}</td>{Array.from({ length: periods }, (_, i) => <td key={i} className="num">{box.quarters[s][i] ?? 0}</td>)}<td className="num"><strong>{s === "away" ? r.awayScore : r.homeScore}</strong></td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="stack">
              <h3>Scoring</h3>
              {box.scoring.length === 0 && <p className="muted">No points scored.</p>}
              <ol className="plays">
                {box.scoring.map((p, i) => (
                  <li key={i}>
                    <span className="num muted">{clockText(p.q, p.clock)}</span>
                    <span><strong>{p.team}</strong> {p.text}</span>
                    <span className="num">{p.away}-{p.home}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="stack">
              <h3>Team stats</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th></th><th className="num">{r.away}</th><th className="num">{r.home}</th></tr></thead>
                  <tbody>
                    {TEAM_ROWS.map(([label, f]) => (
                      <tr key={label}><td>{label}</td><td className="num">{f(box.team.away)}</td><td className="num">{f(box.team.home)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="stack">
              <div className="tabs" role="group" aria-label="Team">
                {(["away", "home"] as Side[]).map((s) => <button key={s} aria-pressed={side === s} onClick={() => setSide(s)}>{teams[s].name}</button>)}
              </div>
              {SECTIONS.map((sec) => {
                const rows = Object.entries(box.players[side]).filter(([, v]) => stat(v, sec.has) > 0 && (sec.title !== "Defense" || stat(v, "tklSolo") + stat(v, "tklAst") + stat(v, "sacks") + stat(v, "defInt") + stat(v, "pd") > 0));
                if (!rows.length) return null;
                rows.sort((a, b) => sec.title === "Defense"
                  ? stat(b[1], "tklSolo") + stat(b[1], "tklAst") - stat(a[1], "tklSolo") - stat(a[1], "tklAst")
                  : stat(b[1], sec.sort) - stat(a[1], sec.sort));
                return (
                  <div key={sec.title} className="stack tight">
                    <h3>{sec.title}</h3>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Player</th>{sec.cols.map((c, i) => <th key={i} className="num">{c.label}</th>)}</tr></thead>
                        <tbody>
                          {rows.map(([pid, v]) => (
                            <tr key={pid} className="clickable" onClick={() => ui.openPlayer(pid)}>
                              <td className="name">{PLAYER_BY_ID[pid].name} <span className="muted">{PLAYER_BY_ID[pid].position}</span></td>
                              {sec.cols.map((c, i) => <td key={i} className="num">{c.value(v)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {(box.inactives[side].length > 0 || box.injuries.some((i) => i.team === r[side])) && (
                <div className="stack tight">
                  {box.injuries.some((i) => i.team === r[side]) && (
                    <p><span className="label">Injuries</span> {box.injuries.filter((i) => i.team === r[side]).map((i) => `${PLAYER_BY_ID[i.player].name} (${i.type.toLowerCase()})`).join(", ")}</p>
                  )}
                  {box.inactives[side].length > 0 && (
                    <p><span className="label">Inactive</span> {box.inactives[side].map((pid) => `${PLAYER_BY_ID[pid].name} ${PLAYER_BY_ID[pid].position}`).join(", ")}</p>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
