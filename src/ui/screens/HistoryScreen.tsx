import { useState } from "react";
import { books } from "../../engine/books";
import { shortDate } from "../../engine/dates";
import { AWARD_NAME, honors } from "../../engine/honors";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID, teamLabel } from "../../engine/league";
import { NFL_GAME, NFL_SEASON, clubTimeline, contractMilestones, eras, records, rivals, tradeOutcomes } from "../../engine/records";
import { history } from "../../engine/seasons";
import { staff } from "../../engine/coaches";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { CareersTab, HindsightTab, OwnersTab, PeopleTab } from "./HistoryMore";
import { GroupedTabs } from "../Tabs";
import { useUi } from "../ui";

type Tab = "Honors" | "Hall of Fame" | "Records" | "Careers" | "Rivalries" | "Trades" | "Eras" | "Owners" | "People" | "Hindsight" | "Timeline";
// Players first, then the club's own story, then how judgments held up.
const GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Players", tabs: ["Honors", "Hall of Fame", "Records", "Careers"] },
  { label: "The club", tabs: ["Timeline", "Eras", "Owners", "Rivalries", "Trades"] },
  { label: "Looking back", tabs: ["People", "Hindsight"] },
];

export function HistoryScreen({ game }: { game: GameState }) {
  const [tab, setTab] = useState<Tab>("Honors");
  return (
    <section className="stack">
      <h2>History</h2>
      <GroupedTabs label="History" groups={GROUPS} value={tab} onChange={setTab} />
      {tab === "Honors" && <Honors game={game} />}
      {tab === "Hall of Fame" && <Hall game={game} />}
      {tab === "Records" && <Records game={game} />}
      {tab === "Rivalries" && <Rivalries game={game} />}
      {tab === "Trades" && <Trades game={game} />}
      {tab === "Eras" && <Eras game={game} />}
      {tab === "Careers" && <CareersTab game={game} />}
      {tab === "People" && <PeopleTab game={game} />}
      {tab === "Hindsight" && <HindsightTab game={game} />}
      {tab === "Timeline" && <Timeline game={game} />}
      {tab === "Owners" && <OwnersTab game={game} />}
    </section>
  );
}

/** A player (linked to his page) or, for Coach of the Year, a coach. */
function Name({ id, game }: { id: string; game?: GameState }) {
  const ui = useUi();
  if (!PLAYER_BY_ID[id]) return <>{game ? staff(game).people[id]?.name ?? id : id}</>;
  return <button className="link" onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button>;
}

function Honors({ game }: { game: GameState }) {
  const h = honors(game);
  const years = [...new Set([...Object.keys(h.awards), ...Object.keys(h.allPro), ...Object.keys(h.proBowl)].map(Number))].sort((a, b) => b - a);
  const [year, setYear] = useState(years[0]);
  if (!years.length) return <p className="muted">Pro Bowl rosters come out in late December, the All-Pro teams the week after the regular season, and the awards at NFL Honors the week of the Super Bowl.</p>;
  const y = year ?? years[0];
  const ap = h.allPro[y];
  const ours = (h.proBowl[y] ?? []).filter((id) => game.players[id]?.team === game.userTeam);
  return (
    <div className="stack">
      <label className="field">Season<select value={y} onChange={(e) => setYear(Number(e.target.value))}>{years.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
      <div className="panel stack tight">
        <h3>Awards</h3>
        {(h.awards[y] ?? []).length ? (
          <table><tbody>{h.awards[y].map((a) => (
            <tr key={a.award}><td>{AWARD_NAME[a.award]}</td><td className="name"><Name id={a.winner} game={game} /> <span className="muted">{teamLabel(a.team)}</span></td>
              <td className="muted">{a.finalists.length ? <>Also: {a.finalists.map((f, i) => <span key={f}>{i ? ", " : ""}<Name id={f} game={game} /></span>)}</> : ""}</td></tr>
          ))}</tbody></table>
        ) : <span className="muted">Handed out at NFL Honors, three days before the Super Bowl.</span>}
      </div>
      {ap && (
        <div className="split">
          {(["first", "second"] as const).map((k) => (
            <div key={k} className="panel stack tight">
              <h3>All-Pro {k} team</h3>
              {ap[k].map((id) => <span key={id}><span className="muted">{game.players[id]?.pos ?? PLAYER_BY_ID[id].position}</span> <Name id={id} /></span>)}
            </div>
          ))}
        </div>
      )}
      <div className="panel stack tight">
        <h3>Our Pro Bowlers</h3>
        {ours.length ? ours.map((id) => <span key={id}><Name id={id} /> <span className="muted">{game.players[id]?.pos ?? PLAYER_BY_ID[id].position}</span></span>) : <span className="muted">{h.proBowl[y] ? "None." : "Not named yet."}</span>}
        {h.proBowl[y] && <span className="muted">{h.proBowl[y].length} players were named across both conferences.</span>}
      </div>
    </div>
  );
}

function Hall({ game }: { game: GameState }) {
  const h = honors(game).hof;
  const years = Object.keys(h.finalists).map(Number).sort((a, b) => b - a);
  return (
    <div className="stack">
      <p className="muted">Players become eligible five full seasons after they retire. The selectors weigh the whole career: what he did, how long, and the honors along the way. A class takes at most five.</p>
      {!years.length && <span className="muted">No votes yet in this save. The first players to retire here become eligible five seasons later.</span>}
      {years.map((y) => (
        <div key={y} className="panel stack tight">
          <h3>Class of {y}</h3>
          <span>{h.classes[y]?.length ? h.classes[y].map((id, i) => <span key={id}>{i ? ", " : ""}<Name id={id} /></span>) : "Nobody reached the bar."}</span>
          {h.finalists[y]?.length > (h.classes[y]?.length ?? 0) && <span className="muted">Other finalists: {h.finalists[y].filter((id) => !h.classes[y]?.includes(id)).map((id, i) => <span key={id}>{i ? ", " : ""}<Name id={id} /></span>)}</span>}
        </div>
      ))}
    </div>
  );
}

function Records({ game }: { game: GameState }) {
  const r = records(game);
  const row = (key: string, nfl: [number, string, number, string], best: typeof r.game[string] | undefined) => (
    <tr key={key}>
      <td>{nfl[3]}</td><td className="num">{nfl[0]}</td><td>{nfl[1]} ({nfl[2]})</td>
      <td className="num">{best ? best.value : "—"}</td><td>{best ? <><Name id={best.player} /> <span className="muted">{best.team}, {best.season}</span></> : ""}</td>
    </tr>
  );
  return (
    <div className="stack">
      {r.broken.length > 0 && <div className="panel stack tight"><h3>Records broken</h3>{r.broken.map((b, i) => <span key={i}>{shortDate(b.date)}: {b.text}</span>)}</div>}
      {([["Single season", NFL_SEASON, r.season], ["Single game", NFL_GAME, r.game]] as const).map(([title, nfl, best]) => (
        <div key={title} className="panel stack tight">
          <h3>{title}</h3>
          <table>
            <thead><tr><th>Record</th><th className="num">NFL</th><th>Held by</th><th className="num">Best here</th><th></th></tr></thead>
            <tbody>{Object.keys(nfl).map((k) => row(k, nfl[k], best[k]))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Rivalries({ game }: { game: GameState }) {
  const list = rivals(game, game.userTeam).slice(0, 8);
  return (
    <div className="panel stack tight">
      <h3>Our rivals</h3>
      <span className="muted">Rivalries grow from division games, playoff meetings and close finishes.</span>
      <table>
        <thead><tr><th>Team</th><th>Rivalry</th><th className="num">Series</th><th className="num">Playoff meetings</th></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.team}><td className="name">{TEAM_BY_ID[r.team].city} {TEAM_BY_ID[r.team].name}</td><td>{r.word}</td><td className="num">{r.games ? `${r.w}-${r.l}${r.games - r.w - r.l ? `-${r.games - r.w - r.l}` : ""}` : "—"}</td><td className="num">{r.playoff}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Trades({ game }: { game: GameState }) {
  const [all, setAll] = useState(false);
  const list = tradeOutcomes(game, all ? undefined : game.userTeam).slice(0, 40);
  return (
    <div className="panel stack tight">
      <h3>How the trades turned out</h3>
      <span className="muted">Judged by what each side has gotten since, for the team that got it: seasons of production, and the players the picks became.</span>
      <label><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every team's trades</label>
      {!list.length && <span className="muted">No trades yet.</span>}
      {list.map(({ trade: t, detail, verdict }) => (
        <div key={t.id} className="stack tight">
          <span><strong>{shortDate(t.date)} {t.date.slice(0, 4)}</strong>: {teamLabel(t.teams[0])} got {detail[0].join(", ") || "nothing"}; {teamLabel(t.teams[1])} got {detail[1].join(", ") || "nothing"}.</span>
          <span className="muted">{verdict}</span>
        </div>
      ))}
    </div>
  );
}

function Eras({ game }: { game: GameState }) {
  const list = eras(game, game.userTeam);
  const past = history(game).seasons;
  return (
    <div className="stack">
      <div className="panel stack tight">
        <h3>Under each head coach and GM</h3>
        {!list.length && <span className="muted">Records start when the first season ends.</span>}
        {list.length > 0 && (
          <table>
            <thead><tr><th>Role</th><th>Name</th><th>Seasons</th><th className="num">Record</th><th className="num">Playoff wins</th><th className="num">Titles</th></tr></thead>
            <tbody>{list.map((e, i) => (
              <tr key={i}><td>{e.role === "HC" ? "Head coach" : "GM"}</td><td className="name">{e.name}</td><td>{e.from === e.to ? e.from : `${e.from}-${e.to}`}</td>
                <td className="num">{e.w}-{e.l}{e.t ? `-${e.t}` : ""}</td><td className="num">{e.playoffWins}</td><td className="num">{e.titles}</td></tr>
            ))}</tbody>
          </table>
        )}
        <span className="muted">Ownership: {game.ownerName} since {past[0]?.season ?? RULES.season}.</span>
      </div>
      <Milestones game={game} />
    </div>
  );
}

function Milestones({ game }: { game: GameState }) {
  const list = contractMilestones(game).slice(0, 15);
  return (
    <div className="panel stack tight">
      <h3>Contract milestones</h3>
      <span className="muted">Deals that set a new high at their position, by average per year.</span>
      {!list.length && <span className="muted">No position's top deal has been topped yet.</span>}
      {list.map((m, i) => <span key={i}>{shortDate(m.date)} {m.date.slice(0, 4)}: <Name id={m.player} /> ({m.pos}, {m.team}), {m.years} years at {money(m.apy)} a year, past {money(m.prior)}.</span>)}
    </div>
  );
}

function Timeline({ game }: { game: GameState }) {
  const t = clubTimeline(game);
  const closed = books(game).closed;
  const values = records(game).values;
  const us = game.userTeam;
  return (
    <div className="stack">
      <div className="panel stack tight">
        <h3>The club by year</h3>
        {!closed.length && !Object.keys(values).length && <span className="muted">Each year is added when the books close and the valuations come out.</span>}
        {(closed.length > 0 || Object.keys(values).length > 0) && (
          <table>
            <thead><tr><th>Year</th><th className="num">Revenue</th><th className="num">Operating income</th><th className="num">Net</th><th className="num">Debt</th><th className="num">Valuation</th></tr></thead>
            <tbody>{[...new Set([...closed.map((c) => c.year), ...Object.keys(values).map(Number)])].sort((a, b) => b - a).map((y) => {
              const c = closed.find((x) => x.year === y);
              return <tr key={y}><td>{y}</td><td className="num">{c ? money(c.revenue) : ""}</td><td className="num">{c ? money(c.operating) : ""}</td><td className="num">{c ? money(c.net) : ""}</td><td className="num">{c ? money(c.debtEnd) : ""}</td><td className="num">{values[y]?.[us] ? money(values[y][us]) : ""}</td></tr>;
            })}</tbody>
          </table>
        )}
      </div>
      <div className="panel stack tight">
        <h3>Our home</h3>
        {!t.length && <span className="muted">Building projects and lease changes show up here.</span>}
        {t.map((x, i) => <span key={i}>{shortDate(x.date)} {x.date.slice(0, 4)}: {x.text}</span>)}
      </div>
    </div>
  );
}
