import { useState } from "react";
import { Chip, FormChips, Icon, Versus, WordScale, stepOf } from "../gfx";
import { recentForm } from "../gfxdata";
import { teamPlayerIds } from "../../engine/cap";
import { clubhouse, posOf, starters } from "../../engine/clubhouse";
import { shortDate, weekday } from "../../engine/dates";
import { signStreetFreeAgent } from "../../engine/freeagency";
import { EMPHASIS, emergencyList, gameStatus, gameWeek, nextGame, participationLabel, thinSpots, type Emphasis } from "../../engine/gameweek";
import { ageOn } from "../../engine/dates";
import { PLAYER_BY_ID, TEAM_BY_ID } from "../../engine/league";
import { depthChart } from "../../engine/roster";
import { gameDayActives } from "../../engine/sim";
import { coachView } from "../../engine/staff";
import { matchup } from "../../engine/standings";
import { setPrograms } from "../../engine/training";
import type { GameState } from "../../engine/types";
import { claimOdds, claimOddsWord, subjectToWaivers } from "../../engine/waivers";
import { useUi } from "../ui";
import { rivalryHeat, rivalryWord } from "../../engine/records";
import { tip } from "../tip";
import { GamePlan } from "./GamePlan";

const RIVAL_STEPS = ["Quiet", "Growing", "Heated", "Bitter"];
const CLAIM_STEPS = ["Will clear", "Should clear", "Could be claimed", "Likely to be claimed"];

export function GameWeekScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const us = game.userTeam;
  const g = nextGame(game, us, 10);
  const m = g ? matchup(game, g) : null;
  const opp = m ? (m.away === us ? m.home : m.away) : null;
  const emph = clubhouse(game).programs.emphasis ?? "balanced";
  const Name = ({ id }: { id: string }) => <button className="link" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button>;
  return (
    <section className="stack">
      {g && opp && (
        <div className="panel stack tight tm-matchup">
          <h3>{weekday(g.date)} {shortDate(g.date)}</h3>
          <Versus away={m!.away} home={m!.home} awayLabel={<span className="gx-big">{TEAM_BY_ID[m!.away].name}</span>} homeLabel={<span className="gx-big">{TEAM_BY_ID[m!.home].name}</span>} mid={<>
            <span>{m!.home === us ? "Home" : "Away"}</span>
            <WordScale steps={RIVAL_STEPS} at={stepOf(RIVAL_STEPS, rivalryWord(rivalryHeat(game, us, opp)))} label={<><Icon name="flame" size={13} /> Rivalry</>} compact />
          </>} />
          <div className="gx-vs"><FormChips results={recentForm(game, m!.away, 5)} /><FormChips results={recentForm(game, m!.home, 5)} /></div>
        </div>
      )}
      <p className="muted">{g && opp ? `Next: ${m!.home === us ? "vs" : "at"} the ${TEAM_BY_ID[opp].name}, ${weekday(g.date)} ${shortDate(g.date)}.${rivalryWord(rivalryHeat(game, us, opp)) !== "Quiet" ? ` A ${rivalryWord(rivalryHeat(game, us, opp)).toLowerCase()} rivalry.` : ""}` : "No game in the next ten days."} Anyone signed or claimed on game day can't play until the next game.</p>
      <div className="panel stack tight">
        <h3>This week's practice plan</h3>
        <div className="tabs" role="group" aria-label="Practice emphasis">
          {(Object.keys(EMPHASIS) as Emphasis[]).map((e) => <button key={e} aria-pressed={emph === e} onClick={() => { setPrograms(game, { emphasis: e }); changed(); }}>{EMPHASIS[e].label}</button>)}
        </div>
        <span className="muted">{EMPHASIS[emph].what}</span>
      </div>
      <div className="stack tm-plan">
        <h2>Game plan</h2>
        <GamePlan game={game} />
      </div>
      {g && (
        <div className="split">
          <Report game={game} team={us} title="Our practice report" Name={Name} />
          {opp && <Report game={game} team={opp} title={`${TEAM_BY_ID[opp].name} practice report`} Name={Name} />}
        </div>
      )}
      {g && <GameDay game={game} Name={Name} />}
      <div className="split">
        <Emergency game={game} changed={changed} Name={Name} />
        <Bubble game={game} Name={Name} />
      </div>
    </section>
  );
}

type NameC = (p: { id: string }) => JSX.Element;

function Report({ game, team, title, Name }: { game: GameState; team: string; title: string; Name: NameC }) {
  const r = gameWeek(game).reports[team];
  const g = nextGame(game, team, 10);
  const days = r ? Object.keys(r.days).sort() : [];
  const ids = r ? [...new Set(days.flatMap((d) => Object.keys(r.days[d])))] : [];
  return (
    <div className="panel stack tight">
      <h3>{title}</h3>
      {!ids.length ? <span className="muted">{days.length ? "Everyone practiced in full." : "Reports are filed the three practice days before a game."}</span> : (
        <table>
          <thead><tr><th>Player</th>{days.map((d) => <th key={d}>{weekday(d).slice(0, 3)}</th>)}<th>Game</th></tr></thead>
          <tbody>
            {ids.map((id) => (
              <tr key={id}>
                <td className="name"><Name id={id} /> <span className="muted">{posOf(game, id)}</span></td>
                {days.map((d) => { const c = r!.days[d][id]; const v = c ? c[0] : "FP"; return <td key={d} title={c?.[1]}><span className={`tm-prac tm-prac-${v}`}>{v}</span></td>; })}
                <td>{g && days.length === 3 ? gameStatus(game, id, g) ?? "" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ids.length > 0 && <span className="muted">{participationLabel("DNP")} (DNP), {participationLabel("LP").toLowerCase()} (LP), full (FP). Hover for the reason.</span>}
    </div>
  );
}

function GameDay({ game, Name }: { game: GameState; Name: NameC }) {
  const g = nextGame(game, game.userTeam, 10)!;
  const { inactive, emergency } = gameDayActives(depthChart(game, game.userTeam, g.date));
  const hurt = teamPlayerIds(game, game.userTeam).filter((id) => game.players[id].status === "active" && game.players[id].injury && game.players[id].injury!.returnDate > g.date);
  return (
    <div className="panel stack tight">
      <h3>Game-day inactives (as of today)</h3>
      <div className="gx-grid">{[...hurt, ...inactive].length ? [...hurt, ...inactive].map((id) => <div key={id} className="gx-tile sunk gx-row"><span className="gx-pos">{posOf(game, id)}</span><Name id={id} />{hurt.includes(id) && <Chip icon="cross" tone="bad">Hurt</Chip>}</div>) : <span className="muted">Nobody yet.</span>}</div>
      {emergency && <span>Emergency quarterback: <Name id={emergency} />. He's inactive, but can play if both active quarterbacks go out.</span>}
    </div>
  );
}

function Emergency({ game, changed, Name }: { game: GameState; changed: () => void; Name: NameC }) {
  const [msg, setMsg] = useState("");
  const thin = thinSpots(game);
  return (
    <div className="panel stack tight">
      <h3>Emergency list</h3>
      <span className="muted">The pro scouts' short list of free agents at the positions we can't be caught short at.{thin.length ? ` Thin right now: ${thin.join(", ")}.` : ""}</span>
      {msg && <span className="notice">{msg}</span>}
      {emergencyList(game).map(({ pos, ids }) => (
        <div key={pos}>
          <span className="gx-pos">{pos}</span>{" "}
          {ids.length ? ids.map((id, i) => (
            <span key={id}>{i ? " · " : ""}<Name id={id} /> <span className="muted">{ageOn(PLAYER_BY_ID[id].birthDate, game.date) ?? ""}</span>{" "}
              <button className="link" onClick={() => { signStreetFreeAgent(game, game.userTeam, id); setMsg(`Signed ${PLAYER_BY_ID[id].name}.`); changed(); }}>sign</button>
            </span>
          )) : <span className="muted">nobody worth a call</span>}
        </div>
      ))}
    </div>
  );
}

function Bubble({ game, Name }: { game: GameState; Name: NameC }) {
  const us = game.userTeam;
  // Starters (and the kicker, punter and snapper) aren't on the bubble.
  const chart = depthChart(game, us);
  const first = new Set([...starters(game, us), chart.K[0], chart.P[0], chart.LS[0]]);
  const ids = teamPlayerIds(game, us).filter((id) => game.players[id].status === "active" && !first.has(id) && subjectToWaivers(game, id))
    .sort((a, b) => coachView(game, us, a) - coachView(game, us, b)).slice(0, 8);
  return (
    <div className="panel stack tight">
      <h3>Bottom of the roster: waiver risk</h3>
      <span className="muted">If we let these players go, would someone claim them? The front office's read.</span>
      {ids.map((id) => { const p = claimOdds(game, id); return <div key={id} className="gx-row"><span className="gx-pos">{posOf(game, id)}</span><Name id={id} /><WordScale steps={CLAIM_STEPS} at={stepOf(CLAIM_STEPS, claimOddsWord(p))} invert /></div>; })}
    </div>
  );
}
