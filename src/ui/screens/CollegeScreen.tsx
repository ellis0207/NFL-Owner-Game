import { useMemo, useState } from "react";
import {
  AWARDS, awardRace, collegeGames, collegeRecords, collegeWeeks, conferenceStandings, latestPoll, prospectLine,
  prospectTotals, rankOf, recordLabel, watchList, type AwardDef,
} from "../../engine/college";
import { COLLEGE_TEAM, CONFERENCE_IDS, CONFERENCES, conferenceName, schoolName } from "../../engine/collegeData";
import { shortDate } from "../../engine/dates";
import { draftClass } from "../../engine/prospects";
import type { CollegeConference, CollegeGame, CollegePoll, GameState } from "../../engine/types";
import { useUi } from "../ui";

type Tab = "scores" | "polls" | "standings" | "awards";
const TABS: [Tab, string][] = [["scores", "Scores & schedule"], ["polls", "Polls"], ["standings", "Standings"], ["awards", "Award watch"]];

export function CollegeScreen({ game }: { game: GameState }) {
  const [tab, setTab] = useState<Tab>("scores");
  const c = game.college!;
  return (
    <section className="stack">
      <h2>College football</h2>
      <p className="muted">
        All 138 FBS teams, {c.champion ? `${schoolName(c.champion)} won the national title.` : "playing the 2026 season every Saturday."} Only the
        NFL prospects are tracked as players: their stats and game logs are on each prospect's page, and the Scouting page is where you send our scouts.
      </p>
      <div className="tabs" role="group" aria-label="View">
        {TABS.map(([k, label]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === "scores" && <Scores game={game} />}
      {tab === "polls" && <Polls game={game} />}
      {tab === "standings" && <Standings game={game} />}
      {tab === "awards" && <Awards game={game} />}
    </section>
  );
}

export function SchoolLink({ game, id, rank = true }: { game: GameState; id: string; rank?: boolean }) {
  const ui = useUi();
  const r = rank ? rankOf(game, id, game.college!.cfp.length && game.date < "2027-01-26" ? "cfp" : "ap") : null;
  return (
    <button className="link" onClick={() => ui.openSchool(id)}>
      {r ? <span className="muted">{r} </span> : null}{schoolName(id)}
    </button>
  );
}

function Scores({ game }: { game: GameState }) {
  const weeks = collegeWeeks(game);
  const current = weeks.find((w) => w.dates[w.dates.length - 1] >= game.date) ?? weeks[weeks.length - 1];
  const [week, setWeek] = useState<number>(current.week);
  const [conf, setConf] = useState<CollegeConference | "top25" | "all">("all");
  const poll = latestPoll(game, "ap");
  const games = collegeGames(game)
    .filter((g) => g.week === week)
    .filter((g) => conf === "all" || (conf === "top25"
      ? !!poll && (poll.ranks.includes(g.away) || poll.ranks.includes(g.home))
      : COLLEGE_TEAM[g.away].conference === conf || COLLEGE_TEAM[g.home].conference === conf))
    .sort((a, b) => a.date.localeCompare(b.date) || topRank(game, a) - topRank(game, b));
  const info = weeks.find((w) => w.week === week);
  return (
    <div className="stack tight">
      <div className="btn-row">
        <select value={week} onChange={(e) => setWeek(Number(e.target.value))} aria-label="Week">
          {weeks.map((w) => <option key={w.week} value={w.week}>{w.label} · {shortDate(w.dates[0])}</option>)}
        </select>
        <select value={conf} onChange={(e) => setConf(e.target.value as CollegeConference | "top25" | "all")} aria-label="Conference">
          <option value="all">All games</option>
          <option value="top25">Top 25 teams</option>
          {CONFERENCE_IDS.map((id) => <option key={id} value={id}>{CONFERENCES[id].name}</option>)}
        </select>
        <span className="muted">{games.length} game{games.length === 1 ? "" : "s"}{info ? ` · ${info.dates.map(shortDate).join(", ")}` : ""}</span>
      </div>
      {week >= 14 && collegeGames(game).filter((g) => g.week === week).length === 0 && <p className="muted">Matchups are set when the regular season ends.</p>}
      <div className="scores">
        {games.map((g) => <CollegeScore key={g.id} game={game} g={g} />)}
      </div>
    </div>
  );
}

function topRank(game: GameState, g: CollegeGame): number {
  return Math.min(rankOf(game, g.away) ?? 99, rankOf(game, g.home) ?? 99);
}

export function CollegeScore({ game, g }: { game: GameState; g: CollegeGame }) {
  const r = game.college!.results[g.id];
  const awayWin = r && r[0] > r[1];
  const homeWin = r && r[1] > r[0];
  const seed = (i: 0 | 1) => (g.seeds ? <span className="muted">({g.seeds[i]}) </span> : null);
  return (
    <div className="score">
      <div className={`row ${awayWin ? "win" : ""}`}><span>{seed(0)}<SchoolLink game={game} id={g.away} /></span><span>{r ? r[0] : ""}</span></div>
      <div className={`row ${homeWin ? "win" : ""}`}><span>{seed(1)}{g.site ? "" : "@"}<SchoolLink game={game} id={g.home} /></span><span>{r ? r[1] : ""}</span></div>
      <div className="meta">
        {r ? (r[2] ? "Final/OT" : "Final") : shortDate(g.date)}
        {g.name ? ` · ${g.name}` : g.conference ? ` · ${CONFERENCES[COLLEGE_TEAM[g.home].conference].name}` : ""}
        {g.site && !g.name?.startsWith(g.site) ? ` · ${g.site}` : ""}
      </div>
    </div>
  );
}

function PollTable({ game, poll, prev }: { game: GameState; poll: CollegePoll; prev?: CollegePoll }) {
  const recs = collegeRecords(game);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th className="num">Rk</th><th>Team</th><th className="num">Record</th><th>Conference</th><th className="num">Last</th></tr></thead>
        <tbody>
          {poll.ranks.map((t, i) => {
            const was = prev ? prev.ranks.indexOf(t) : -2;
            const move = was === -1 ? "NR" : was >= 0 ? (was === i ? "—" : was > i ? `▲${was - i}` : `▼${i - was}`) : "";
            return (
              <tr key={t}>
                <td className="num">{i + 1}</td>
                <td className="name"><SchoolLink game={game} id={t} rank={false} /></td>
                <td className="num">{recordLabel(recs[t])}</td>
                <td>{conferenceName(COLLEGE_TEAM[t].conference)}</td>
                <td className={`num ${move.startsWith("▲") ? "good" : move.startsWith("▼") ? "bad" : ""}`}>{was >= 0 ? `${was + 1} ` : ""}<span className="muted">{move}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Polls({ game }: { game: GameState }) {
  const c = game.college!;
  const [kind, setKind] = useState<"ap" | "cfp">(c.cfp.length && game.date < "2027-01-26" ? "cfp" : "ap");
  const polls = c[kind];
  const [idx, setIdx] = useState<number | null>(null);
  const i = idx ?? polls.length - 1;
  const poll = polls[i];
  return (
    <div className="stack">
      <div className="btn-row">
        <div className="tabs" role="group" aria-label="Poll">
          <button aria-pressed={kind === "ap"} onClick={() => { setKind("ap"); setIdx(null); }}>AP Top 25</button>
          <button aria-pressed={kind === "cfp"} onClick={() => { setKind("cfp"); setIdx(null); }}>CFP rankings</button>
        </div>
        {polls.length > 0 && (
          <select value={i} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Release">
            {polls.map((p, j) => <option key={j} value={j}>{p.label} · {shortDate(p.date)}</option>)}
          </select>
        )}
      </div>
      {!poll && <p className="muted">{kind === "ap" ? "The preseason AP poll comes out on Aug 11." : "The selection committee releases its first ranking on Nov 3, then every Tuesday until Selection Day (Dec 6)."}</p>}
      {poll && <PollTable game={game} poll={poll} prev={polls[i - 1]} />}
      {c.cfpField && <Bracket game={game} />}
    </div>
  );
}

function Bracket({ game }: { game: GameState }) {
  const c = game.college!;
  const rounds: [CollegeGame["kind"], string][] = [["cfp1", "First round"], ["cfpQF", "Quarterfinals"], ["cfpSF", "Semifinals"], ["cfpF", "National championship"]];
  return (
    <div className="stack tight">
      <h3>College Football Playoff</h3>
      <p className="muted">Seeds: {c.cfpField!.map((t, i) => `${i + 1}. ${schoolName(t)}`).join(" · ")}</p>
      {rounds.map(([k, label]) => {
        const gs = c.post.filter((g) => g.kind === k);
        if (!gs.length) return null;
        return (
          <div key={k} className="stack tight">
            <strong>{label}</strong>
            <div className="scores">{gs.map((g) => <CollegeScore key={g.id} game={game} g={g} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Standings({ game }: { game: GameState }) {
  const [conf, setConf] = useState<CollegeConference | "power" | "all">("power");
  const list = CONFERENCE_IDS.filter((id) => conf === "all" || (conf === "power" ? CONFERENCES[id].power : id === conf));
  return (
    <div className="stack">
      <div className="btn-row">
        <select value={conf} onChange={(e) => setConf(e.target.value as CollegeConference | "power" | "all")} aria-label="Conference">
          <option value="power">Power conferences</option>
          <option value="all">All conferences</option>
          {CONFERENCE_IDS.map((id) => <option key={id} value={id}>{CONFERENCES[id].name}</option>)}
        </select>
      </div>
      <div className="divisions" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
        {list.map((id) => (
          <div key={id} className="table-wrap">
            <table>
              <thead>
                <tr><th>{CONFERENCES[id].name}</th><th className="num">{id === "IND" ? "" : "Conf"}</th><th className="num">All</th><th className="num">PF</th><th className="num">PA</th><th className="num">Strk</th></tr>
              </thead>
              <tbody>
                {conferenceStandings(game, id).map((r) => (
                  <tr key={r.team}>
                    <td className="name"><SchoolLink game={game} id={r.team} /></td>
                    <td className="num">{id === "IND" ? "" : `${r.rec.cw}-${r.rec.cl}`}</td>
                    <td className="num">{r.rec.w}-{r.rec.l}</td>
                    <td className="num">{r.rec.pf}</td><td className="num">{r.rec.pa}</td>
                    <td className="num">{r.rec.streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function Awards({ game }: { game: GameState }) {
  return (
    <div className="divisions" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
      {AWARDS.map((a) => <AwardCard key={a.id} game={game} award={a} />)}
    </div>
  );
}

function AwardCard({ game, award }: { game: GameState; award: AwardDef }) {
  const ui = useUi();
  const dc = draftClass(game.seed);
  const st = game.college!.awards[award.id] ?? {};
  const started = Object.keys(game.college!.results).length > 0;
  const watch = useMemo(() => watchList(game, award), [game, award]);
  const leaders = started && !st.winner ? awardRace(game, award, 5) : [];
  const person = (id: string, withLine = true) => {
    const p = dc.byId[id];
    return (
      <div key={id}>
        <button className="link" onClick={() => ui.openProspect(id)}>{p.name}</button>{" "}
        <span className="muted">{p.position}, {schoolName(p.school)}{withLine && started ? ` · ${prospectLine(p, prospectTotals(game, id))}` : ""}</span>
      </div>
    );
  };
  return (
    <div className="panel stack tight">
      <h3 style={{ margin: 0 }}>{award.name}</h3>
      <span className="muted">{award.what}</span>
      {st.winner && <div><span className="good">Winner</span> {person(st.winner)}</div>}
      {st.finalists && !st.winner && <><strong>Finalists</strong>{st.finalists.map((id) => person(id))}</>}
      {st.semifinalists && !st.finalists && <><strong>Semifinalists</strong>{st.semifinalists.slice(0, 6).map((id) => person(id))}</>}
      {leaders.length > 0 && !st.finalists && !st.semifinalists && <><strong>Leading the race</strong>{leaders.map((id) => person(id))}</>}
      <details>
        <summary className="muted">Preseason watch list ({watch.length})</summary>
        {watch.map((id) => person(id, false))}
      </details>
    </div>
  );
}
