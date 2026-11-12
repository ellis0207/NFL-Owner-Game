import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { TEAMS, teamLabel } from "../../engine/league";
import { proposeRealign, relocation } from "../../engine/relocation";
import { profile, rivals } from "../../engine/rivals";
import type { GameState } from "../../engine/types";
import { money } from "../format";

/** Club profiles: how each rival club is owned, run and regarded. */
export function ClubProfiles({ game }: { game: GameState }) {
  const others = TEAMS.filter((t) => t.id !== game.userTeam);
  const [team, setTeam] = useState(others[0].id);
  const p = profile(game, team);
  const log = rivals(game).log.slice(0, 8);
  return (
    <div className="stack">
      <section className="panel stack tight">
        <h3>Club profiles</h3>
        <span className="muted">What the league knows about how each club is owned and run: its owner's approach, who makes the football calls, its spending and its standing with candidates.</span>
        <label className="field" data-view><span className="label">Club</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            {others.map((t) => <option key={t.id} value={t.id}>{teamLabel(t.id)}</option>)}
          </select>
        </label>
        <dl className="kv">
          <dt>Controlled by</dt><dd>{p.owner}</dd>
          <dt>Owner's approach</dt><dd>{p.style}</dd>
          <dt>Who decides</dt><dd>{p.governance}</dd>
          <dt>Management reputation</dt><dd>{p.rep}</dd>
          <dt>With candidates</dt><dd>{p.hiring}</dd>
          <dt>Money</dt><dd>{p.money}</dd>
          <dt>Player budget</dt><dd>{money(p.budget.salary)}</dd>
          <dt>Staff budget</dt><dd>{money(p.budget.staff)}</dd>
          <dt>Stadium and capital</dt><dd>{money(p.budget.stadium)} upkeep, {money(p.budget.capital)} projects</dd>
        </dl>
        {p.meddles.length > 0 && <><h4>Owner interference</h4><ul className="plain">{p.meddles.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
        {p.memory.length > 0 && <><h4>What the club remembers</h4><ul className="plain muted">{p.memory.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
        <h4>Ownership</h4>
        <ul className="plain">{p.history.map((h, i) => <li key={i}>{h}</li>)}</ul>
      </section>
      {log.length > 0 && (
        <section className="panel stack tight">
          <h3>Around the league</h3>
          <ul className="plain muted">{log.map((l, i) => <li key={i}>{shortDate(l.date)}: {l.text}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

/** Realignment: ask the owners to swap our division with another club's. */
export function Realignment({ game, say }: { game: GameState; say: (t: string | null) => void }) {
  const r = relocation(game);
  return (
    <section className="panel stack tight">
      <h3>Realignment</h3>
      <span className="muted">The owners vote at the annual meeting; a swap needs 24 votes and takes effect the next season, and schedules, rivalries and the playoff path follow the new divisions. After a move, geography usually carries it; without one, owners weigh tradition and most proposals fail.</span>
      <label className="field"><span className="label">Swap our division with</span>
        <select defaultValue="" onChange={(x) => x.target.value && say(proposeRealign(game, x.target.value))}>
          <option value="">Choose a club</option>
          {TEAMS.filter((t) => t.id !== game.userTeam).map((t) => <option key={t.id} value={t.id}>{teamLabel(t.id)} ({t.conference} {t.division})</option>)}
        </select>
      </label>
      {r.realign.length === 0 && <span className="muted">No realignment proposals yet.</span>}
      {r.realign.map((x, i) => <span key={i}>{x.season}: the {teamLabel(x.team)} and {teamLabel(x.with)}: {x.status}{x.yes !== undefined ? ` (${x.yes} votes)` : ""}.</span>)}
    </section>
  );
}
