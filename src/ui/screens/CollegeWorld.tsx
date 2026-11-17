// College page tabs for the living college world: recruiting, programs and the coaching carousel.
// Everything here is public: stars and ranks from the recruiting services, records, class ranks,
// coaching changes and what the boosters are saying. No program or coach numbers.
import { useMemo, useState } from "react";
import { COLLEGE_TEAM, COLLEGE_TEAMS, CONFERENCE_IDS, CONFERENCES, conferenceName, schoolName } from "../../engine/collegeData";
import { shortDate } from "../../engine/dates";
import { activeClass, classRanking, earlySigningDay, recruitPool, signingDay } from "../../engine/recruiting";
import { portalMoves } from "../../engine/portal";
import { coachName, headCoach, recentMoves, seatHeat, tenureRows } from "../../engine/cfbcoaches";
import type { CollegeConference, GameState, Position } from "../../engine/types";
import { height } from "../format";
import { useUi } from "../ui";

function School({ id }: { id: string }) {
  const ui = useUi();
  return <button className="link" onClick={() => ui.openSchool(id)}>{schoolName(id)}</button>;
}

export function stars(n: number): string {
  return "★".repeat(n);
}

// ---- Recruiting ----

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "OT", "OG", "C", "EDGE", "IDL", "LB", "CB", "S", "K", "P"];

export function Recruiting({ game }: { game: GameState }) {
  const now = activeClass(game.date);
  const years = [now, now - 1].filter((y) => game.cfb?.classes[y]);
  const [year, setYear] = useState(now);
  const [view, setView] = useState<"players" | "teams" | "portal">("players");
  const cls = game.cfb?.classes[year];
  if (!game.cfb || !cls) return <p className="muted">Recruiting starts when the college world does.</p>;
  const pool = recruitPool(game.seed, year);
  const committed = Object.keys(cls.commits).length;
  return (
    <div className="stack">
      <div className="btn-row">
        <div className="tabs" role="group" aria-label="Recruiting view">
          <button aria-pressed={view === "players"} onClick={() => setView("players")}>Top recruits</button>
          <button aria-pressed={view === "teams"} onClick={() => setView("teams")}>Team rankings</button>
          <button aria-pressed={view === "portal"} onClick={() => setView("portal")}>Transfer portal</button>
        </div>
        {years.length > 1 && (
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Class">
            {years.map((y) => <option key={y} value={y}>Class of {y}{y === now ? " (recruiting now)" : " (signed)"}</option>)}
          </select>
        )}
      </div>
      <p className="muted">
        {cls.done
          ? `The class of ${year} signed on ${shortDate(signingDay(year))}.`
          : `Class of ${year}: ${committed.toLocaleString("en-US")} of the top ${pool.recruits.length.toLocaleString("en-US")} have committed. Early signing period ${shortDate(earlySigningDay(year))}, National Signing Day ${shortDate(signingDay(year))}.`}
        {" "}Stars and ranks are the recruiting services' composite: a read on high school players, often wrong.
      </p>
      {view === "players" ? <Recruits game={game} year={year} /> : view === "teams" ? <ClassRanks game={game} year={year} /> : <Portal game={game} />}
    </div>
  );
}

function Recruits({ game, year }: { game: GameState; year: number }) {
  const [pos, setPos] = useState<Position | "all">("all");
  const [status, setStatus] = useState<"all" | "open" | "committed">("all");
  const [n, setN] = useState(100);
  const cls = game.cfb!.classes[year];
  const list = recruitPool(game.seed, year).recruits
    .filter((r) => pos === "all" || r.position === pos)
    .filter((r) => status === "all" || (status === "open" ? !cls.commits[r.id] : !!cls.commits[r.id]));
  return (
    <div className="stack tight">
      <div className="btn-row">
        <select value={pos} onChange={(e) => setPos(e.target.value as Position | "all")} aria-label="Position">
          <option value="all">All positions</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as "all" | "open" | "committed")} aria-label="Status">
          <option value="all">Committed or not</option>
          <option value="open">Uncommitted</option>
          <option value="committed">Committed</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">Rk</th><th>Recruit</th><th>Pos</th><th>Size</th><th>Home</th><th className="num">Rating</th><th>Status</th></tr></thead>
          <tbody>
            {list.slice(0, n).map((r) => {
              const c = cls.commits[r.id];
              return (
                <tr key={r.id}>
                  <td className="num">{r.rank}</td>
                  <td className="name">{r.name} <span className="muted">{stars(r.stars)}</span></td>
                  <td>{r.position}</td>
                  <td className="muted">{height(r.heightIn)}, {r.weightLb}</td>
                  <td>{r.home}</td>
                  <td className="num">{r.rating.toFixed(4)}</td>
                  <td>{c ? <>{c.signed ? "Signed" : "Committed"}: <School id={c.school} /> <span className="muted">{shortDate(c.date)}{c.flipped ? ` · flipped from ${schoolName(c.flipped)}` : ""}</span></> : <span className="muted">Uncommitted</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > n && <button className="btn small" onClick={() => setN(n + 100)}>Show more ({list.length - n} left)</button>}
    </div>
  );
}

function ClassRanks({ game, year }: { game: GameState; year: number }) {
  const rows = useMemo(() => classRanking(game, year), [game, year, Object.keys(game.cfb!.classes[year].commits).length]);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th className="num">Rk</th><th>School</th><th>Conference</th><th className="num">Commits</th><th className="num">5★</th><th className="num">4★</th><th className="num">Points</th></tr></thead>
        <tbody>
          {rows.filter((r) => r.commits > 0).map((r, i) => (
            <tr key={r.team}>
              <td className="num">{i + 1}</td>
              <td className="name"><School id={r.team} /></td>
              <td>{conferenceName(COLLEGE_TEAM[r.team].conference)}</td>
              <td className="num">{r.commits}</td><td className="num">{r.five || ""}</td><td className="num">{r.four || ""}</td>
              <td className="num">{r.points.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Portal({ game }: { game: GameState }) {
  const ui = useUi();
  const moves = portalMoves(game).filter((m) => m.date <= game.date);
  if (!moves.length) return <p className="muted">The portal opens for three weeks after the conference title games and for ten days in April. Players we track who enter show up here.</p>;
  return (
    <div className="stack tight">
      <p className="muted">Draft prospects for the next two years who entered the portal. A transfer plays for his new school from next season.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Entered</th><th>Player</th><th>Pos</th><th>From</th><th>To</th></tr></thead>
          <tbody>
            {moves.map((m) => (
              <tr key={m.id}>
                <td>{shortDate(m.date)}</td>
                <td className="name"><button className="link" onClick={() => ui.openProspect(m.id)}>{m.name}</button></td>
                <td>{m.position}</td>
                <td><School id={m.from} /></td>
                <td>{!m.to ? <span className="muted">Looking</span> : m.to === m.from ? <span className="muted">Stayed</span> : <School id={m.to} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Programs ----

function seasonLabel(row: number[]): string {
  return `${row[1]}-${row[2]}${row[3] ? ` (${row[3]})` : ""}${row[5] === 5 ? " ★" : ""}`;
}

export function Programs({ game }: { game: GameState }) {
  const [conf, setConf] = useState<CollegeConference | "power" | "all">("power");
  const [sort, setSort] = useState<"last" | "recruiting" | "name">("last");
  const w = game.cfb;
  if (!w) return <p className="muted">Program histories start with the living college world.</p>;
  const lastSeason = Math.max(0, ...COLLEGE_TEAMS.map((t) => w.programs[t.id].seasons.at(-1)?.[0] ?? 0));
  const seasons = [lastSeason - 2, lastSeason - 1, lastSeason].filter((y) => y > 0);
  const classYears = [...new Set(COLLEGE_TEAMS.flatMap((t) => Object.keys(w.programs[t.id].classRank).map(Number)))].sort().slice(-3);
  const avgClass = (id: string) => {
    const r = classYears.map((y) => w.programs[id].classRank[y]).filter(Boolean);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 999;
  };
  const lastPct = (id: string) => {
    const r = w.programs[id].seasons.at(-1);
    return r ? r[1] / Math.max(1, r[1] + r[2]) + (r[3] ? (26 - r[3]) * 0.01 : 0) : 0;
  };
  const list = COLLEGE_TEAMS.map((t) => t.id)
    .filter((id) => conf === "all" || (conf === "power" ? CONFERENCES[COLLEGE_TEAM[id].conference].power : COLLEGE_TEAM[id].conference === conf))
    .sort((a, b) => sort === "name" ? schoolName(a).localeCompare(schoolName(b)) : sort === "recruiting" ? avgClass(a) - avgClass(b) : lastPct(b) - lastPct(a));
  return (
    <div className="stack tight">
      <div className="btn-row">
        <select value={conf} onChange={(e) => setConf(e.target.value as CollegeConference | "power" | "all")} aria-label="Conference">
          <option value="power">Power conferences</option>
          <option value="all">All FBS</option>
          {CONFERENCE_IDS.map((id) => <option key={id} value={id}>{CONFERENCES[id].name}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as "last" | "recruiting" | "name")} aria-label="Sort">
          <option value="last">Last season</option>
          <option value="recruiting">Recent recruiting</option>
          <option value="name">School</option>
        </select>
      </div>
      {!seasons.length && <p className="muted">No seasons finished in this save yet: records fill in after the national championship.</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>School</th><th>Head coach</th>
              {seasons.map((y) => <th key={y} className="num">{y}</th>)}
              {classYears.map((y) => <th key={y} className="num">Class {y}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((id) => {
              const p = w.programs[id];
              const hc = headCoach(game, id);
              return (
                <tr key={id}>
                  <td className="name"><School id={id} /></td>
                  <td>{hc ? <>{hc.name} <span className="muted">since {hc.hiredYear}</span></> : <span className="muted">Open</span>}</td>
                  {seasons.map((y) => { const r = p.seasons.find((x) => x[0] === y); return <td key={y} className="num">{r ? seasonLabel(r) : "—"}</td>; })}
                  {classYears.map((y) => <td key={y} className="num">{p.classRank[y] ?? "—"}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">Records with the final AP rank in parentheses; ★ national champion. Class columns are the recruiting services' team ranking.</p>
    </div>
  );
}

// ---- Coaching changes ----

export function heatLabel(h: number): string | null {
  return h >= 0.75 ? "Scorching" : h >= 0.5 ? "Hot" : h >= 0.3 ? "Warm" : null;
}

export function Coaching({ game }: { game: GameState }) {
  const w = game.cfb;
  if (!w) return <p className="muted">The college carousel starts with the living college world.</p>;
  const moves = recentMoves(game, 300);
  const openings = Object.entries(w.openings).sort((a, b) => a[1].localeCompare(b[1]));
  const seats = COLLEGE_TEAMS.map((t) => [t.id, seatHeat(game, t.id)] as const).filter(([, h]) => heatLabel(h)).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return (
    <div className="stack">
      <section className="stack tight">
        <h3>Open jobs ({openings.length})</h3>
        {!openings.length && <p className="muted">Every program has a head coach.</p>}
        {openings.map(([t, d]) => <div key={t}><School id={t} /> <span className="muted">open since {shortDate(d)} · {conferenceName(COLLEGE_TEAM[t].conference)}</span></div>)}
      </section>
      <section className="stack tight">
        <h3>The hot seat</h3>
        <p className="muted">What boosters and the local press are saying, measured against what each program expects of itself.</p>
        {!seats.length && <p className="muted">Nobody's job is in question right now.</p>}
        {seats.map(([t, h]) => {
          const hc = headCoach(game, t);
          const rows = hc ? tenureRows(game, hc.id, t) : [];
          return (
            <div key={t}><span className={h >= 0.5 ? "bad" : ""}>{heatLabel(h)}</span> · {coachName(game, t)}, <School id={t} />
              <span className="muted"> since {hc?.hiredYear}{rows.length ? ` · ${rows.slice(-3).map(([, r]) => `${r[1]}-${r[2]}`).join(", ")}` : ""}</span></div>
          );
        })}
      </section>
      <section className="stack tight">
        <h3>Coaching changes</h3>
        {!moves.length && <p className="muted">No changes yet. Firings come the week after rivalry weekend; NFL teams call in January.</p>}
        {moves.map((m, i) => <div key={i}><span className="muted">{shortDate(m.date)}</span> {m.text}</div>)}
      </section>
    </div>
  );
}

// ---- One school's side of it ----

export function SchoolProgram({ game, id }: { game: GameState; id: string }) {
  const w = game.cfb;
  if (!w) return null;
  const p = w.programs[id];
  const year = activeClass(game.date);
  const cls = w.classes[year];
  const pool = recruitPool(game.seed, year);
  const commits = Object.entries(cls?.commits ?? {}).filter(([, c]) => c.school === id).map(([rid, c]) => [pool.byId[rid], c] as const)
    .filter(([r]) => r).sort((a, b) => a[0].rank - b[0].rank);
  const rank = classRanking(game, year).findIndex((r) => r.team === id) + 1;
  const titles = p.seasons.filter((r) => r[5] === 5).map((r) => r[0]);
  return (
    <>
      {p.seasons.length > 0 && (
        <section className="stack tight">
          <h3>Recent seasons</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Season</th><th className="num">Record</th><th className="num">Final AP</th><th>Postseason</th><th>Coach</th><th className="num">Class rank</th></tr></thead>
              <tbody>
                {p.seasons.slice(-8).reverse().map((r) => (
                  <tr key={r[0]}>
                    <td>{r[0]}</td><td className="num">{r[1]}-{r[2]}</td><td className="num">{r[3] || "—"}</td>
                    <td>{[r[4] ? "Conference champion" : "", ["", "Playoff", "Playoff quarterfinal", "Playoff semifinal", "Lost title game", "National champion"][r[5]]].filter(Boolean).join(", ") || "—"}</td>
                    <td>{game.staff?.people[p.coaches[r[0]]]?.name ?? "—"}</td>
                    <td className="num">{p.classRank[r[0]] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {titles.length > 0 && <span className="muted">National titles in this save: {titles.join(", ")}</span>}
        </section>
      )}
      <section className="stack tight">
        <h3>Class of {year}{rank && commits.length ? ` · No. ${rank} nationally` : ""}</h3>
        {!commits.length && <p className="muted">No commitments from the nation's top recruits yet.</p>}
        {commits.map(([r, c]) => (
          <div key={r.id}>{r.name} <span className="muted">{stars(r.stars)} {r.position}, {r.home} · No. {r.rank}{c.signed ? " · signed" : ""}</span></div>
        ))}
      </section>
    </>
  );
}
