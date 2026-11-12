// More of the club's history: career leaders and careers ranked across eras,
// the front office's biographies, the rule and ownership eras, and the
// hindsight grades on drafts, signings and coaching staffs.
import { useMemo, useState } from "react";
import { careerLeaders, eraRankings } from "../../engine/careerstats";
import { hindsight } from "../../engine/hindsight";
import { CONTROL } from "../../engine/investors";
import { PLAYER_BY_ID, TEAM_BY_ID, teamLabel } from "../../engine/league";
import { execBios, ownerEras, ruleEras } from "../../engine/records";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { useUi } from "../ui";

const LEADER_KEYS: [string, string][] = [["passYds", "Passing yards"], ["passTd", "Passing TD"], ["rushYds", "Rushing yards"], ["rushTd", "Rushing TD"], ["rec", "Receptions"], ["recYds", "Receiving yards"], ["recTd", "Receiving TD"], ["sacks", "Sacks"], ["defInt", "Interceptions"], ["fgm", "Field goals"]];

function Who({ id }: { id: string }) {
  const ui = useUi();
  return PLAYER_BY_ID[id] ? <button className="link" onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button> : <>{id}</>;
}

export function CareersTab({ game }: { game: GameState }) {
  const [key, setKey] = useState("passYds");
  const leaders = useMemo(() => careerLeaders(game, key, 15), [game, key]);
  const ranks = useMemo(() => eraRankings(game, undefined, 20), [game]);
  return (
    <div className="stack">
      <p className="muted">Career totals from 2005 on, plus every season played in this game. Earlier seasons aren't on file.</p>
      <div className="tabs" role="group" aria-label="Stat">
        {LEADER_KEYS.map(([k, l]) => <button key={k} aria-pressed={key === k} onClick={() => setKey(k)}>{l}</button>)}
      </div>
      <ol>{leaders.map((r) => <li key={r.id}><Who id={r.id} />: {r.value.toLocaleString()}{r.active ? "" : <span className="muted"> (retired)</span>}</li>)}</ol>
      <h3>Across eras</h3>
      <p className="muted">Each season against a Pro Bowl season at the position, with passing scaled to its era. Peak is the best five seasons.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Player</th><th>Pos</th><th>Years</th><th className="num">Seasons</th><th className="num">Peak</th><th className="num">Career</th></tr></thead>
        <tbody>{ranks.map((r) => <tr key={r.id}><td className="name"><Who id={r.id} /></td><td>{r.pos}</td><td>{r.from}-{r.to}</td><td className="num">{r.seasons}</td><td className="num">{r.peak.toFixed(1)}</td><td className="num">{r.career.toFixed(1)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

export function PeopleTab({ game }: { game: GameState }) {
  const bios = execBios(game);
  const rules = ruleEras(game);
  const owners = ownerEras(game);
  return (
    <div className="stack">
      <h3>Owners</h3>
      <ul>{owners.map((o) => <li key={o.owner + o.from}>{o.owner}, {o.from}-{o.to}: {o.w}-{o.l}{o.t ? `-${o.t}` : ""}, {o.playoffs} playoff trips, {o.titles} titles</li>)}</ul>
      <h3>Front office and coaches</h3>
      {bios.length === 0 && <p className="muted">No seasons finished yet.</p>}
      {bios.map((b) => (
        <div key={b.name + b.role + b.from}>
          <strong>{b.name}</strong>, {b.role} ({b.from}-{b.to ?? "now"}): {b.record}.
          {b.decisions.length > 0 && <span className="muted"> {b.decisions.join(" ")}</span>}
          {b.honors.length > 0 && <span> Honors: {b.honors.join(", ")}.</span>}
        </div>
      ))}
      <h3>Rule eras</h3>
      <ul>{rules.map((r) => <li key={r.label + r.from}>{r.label} ({r.from}-{r.to}): {r.ppg.toFixed(1)} points and {Math.round(r.passPerGame)} passing yards a team-game{r.rules.length ? `; ${r.rules.join(", ")}` : ""}</li>)}</ul>
    </div>
  );
}

export function HindsightTab({ game }: { game: GameState }) {
  const h = hindsight(game);
  const ours = game.userTeam;
  return (
    <div className="stack">
      <p className="muted">Two and four seasons after each draft and free agency period, the staff grades them again on what the players actually did.</p>
      {h.coaching.length > 0 && <>
        <h3>Coaching grades</h3>
        <ul>{h.coaching.map((c) => <li key={c.season}>{c.season} ({c.hc}; {c.oc}, {c.dc}): {c.wins} wins with talent that usually wins {c.expectedWins.toFixed(1)}, points for and against worth {c.pythagWins.toFixed(1)}. {c.note}</li>)}</ul>
      </>}
      {h.drafts.map((d) => {
        const mine = d.picks.filter((p) => p.team === ours);
        const best = [...d.teams].sort((a, b) => b.value - b.expected - (a.value - a.expected)).slice(0, 3);
        return (
          <div key={`${d.year}-${d.after}`} className="stack">
            <h3>{d.year} draft, {d.after} seasons later</h3>
            <span>Best classes: {best.map((t) => `${teamLabel(t.team)} (${t.grade})`).join(", ")}. Ours: {d.teams.find((t) => t.team === ours)?.grade ?? "-"}.</span>
            <ul>{mine.map((p) => <li key={p.player}>No. {p.overall} <Who id={p.player} />: {p.grade}{p.dayGrade ? ` (draft day: ${p.dayGrade})` : ""}</li>)}</ul>
          </div>
        );
      })}
      {h.signings.map((s) => {
        const mine = s.grades.filter((g) => g.team === ours);
        return (
          <div key={`${s.year}-${s.after}`}>
            <h3>{s.year} free agency, {s.after} seasons later</h3>
            {mine.length ? <ul>{mine.map((g) => <li key={g.player}><Who id={g.player} />, {money(g.apy)} a year: {g.grade}</li>)}</ul> : <span className="muted">No signings of ours to grade.</span>}
          </div>
        );
      })}
      {!h.drafts.length && !h.signings.length && !h.coaching.length && <p className="muted">Nothing to grade yet. The first coaching grade comes after this season's Super Bowl, and draft re-grades two seasons after each draft.</p>}
    </div>
  );
}

const big = (x: number) => (Math.abs(x) >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : money(x));
const years = (from: string, to?: string) => (!to ? `${from.slice(0, 4)} on` : from.slice(0, 4) === to.slice(0, 4) ? from.slice(0, 4) : `${from.slice(0, 4)}-${to.slice(0, 4)}`);

/** Who has owned the club, the player's own clubs, and changes of control around the league. */
export function OwnersTab({ game }: { game: GameState }) {
  const eras = ownerEras(game);
  const t = game.tenure;
  const s = game.succession;
  const f = game.franchise;
  const before = CONTROL[game.userTeam];
  return (
    <div className="stack">
      <div className="panel stack tight">
        <h3>Owners of the {TEAM_BY_ID[game.userTeam].name}</h3>
        <ul className="plain">
          {before && <li>Before 2026: {before}.</li>}
          {(t?.clubs ?? []).filter((c) => c.team === game.userTeam).map((c, i) => <li key={i}>{years(c.from, c.to)}: {c.how}{c.price ? ` for ${big(c.price)}` : ""}.</li>)}
          {(f?.sales ?? []).filter((x) => x.team === game.userTeam && !x.real).map((x, i) => <li key={`s${i}`}>{x.date.slice(0, 4)}: sold to {x.buyer} for {big(x.price)}.</li>)}
        </ul>
        {eras.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Owner</th><th>Seasons</th><th className="num">Record</th><th className="num">Playoffs</th><th className="num">Titles</th></tr></thead>
              <tbody>{eras.map((o) => <tr key={o.owner + o.from}><td>{o.owner}</td><td>{o.from === o.to ? o.from : `${o.from}-${o.to}`}</td><td className="num">{o.w}-{o.l}{o.t ? `-${o.t}` : ""}</td><td className="num">{o.playoffs}</td><td className="num">{o.titles}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <span className="muted">Contracts, records and relationships carry over when the club changes hands.</span>
      </div>
      {t && t.clubs.length > 0 && (
        <div className="panel stack tight">
          <h3>Your family's clubs</h3>
          <ul className="plain">{t.clubs.map((c, i) => <li key={i}>{TEAM_BY_ID[c.team]?.name ?? c.team}: {c.how}, {years(c.from, c.to)}{c.proceeds ? `; netted ${big(c.proceeds)}` : ""}.</li>)}</ul>
        </div>
      )}
      {s && s.history.length > 0 && (
        <div className="panel stack tight">
          <h3>Succession</h3>
          <ul className="plain muted">{s.history.slice(0, 12).map((h, i) => <li key={i}>{h.date}: {h.text}</li>)}</ul>
        </div>
      )}
      {f && f.sales.length > 0 && (
        <div className="panel stack tight">
          <h3>Changes of control around the league</h3>
          <ul className="plain">{[...f.sales].reverse().map((x, i) => <li key={i}>{x.date.slice(0, 4)}: the {TEAM_BY_ID[x.team]?.name ?? x.team} to {x.buyer}, {big(x.price)}.</li>)}</ul>
        </div>
      )}
    </div>
  );
}
