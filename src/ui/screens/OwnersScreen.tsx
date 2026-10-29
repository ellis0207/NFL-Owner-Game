import { useState } from "react";
import { addDays, shortDate } from "../../engine/dates";
import { RULES, TEAMS, teamLabel } from "../../engine/league";
import {
  currentMeeting, endAlliance, LOBBY_CALLS, lobby, owners, proposable, proposeAlliance, relationWord, setOurVote, sponsorName, submitProposal, VOTES_TO_PASS, whipCount,
} from "../../engine/owners";
import { RULE_BY_ID } from "../../engine/rules";
import type { GameState, RuleProposal } from "../../engine/types";

const COMMITTEE = { for: "Recommends it", against: "Recommends against", neutral: "No position" };

export function OwnersScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const o = owners(game);
  const m = currentMeeting(game);
  const meetingDay = RULES.keyDates.annualLeagueMeeting;
  const say = (text: string | null) => {
    setSaid(text);
    changed();
  };
  const canSubmit = m && !m.done && game.date <= m.deadline && !m.proposals.some((p) => p.sponsor === game.userTeam);
  const options = canSubmit ? proposable(game) : [];
  const others = TEAMS.filter((t) => t.id !== game.userTeam).sort((a, b) => o.relations[b.id].rapport - o.relations[a.id].rapport);

  return (
    <section className="stack">
      <h2>Owners</h2>
      <p className="muted">
        The owners change the playing rules and league policies at the annual league meeting ({shortDate(meetingDay)}); a change needs {VOTES_TO_PASS} of 32 votes.
        The proposals come out three weeks before{m ? "" : `, on ${shortDate(addDays(meetingDay, -21))}`}.
      </p>
      {said && <p className="notice">{said}</p>}

      {m && (
        <section className="panel stack tight">
          <h3>{m.done ? `The ${m.year} vote` : `The agenda for ${m.year}`}</h3>
          {!m.done && <span className="muted">The vote is {shortDate(m.voteDate)}. Lobbying calls left: {LOBBY_CALLS - m.calls}.</span>}
          {m.proposals.map((p) => <Proposal key={p.id} game={game} p={p} done={!!m.done} say={say} />)}
        </section>
      )}

      {canSubmit && (
        <section className="panel stack tight">
          <h3>Submit our own proposal</h3>
          <span className="muted">One a year, until {shortDate(m!.deadline)}.</span>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a change…</option>
            {options.map((id) => <option key={id} value={id}>{RULE_BY_ID[id].title}</option>)}
          </select>
          {pick && <span className="muted">{RULE_BY_ID[pick].what}</span>}
          <div><button className="btn primary" disabled={!pick} onClick={() => { const err = submitProposal(game, pick); say(err ?? "Submitted. We're voting yes on it, of course."); setPick(""); }}>Submit</button></div>
        </section>
      )}

      <section className="panel stack tight">
        <h3>The other owners</h3>
        <span className="muted">Votes, trades and hiring away their coaches all change how they feel about us. Allies back our side in the room and their front offices deal a little easier; rivals do the opposite.</span>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Club</th><th>Relationship</th><th></th></tr></thead>
            <tbody>
              {others.map((t) => {
                const r = o.relations[t.id];
                const word = relationWord(r);
                return (
                  <tr key={t.id}>
                    <td>{teamLabel(t.id)}</td>
                    <td className={word === "Ally" || word === "Close" ? "good" : word === "Rival" || word === "Hostile" ? "bad" : ""}>{word}</td>
                    <td>
                      {r.ally ? <button className="btn small" onClick={() => say(endAlliance(game, t.id))}>End alliance</button>
                        : !r.rival && r.rapport >= 30 ? <button className="btn small" onClick={() => say(proposeAlliance(game, t.id))}>Propose an alliance</button> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel stack tight">
        <h3>The rulebook</h3>
        {o.rules.length === 0 ? <span className="muted">No changes since 2026.</span> : o.rules.map((r) => (
          <span key={r.rule + r.year}>{r.year}: {RULE_BY_ID[r.rule].title} <span className="muted">({sponsorName(r.sponsor)}, {r.yes}-{32 - r.yes})</span></span>
        ))}
        {o.history.filter((h) => !h.passed).length > 0 && (
          <>
            <h4>Voted down</h4>
            {o.history.filter((h) => !h.passed).map((h) => (
              <span key={h.rule + h.year} className="muted">{h.year}: {RULE_BY_ID[h.rule].title} ({sponsorName(h.sponsor)}, {h.yes}-{32 - h.yes})</span>
            ))}
          </>
        )}
      </section>
    </section>
  );
}

function Proposal({ game, p, done, say }: { game: GameState; p: RuleProposal; done: boolean; say: (t: string | null) => void }) {
  const [target, setTarget] = useState("");
  const c = RULE_BY_ID[p.rule];
  const ours = p.sponsor === game.userTeam;
  const vote = (yes: boolean | undefined) => { setOurVote(game, p.id, yes); say(null); };
  if (done) {
    return (
      <div className="report">
        <strong>{c.title}</strong>
        <span className={p.passed ? "good" : "bad"}>{p.passed ? "Approved" : "Voted down"}, {p.yes}-{32 - (p.yes ?? 0)}. We voted {p.votes?.[game.userTeam] ? "yes" : "no"}.</span>
        <span className="muted">{sponsorName(p.sponsor)}</span>
      </div>
    );
  }
  const w = whipCount(game, p);
  const ourYes = p.ourVote ?? false;
  const projected = w.yes.length + (ourYes ? 1 : 0);
  const persuadable = [...w.undecided, ...(p.ourVote === false ? w.yes : w.no)].filter((t) => p.lobby[t] === undefined);
  return (
    <div className="report">
      <strong>{c.title}</strong>
      <span>{c.what}</span>
      <span className="muted">
        Proposed by the {sponsorName(p.sponsor)}.{p.sponsor !== "committee" && ` Competition Committee: ${COMMITTEE[p.committee]}.`}
        {p.ourVote === undefined && ` If we don't decide, our president votes ${p.sponsor === "committee" || p.committee === "for" ? "yes" : "no"}.`}
      </span>
      <span>
        Our read of the room: about {projected} yes, {w.no.length + (p.ourVote === false ? 1 : 0)} no, {w.undecided.length} undecided
        {projected >= VOTES_TO_PASS ? " — it looks like it passes." : projected + w.undecided.length >= VOTES_TO_PASS ? " — it could go either way." : " — it looks short."}
      </span>
      <div className="btn-row">
        <button className={`btn small${p.ourVote === true ? " primary" : ""}`} onClick={() => vote(true)}>Vote yes</button>
        {!ours && <button className={`btn small${p.ourVote === false ? " primary" : ""}`} onClick={() => vote(false)}>Vote no</button>}
        {p.ourVote !== undefined && !ours && <button className="btn small" onClick={() => vote(undefined)}>Undecided</button>}
      </div>
      {p.ourVote !== undefined && persuadable.length > 0 && (
        <div className="btn-row">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Call an owner…</option>
            {persuadable.map((t) => <option key={t} value={t}>{teamLabel(t)} ({w.undecided.includes(t) ? "undecided" : p.ourVote ? "leaning no" : "leaning yes"})</option>)}
          </select>
          <button className="btn small" disabled={!target} onClick={() => { say(lobby(game, p.id, target)); setTarget(""); }}>Make the call</button>
        </div>
      )}
    </div>
  );
}
