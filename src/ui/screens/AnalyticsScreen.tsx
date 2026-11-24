import { useState } from "react";
import { Avatar, Chip, Hud, HudStat, Leaderboard, Scatter, Spark, TeamTag } from "../gfx";
import { addAdv, emptyAdv, perPlay } from "../../engine/analytics";
import { shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, TEAM_BY_ID } from "../../engine/league";
import { attribution, teamOutlook } from "../../engine/outlook";
import {
  adjustedEpa, analytics, ANALYTICS_LEVELS, buyIn, buyInWord, credibilityWord, leaders, leagueTrend, PRIORITIES,
  seasonAdv, setAnalyticsLevel, setPriority, type Priority,
} from "../../engine/strategy";
import type { GameState } from "../../engine/types";
import { AnalyticsStaffTab, AssessmentsTab } from "./AnalyticsLab";
import { GroupedTabs } from "../Tabs";
import { useUi } from "../ui";
import { tip } from "../tip";

type Tab = "Team" | "Players" | "Assessments" | "Outlook" | "Department" | "Analysts" | "Trends";
// Our own numbers first, then the department that produces them. The game plan
// lives on the Game week page, next to the practice plan it feeds.
const GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Our team", tabs: ["Team", "Players", "Assessments", "Outlook"] },
  { label: "Department", tabs: ["Department", "Analysts", "Trends"] },
];

const f2 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function AnalyticsScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [tab, setTab] = useState<Tab>("Team");
  return (
    <section className="stack">
      <GroupedTabs label="Analytics" groups={GROUPS} value={tab} onChange={setTab} />
      {tab === "Team" && <TeamTab game={game} />}
      {tab === "Players" && <PlayersTab game={game} />}
      {tab === "Assessments" && <AssessmentsTab game={game} />}
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
      <div className="panel stack tight">
        <h3>Offense against defense, adjusted EPA a play</h3>
        <Scatter points={rows.map(([t]) => ({ key: t, team: t, x: adj[t].off, y: adj[t].def, mine: t === game.userTeam }))} xLabel="Better offense" yLabel="Better defense" invertY />
        <span className="muted">Top right is good on both sides; bottom left struggles on both.</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th><th className="num">Off EPA/play</th><th className="num">Adj</th><th className="num">Success</th><th className="num">Dropback</th><th className="num">Run</th><th className="num">Def EPA/play</th><th className="num">Adj</th><th className="num">Def success</th><th className="num">20+ plays</th></tr></thead>
          <tbody>
            {rows.map(([t, v]) => (
              <tr key={t} className={t === game.userTeam ? "highlight" : ""}>
                <td className="name"><TeamTag team={t} name={TEAM_BY_ID[t].name} /></td>
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
                <Leaderboard onPick={ui.openPlayer} rows={list.map((p) => ({ key: p.id, team: game.players[p.id]?.team ?? undefined, mine: game.players[p.id]?.team === game.userTeam,
                  who: <span {...tip("player", p.id)}>{PLAYER_BY_ID[p.id].name}</span>, sub: `${p.n} plays · ${pct(p.s / p.n)} success`, value: p.epa / p.n, text: f2(p.epa / p.n) }))} />
              )}
            </div>
          );
        })}
      </div>
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
          <div className="gx-grid">
            <div className="gx-tile sunk gx-row"><Avatar name="Analytics" icon="chart" size={36} /><span><span className="gx-kicker">The analysts</span><br /><strong>{a.level ? credibilityWord(a.credibility) : "No department"}</strong></span></div>
            <div className="gx-tile sunk gx-row"><Avatar name="Head Coach" icon="whistle" size={36} /><span><span className="gx-kicker">The head coach</span><br /><strong>{buyInWord(b)}</strong></span></div>
          </div>
          <span className="muted">Trust grows when advice is taken and works. Coaches can disagree for good reasons; the game plan on Game week shows both sides.</span>
        </div>
        <div className="panel stack tight">
          <h3>Is it paying off?</h3>
          <div className="gx-row"><HudStat icon="check" label="Calls changed" value={String(a.advice.followed)} tone="good" /><HudStat icon="target" label="Points left on the field" value={a.advice.lost.toFixed(1)} tone={a.advice.lost > 3 ? "bad" : undefined} /></div>
          <span className="muted">This season: {a.advice.followed} fourth-down calls changed by the analysts, and about {a.advice.lost.toFixed(1)} expected points left on the field when the coach went the other way.</span>
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
            <Hud><HudStat icon="trophy" label="Record" value={`${at.w}-${at.l}${at.t ? `-${at.t}` : ""}`} /><HudStat icon="football" label="Points for" value={String(at.pf)} tone="good" /><HudStat icon="shield" label="Points against" value={String(at.pa)} tone="bad" /></Hud>
            {at.lines.map((l, i) => <span key={i}>{l}</span>)}
          </>
        )}
      </div>
      <div className="panel stack tight">
        <h3>Needs ahead</h3>
        <span className="muted">Starters getting old for their position, or whose contracts run out within two seasons.</span>
        {!rows.length && <span>No starter is aging out or near the end of a deal.</span>}
        {rows.map((r) => (
          <div key={r.id} className="gx-row"><span className="gx-pos">{r.pos}</span><button className="link" {...tip("player", r.id)} onClick={() => ui.openPlayer(r.id)}>{PLAYER_BY_ID[r.id].name}</button>{r.age !== null && <span className="muted">{r.age}</span>}{r.flags.map((f) => <Chip key={f} icon={/contract/i.test(f) ? "pen" : "clock"} tone={/this season|past/i.test(f) ? "warn" : undefined}>{f}</Chip>)}</div>
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
      {a.trends.length > 1 && (
        <div className="gx-row" style={{ gap: "1.5rem" }}>
          <Spark values={a.trends.map((t) => t.pass)} label="Pass tilt by season" width={160} height={40} />
          <Spark values={a.trends.map((t) => t.twoHigh)} label="Two-deep tilt by season" width={160} height={40} tone="warn" />
        </div>
      )}
      {a.trends.length > 0 && (
        <table>
          <thead><tr><th>Season</th><th className="num">EPA/dropback</th><th className="num">EPA/run</th><th className="num">Pass tilt</th><th className="num">Two-deep tilt</th></tr></thead>
          <tbody>{a.trends.map((t) => <tr key={t.season}><td>{t.season}</td><td className="num">{f2(t.passEpa)}</td><td className="num">{f2(t.rushEpa)}</td><td className="num">{(t.pass * 100).toFixed(1)}</td><td className="num">{(t.twoHigh * 100).toFixed(1)}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
