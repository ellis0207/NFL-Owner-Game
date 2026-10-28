import { useEffect } from "react";
import { COLLEGE_STATS, injuryNote, mediaRank, prospectLog, prospectTotals, rankedName, STAT_LABEL } from "../engine/college";
import { COLLEGE_TEAM, conferenceName, schoolName } from "../engine/collegeData";
import { shortDate } from "../engine/dates";
import { CLASS_LABEL, draftClass, prospectAge } from "../engine/prospects";
import { DEPTHS, onScoutList, scoutPlayer, scoutReport, unscoutPlayer } from "../engine/scouting";
import type { GameState, ScoutDepth } from "../engine/types";
import { mockSpot, selectionOf } from "../engine/draft";
import { teamLabel } from "../engine/league";
import { height } from "./format";
import { useUi } from "./ui";

export function ProspectPanel({ game, id, onClose, changed }: { game: GameState; id: string; onClose: () => void; changed: () => void }) {
  const ui = useUi();
  const p = draftClass(game.seed).byId[id];
  const report = scoutReport(game, id);
  const log = prospectLog(game, id);
  const totals = prospectTotals(game, id);
  const keys = COLLEGE_STATS[p.position];
  const listed = onScoutList(game, id);
  const hurt = injuryNote(game, id);
  const school = COLLEGE_TEAM[p.school];
  const picked = selectionOf(game, id);
  const udfa = game.draft?.udfa?.[id];
  const back = game.draft?.returned?.includes(id);
  const combine = game.draft?.combine?.[id];
  const mock = mockSpot(game, id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const scout = (d: ScoutDepth) => { unscoutPlayer(game, id); scoutPlayer(game, id, d); changed(); };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer wide" role="dialog" aria-label={p.name} onClick={(e) => e.stopPropagation()}>
        <div className="btn-row" style={{ justifyContent: "flex-end" }}><button className="btn small" onClick={onClose}>Close</button></div>
        <header>
          <div>
            <h2>{p.name}</h2>
            <span className="muted">
              {p.position} · <button className="link" onClick={() => ui.openSchool(p.school)}>{schoolName(p.school)} {school.nickname}</button> · {conferenceName(school.conference)}
            </span>
          </div>
          <span className="jersey" style={{ marginLeft: "auto" }}>{p.jersey}</span>
        </header>
        <dl className="kv">
          <dt>Class</dt><dd>{CLASS_LABEL[p.classYear]}{p.classYear === "JR" || p.classYear === "RS SO" || p.classYear === "RS JR" ? " (has to declare for the draft)" : ""}</dd>
          <dt>Age</dt><dd>{prospectAge(p, game.date)}</dd>
          <dt>Listed</dt><dd>{height(p.heightIn)}, {p.weightLb} lb</dd>
          <dt>Hometown state</dt><dd>{p.hometown}</dd>
          <dt>Media big board</dt><dd>{mediaRank(game, id) <= 300 ? `No. ${mediaRank(game, id)}` : "Not ranked"}</dd>
          <dt>Role</dt><dd>{p.starter ? "Starter" : "Backup"}</dd>
          {hurt && <><dt>Injury</dt><dd className="bad">{hurt}</dd></>}
          {picked && <><dt>Drafted</dt><dd>Round {picked.pick.split("-")[1]}, No. {picked.overall}, {teamLabel(picked.team)}{picked.grade ? ` (our GM: ${picked.grade})` : ""}</dd></>}
          {udfa && <><dt>Signed</dt><dd>Undrafted free agent, {teamLabel(udfa)}</dd></>}
          {back && <><dt>Draft</dt><dd>Went back to school for another year</dd></>}
          {!picked && !udfa && !back && mock && <><dt>Latest mock</dt><dd>No. {mock.overall} to {teamLabel(mock.team)} ({mock.mock.analyst}, {shortDate(mock.mock.date)})</dd></>}
        </dl>
        {combine && (
          <section className="panel stack tight">
            <h3 style={{ margin: 0 }}>Scouting combine</h3>
            <dl className="kv">
              <dt>Height, weight</dt><dd>{height(combine.heightIn)}, {combine.weightLb} lb</dd>
              <dt>40-yard dash</dt><dd>{combine.forty ? combine.forty.toFixed(2) : "Did not run"}</dd>
              <dt>Vertical</dt><dd>{combine.vertical ? `${combine.vertical}"` : "—"}</dd>
              <dt>Bench (225 lb)</dt><dd>{combine.bench ? `${combine.bench} reps` : "—"}</dd>
            </dl>
          </section>
        )}

        <section className="panel stack tight">
          <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ margin: 0 }}>Our scouting report</h3>
            <span className="muted">{report.level}</span>
          </div>
          <div className="meter" aria-label="How well we know him"><span style={{ width: `${report.knowledge}%`, background: "var(--team)" }} /></div>
          {report.grade && <div><strong>{report.grade}</strong>{report.role ? <span className="muted"> · {report.role}</span> : null}</div>}
          {report.strengths.length > 0 && <div><span className="good">Strengths:</span> {report.strengths.join(". ")}.</div>}
          {report.concerns.length > 0 && <div><span className="warn">Concerns:</span> {report.concerns.join(". ")}.</div>}
          {report.size && <div>{report.size}</div>}
          {report.athletic && <div>{report.athletic}</div>}
          {report.fit && <div>{report.fit}</div>}
          {report.upside && <div>{report.upside}</div>}
          {report.makeup.map((m, i) => <div key={i}>{m}</div>)}
          {report.medical && <div><span className="muted">Medical:</span> {report.medical}</div>}
          {report.next && <div className="muted">{report.next}</div>}
          <div className="muted">Filed by {report.author}.</div>
          <div className="btn-row">
            {(Object.keys(DEPTHS) as ScoutDepth[]).map((d) => (
              <button key={d} className={`btn small${listed === d ? " primary" : ""}`} onClick={() => scout(d)} disabled={listed === d}>
                {listed === d ? `On this week's ${DEPTHS[d].label.toLowerCase()} list` : `Add to ${DEPTHS[d].label.toLowerCase()}`}
              </button>
            ))}
            {listed && <button className="btn small" onClick={() => { unscoutPlayer(game, id); changed(); }}>Take off the list</button>}
          </div>
        </section>

        <section className="stack tight">
          <h3>2026 season</h3>
          {totals.g === 0 ? <p className="muted">Hasn't played yet this season.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th className="num">G</th>{keys.map((k) => <th key={k} className="num">{STAT_LABEL[k]}</th>)}</tr></thead>
                <tbody><tr><td className="num">{totals.g}</td>{keys.map((k) => <td key={k} className="num">{(totals[k] ?? 0).toLocaleString("en-US")}</td>)}</tr></tbody>
              </table>
            </div>
          )}
        </section>

        {log.length > 0 && (
          <section className="stack tight">
            <h3>Game log</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Opponent</th><th>Result</th>{keys.map((k) => <th key={k} className="num">{STAT_LABEL[k]}</th>)}</tr></thead>
                <tbody>
                  {log.map((r) => {
                    const played = Object.keys(r.line).length > 0;
                    return (
                      <tr key={r.game.id}>
                        <td>{shortDate(r.game.date)}</td>
                        <td className="name">{r.home || r.game.site ? "vs" : "at"} <button className="link" onClick={() => ui.openSchool(r.opp)}>{schoolName(r.opp)}</button>{r.game.name ? <span className="muted"> · {r.game.name}</span> : null}</td>
                        <td>{r.result}</td>
                        {played ? keys.map((k) => <td key={k} className="num">{r.line[k] ?? 0}</td>) : <td colSpan={keys.length} className="muted">Did not play</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <p className="muted">{rankedName(game, p.school)} is {school.coach}'s team ({school.city}, {school.state}).</p>
      </aside>
    </div>
  );
}
