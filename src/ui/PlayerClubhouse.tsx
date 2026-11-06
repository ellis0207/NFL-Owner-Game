import { useState } from "react";
import { clubhouse, expectsToStart, marketability, marketWord, mentorOf, posOf, trustOf, trustWord } from "../engine/clubhouse";
import { ageOn } from "../engine/dates";
import { PLAYER_BY_ID } from "../engine/league";
import { askEarlyReturn } from "../engine/medical";
import { conversionsFor, FOCUS, grownTo, retrain, retrainWord, setPlan, type Focus } from "../engine/training";
import type { GameState, Position } from "../engine/types";
import { personalityWords } from "./screens/ClubhouseScreen";
import { useUi } from "./ui";

/** The player page's clubhouse lines, and for our own players the owner's few levers. */
export function PlayerClubhouse({ game, id, changed }: { game: GameState; id: string; changed: () => void }) {
  const ui = useUi();
  const [reply, setReply] = useState<string | null>(null);
  const ps = game.players[id];
  if (!ps?.team || ps.status === "retired") return null;
  const mine = ps.team === game.userTeam;
  const p = PLAYER_BY_ID[id];
  const words = personalityWords(game, id);
  const mentor = mentorOf(game, id);
  const plan = clubhouse(game).plans[id];
  const young = (ageOn(p.birthDate, game.date) ?? 30) <= 26;
  const inj = ps.injury && ps.injury.returnDate > game.date ? ps.injury : null;
  const original = ps.retrain?.from ?? p.position;
  return (
    <section className="stack tight">
      <h3>Clubhouse</h3>
      <dl className="kv">
        {mine && <><dt>Coaches</dt><dd>{trustWord(trustOf(game, id))}</dd></>}
        <dt>Profile</dt><dd>{marketWord(marketability(game, id))}</dd>
        {mine && words.length > 0 && <><dt>Staff notes</dt><dd>{words.join("; ")}</dd></>}
        {mentor && <><dt>Mentor</dt><dd><button className="link" onClick={() => ui.openPlayer(mentor)}>{PLAYER_BY_ID[mentor].name}</button></dd></>}
        {mine && expectsToStart(game, id) && <><dt>Role</dt><dd>Expects to start</dd></>}
        {ps.retrain && <><dt>Position</dt><dd>Moved from {ps.retrain.from} to {posOf(game, id)}: {retrainWord(game, id)}</dd></>}
      </dl>
      {mine && (
        <div className="btn-row" style={{ flexWrap: "wrap" }}>
          {(young || plan) && (
            <label>Development plan{" "}
              <select value={plan?.focus ?? ""} onChange={(e) => { setReply(setPlan(game, id, (e.target.value || null) as Focus | null, grownTo(game, id))); changed(); }}>
                <option value="">None</option>
                {(Object.keys(FOCUS) as Focus[]).map((f) => <option key={f} value={f}>{FOCUS[f].label}</option>)}
              </select>
            </label>
          )}
          {conversionsFor(game, id).length > 0 && (
            <label>Position{" "}
              <select value={posOf(game, id)} onChange={(e) => { setReply(retrain(game, id, e.target.value === original ? null : e.target.value as Position)); changed(); }}>
                <option value={original}>{original}</option>
                {conversionsFor(game, id).map((pos) => <option key={pos} value={pos}>Try at {pos}</option>)}
              </select>
            </label>
          )}
          {inj && !inj.asked && <button onClick={() => { setReply(askEarlyReturn(game, id).text); changed(); }}>Ask the doctors about an early return</button>}
        </div>
      )}
      {plan && <span className="muted">{FOCUS[plan.focus].what}</span>}
      {reply && <span className="notice">{reply}</span>}
    </section>
  );
}
