// Labor relations on the Owners page: the agreement in force, the union,
// talks and each side's proposal, our stance and priorities, the vote on a
// tentative deal, a lockout's toll, and grievances against the club.
import type { CbaTerms } from "../../engine/cbaterms";
import { shortDate } from "../../engine/dates";
import { castVote, currentAgreement, deadline, labor, lockedOut, setPriority, setStance, settleGrievance, STANCES, type Stance } from "../../engine/labor";
import { onCommittee } from "../../engine/leagueoffice";
import { PLAYER_BY_ID } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { money } from "../format";

const ROWS: { k: keyof CbaTerms; label: string; show: (v: number) => string }[] = [
  { k: "share", label: "Players' share of revenue", show: (v) => `${(v * 100).toFixed(2)}%` },
  { k: "games", label: "Regular-season games", show: (v) => String(v) },
  { k: "minScale", label: "Minimum salaries", show: rel },
  { k: "rookieScale", label: "Rookie pool", show: rel },
  { k: "benefits", label: "Benefit plans", show: rel },
  { k: "practice", label: "Padded camp practices", show: (v) => String(Math.round(v)) },
  { k: "safety", label: "New safety provisions", show: (v) => String(Math.round(v)) },
  { k: "cashFloor", label: "Cash spending floor", show: (v) => `${Math.round(v * 100)}%` },
];

function rel(v: number): string {
  const p = Math.round((v - 1) * 100);
  return p === 0 ? "as before" : `${p > 0 ? "+" : ""}${p}%`;
}

export function LaborPanel({ game, say }: { game: GameState; say: (t: string | null) => void }) {
  const l = labor(game);
  const a = currentAgreement(game);
  const t = l.talks;
  const member = onCommittee(game, "labor");
  return (
    <section className="panel stack tight">
      <h3>Labor relations</h3>
      <span className="muted">
        The agreement with the players' union runs {a.from}-{a.through} (signed {shortDate(a.signed)}). The union is led by {l.union.leader} (made up), and its members are
        {l.union.militancy > 0.55 ? " in a fighting mood" : l.union.militancy < 0.42 ? " inclined to compromise" : " firm but practical"}.
        {member ? " We sit on the owners' labor committee, so our view carries full weight." : " We aren't on the owners' labor committee (Management Council); our view counts, but less."}
      </span>
      {!t && <span className="muted">Talks on the next agreement open in March {a.through - 1}.</span>}
      {t && (
        <>
          <span className={lockedOut(game) ? "bad" : ""}>
            {t.lockout ? `Lockout since ${shortDate(t.lockout.start)}: no free agency, trades or team activities.${t.lockout.cancelled.length ? ` ${t.lockout.cancelled.length} games cancelled so far.` : ""}`
              : t.status === "tentative" ? "A tentative deal is on the table."
              : `Talks since ${shortDate(t.opened)}. The agreement expires ${shortDate(deadline(t.through))}; without a deal the owners lock the players out.`}
          </span>
          <div className="table-wrap"><table>
            <thead><tr><th>Term</th><th className="num">In force</th><th className="num">Owners propose</th><th className="num">Union proposes</th>{t.tentative && <th className="num">Tentative deal</th>}</tr></thead>
            <tbody>{ROWS.map((r) => (
              <tr key={r.k}><td>{r.label}</td><td className="num">{r.show(a.terms[r.k] as number)}</td><td className="num">{r.show(t.owners[r.k] as number)}</td><td className="num">{r.show(t.union[r.k] as number)}</td>{t.tentative && <td className="num">{r.show(t.tentative.terms[r.k] as number)}</td>}</tr>
            ))}</tbody>
          </table></div>
          <span className="muted">The union gives an 18th game only for a share of at least 49.5%, fewer padded practices and another safety provision.</span>
          {t.tentative && (
            <div className="btn-row">
              <span>Owners vote {shortDate(t.tentative.votesDue)} (24 needed). Our vote: {t.tentative.ourVote === undefined ? "with the committee" : t.tentative.ourVote ? "yes" : "no"}.</span>
              <button className="btn small" onClick={() => say(castVote(game, true) ?? "We'll vote yes.")}>Vote yes</button>
              <button className="btn small" onClick={() => say(castVote(game, false) ?? "We'll vote no.")}>Vote no</button>
            </div>
          )}
        </>
      )}
      <label className="field"><span className="label">Our stance in the owners' room</span>
        <select value={l.stance} onChange={(x) => { setStance(game, x.target.value as Stance); say(null); }}>
          {(Object.keys(STANCES) as Stance[]).map((k) => <option key={k} value={k}>{k === "hard" ? "Hard line" : k === "soft" ? "Labor peace" : "Steady"}</option>)}
        </select>
      </label>
      <span className="muted">{STANCES[l.stance]}</span>
      <div className="btn-row">
        <label><input type="checkbox" checked={l.priorities.games18} onChange={(x) => { setPriority(game, "games18", x.target.checked); say(null); }} /> Ask for an 18th game</label>
        <label><input type="checkbox" checked={l.priorities.share} onChange={(x) => { setPriority(game, "share", x.target.checked); say(null); }} /> Cut the players' share</label>
        <label><input type="checkbox" checked={l.priorities.rookie} onChange={(x) => { setPriority(game, "rookie", x.target.checked); say(null); }} /> Shrink the rookie pool</label>
      </div>
      {l.agreements.length > 1 && <span className="muted">Past agreements: {l.agreements.slice(0, -1).map((x) => `${x.from}-${x.through}`).join(", ")}{l.agreements.some((x) => x.lockout) ? `. Lockouts: ${l.agreements.filter((x) => x.lockout).map((x) => `${shortDate(x.lockout!.start)} to ${shortDate(x.lockout!.end)}${x.lockout!.gamesLost ? ` (${x.lockout!.gamesLost} games lost)` : ""}`).join(", ")}` : ""}.</span>}
      {l.log.slice(0, 4).map((x, i) => <span key={i} className="muted">{shortDate(x.date)}: {x.text}</span>)}
      <h4>Grievances</h4>
      {l.grievances.length === 0 && <span className="muted">No grievances against us.</span>}
      {l.grievances.slice(0, 5).map((g) => (
        <span key={g.id} className="muted">
          {shortDate(g.filed)}: {PLAYER_BY_ID[g.player]?.name ?? "A player"}, {g.kind}, claiming {money(g.claim)}.{" "}
          {g.status === "open" ? <>Hearing about {shortDate(g.due)}. <button className="link" onClick={() => say(settleGrievance(game, g.id))}>Settle for {money(g.claim * 0.55)}</button></>
            : g.status === "won" ? "Denied." : `${g.status === "settled" ? "Settled" : "Lost"}: ${money(g.award ?? 0)}.`}
        </span>
      ))}
    </section>
  );
}
