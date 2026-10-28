import { useEffect } from "react";
import { collegeGames, collegeRecords, mediaRank, prospectLine, prospectTotals, rankOf, recordLabel } from "../engine/college";
import { COLLEGE_TEAM, conferenceName, DEFENSE_NAMES, distanceTo, OFFENSE_NAMES, schoolName } from "../engine/collegeData";
import { shortDate } from "../engine/dates";
import { draftClass } from "../engine/prospects";
import { knowledgeLabel, knowledge, scoutReport, tripCost } from "../engine/scouting";
import type { GameState } from "../engine/types";
import { useUi } from "./ui";

export function SchoolPanel({ game, id, onClose }: { game: GameState; id: string; onClose: () => void }) {
  const ui = useUi();
  const t = COLLEGE_TEAM[id];
  const c = game.college!;
  const rec = collegeRecords(game)[id];
  const rank = rankOf(game, id);
  const games = collegeGames(game).filter((g) => g.away === id || g.home === id).sort((a, b) => a.date.localeCompare(b.date));
  const dc = draftClass(game.seed);
  const prospects = (dc.bySchool[id] ?? []).map((pid) => dc.byId[pid]).sort((a, b) => mediaRank(game, a.id) - mediaRank(game, b.id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer wide" role="dialog" aria-label={t.school} onClick={(e) => e.stopPropagation()}>
        <div className="btn-row" style={{ justifyContent: "flex-end" }}><button className="btn small" onClick={onClose}>Close</button></div>
        <header>
          <div>
            <h2>{rank ? `No. ${rank} ` : ""}{t.school} {t.nickname}</h2>
            <span className="muted">{conferenceName(t.conference)} · {recordLabel(rec)}{t.conference !== "IND" ? ` (${rec.cw}-${rec.cl} conference)` : ""}</span>
          </div>
        </header>
        <dl className="kv">
          <dt>Head coach</dt><dd>{t.coach} (since {t.coachSince})</dd>
          <dt>Campus</dt><dd>{t.city}, {t.state} · {t.region}</dd>
          <dt>Offense</dt><dd>{OFFENSE_NAMES[t.offense]}</dd>
          <dt>Defense</dt><dd>{DEFENSE_NAMES[t.defense]}</dd>
          <dt>From our building</dt><dd>{Math.round(distanceTo(game.userTeam, id)).toLocaleString("en-US")} miles · about ${tripCost(game.userTeam, id).toLocaleString("en-US")} per scout trip</dd>
        </dl>

        <section className="stack tight">
          <h3>NFL prospects ({prospects.length})</h3>
          {prospects.length === 0 && <p className="muted">No draft prospects on this roster.</p>}
          {prospects.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Prospect</th><th>Pos</th><th>Class</th><th className="num">Media</th><th>2026</th><th>Our file</th><th>Our grade</th></tr></thead>
                <tbody>
                  {prospects.map((p) => (
                    <tr key={p.id}>
                      <td className="name"><button className="link" onClick={() => ui.openProspect(p.id)}>{p.name}</button></td>
                      <td>{p.position}</td><td>{p.classYear}</td>
                      <td className="num">{mediaRank(game, p.id) <= 300 ? mediaRank(game, p.id) : "—"}</td>
                      <td className="muted">{prospectLine(p, prospectTotals(game, p.id))}</td>
                      <td>{knowledgeLabel(knowledge(game, p.id))}</td>
                      <td>{scoutReport(game, p.id).grade ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="stack tight">
          <h3>Schedule</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {games.map((g) => {
                  const home = g.home === id;
                  const opp = home ? g.away : g.home;
                  const r = c.results[g.id];
                  const us = r ? (home ? r[1] : r[0]) : null;
                  const them = r ? (home ? r[0] : r[1]) : null;
                  return (
                    <tr key={g.id}>
                      <td>{shortDate(g.date)}</td>
                      <td className="name">{home && !g.site ? "vs" : g.site ? "vs" : "at"} <button className="link" onClick={() => ui.openSchool(opp)}>{schoolName(opp)}</button>
                        {g.name || g.site ? <span className="muted"> · {g.name ?? g.site}</span> : null}{g.conference ? <span className="muted"> · conf</span> : null}</td>
                      <td className={r ? (us! > them! ? "good" : "bad") : "muted"}>{r ? `${us! > them! ? "W" : "L"} ${us}-${them}${r[2] ? " (OT)" : ""}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </aside>
    </div>
  );
}
