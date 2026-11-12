import { useState } from "react";
import { teamPlayerIds } from "../../engine/cap";
import { chemistryWord, clubhouse, leaders, marketability, marketWord, mentors, personality, posOf, trustOf, trustWord } from "../../engine/clubhouse";
import { shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "../../engine/league";
import { insurableBase, insuranceFloor, insure, knownReturn, medicalLevel, premiumFor } from "../../engine/medical";
import { outLabel } from "../../engine/season";
import { FOCUS, MAX_PLANS, planWord, PROGRAM_COSTS, retrainWord, setPrograms, STRENGTH_LEVELS, grownTo, type Workload } from "../../engine/training";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { DoctorsPanel, StandingPanel } from "./ClubhouseStanding";
import { useUi } from "../ui";
import { tip } from "../tip";

const TABS = ["Locker room", "Development", "Medical"] as const;
type Tab = (typeof TABS)[number];

export function ClubhouseScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [tab, setTab] = useState<Tab>("Locker room");
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Clubhouse</h2>
        <div className="tabs" role="group" aria-label="Clubhouse">
          {TABS.map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>
      {tab === "Locker room" && <><StandingPanel game={game} /><LockerTab game={game} /></>}
      {tab === "Development" && <DevelopmentTab game={game} changed={changed} />}
      {tab === "Medical" && <><DoctorsPanel game={game} changed={changed} /><MedicalTab game={game} changed={changed} /></>}
    </section>
  );
}

function Name({ id }: { id: string }) {
  const ui = useUi();
  return <button className="link" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button>;
}

function LockerTab({ game }: { game: GameState }) {
  const c = clubhouse(game);
  const us = game.userTeam;
  const chem = c.chem[us] ?? 60;
  const ranked = Object.entries(c.chem).sort((a, b) => b[1] - a[1]);
  const rank = ranked.findIndex(([t]) => t === us) + 1;
  const ids = teamPlayerIds(game, us).filter((id) => game.players[id].status === "active" || game.players[id].status === "ir");
  const doghouse = ids.filter((id) => trustOf(game, id) < 42);
  const leaned = ids.filter((id) => trustOf(game, id) >= 75);
  const names = ids.map((id) => ({ id, m: marketability(game, id) })).sort((a, b) => b.m - a.m).slice(0, 6);
  const concerns = Object.entries(c.roleWeeks).filter(([, n]) => n >= 2).map(([id]) => id);
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>Chemistry</h3>
          <strong>{chemistryWord(chem)}</strong>
          <span className="muted">{rank <= 8 ? "One of the closest rooms in the league" : rank <= 24 ? "About average for the league" : "One of the least settled rooms in the league"}, by the staff's read.</span>
          <span className="muted">It comes from continuity among the starters, veterans the room follows, how happy and present people are, and the head coach. It matters a little on the field, never as much as talent.</span>
        </div>
        <div className="panel stack tight">
          <h3>Leaders</h3>
          {leaders(game, us).length ? leaders(game, us).map((id) => <span key={id}><Name id={id} /> <span className="muted">{posOf(game, id)}</span></span>) : <span className="muted">No clear voices in the room yet.</span>}
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Mentors</h3>
          {mentors(game, us).length ? mentors(game, us).map(([m, y]) => <span key={y}><Name id={m} /> is looking after <Name id={y} /></span>) : <span className="muted">No veterans paired with young players right now.</span>}
          <span className="muted">Young players with a veteran in their room tend to develop a little faster.</span>
        </div>
        <div className="panel stack tight">
          <h3>The coaches' trust</h3>
          {leaned.length > 0 && <span>Lean on: {leaned.map((id, i) => <span key={id}>{i ? ", " : ""}<Name id={id} /></span>)}</span>}
          {doghouse.length > 0 && <span>In the doghouse: {doghouse.map((id, i) => <span key={id}>{i ? ", " : ""}<Name id={id} /></span>)}</span>}
          {!leaned.length && !doghouse.length && <span className="muted">Nobody stands out either way.</span>}
          <span className="muted">Trust grows with good play and showing up, and starts over under a new head coach. It tips close depth chart calls.</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Unhappy with their role</h3>
          {concerns.length ? concerns.map((id) => <span key={id}><Name id={id} /> <span className="muted">backup for {c.roleWeeks[id]} weeks</span></span>) : <span className="muted">Nobody paid or drafted to start is sitting.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Best-known players</h3>
          {names.map(({ id, m }) => <span key={id}><Name id={id} />: <span className="muted">{marketWord(m)}</span></span>)}
          <span className="muted">Names people know sell jerseys at the team store.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>League chemistry</h3>
        <span className="muted">{ranked.slice(0, 5).map(([t]) => TEAM_BY_ID[t].name).join(", ")} have the closest rooms; {ranked.slice(-3).map(([t]) => TEAM_BY_ID[t].name).join(", ")} the most unsettled, from what's reported around the league.</span>
      </div>
      {c.log.length > 0 && (
        <div className="panel stack tight">
          <h3>Notes</h3>
          {c.log.slice(0, 12).map((l, i) => <span key={i}>{shortDate(l.date)}: {l.text}</span>)}
        </div>
      )}
    </div>
  );
}

function DevelopmentTab({ game, changed }: { game: GameState; changed: () => void }) {
  const c = clubhouse(game);
  const p = c.programs;
  const plans = Object.entries(c.plans);
  const moved = teamPlayerIds(game, game.userTeam).filter((id) => game.players[id].retrain);
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>Practice load</h3>
          <div className="tabs" role="group" aria-label="Practice load">
            {(["light", "normal", "heavy"] as Workload[]).map((w) => <button key={w} aria-pressed={p.workload === w} onClick={() => { setPrograms(game, { workload: w }); changed(); }}>{w[0].toUpperCase() + w.slice(1)}</button>)}
          </div>
          <span className="muted">{p.workload === "light" ? "Fewer full-speed reps: fewer practice injuries, a little slower development." : p.workload === "heavy" ? "More full-speed work: young players grow a bit faster, and more players get hurt." : "A typical week of practice."}</span>
          <label className="btn-row"><input type="checkbox" checked={p.restVets} onChange={(e) => { setPrograms(game, { restVets: e.target.checked }); changed(); }} /> Rest veterans 30 and over one practice a week</label>
        </div>
        <div className="panel stack tight">
          <h3>Strength and conditioning</h3>
          <div className="tabs" role="group" aria-label="Strength staff">
            {STRENGTH_LEVELS.map((l, i) => <button key={l.label} aria-pressed={p.strength === i} onClick={() => { setPrograms(game, { strength: i }); changed(); }}>{l.label}</button>)}
          </div>
          <span className="muted">{STRENGTH_LEVELS[p.strength].what} {money(STRENGTH_LEVELS[p.strength].cost)} a year. A better staff means fewer injuries and slightly faster growth, not bigger numbers overnight.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Development plans ({plans.length} of {MAX_PLANS})</h3>
        <span className="muted">Set a plan from a young player's page. The position coaches put extra time into each one and report monthly.</span>
        {plans.length ? (
          <table>
            <thead><tr><th>Player</th><th>Focus</th><th>Since</th><th>Coaches' read</th></tr></thead>
            <tbody>
              {plans.map(([id, plan]) => (
                <tr key={id}><td className="name"><Name id={id} /> <span className="muted">{posOf(game, id)}</span></td><td>{FOCUS[plan.focus].label}</td><td>{shortDate(plan.since)}</td>
                  <td>{planWord(grownTo(game, id) - plan.start, Math.round((Date.parse(game.date) - Date.parse(plan.since)) / 864e5))}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <span className="muted">No plans yet.</span>}
      </div>
      <div className="panel stack tight">
        <h3>Position changes</h3>
        {moved.length ? moved.map((id) => <span key={id}><Name id={id} />: {game.players[id].retrain!.from} to {posOf(game, id)}, {retrainWord(game, id)}.</span>)
          : <span className="muted">Nobody is learning a new position. Ask the coaches to try one from a player's page.</span>}
      </div>
    </div>
  );
}

function MedicalTab({ game, changed }: { game: GameState; changed: () => void }) {
  const c = clubhouse(game);
  const p = c.programs;
  const [msg, setMsg] = useState("");
  const hurt = teamPlayerIds(game, game.userTeam).filter((id) => game.players[id].injury && game.players[id].injury!.returnDate > game.date);
  const insurable = teamPlayerIds(game, game.userTeam).filter((id) => insurableBase(game, id) >= insuranceFloor(game))
    .sort((a, b) => insurableBase(game, b) - insurableBase(game, a));
  const lvl = medicalLevel(game, game.userTeam);
  const toggle = (k: "nutrition" | "mental", v: boolean) => { setPrograms(game, { [k]: v }); changed(); };
  return (
    <div className="stack">
      <div className="panel stack tight">
        <h3>Injury report</h3>
        {hurt.length ? (
          <table>
            <thead><tr><th>Player</th><th>Injury</th><th>Since</th><th>Outlook</th></tr></thead>
            <tbody>
              {hurt.map((id) => {
                const inj = game.players[id].injury!;
                const pending = inj.testsOn && game.date < inj.testsOn;
                return (
                  <tr key={id}><td className="name"><Name id={id} /></td><td>{inj.type}</td><td>{shortDate(inj.date)}</td>
                    <td>{outLabel(game.date, knownReturn(game, inj), inj.seasonEnding)}{pending ? <span className="muted"> (tests back {shortDate(inj.testsOn!)})</span> : ""}</td></tr>
                );
              })}
            </tbody>
          </table>
        ) : <span className="muted">Nobody hurt.</span>}
        <span className="muted">First estimates are firmed up by follow-up tests. The doctors decide when a player is cleared; concussions are the independent consultant's call. Medical budget: {["minimal", "league average", "above average", "top of the league"][lvl]} (set on the Business screen).</span>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Player support programs</h3>
          <label className="btn-row"><input type="checkbox" checked={p.nutrition} onChange={(e) => toggle("nutrition", e.target.checked)} /> Nutrition staff and team meals ({money(PROGRAM_COSTS.nutrition)})</label>
          <label className="btn-row"><input type="checkbox" checked={p.mental} onChange={(e) => toggle("mental", e.target.checked)} /> Confidential mental health and player support ({money(PROGRAM_COSTS.mental)})</label>
          <label className="btn-row"><input type="checkbox" checked={!!p.equipment} onChange={(e) => { setPrograms(game, { equipment: e.target.checked ? 1 : 0 }); changed(); }} /> Newest approved helmets and weekly fitting ({money(PROGRAM_COSTS.equipment)})</label>
          <label className="btn-row"><input type="checkbox" checked={!!p.field} onChange={(e) => { setPrograms(game, { field: e.target.checked ? 1 : 0 }); changed(); }} /> Extra grounds crew and surface testing ({money(PROGRAM_COSTS.field)})</label>
          <span className="muted">Player support is confidential: the club never learns or shares what a player discusses.</span>
        </div>
        <div className="panel stack tight">
          <h3>Injury insurance ({RULES.season})</h3>
          {msg && <span className="notice">{msg}</span>}
          {insurable.length ? (
            <table>
              <thead><tr><th>Player</th><th className="num">Salary</th><th className="num">Premium</th><th></th></tr></thead>
              <tbody>
                {insurable.slice(0, 12).map((id) => {
                  const pol = c.policies[id]?.season === RULES.season ? c.policies[id] : undefined;
                  return (
                    <tr key={id}><td className="name"><Name id={id} /></td><td className="num">{money(insurableBase(game, id))}</td>
                      <td className="num">{money(pol?.premium ?? premiumFor(game, id))}</td>
                      <td>{pol ? <span className="muted">Covered{pol.paid ? `, ${money(pol.paid)} paid` : ""}</span> : <button onClick={() => { setMsg(insure(game, id) ?? `${PLAYER_BY_ID[id].name} is covered.`); changed(); }}>Insure</button>}</td></tr>
                  );
                })}
              </tbody>
            </table>
          ) : <span className="muted">No salaries big enough to insure.</span>}
          <span className="muted">After more than three straight weeks out with a football injury, a policy pays back 80% of his salary for each further week.</span>
        </div>
      </div>
    </div>
  );
}

/** A player's clubhouse lines and the owner's levers, for the player page. */
export function personalityWords(game: GameState, id: string): string[] {
  const me = personality(id);
  const out: string[] = [];
  if (me.learning >= 0.65) out.push("Picks things up quickly");
  else if (me.learning <= 0.35) out.push("Needs reps to learn new things");
  if (me.work >= 0.65) out.push("A pro's pro in his preparation");
  else if (me.work <= 0.33) out.push("Coaches push him on preparation");
  if (leaders(game, game.players[id]?.team ?? "").includes(id)) out.push("A leader in the locker room");
  return out;
}

export { trustWord };
