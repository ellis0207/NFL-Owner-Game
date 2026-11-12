import type { ReactNode } from "react";
import { budgetVsActual } from "../engine/books";
import { capHit, capSummary, contractYearsLeft, rollover, teamPlayerIds } from "../engine/cap";
import { coachAge, jobLabel, knownFor, ROLE_NAME } from "../engine/coaches";
import { dealOf, leagueYear, salaryCap } from "../engine/contracts";
import { ageOn, shortDate } from "../engine/dates";
import { billions, BUDGET_LEVELS, business, cashBalance, CATEGORY, deptCost, DEPTS, pnl, valuation } from "../engine/business";
import { EXEC_ROLES, execs } from "../engine/executives";
import { GAME_BY_ID, PLAYER_BY_ID, RULES, SCHEDULE, STAFF, TEAM_BY_ID } from "../engine/league";
import { knownReturn } from "../engine/medical";
import { owners, relationWord } from "../engine/owners";
import { playerReport } from "../engine/reports";
import { profile } from "../engine/rivals";
import { gameTypeLabel, isSeasonOver, outLabel } from "../engine/season";
import { divisionStandings, matchup, standings } from "../engine/standings";
import { seasonTotals } from "../engine/stats";
import type { Dept, DefenseScheme, GameState, LedgerCat, OffenseScheme } from "../engine/types";
import { lastSeasonLine, money, statLine } from "./format";
import { tip } from "./tip";
import { useUi } from "./ui";
import type { SeasonStats } from "../engine/types";

/** What a hover card shows: a heading, a short line under it, and the details. */
export interface TipCard {
  title: ReactNode;
  sub?: ReactNode;
  body?: ReactNode;
  /** A last muted line: where to go for more. */
  foot?: string;
}

const STATUS: Record<string, string> = {
  camp: "In camp", active: "Active roster", ps: "Practice squad", ir: "Injured reserve", future: "Reserve/future deal", fa: "Free agent", retired: "Retired",
};

/** Label-value rows. A value that is money lines up on the right. */
function Rows({ rows }: { rows: ([ReactNode, ReactNode, string?] | false | null | undefined | "" | 0)[] }) {
  const shown = rows.filter(Boolean) as [ReactNode, ReactNode, string?][];
  if (!shown.length) return null;
  return (
    <table className="tip-rows">
      <tbody>
        {shown.map(([k, v, cls], i) => <tr key={i}><th scope="row">{k}</th><td className={cls}>{v}</td></tr>)}
      </tbody>
    </table>
  );
}

/** Names inside a card: hover for that card, click to open the page. */
export function TipPlayer({ id }: { id: string }) {
  const ui = useUi();
  const p = PLAYER_BY_ID[id];
  if (!p) return <>{id}</>;
  return <button className="link" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{p.name}</button>;
}
export function TipTeam({ id, full }: { id: string; full?: boolean }) {
  const t = TEAM_BY_ID[id];
  if (!t) return <>{id}</>;
  return <span className="tip-name" {...tip("team", id)}>{full ? `${t.city} ${t.name}` : t.name}</span>;
}
function TipCoach({ game, id }: { game: GameState; id: string }) {
  const c = game.staff?.people[id];
  return c ? <span className="tip-name" {...tip("coach", id)}>{c.name}</span> : null;
}
function Cat({ cat, year }: { cat: LedgerCat; year: number }) {
  return <span className="tip-name" {...tip("ledger", cat, year)}>{CATEGORY[cat].label}</span>;
}

function signed(v: number): string {
  return v > 0 ? `+${money(v)}` : money(v);
}

// ---- Players ----

function playerCard(game: GameState, id: string): TipCard | null {
  const p = PLAYER_BY_ID[id];
  const st = game.players[id];
  if (!p || !st) return null;
  const year = leagueYear(game.date);
  const deal = dealOf(game, id);
  const hit = st.team ? capHit(id, year, game) : 0;
  const left = deal ? contractYearsLeft(id, year, game) : 0;
  const age = ageOn(p.birthDate, game.date);
  const inj = st.injury && st.injury.returnDate > game.date ? st.injury : null;
  const now = seasonTotals(game, "REG")[id]?.line;
  const report = st.status !== "retired" ? playerReport(game, id) : null;
  const where = st.team ? <TipTeam id={st.team} full /> : st.lastTeam && TEAM_BY_ID[st.lastTeam] ? <>last with the <TipTeam id={st.lastTeam} /></> : null;
  return {
    title: <>{p.name} <span className="muted">{p.position}{p.jersey != null ? ` #${p.jersey}` : ""}</span></>,
    sub: <>{STATUS[st.status] ?? st.status}{where ? <> · {where}</> : null}</>,
    body: (
      <>
        <Rows rows={[
          ["Age", `${age ?? "—"}${p.yearsExp === 0 ? ", rookie" : `, ${p.yearsExp} seasons in`}`],
          inj && ["Injury", <span className="bad">{inj.type}: {outLabel(game.date, knownReturn(game, inj), inj.seasonEnding)}</span>],
          deal && st.team && [`${year} cap hit`, money(hit), "num"],
          deal && ["Contract", `${money(deal.apy)} a year, ${left} year${left === 1 ? "" : "s"} left`],
          !deal && st.status === "fa" && ["Contract", "None: free agent"],
          !isSeasonOver(game) && now && [`${RULES.season} so far`, statLine(p.position, now as unknown as SeasonStats)],
          ["Last season", lastSeasonLine(p)],
        ]} />
        {report && <p className="tip-note"><strong>{report.grade}</strong> <span className="muted">({report.authorRole.toLowerCase()})</span>{report.strengths[0] ? `. ${report.strengths[0]}` : ""}{report.concerns[0] ? `. ${report.concerns[0]}` : ""}.</p>}
      </>
    ),
    foot: "Click the name for the full player page.",
  };
}

// ---- Teams ----

function teamCard(game: GameState, id: string): TipCard | null {
  const t = TEAM_BY_ID[id];
  if (!t) return null;
  const table = standings(game);
  const r = table[id];
  const div = divisionStandings(game).find((d) => d.conference === t.conference && d.division === t.division);
  const place = div ? div.rows.findIndex((x) => x.team === id) + 1 : 0;
  const people = Object.values(game.staff?.people ?? {});
  const hc = people.find((c) => c.team === id && c.role === "HC");
  const gm = people.find((c) => c.team === id && c.role === "GM");
  const cap = capSummary(game, id);
  const ours = id === game.userTeam;
  const owner = ours ? game.ownerName : profile(game, id).owner;
  const rel = !ours ? owners(game).relations?.[id] : undefined;
  const involved = (g: (typeof SCHEDULE)[number]) => { const m = matchup(game, g); return m && (m.away === id || m.home === id) ? m : null; };
  const next = SCHEDULE.find((g) => g.date >= game.date && !game.results[g.id] && involved(g));
  const last = [...SCHEDULE].reverse().find((g) => game.results[g.id] && involved(g));
  const lastLine = (() => {
    if (!last) return null;
    const res = game.results[last.id];
    const home = res.home === id;
    const us = home ? res.homeScore : res.awayScore, them = home ? res.awayScore : res.homeScore;
    const opp = home ? res.away : res.home;
    return <><span className={us > them ? "good" : us < them ? "bad" : undefined}>{us > them ? "W" : us < them ? "L" : "T"} {us}-{them}</span> {home ? "vs" : "at"} <TipTeam id={opp} /></>;
  })();
  const nextLine = (() => {
    if (!next) return null;
    const m = involved(next)!;
    const opp = m.home === id ? m.away : m.home;
    return <span {...tip("game", next.id)} className="tip-name">{shortDate(next.date)}, {m.home === id ? "vs" : "at"} {TEAM_BY_ID[opp]?.name}</span>;
  })();
  return {
    title: `${t.city} ${t.name}`,
    sub: `${t.conference} ${t.division}${ours ? " · your club" : ""}`,
    body: (
      <Rows rows={[
        ["Record", `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}${place ? `, ${place}${["st", "nd", "rd", "th"][Math.min(place, 4) - 1]} in the division` : ""} (${r.pf} for, ${r.pa} against)`],
        lastLine && ["Last game", lastLine],
        nextLine && ["Next game", nextLine],
        hc && ["Head coach", <TipCoach game={game} id={hc.id} />],
        gm && ["General manager", <TipCoach game={game} id={gm.id} />],
        ["Owner", owner],
        rel && ["Relations", relationWord(rel)],
        game.settings.capRules !== "off" && ["Cap space", <span {...tip("cap", id)} className={`tip-name ${cap.space < 0 ? "bad" : ""}`}>{money(cap.space)}</span>, "num"],
        ["Club value (est.)", billions(valuation(game, id)), "num"],
      ]} />
    ),
  };
}

// ---- Football staff ----

function coachCard(game: GameState, id: string): TipCard | null {
  const c = game.staff?.people[id];
  if (!c) return null;
  const teamName = (t: string) => TEAM_BY_ID[t]?.name ?? t;
  const scheme = c.scheme && c.side
    ? (c.side === "offense" ? STAFF.schemeNames.offense[c.scheme as OffenseScheme] : STAFF.schemeNames.defense[c.scheme as DefenseScheme])
    : null;
  const head = c.record.filter((r) => r.role === "HC");
  const hw = head.reduce((s, r) => s + r.w, 0), hl = head.reduce((s, r) => s + r.l, 0), ht = head.reduce((s, r) => s + r.t, 0);
  const lastSeason = c.record.at(-1);
  const tags = knownFor(game, c);
  const mentor = c.mentor && game.staff?.people[c.mentor];
  return {
    title: c.name,
    sub: c.team ? <>{c.role ? ROLE_NAME[c.role].replace(/^./, (x) => x.toUpperCase()) : ""}, <TipTeam id={c.team} full /></> : jobLabel(c, teamName),
    body: (
      <>
        <Rows rows={[
          ["Age", `${c.birthYearEstimated ? "about " : ""}${coachAge(c)}`],
          scheme && ["Scheme", scheme],
          c.background && ["Background", c.background],
          c.contract && ["Contract", `${money(c.contract.salary)} a year through ${c.contract.through}`],
          head.length > 0 && ["As head coach", `${hw}-${hl}${ht ? `-${ht}` : ""} in ${head.length} season${head.length === 1 ? "" : "s"}, ${head.filter((r) => r.playoffs >= 0).length} playoff trip${head.filter((r) => r.playoffs >= 0).length === 1 ? "" : "s"}`],
          lastSeason && [`${lastSeason.season}`, `${teamName(lastSeason.team)} ${lastSeason.role}: ${lastSeason.w}-${lastSeason.l}${lastSeason.t ? `-${lastSeason.t}` : ""}${lastSeason.rank ? `, unit ranked ${lastSeason.rank}` : ""}`],
          mentor && ["Coaching tree", <TipCoach game={game} id={mentor.id} />],
        ]} />
        {tags.length > 0 && <p className="tip-note">Around the league: {tags.join("; ")}.</p>}
      </>
    ),
  };
}

// ---- Business executives ----

function execCard(game: GameState, id: string): TipCard | null {
  const e = execs(game).people[id];
  if (!e) return null;
  const job = e.role ? EXEC_ROLES[e.role].label : e.deputyOf ? `Deputy, ${EXEC_ROLES[e.deputyOf].label.toLowerCase()}` : "Candidate";
  return {
    title: e.name,
    sub: job,
    body: (
      <>
        <Rows rows={[
          ["Age", `${RULES.season - e.born}`],
          ["Background", `${e.background}, ${e.years} years in senior jobs`],
          ["Style", e.style],
          e.contract && ["Contract", `${money(e.contract.salary)} a year through ${e.contract.through}${e.contract.guaranteed ? ", guaranteed" : ""}`],
          e.resume[0] && ["Before", e.resume.slice(0, 2).join("; ")],
        ]} />
        {e.reviews[0] && <p className="tip-note">{e.reviews[0].year} review: {e.reviews[0].text}</p>}
      </>
    ),
  };
}

// ---- The cap ----

function capCard(game: GameState, team: string, yearArg?: string): TipCard | null {
  if (!TEAM_BY_ID[team]) return null;
  const year = yearArg ? Number(yearArg) : leagueYear(game.date);
  const s = capSummary(game, team, year);
  const carried = rollover(game, team, year);
  const league = salaryCap(game, year);
  const other = s.limit - league - carried;
  const hits = teamPlayerIds(game, team).map((id) => ({ id, hit: capHit(id, year, game) })).filter((h) => h.hit > 0).sort((a, b) => b.hit - a.hit);
  const top = hits.slice(0, 8);
  return {
    title: `${year} salary cap: ${TEAM_BY_ID[team].name}`,
    sub: s.rule === "top51" ? "Offseason: only the top 51 cap hits count" : "In season: every contract counts",
    body: (
      <>
        <Rows rows={[
          ["League cap", money(league), "num"],
          carried !== 0 && ["Carried over from last year", signed(carried), "num"],
          other !== 0 && [carried ? "Incentive settlement" : "Carryover and other adjustments", signed(other), "num"],
          ["Player contracts", `−${money(s.players)}`, "num"],
          s.dead > 0 && ["Dead money", `−${money(s.dead)}`, "num bad"],
          [<strong>Space</strong>, <strong className={s.space < 0 ? "bad" : undefined}>{money(s.space)}</strong>, "num"],
        ]} />
        {top.length > 0 && (
          <>
            <div className="tip-head">Biggest cap hits</div>
            <Rows rows={top.map((h) => [<TipPlayer id={h.id} />, money(h.hit), "num"])} />
            {hits.length > top.length && <p className="tip-note muted">{hits.length - top.length} more contracts: {money(hits.slice(top.length).reduce((t, h) => t + h.hit, 0))}.</p>}
          </>
        )}
      </>
    ),
    foot: "Every contract is on the Cap page.",
  };
}

// ---- The club's books ----

/** The payments behind one ledger line, grouped by what they were for. */
function ledgerCard(game: GameState, cat: LedgerCat, yearArg?: string): TipCard | null {
  if (!CATEGORY[cat]) return null;
  const year = yearArg ? Number(yearArg) : leagueYear(game.date);
  const entries = business(game).ledger.filter((e) => e.year === year && e.cat === cat);
  const total = entries.reduce((t, e) => t + e.amount, 0);
  const groups = new Map<string, { amount: number; n: number; last: string }>();
  for (const e of entries) {
    // Payments with the same note (weekly payroll, a monthly fee) add up to one line.
    const key = e.note ?? "Regular payments";
    const g = groups.get(key) ?? { amount: 0, n: 0, last: e.date };
    g.amount += e.amount; g.n += 1; g.last = e.date > g.last ? e.date : g.last;
    groups.set(key, g);
  }
  const rows = [...groups.entries()].sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount));
  const shown = rows.slice(0, 8);
  const plan = budgetVsActual(game, year).find((r) => r.cat === cat && r.plan !== 0);
  return {
    title: CATEGORY[cat].label,
    sub: `${year} league year · ${entries.length} payment${entries.length === 1 ? "" : "s"}`,
    body: (
      <>
        <Rows rows={[
          [<strong>{CATEGORY[cat].side === "in" ? "Taken in" : "Paid out"}</strong>, <strong className={total < 0 ? "bad" : "good"}>{money(total)}</strong>, "num"],
          plan && ["Budget for the year", money(plan.plan), "num"],
          plan && ["Budget to date", money(plan.toDate), "num"],
          plan && ["Versus budget", <span className={plan.variance >= 0 ? "good" : "bad"}>{signed(plan.variance)}</span>, "num"],
          plan && ["Year-end projection", money(plan.projected), "num"],
        ]} />
        {shown.length > 0 && (
          <>
            <div className="tip-head">What makes it up</div>
            <Rows rows={shown.map(([k, g]) => [<>{k}{g.n > 1 ? <span className="muted"> ×{g.n}</span> : null}</>, money(g.amount), "num"])} />
            {rows.length > shown.length && <p className="tip-note muted">{rows.length - shown.length} smaller items: {money(rows.slice(shown.length).reduce((t, [, g]) => t + g.amount, 0))}.</p>}
          </>
        )}
        {!entries.length && <p className="tip-note muted">Nothing booked here yet this year.</p>}
      </>
    ),
    foot: "Every payment is on Business > Books.",
  };
}

function deptCard(game: GameState, d: Dept): TipCard | null {
  const def = DEPTS[d];
  if (!def) return null;
  const b = business(game);
  const year = leagueYear(game.date);
  const level = b.budget[d];
  const spent = b.ledger.filter((e) => e.year === year && e.cat === (d as LedgerCat)).reduce((t, e) => t + e.amount, 0);
  const per = def.perGame ? " a home game" : " a year";
  return {
    title: def.label,
    sub: `Budget: ${BUDGET_LEVELS[level]}`,
    body: (
      <>
        <p className="tip-note">{def.what}</p>
        <div className="tip-head">What each level costs</div>
        <Rows rows={BUDGET_LEVELS.map((label, i) => [i === level ? <strong>{label} (now)</strong> : label, `${money(deptCost(d, i, year))}${per}`, "num"])} />
        {CATEGORY[d as LedgerCat] && <Rows rows={[[<Cat cat={d as LedgerCat} year={year} />, `${money(spent)} so far`, "num"]]} />}
      </>
    ),
  };
}

function cashCard(game: GameState): TipCard {
  const b = business(game);
  const year = leagueYear(game.date);
  const sums = new Map<LedgerCat, number>();
  for (const e of b.ledger) if (e.year === year) sums.set(e.cat, (sums.get(e.cat) ?? 0) + e.amount);
  const all = [...sums.entries()];
  const ins = all.filter(([, v]) => v > 0).sort((a, b2) => b2[1] - a[1]).slice(0, 5);
  const outs = all.filter(([, v]) => v < 0).sort((a, b2) => a[1] - b2[1]).slice(0, 5);
  const net = all.reduce((t, [, v]) => t + v, 0);
  return {
    title: "Cash on hand",
    sub: `${year} league year so far`,
    body: (
      <>
        <Rows rows={[
          [<strong>Balance today</strong>, <strong className={cashBalance(game) < 0 ? "bad" : undefined}>{money(cashBalance(game))}</strong>, "num"],
          ["Change this year", <span className={net < 0 ? "bad" : "good"}>{signed(net)}</span>, "num"],
        ]} />
        {ins.length > 0 && <><div className="tip-head">Most money in</div><Rows rows={ins.map(([c, v]) => [<Cat cat={c} year={year} />, money(v), "num"])} /></>}
        {outs.length > 0 && <><div className="tip-head">Most money out</div><Rows rows={outs.map(([c, v]) => [<Cat cat={c} year={year} />, money(v), "num"])} /></>}
      </>
    ),
    foot: "Hover a line for the payments behind it.",
  };
}

function pnlCard(game: GameState, yearArg: string | undefined, part: string | undefined): TipCard | null {
  const year = yearArg ? Number(yearArg) : leagueYear(game.date);
  const p = pnl(game, year);
  const list = (rows: { cat: LedgerCat; amount: number }[]) => <Rows rows={rows.map((r) => [<Cat cat={r.cat} year={year} />, money(r.amount), "num"])} />;
  if (part === "revenue") return { title: `${year} revenue: ${money(p.totalRevenue)}`, body: list([...p.revenue].sort((a, b) => b.amount - a.amount)) };
  if (part === "expenses") return { title: `${year} expenses: ${money(p.totalExpenses)}`, body: list([...p.expenses].sort((a, b) => a.amount - b.amount)) };
  return {
    title: `${year} operating income: ${money(p.operating)}`,
    body: (
      <Rows rows={[
        [<span className="tip-name" {...tip("pnl", year, "revenue")}>Revenue</span>, money(p.totalRevenue), "num"],
        [<span className="tip-name" {...tip("pnl", year, "expenses")}>Expenses</span>, `−${money(p.totalExpenses)}`, "num"],
        [<strong>Operating income</strong>, <strong className={p.operating < 0 ? "bad" : "good"}>{money(p.operating)}</strong>, "num"],
        p.interest !== 0 && ["Interest and loan fees", money(p.interest), "num"],
        p.interest !== 0 && [<strong>After borrowing costs</strong>, <strong>{money(p.net)}</strong>, "num"],
      ]} />
    ),
  };
}

// ---- Games ----

function gameCard(game: GameState, id: string): TipCard | null {
  const g = GAME_BY_ID[id];
  if (!g) return null;
  const m = matchup(game, g);
  const r = game.results[id];
  const table = standings(game);
  const rec = (t: string) => { const x = table[t]; return x ? `${x.w}-${x.l}${x.t ? `-${x.t}` : ""}` : ""; };
  return {
    title: m ? <><TipTeam id={m.away} /> at <TipTeam id={m.home} /></> : gameTypeLabel(g),
    sub: `${gameTypeLabel(g)} · ${shortDate(g.date)}${g.neutral ? " · neutral site" : ""}`,
    body: (
      <Rows rows={[
        r && ["Final", `${TEAM_BY_ID[r.away]?.name} ${r.awayScore}, ${TEAM_BY_ID[r.home]?.name} ${r.homeScore}${r.overtime ? " (OT)" : ""}`],
        m && !r && ["Records", `${TEAM_BY_ID[m.away]?.name} ${rec(m.away)}, ${TEAM_BY_ID[m.home]?.name} ${rec(m.home)}`],
        !m && ["Teams", "Not set yet"],
      ]} />
    ),
    foot: r ? "Click for the box score." : undefined,
  };
}

/** The card for a `data-tip` key, from the state as it is right now. */
export function tipCard(game: GameState, key: string): TipCard | null {
  const [kind, a, b] = key.split(":");
  switch (kind) {
    case "player": return playerCard(game, a);
    case "team": return teamCard(game, a);
    case "coach": return coachCard(game, a);
    case "exec": return execCard(game, a);
    case "cap": return capCard(game, a, b);
    case "ledger": return ledgerCard(game, a as LedgerCat, b);
    case "dept": return deptCard(game, a as Dept);
    case "cash": return cashCard(game);
    case "pnl": return pnlCard(game, a, b);
    case "game": return gameCard(game, a);
    default: return null;
  }
}
