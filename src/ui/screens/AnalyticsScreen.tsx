import { useState } from "react";
import { addAdv, emptyAdv, perPlay } from "../../engine/analytics";
import { shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, SCHEDULE, TEAM_BY_ID } from "../../engine/league";
import { attribution, teamOutlook } from "../../engine/outlook";
import { matchup } from "../../engine/standings";
import {
  adjustedEpa, analytics, ANALYTICS_LEVELS, buyIn, buyInWord, credibilityWord, gamePlan, leaders, leagueTrend, PRIORITIES,
  seasonAdv, setAnalyticsLevel, setPriority, type Priority,
} from "../../engine/strategy";
import type { GameState } from "../../engine/types";
import { AnalyticsStaffTab, AssessmentsTab } from "./AnalyticsLab";
import { useUi } from "../ui";

const TABS = ["Team", "Players", "Assessments", "Game plan", "Department", "Analysts", "Outlook", "Trends"] as const;
type Tab = (typeof TABS)[number];

const f2 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function AnalyticsScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [tab, setTab] = useState<Tab>("Team");
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Analytics</h2>
        <div className="tabs" role="group" aria-label="Analytics">
          {TABS.map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>
      {tab === "Team" && <TeamTab game={game} />}
      {tab === "Players" && <PlayersTab game={game} />}
      {tab === "Assessments" && <AssessmentsTab game={game} />}
      {tab === "Game plan" && <PlanTab game={game} />}
      {tab === "Department" && <DepartmentTab game={game} changed={changed} />}
      {tab === "Analysts" && <AnalyticsStaffTab game={game} changed={changed} />}
      {tab === "Outlook" && <OutlookTab game={game} />}
      {tab === "Trends" && <TrendsTab game={game} />}
    </section>
  );
}

function TeamTab({ game }: { game: GameState }) {
  const s = seasonAdv(game);
  const adj = adjustedEpa(game);
  const rows = Object.entries(s).sort((a, b) => (adj[b[0]].off - adj[b[0]].def) - (adj[a[0]].off - adj[a[0]].def));
  if (!rows.length) return <p className="muted">The numbers start with the first regular-season game.</p>;
  const all = emptyAdv();
  for (const [, v] of rows) addAdv(all, v.off);
  return (
    <div className="stack">
      <span className="muted">
        EPA is how many points a play added to the offense's expected score; a success is a play with positive EPA. Adjusted numbers account for the opponents faced.
        League average this season: {f2(perPlay(all.epa, all.n))} a play ({f2(perPlay(all.pe, all.pn))} a dropback, {f2(perPlay(all.re, all.rn))} a run), {pct(all.s / Math.max(1, all.n))} success.
      </span>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th><th className="num">Off EPA/play</th><th className="num">Adj</th><th className="num">Success</th><th className="num">Dropback</th><th className="num">Run</th><th className="num">Def EPA/play</th><th className="num">Adj</th><th className="num">Def success</th><th className="num">20+ plays</th></tr></thead>
          <tbody>
            {rows.map(([t, v]) => (
              <tr key={t} className={t === game.userTeam ? "highlight" : ""}>
                <td className="name">{TEAM_BY_ID[t].name}</td>
                <td className="num">{f2(perPlay(v.off.epa, v.off.n))}</td>
                <td className="num">{f2(adj[t].off)}</td>
                <td className="num">{pct(v.off.s / Math.max(1, v.off.n))}</td>
                <td className="num">{f2(perPlay(v.off.pe, v.off.pn))}</td>
                <td className="num">{f2(perPlay(v.off.re, v.off.rn))}</td>
                <td className="num">{f2(perPlay(v.def.epa, v.def.n))}</td>
                <td className="num">{f2(adj[t].def)}</td>
                <td className="num">{pct(v.def.s / Math.max(1, v.def.n))}</td>
                <td className="num">{v.off.x}-{v.def.x}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="muted">Sorted by adjusted offense minus adjusted defense. For defense, lower is better.</span>
    </div>
  );
}

function PlayersTab({ game }: { game: GameState }) {
  const ui = useUi();
  const sets: [string, "q" | "r" | "t", number][] = [["Passers (per dropback)", "q", 100], ["Rushers (per carry)", "r", 50], ["Receivers (per target)", "t", 25]];
  return (
    <div className="stack">
      <span className="muted">EPA a play by role, for players with enough plays. Small samples swing; a few big plays move these a lot.</span>
      <div className="split" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
        {sets.map(([title, role, min]) => {
          const list = leaders(game, role, min).slice(0, 15);
          return (
            <div key={role} className="panel stack tight" style={{ overflowX: "auto" }}>
              <h3>{title}</h3>
              {!list.length && <span className="muted">Not enough plays yet.</span>}
              {list.length > 0 && (
                <table>
                  <thead><tr><th>Player</th><th className="num">Plays</th><th className="num">EPA</th><th className="num">Success</th></tr></thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id} className={`clickable${game.players[p.id]?.team === game.userTeam ? " highlight" : ""}`} onClick={() => ui.openPlayer(p.id)}>
                        <td className="name">{PLAYER_BY_ID[p.id].name} <span className="muted">{game.players[p.id]?.team ?? ""}</span></td>
                        <td className="num">{p.n}</td>
                        <td className="num">{f2(p.epa / p.n)}</td>
                        <td className="num">{pct(p.s / p.n)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function nextGame(game: GameState) {
  for (const g of SCHEDULE) {
    if (g.date < game.date || game.results[g.id] || g.type === "PRE") continue;
    const m = matchup(game, g);
    if (m && (m.away === game.userTeam || m.home === game.userTeam)) return { g, opp: m.away === game.userTeam ? m.home : m.away };
  }
  return null;
}

function PlanTab({ game }: { game: GameState }) {
  const a = analytics(game);
  const next = nextGame(game);
  const plan = next ? gamePlan(game, game.userTeam, next.opp, next.g) : null;
  const past = Object.values(a.plans).filter((p) => game.results[p.gameId]).reverse().slice(0, 6);
  return (
    <div className="stack">
      {plan && next && (
        <div className="panel stack tight">
          <h3>Next: {TEAM_BY_ID[next.opp].name}, {shortDate(next.g.date)}</h3>
          {plan.notes.map((n, i) => <span key={i}>{n}</span>)}
          <span className="muted">The coaches make the plan; you see it, you don't call it. Better coaches, a stronger analytics staff and a full week make better plans.</span>
        </div>
      )}
      {!plan && <p className="muted">No game coming up.</p>}
      <div className="panel stack tight">
        <h3>Fourth downs this season</h3>
        <span>{a.advice.advised} calls where the analysts disagreed with the coach's first instinct; the coach took the advice {a.advice.followed} times. Ignored advice cost about {a.advice.lost.toFixed(1)} expected points.</span>
      </div>
      {past.map((p) => (
        <div key={p.gameId} className="panel stack tight">
          <h3>Last {past.length > 1 ? "games" : "game"}: vs {TEAM_BY_ID[p.opp].name}</h3>
          <span>{p.attack === "run" ? "Attacked with the run." : "Attacked through the air."} {p.stop === "pass" ? "Took away the pass." : "Stopped the run first."}</span>
          {p.adjust.map((t, i) => <span key={i} className="muted">{t}</span>)}
          {p.fourth.map(([adv, coach, ok, ev], i) => <span key={i}>Fourth down: the analysts said {adv}; {ok ? "the coach agreed" : `the coach chose to ${coach} (about ${ev.toFixed(2)} expected points given up)`}.</span>)}
        </div>
      ))}
    </div>
  );
}

function DepartmentTab({ game, changed }: { game: GameState; changed: () => void }) {
  const a = analytics(game);
  const b = buyIn(game);
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>Staff</h3>
          <div className="tabs" role="group" aria-label="Analytics staff">
            {ANALYTICS_LEVELS.map((l, i) => <button key={l.label} aria-pressed={a.level === i} onClick={() => { setAnalyticsLevel(game, i); changed(); }}>{l.label}</button>)}
          </div>
          <span className="muted">{ANALYTICS_LEVELS[a.level].what} {ANALYTICS_LEVELS[a.level].cost ? `About $${(ANALYTICS_LEVELS[a.level].cost / 1e6).toFixed(1)}M a year.` : ""}</span>
        </div>
        <div className="panel stack tight">
          <h3>Research priority</h3>
          <div className="tabs" role="group" aria-label="Research priority">
            {(Object.keys(PRIORITIES) as Priority[]).map((p) => <button key={p} aria-pressed={a.priority === p} onClick={() => { setPriority(game, p); changed(); }}>{PRIORITIES[p].label}</button>)}
          </div>
          <span className="muted">{PRIORITIES[a.priority].what}</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Standing with the football staff</h3>
          <dl className="kv">
            <dt>The analysts</dt><dd>{a.level ? credibilityWord(a.credibility) : "No department"}</dd>
            <dt>The head coach</dt><dd>{buyInWord(b)}</dd>
          </dl>
          <span className="muted">Trust grows when advice is taken and works. Coaches can disagree for good reasons; the Game plan tab shows both sides.</span>
        </div>
        <div className="panel stack tight">
          <h3>Is it paying off?</h3>
          <span>This season: {a.advice.followed} fourth-down calls changed by the analysts, and about {a.advice.lost.toFixed(1)} expected points left on the field when the coach went the other way.</span>
          <span className="muted">Data stays inside the football and business offices; the department keeps its records for the season and starts fresh after the draft.</span>
        </div>
      </div>
      {a.log.length > 0 && (
        <div className="panel stack tight">
          <h3>Notes</h3>
          {a.log.slice(0, 12).map((l, i) => <span key={i}>{shortDate(l.date)}: {l.text}</span>)}
        </div>
      )}
    </div>
  );
}

function OutlookTab({ game }: { game: GameState }) {
  const ui = useUi();
  const at = attribution(game, game.userTeam);
  const rows = teamOutlook(game, game.userTeam);
  return (
    <div className="split">
      <div className="panel stack tight">
        <h3>Why the record looks the way it does</h3>
        {!at && <span className="muted">No regular-season games yet.</span>}
        {at && (
          <>
            <span>{at.w}-{at.l}{at.t ? `-${at.t}` : ""}, {at.pf} points for and {at.pa} against.</span>
            {at.lines.map((l, i) => <span key={i}>{l}</span>)}
          </>
        )}
      </div>
      <div className="panel stack tight">
        <h3>Needs ahead</h3>
        <span className="muted">Starters getting old for their position, or whose contracts run out within two seasons.</span>
        {!rows.length && <span>No starter is aging out or near the end of a deal.</span>}
        {rows.map((r) => (
          <span key={r.id}><button className="link" onClick={() => ui.openPlayer(r.id)}>{PLAYER_BY_ID[r.id].name}</button> <span className="muted">{r.pos}{r.age !== null ? `, ${r.age}` : ""}</span>: {r.flags.join("; ")}.</span>
        ))}
      </div>
    </div>
  );
}

function TrendsTab({ game }: { game: GameState }) {
  const a = analytics(game);
  const now = leagueTrend(game);
  return (
    <div className="panel stack tight">
      <h3>How the league plays</h3>
      <span>
        {a.trends.length === 0 ? "No finished seasons yet in this save. " : ""}
        Passing tilt: {now.pass >= 0 ? "+" : ""}{(now.pass * 100).toFixed(1)} points of pass rate; two-deep coverage: {now.twoHigh >= 0 ? "+" : ""}{(now.twoHigh * 100).toFixed(1)} points.
      </span>
      <span className="muted">After each season the league copies what worked. When passing beats running by more than usual, teams throw more, and defenses answer with more two-deep shells.</span>
      {a.trends.length > 0 && (
        <table>
          <thead><tr><th>Season</th><th className="num">EPA/dropback</th><th className="num">EPA/run</th><th className="num">Pass tilt</th><th className="num">Two-deep tilt</th></tr></thead>
          <tbody>{a.trends.map((t) => <tr key={t.season}><td>{t.season}</td><td className="num">{f2(t.passEpa)}</td><td className="num">{f2(t.rushEpa)}</td><td className="num">{(t.pass * 100).toFixed(1)}</td><td className="num">{(t.twoHigh * 100).toFixed(1)}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
