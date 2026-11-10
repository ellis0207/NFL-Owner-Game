// The analytics department's people, data feeds and experiments, the
// position assessments built from the box scores, and the league's new
// ideas this season.
import { useState } from "react";
import { analysts, ANALYST_ROLE, DATA_FEEDS, decideExperiment, EXPERIMENTS, feedsCost, replaceAnalyst, setFeed, startExperiment, type ExperimentKind, type Feed } from "../../engine/analysts";
import { assessments } from "../../engine/assess";
import { shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, RULES, teamLabel } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { money } from "../format";

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

export function AnalyticsStaffTab({ game, changed }: { game: GameState; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const x = analysts(game);
  const innov = (game.analytics?.innovations ?? []).filter((i) => i.season >= RULES.season);
  return (
    <div className="stack">
      {said && <p className="notice">{said}</p>}
      <h3>The analysts</h3>
      {x.staff.length === 0 ? <p className="muted">No analysts at this staff level. Raise it on the Department tab.</p> : (
        <ul>
          {x.staff.map((a, i) => (
            <li key={i}>
              {a.name}, {ANALYST_ROLE[a.role].toLowerCase()} since {a.since}.{" "}
              <span className="muted">{a.skill >= 75 ? "The director calls the work sharp." : a.skill >= 58 ? "Solid work." : "The work has been uneven."}</span>{" "}
              <button className="link" onClick={() => { const n = replaceAnalyst(game, i); setSaid(n ? `${a.name} is out; ${n.name} takes the job.` : null); changed(); }}>Replace</button>
            </li>
          ))}
        </ul>
      )}
      <h3>Data feeds</h3>
      <p className="muted">Bought by the year, paid monthly on the research line: {money(feedsCost(game))} a year now.</p>
      {(Object.keys(DATA_FEEDS) as Feed[]).map((f) => (
        <label key={f} className="row">
          <input type="checkbox" checked={!!x.feeds[f]} onChange={(e) => { setFeed(game, f, e.target.checked); changed(); }} />
          <span><strong>{DATA_FEEDS[f].label}</strong> ({money(DATA_FEEDS[f].cost)} a year). <span className="muted">{DATA_FEEDS[f].what}</span></span>
        </label>
      ))}
      <h3>Experiments</h3>
      <p className="muted">Try a change on half the roster or half the games and measure it against the other half. Results come with a margin of error; a result inside it says nothing either way.</p>
      {(Object.keys(EXPERIMENTS) as ExperimentKind[]).map((k) => {
        const e = x.experiments.find((y) => y.kind === k);
        return (
          <div key={k} className="row wrap">
            <span><strong>{EXPERIMENTS[k].label}</strong> ({EXPERIMENTS[k].weeks} weeks). </span>
            {!e || e.dropped ? <button onClick={() => { setSaid(startExperiment(game, k)); changed(); }}>Start</button>
              : e.adopted ? <span className="good">Adopted (measured {pct(e.measured ?? 0)}).</span>
              : e.measured === undefined ? <span className="muted">Running until {shortDate(e.ends)}.</span>
              : <>
                  <span>Measured {pct(e.measured)}, give or take {pct(e.margin ?? 0).replace("+", "")}.</span>
                  <button onClick={() => { decideExperiment(game, k, true); changed(); }}>Adopt</button>
                  <button onClick={() => { decideExperiment(game, k, false); changed(); }}>Drop</button>
                </>}
          </div>
        );
      })}
      {innov.length > 0 && (
        <>
          <h3>New ideas around the league</h3>
          <ul>{innov.map((i) => <li key={i.team + i.kind}>{teamLabel(i.team)}: {i.idea}.</li>)}</ul>
        </>
      )}
    </div>
  );
}

export function AssessmentsTab({ game }: { game: GameState }) {
  const a = assessments(game);
  const n = (id: string) => PLAYER_BY_ID[id]?.name ?? id;
  return (
    <div className="stack">
      <p className="muted">Position assessments from this regular season's box scores. Defense as a unit: {a.unit.thirdDownStop}% of third downs stopped, {a.unit.explosiveAllowed}% of plays given up for 20 yards or more, pressure on {a.unit.pressureRate}% of dropbacks.</p>
      {a.qb.length > 0 && <>
        <h3>Quarterbacks</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Player</th><th className="num">Dropbacks</th><th className="num">Cmp%</th><th className="num">Y/A</th><th className="num">Pressured</th><th className="num">Sack%</th><th className="num">Pressure to sack</th><th className="num">TO%</th><th className="num">EPA/play</th></tr></thead>
          <tbody>{a.qb.map((q) => <tr key={q.id}><td className="name">{n(q.id)}</td><td className="num">{q.dropbacks}</td><td className="num">{q.cmpPct}</td><td className="num">{q.ypa}</td><td className="num">{q.pressuredPct}%</td><td className="num">{q.sackPct}%</td><td className="num">{q.pressureToSack}%</td><td className="num">{q.toPct}%</td><td className="num">{q.epa}</td></tr>)}</tbody>
        </table></div>
      </>}
      {a.line.length > 0 && <>
        <h3>Blockers</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Player</th><th className="num">Snaps</th><th className="num">Pressures allowed</th><th className="num">Per 100 pass blocks</th></tr></thead>
          <tbody>{a.line.map((l) => <tr key={l.id}><td className="name">{n(l.id)}</td><td className="num">{l.snaps}</td><td className="num">{l.allowed}</td><td className="num">{l.perHundred}</td></tr>)}</tbody>
        </table></div>
      </>}
      {a.def.length > 0 && <>
        <h3>Defenders</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Player</th><th className="num">Snaps</th><th className="num">Pressures</th><th className="num">Sacks</th><th className="num">TFL</th><th className="num">Passes defended + INT</th><th className="num">Tackles</th></tr></thead>
          <tbody>{a.def.map((d) => <tr key={d.id}><td className="name">{n(d.id)}</td><td className="num">{d.snaps}</td><td className="num">{d.pressures}</td><td className="num">{d.sacks}</td><td className="num">{d.tfl}</td><td className="num">{d.coverage}</td><td className="num">{d.tackles}</td></tr>)}</tbody>
        </table></div>
      </>}
      {a.st.length > 0 && <>
        <h3>Special teams</h3>
        <ul>{a.st.map((s) => <li key={s.id + s.role}>{s.role}: {n(s.id)}, {s.line}</li>)}</ul>
      </>}
      {!a.qb.length && !a.line.length && !a.def.length && <p className="muted">No regular-season games yet.</p>}
    </div>
  );
}
