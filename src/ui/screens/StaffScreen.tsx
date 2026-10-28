import { useState } from "react";
import {
  askFor, available, candidates, decideProposal, delegateSearch, extendStaff, extensionAsk, fireStaff, makeOffer, openSearches,
  proposals, requestInterview,
} from "../../engine/carousel";
import { coachAge, jobLabel, knownFor, ROLE_NAME } from "../../engine/coaches";
import { shortDate } from "../../engine/dates";
import { money } from "../../engine/inbox";
import { RULES, STAFF, TEAMS, TEAM_BY_ID, teamLabel } from "../../engine/league";
import { DEFENSE_LABEL, OFFENSE_LABEL } from "../../engine/schemes";
import { playCaller, teamSchemes, teamStaff } from "../../engine/staff";
import type { Coach, CoachSeason, DefenseScheme, GameState, OffenseScheme, StaffRole, StaffSearch } from "../../engine/types";

const ROLES: StaffRole[] = ["HC", "OC", "DC", "STC", "GM", "TRN", "PRO", "COL"];
const TITLE: Record<StaffRole, string> = {
  HC: "Head coach", OC: "Offensive coordinator", DC: "Defensive coordinator", STC: "Special teams coordinator",
  GM: "General manager", TRN: "Head athletic trainer", PRO: "Director of pro scouting", COL: "Director of college scouting",
};
const ROLE_JOB: Partial<Record<StaffRole, string>> = {
  GM: "Runs the roster: cuts, signings, trades and contracts. Hires the trainer and scouting directors.",
  TRN: "Keeps players healthy and gets injured players back on the field.",
  PRO: "Writes our reports on players around the league and in free agency.",
  COL: "Leads draft scouting: how much a week of scouting learns, and how accurate the college reports are.",
  STC: "Coaches the kicking game, returns and coverage units.",
};
const IMPRESSION = ["", "Poor", "Mixed", "Solid", "Strong", "Outstanding"];

const team = (id: string) => TEAM_BY_ID[id]?.name ?? id;

function ageText(c: Coach): string {
  const a = coachAge(c);
  return c.birthYearEstimated ? `about ${a}` : `${a}`;
}

function schemeText(c: Coach): string | null {
  if (!c.scheme || !c.side) return null;
  return c.side === "offense" ? STAFF.schemeNames.offense[c.scheme as OffenseScheme] : STAFF.schemeNames.defense[c.scheme as DefenseScheme];
}

function seasonText(r: CoachSeason): string {
  const rec = `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`;
  const post = r.playoffs < 0 ? "" : r.playoffs === 0 ? ", lost in the playoffs" : r.playoffs >= 4 ? ", won the Super Bowl" : `, ${r.playoffs} playoff win${r.playoffs > 1 ? "s" : ""}`;
  const unit = r.rank ? ` · ${r.role === "DC" ? "defense" : r.role === "OC" ? "offense" : "unit"} ${r.rank}${["th", "st", "nd", "rd"][(r.rank % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][r.rank] ?? "th"} in points${r.role === "DC" ? " allowed" : ""}` : "";
  return `${r.season} ${TEAM_BY_ID[r.team]?.name ?? r.team} ${r.role}: ${rec}${post}${unit}`;
}

function Record({ c }: { c: Coach }) {
  if (!c.record.length) return <span className="muted">{c.background ?? "No NFL record in this job yet."}</span>;
  return (
    <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
      {c.record.slice(-3).reverse().map((r) => <li key={`${r.season}-${r.team}`}>{seasonText(r)}</li>)}
    </ul>
  );
}

function Tags({ game, c, looks = 0 }: { game: GameState; c: Coach; looks?: number }) {
  const tags = knownFor(game, c, looks, `owner:${game.userTeam}`);
  if (!tags.length) return null;
  return <span><span className="label">Known for</span> {tags.join(" · ")}</span>;
}

export function StaffScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const searches = game.staff ? openSearches(game, game.userTeam) : [];
  const top = searches.filter((x) => x.role === "HC" || x.role === "GM");
  const [view, setView] = useState<"ours" | "search" | "league">(top.length ? "search" : "ours");
  const [msg, setMsg] = useState<string | null>(null);
  const act = (r: { ok: boolean; text: string }) => { setMsg(r.text); changed(); };
  if (!game.staff) return <section className="stack"><h2>Staff</h2></section>;

  return (
    <section className="stack">
      <h2>Staff</h2>
      <div className="tabs" role="group" aria-label="View">
        <button aria-pressed={view === "ours"} onClick={() => setView("ours")}>Our staff</button>
        <button aria-pressed={view === "search"} onClick={() => setView("search")}>Searches{top.length ? ` (${top.length})` : ""}</button>
        <button aria-pressed={view === "league"} onClick={() => setView("league")}>Around the league</button>
      </div>
      {msg && <p className="notice">{msg}</p>}
      <Proposals game={game} act={act} />
      {view === "ours" && <OurStaff game={game} act={act} searches={searches} />}
      {view === "search" && (top.length
        ? top.map((s) => <Search key={s.role} game={game} search={s} act={act} />)
        : <p className="muted">No open searches. If we let the head coach or general manager go, the search runs here: interviews, then an offer.</p>)}
      {view === "league" && <League game={game} />}
    </section>
  );
}

function Proposals({ game, act }: { game: GameState; act: (r: { ok: boolean; text: string }) => void }) {
  const list = proposals(game);
  if (!list.length) return null;
  return (
    <section className="panel stack tight">
      <h3>Waiting on your approval</h3>
      {list.map((p) => {
        const c = game.staff!.people[p.candidate];
        const by = game.staff!.people[p.by];
        const old = p.replaces ? game.staff!.people[p.replaces] : null;
        return (
          <div key={p.id} className="report">
            <strong>{by?.name ?? "The head coach"} wants {c.name} as {ROLE_NAME[p.role]}</strong>
            <span>{jobLabel(c, team)} · age {ageText(c)}{schemeText(c) ? ` · ${schemeText(c)}` : ""}</span>
            <span className="muted">"{p.reason}."</span>
            <Record c={c} />
            <Tags game={game} c={c} />
            {old && <span className="muted">This would replace {old.name}.</span>}
            <span className="muted">Asks about {money(askFor(game, c.id, p.role))} a year. Proposed {shortDate(p.date)}; approved automatically after four days.</span>
            <div className="btn-row">
              <button className="btn primary" onClick={() => act(decideProposal(game, p.id, "approve"))}>Approve</button>
              <button className="btn" onClick={() => act(decideProposal(game, p.id, "reject"))}>Ask for someone else</button>
              {old && <button className="btn" onClick={() => act(decideProposal(game, p.id, "keep"))}>Keep {old.name}</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function OurStaff({ game, act, searches }: { game: GameState; act: (r: { ok: boolean; text: string }) => void; searches: StaffSearch[] }) {
  const s = game.staff!;
  const [extend, setExtend] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [years, setYears] = useState(3);
  const [salary, setSalary] = useState(0);
  const people = Object.values(s.people).filter((c) => c.team === game.userTeam && c.role);
  const install = s.install[game.userTeam];
  const owed = s.owed.filter((o) => o.team === game.userTeam && o.through >= RULES.season);
  return (
    <>
      {install && (install.offense < 1 || install.defense < 1) && (
        <p className="notice">
          {install.offense < 1 && `The new offense is about ${Math.round(install.offense * 100)}% installed. `}
          {install.defense < 1 && `The new defense is about ${Math.round(install.defense * 100)}% installed. `}
          New schemes take the spring, camp and the first weeks of the season to become second nature.
        </p>
      )}
      <div className="cards">
        {ROLES.map((role) => {
          const c = people.find((p) => p.role === role);
          const open = searches.find((x) => x.role === role);
          if (!c) {
            return (
              <div key={role} className="card">
                <span className="role">{TITLE[role]}</span>
                <span className="muted">{open ? (role === "HC" || role === "GM" ? "Open: the search is on the Searches tab." : `Open: ${role === "TRN" || role === "PRO" || role === "COL" ? "the GM" : "the head coach"} will bring a name.`) : "Vacant."}</span>
              </div>
            );
          }
          const scheme = schemeText(c);
          const k = c.contract;
          const expiring = k && k.through <= RULES.season;
          return (
            <div key={role} className="card">
              <span className="role">{TITLE[role]}{c.interimFrom ? " (interim)" : ""}</span>
              <span className="who">{c.name}</span>
              <span className="muted">Age {ageText(c)} · {c.hiredYear >= RULES.season ? "First season in the job" : `In the job since ${c.hiredYear}`}</span>
              {k && <span><span className="label">Contract</span> {money(k.salary)} a year through {k.through}{expiring ? <span className="warn"> · expiring</span> : ""}</span>}
              {scheme && <span><span className="label">Scheme</span> {scheme}</span>}
              {c.callsPlays.length > 0 && <span><span className="label">Calls plays</span> {c.callsPlays.join(" and ")}</span>}
              <Tags game={game} c={c} looks={1} />
              <Record c={c} />
              {ROLE_JOB[role] && <span className="muted">{ROLE_JOB[role]}</span>}
              {open && <span className="warn">The head coach wants to replace this coordinator: see the proposal above.</span>}
              {extend === c.id ? (
                <div className="stack tight">
                  <div className="offer-grid">
                    <label className="field">Years<select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
                    <label className="field">Salary ($M a year)<input type="number" step={0.05} value={salary / 1e6} onChange={(e) => setSalary(Math.round(Number(e.target.value) * 1e6))} /></label>
                  </div>
                  <span className="muted">Asking about {money(extensionAsk(game, c.id))} a year.</span>
                  <div className="btn-row">
                    <button className="btn primary small" onClick={() => { act(extendStaff(game, c.id, years, salary)); setExtend(null); }}>Offer extension</button>
                    <button className="btn small" onClick={() => setExtend(null)}>Cancel</button>
                  </div>
                </div>
              ) : confirm === c.id ? (
                <div className="stack tight">
                  <span className="warn">Let {c.name} go?{k && k.through >= RULES.season + (game.date > RULES.keyDates.regularSeasonEnd ? 1 : 0) ? ` We keep paying the contract (${money(k.salary)} a year through ${k.through}) unless another team hires them.` : ""}</span>
                  <div className="btn-row">
                    <button className="btn small" onClick={() => { act(fireStaff(game, c.id)); setConfirm(null); }}>Yes, let go</button>
                    <button className="btn small" onClick={() => setConfirm(null)}>Keep</button>
                  </div>
                </div>
              ) : (
                <div className="btn-row">
                  {k && <button className="btn small" onClick={() => { setExtend(c.id); setYears(role === "HC" || role === "GM" ? 4 : 2); setSalary(extensionAsk(game, c.id)); }}>Extend</button>}
                  <button className="btn small" onClick={() => setConfirm(c.id)}>Let go</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {owed.length > 0 && (
        <p className="muted">
          Still being paid: {owed.map((o) => `${s.people[o.id]?.name ?? "a former coach"} (${money(o.salary)} a year through ${o.through})`).join(", ")}.
        </p>
      )}
      <p className="muted">
        Head coaches and GMs are yours to hire and fire. The head coach picks coordinators and you approve them; the GM fills the
        trainer and scouting jobs. Firing someone doesn't end the contract: the team pays the rest unless another team hires them.
      </p>
    </>
  );
}

type Filter = "all" | "nfl" | "assistants" | "college" | "free" | "interviewed";

function Search({ game, search, act }: { game: GameState; search: StaffSearch; act: (r: { ok: boolean; text: string }) => void }) {
  const s = game.staff!;
  const role = search.role;
  const [filter, setFilter] = useState<Filter>("all");
  const [more, setMore] = useState(25);
  const [offer, setOffer] = useState<string | null>(null);
  const [years, setYears] = useState(role === "HC" ? 5 : 4);
  const [salary, setSalary] = useState(0);
  const pending = s.offers.find((o) => o.team === game.userTeam && o.role === role);
  const prev = search.previous ? s.people[search.previous] : null;
  const pool = candidates(game, game.userTeam, role).map((id) => s.people[id]).filter((c) => {
    if (filter === "interviewed") return !!search.interviews[c.id];
    if (filter === "nfl") return !!c.role;
    if (filter === "assistants") return c.job?.kind === "assistant" || c.job?.kind === "front";
    if (filter === "college") return c.job?.kind === "college";
    if (filter === "free") return !c.role && !c.job;
    return true;
  });
  return (
    <section className="panel stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h3>{TITLE[role]} search</h3>
        {!search.delegated && <button className="btn small" onClick={() => act(delegateSearch(game, role))}>{role === "GM" ? "Hand it to a search firm" : "Let the GM run it"}</button>}
      </div>
      <span className="muted">
        Opened {shortDate(search.opened)}{prev ? ` after ${prev.name} ${search.reason === "retired" ? "retired" : search.reason === "fired" ? "was let go" : "left"}` : ""}.
        {search.interim && s.people[search.interim] ? ` ${s.people[search.interim].name} is the interim.` : ""}
        {" "}Other teams' coaches can't interview during the regular season; those still in the playoffs only by video after the wild card round, and they join when their season ends.
      </span>
      {search.delegated && <p className="notice">{role === "GM" ? "A search firm is" : "The GM is"} running this search.</p>}
      {pending && <p className="notice">Offer out to {s.people[pending.id]?.name}: {pending.years} years at {money(pending.salary)} a year (sent {shortDate(pending.date)}).</p>}
      {search.agreed && <p className="notice">{s.people[search.agreed.id]?.name} has agreed to terms.</p>}
      <div className="tabs" role="group" aria-label="Candidates">
        {([["all", "Everyone"], ["nfl", "NFL coordinators"], ["assistants", role === "GM" ? "Front offices" : "Assistants"], ["college", "College"], ["free", "Out of work"], ["interviewed", "Interviewed"]] as [Filter, string][])
          .filter(([f]) => role !== "GM" || f !== "college")
          .map(([f, label]) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>)}
      </div>
      <div className="stack tight">
        {pool.slice(0, more).map((c) => {
          const iv = search.interviews[c.id];
          const rep = iv?.report;
          const a = available(game, game.userTeam, c.id, role);
          return (
            <div key={c.id} className="report">
              <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>{c.name}</strong>
                <span className="muted">{jobLabel(c, team)} · age {ageText(c)}</span>
              </div>
              {schemeText(c) && <span className="muted">{schemeText(c)}</span>}
              <Record c={c} />
              <Tags game={game} c={c} looks={rep ? rep.rounds : 0} />
              {rep && (
                <div className="stack tight">
                  <span><span className="label">{rep.rounds >= 2 ? "Second interview" : "Interview"}</span> {IMPRESSION[rep.impression]} impression ({shortDate(rep.date)})</span>
                  <ul>{rep.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                  {rep.plan.length > 0 && <span className="muted">Would bring: {rep.plan.map((id) => `${s.people[id]?.name} (${s.people[id] ? jobLabel(s.people[id], team) : ""})`).join(", ")}</span>}
                </div>
              )}
              {iv?.declined && <span className="muted">{rep ? "Turned down our offer." : "Passed on interviewing."}</span>}
              {iv && !iv.report && !iv.declined && <span className="muted">Interview set for {shortDate(iv.date)}.</span>}
              {!a.ok && <span className="muted">{a.why}</span>}
              {offer === c.id ? (
                <div className="stack tight">
                  <div className="offer-grid">
                    <label className="field">Years<select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
                    <label className="field">Salary ($M a year)<input type="number" step={0.05} value={salary / 1e6} onChange={(e) => setSalary(Math.round(Number(e.target.value) * 1e6))} /></label>
                  </div>
                  <span className="muted">The agent's number: about {money(askFor(game, c.id, role))} a year. Other teams may be offering too.</span>
                  <div className="btn-row">
                    <button className="btn primary small" onClick={() => { act(makeOffer(game, role, c.id, years, salary)); setOffer(null); }}>Send offer</button>
                    <button className="btn small" onClick={() => setOffer(null)}>Cancel</button>
                  </div>
                </div>
              ) : a.ok && !iv?.declined && !search.delegated && (
                <div className="btn-row">
                  {(!iv || (rep && rep.rounds < 2)) && (!iv || iv.report) && (
                    <button className="btn small" onClick={() => act(requestInterview(game, role, c.id))}>{rep ? "Second interview" : "Interview"}</button>
                  )}
                  {rep && <button className="btn small primary" onClick={() => { setOffer(c.id); setSalary(askFor(game, c.id, role)); }}>Make an offer</button>}
                </div>
              )}
            </div>
          );
        })}
        {pool.length > more && <button className="btn small" onClick={() => setMore(more + 25)}>Show more ({pool.length - more} left)</button>}
        {!pool.length && <span className="muted">Nobody here.</span>}
      </div>
    </section>
  );
}

function League({ game }: { game: GameState }) {
  const s = game.staff!;
  const open = openSearches(game).filter((x) => x.role === "HC" || x.role === "GM");
  const log = s.log.slice(0, 60);
  return (
    <>
      {open.length > 0 && (
        <section className="panel stack tight">
          <h3>Open jobs</h3>
          <span>{open.map((x) => `${teamLabel(x.team)} ${ROLE_NAME[x.role]}`).join(" · ")}</span>
        </section>
      )}
      {log.length > 0 && (
        <section className="panel stack tight">
          <h3>The carousel</h3>
          <div className="news-feed">
            {log.map((l, i) => <div key={i}><span className="news-date">{shortDate(l.date)}</span> {l.text}</div>)}
          </div>
        </section>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th><th>Head coach</th><th>Offense</th><th>Defense</th><th>Play callers</th><th>GM</th></tr></thead>
          <tbody>
            {TEAMS.map((t) => {
              const st = teamStaff(t.id);
              const schemes = teamSchemes(t.id);
              const off = playCaller(t.id, "offense");
              const def = playCaller(t.id, "defense");
              return (
                <tr key={t.id} className={t.id === game.userTeam ? "mine" : undefined}>
                  <td className="name">{TEAM_BY_ID[t.id].name}</td>
                  <td>{st.HC?.name ?? <span className="muted">open</span>}</td>
                  <td>{OFFENSE_LABEL[schemes.offense]}<div className="muted">OC {st.OC?.name ?? "none"}</div></td>
                  <td>{DEFENSE_LABEL[schemes.defense]}<div className="muted">DC {st.DC?.name ?? "none"}</div></td>
                  <td className="muted">O: {off?.name}<br />D: {def?.name}</td>
                  <td>{st.GM?.name ?? <span className="muted">open</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        The 2026 coaches, coordinators and general managers are the real people in those jobs, running their real schemes.
        Assistants, trainers, scouting directors and anyone hired from outside that list are fictional. College head coaches are the real ones.
      </p>
    </>
  );
}
