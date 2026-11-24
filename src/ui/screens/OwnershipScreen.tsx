import { useState } from "react";
import { billions, valuation } from "../../engine/business";
import { shortDate } from "../../engine/dates";
import { wantsWord } from "../../engine/crossroads";
import { boardroom, nextMeeting, openPledge, partnerGoal, payPledge, pledgeOnTrack } from "../../engine/boardroom";
import { marketRate } from "../../engine/debt";
import {
  board, BOARD_MAJORITY, bridgeLoan, checkSale, contingency, CONTROL, covenants, investors, MATTERS, moodWord, openSale, ownerCapitalCall, ownerShare,
  partnerReturn, pctText, returns, RULE_LINES, setDisclosure, setSuccession, SUCCESSION, TERMS, type Matter,
} from "../../engine/investors";
import { TEAM_BY_ID, TEAMS } from "../../engine/league";
import { owner } from "../../engine/ownership";
import type { GameState, InvestorsState, Partner, StakeSale, StakeTerms } from "../../engine/types";
import { franchise } from "../../engine/franchisemarket";
import { inControl } from "../../engine/takeover";
import { money } from "../format";
import { GroupedTabs } from "../Tabs";
import { Deals } from "./OwnershipDeals";
import { Succession } from "./OwnershipSuccession";
import { Avatar, Bars, Chip, Donut, Gauge, HudStat, Hud, Stacked, TeamTag } from "../gfx";

type Tab = "Stakes" | "Board" | "Investors" | "Reports" | "Succession" | "Deals";
// Partners and governance of the club you own, then buying and selling clubs.
const GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Your club", tabs: ["Stakes", "Board", "Investors", "Reports"] },
  { label: "The future", tabs: ["Succession", "Deals"] },
];
type Say = (msg: string | null, ok?: string) => void;

const KIND: Record<Partner["kind"], string> = { individual: "Individual", family: "Family office", fund: "Private-equity fund", celebrity: "Public figure" };
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const big = (x: number) => (Math.abs(x) >= 1e9 ? billions(x) : money(x));

export function OwnershipScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [tab, setTab] = useState<Tab>(inControl(game) && !franchise(game).deal ? "Stakes" : "Deals");
  const [said, setSaid] = useState<string | null>(null);
  const say: Say = (msg, ok) => { setSaid(msg ?? ok ?? null); changed(); };
  return (
    <section className="stack">
      <GroupedTabs label="Ownership" groups={inControl(game) ? GROUPS : [{ label: "Clubs", tabs: ["Deals"] }]} value={inControl(game) ? tab : "Deals"} onChange={setTab} />
      {said && <p className="notice">{said}</p>}
      {inControl(game) && tab === "Stakes" && <Stakes game={game} say={say} />}
      {inControl(game) && tab === "Board" && <Board game={game} say={say} />}
      {inControl(game) && tab === "Investors" && <Investors game={game} say={say} />}
      {inControl(game) && tab === "Reports" && <Reports game={game} />}
      {inControl(game) && tab === "Succession" && <Succession game={game} say={say} />}
      {(tab === "Deals" || !inControl(game)) && <Deals game={game} say={say} />}
    </section>
  );
}

function SaleStatus({ game, sale }: { game: GameState; sale: StakeSale }) {
  const s = investors(game);
  const seller = sale.seller ? s.partners.find((p) => p.id === sale.seller)?.name : undefined;
  const bid = sale.bids.find((b) => b.id === sale.chosen);
  const what = `${pctText(sale.pct)} of the club (${seller ? `${seller}'s stake` : sale.kind === "primary" ? "new shares" : "your shares"}, ${TERMS[sale.terms].label.toLowerCase()} terms)`;
  const line = {
    marketing: `The bankers are taking ${what} to buyers. Bids are due ${shortDate(sale.bidsDue)}.`,
    bids: `Bids for ${what} are in. The memo is on Today.`,
    league: `${bid?.name} agreed to pay ${money(bid?.price ?? 0)} for ${what}. The league's finance committee is vetting them; it should close ${sale.closes ? shortDate(sale.closes) : "soon"}.`,
    closed: `Sold ${what} to ${bid?.name} for ${money(bid?.price ?? 0)}.`,
    failed: `The sale of ${what} didn't go through.`,
  }[sale.stage];
  return <span>{line}</span>;
}

function Stakes({ game, say }: { game: GameState; say: Say }) {
  const s = investors(game);
  const o = owner(game);
  const value = valuation(game, game.userTeam);
  const [pct, setPct] = useState(0.1);
  const [kind, setKind] = useState<StakeSale["kind"]>("secondary");
  const [terms, setTerms] = useState<StakeTerms>("standard");
  const [call, setCall] = useState(50_000_000);
  const blocked = checkSale(game, pct, kind);
  const low = value * pct * (1 - 0.1 - TERMS[terms].discount - 0.05);
  const high = value * pct * (1 - 0.1 - TERMS[terms].discount + 0.06);
  const busy = s.sale && s.sale.stage !== "closed" && s.sale.stage !== "failed";
  return (
    <>
      <div className="panel stack tight">
        <h3>Who owns the {TEAM_BY_ID[game.userTeam].name}</h3>
        <div className="gx-row">
          <Donut size={130} center={<span style={{ display: "grid" }}><strong>{pc(ownerShare(game))}</strong><span className="muted" style={{ fontSize: "0.65rem" }}>YOURS</span></span>}
            parts={[{ label: game.ownerName, value: ownerShare(game), text: pc(ownerShare(game)), color: "var(--team)" },
              ...s.partners.map((p, i) => ({ label: p.name, value: p.pct, text: pc(p.pct), color: `hsl(${(i * 67 + 200) % 360} 45% 52%)` }))]} />
          <Hud>
            <HudStat icon="bank" label="Club value" value={billions(value)} />
            <HudStat icon="users" label="Partners" value={s.partners.length} />
            <HudStat icon="money" label="You put in" value={money(o.putIn)} />
            <HudStat icon="trend" label="You took out" value={money(o.takenOut)} tone="good" />
          </Hud>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Owner</th><th>Kind</th><th className="num">Share</th><th className="num">Paid</th><th className="num">Capital calls</th><th className="num">Distributions</th><th>Board</th><th>Terms</th><th>Mood</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>{game.ownerName}</strong></td><td>Controlling owner</td><td className="num">{pc(ownerShare(game))}</td>
                <td className="num">{billions(o.purchase)}</td><td className="num">{money(o.putIn)}</td><td className="num">{money(o.takenOut)}</td><td>Chair</td><td /><td />
              </tr>
              {s.partners.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td><td>{KIND[p.kind]}</td><td className="num">{pc(p.pct)}</td><td className="num">{big(p.paid)}</td>
                  <td className="num">{money(p.calls)}</td><td className="num">{money(p.distributions)}</td><td>{p.board ? <Chip icon="key">Seat</Chip> : <span className="muted">No</span>}</td>
                  <td>{TERMS[p.terms].label}</td><td><Chip icon="heart" tone={p.mood < 42 ? "bad" : p.mood >= 58 ? "good" : undefined}>{moodWord(p.mood)}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="muted">
          {s.partners.length
            ? "Distributions and capital calls go to every partner by their shares, so your own pocket gets only your part. You pay tax on your share of the club's income."
            : "You bought the whole club, so for now there are no partners. Selling a stake brings in money and partners who share in distributions, meet capital calls and vote on reserved matters."}
          {" "}The partners, funds and bidders are made up.
        </span>
        {s.former.length > 0 && <span className="muted">Former partners: {s.former.map((f) => `${f.name} (${pctText(f.pct)}, left ${shortDate(f.left)} ${f.left.slice(0, 4)}: ${f.how.toLowerCase()})`).join("; ")}.</span>}
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Sell a stake</h3>
          {s.sale && <SaleStatus game={game} sale={s.sale} />}
          {!busy && (
            <>
              <label className="field"><span className="label">How much</span>
                <select value={pct} onChange={(e) => setPct(Number(e.target.value))}>
                  {[0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((x) => <option key={x} value={x}>{pctText(x)}</option>)}
                </select>
              </label>
              <label className="field"><span className="label">Whose shares</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as StakeSale["kind"])}>
                  <option value="secondary">Yours: the money comes to you</option>
                  <option value="primary">New shares: the money goes into the club</option>
                </select>
              </label>
              <label className="field"><span className="label">Terms</span>
                <select value={terms} onChange={(e) => setTerms(e.target.value as StakeTerms)}>
                  {(Object.keys(TERMS) as StakeTerms[]).map((t) => <option key={t} value={t}>{TERMS[t].label}</option>)}
                </select>
              </label>
              <span className="muted">{TERMS[terms].what}</span>
              <span>The bankers expect bids of roughly {big(low)} to {big(high)}, against a club value of about {billions(value)}. Minority stakes sell below their share of full value.</span>
              {blocked && <span className="bad">{blocked}</span>}
              <div className="btn-row">
                <button className="btn small primary" disabled={!!blocked} onClick={() => say(openSale(game, pct, kind, terms), "The stake is on the market. Bids come back as a memo in about three weeks.")}>Put it on the market</button>
              </div>
            </>
          )}
        </div>
        <div className="panel stack tight">
          <h3>Capital calls</h3>
          {s.partners.length ? (
            <>
              <span>Call money from every partner by their shares. A partner who can't pay is diluted.</span>
              <label className="field"><span className="label">Amount</span>
                <select value={call} onChange={(e) => setCall(Number(e.target.value))}>
                  {[25, 50, 100, 200].map((x) => <option key={x} value={x * 1_000_000}>{money(x * 1_000_000)}</option>)}
                </select>
              </label>
              <div className="btn-row"><button className="btn small" onClick={() => say(ownerCapitalCall(game, call), "The call went out.")}>Call {money(call)}</button></div>
            </>
          ) : <span className="muted">With no partners, a capital call is just you. If the club runs past its credit line, the money comes from you automatically.</span>}
          {s.calls.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th className="num">Called</th><th className="num">Your part</th><th>Why</th></tr></thead>
                <tbody>{s.calls.slice(0, 8).map((c, i) => <tr key={i}><td>{shortDate(c.date)} {c.date.slice(0, 4)}</td><td className="num">{big(c.amount)}</td><td className="num">{money(c.ours)}</td><td className="muted">{c.why}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>The league's ownership rules</h3>
          <ul>{RULE_LINES.map((l) => <li key={l}>{l}</li>)}</ul>
          <span className="muted">Approximate, as the policy stood after the league opened stakes to private-equity funds in 2024.</span>
        </div>
        <div className="panel stack tight">
          <h3>Around the league</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Club</th><th>Controlled by</th></tr></thead>
              <tbody>{TEAMS.filter((t) => t.id !== game.userTeam).map((t) => <tr key={t.id}><td><TeamTag team={t.id} name={t.name} /></td><td>{CONTROL[t.id] ?? "Unknown"}</td></tr>)}</tbody>
            </table>
          </div>
          <span className="muted">The real controlling owners, approximately, as of 2026.</span>
        </div>
      </div>
    </>
  );
}

function Board({ game, say }: { game: GameState; say: Say }) {
  const s = investors(game);
  const share = ownerShare(game);
  const rate = marketRate(game);
  const [amount, setAmount] = useState(50_000_000);
  const [extra, setExtra] = useState(0.01);
  return (
    <>
      <div className="split">
        <div className="panel stack tight">
          <h3>The board</h3>
          <div className="gx-grid">{board(game).map((d) => <div key={d.name} className="gx-row"><Avatar name={d.name} size={36} icon={/chair/i.test(d.role) ? "key" : undefined} /><div className="stack tight"><strong>{d.name}</strong><span className="muted">{d.role}</span></div></div>)}</div>
          <span className="muted">The board meets each quarter and votes on reserved matters. Partner directors join when a partner's terms give them a seat.</span>
        </div>
        <div className="panel stack tight">
          <h3>Reserved matters</h3>
          <div className="btn-row">{(Object.keys(MATTERS) as Matter[]).map((m) => <Chip key={m} icon="gavel">{MATTERS[m].label}</Chip>)}</div>
          <span>{!s.partners.length ? "With no partners, your vote carries them." : share >= BOARD_MAJORITY ? `You hold ${pctText(share)}, enough to carry them alone; partners still notice how they're asked.` : `You hold ${pctText(share)}. These need two-thirds of the shares, so you need partners' votes.`}</span>
        </div>
      </div>
      {s.partners.length > 0 && <BoardMeetings game={game} say={say} />}
      <div className="split">
        <div className="panel stack tight">
          <h3>Covenants</h3>
          <div className="table-wrap">
            <table>
              <tbody>{covenants(game).map((c) => <tr key={c.what}><td>{c.what}</td><td><Chip icon={c.ok ? "check" : "alert"} tone={c.ok ? "good" : "bad"}>{c.status}</Chip></td></tr>)}</tbody>
            </table>
          </div>
          <span className="muted">A broken lender covenant stops distributions; the investor agreement and the league's rules stop actions that would break them.</span>
        </div>
        <div className="panel stack tight">
          <h3>Succession terms</h3>
          <label className="field"><span className="label">If you can no longer run the club</span>
            <select value={s.succession} onChange={(e) => { setSuccession(game, e.target.value as InvestorsState["succession"]); say(null); }}>
              {(Object.keys(SUCCESSION) as InvestorsState["succession"][]).map((k) => <option key={k} value={k}>{{ trust: "Family trust", named: "A named successor", sale: "Sell the club" }[k]}</option>)}
            </select>
          </label>
          <span>{SUCCESSION[s.succession][0].toUpperCase() + SUCCESSION[s.succession].slice(1)}.</span>
          <span className="muted">Every partner's agreement carries transfer limits: a right of first refusal on their stake, tag-along rights if control is sold, and the league's approval for any new partner.</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Bridge loan from you</h3>
          <span>Lend the club money for a year from your own cash. It's a related-party deal: the league is told, and with partners the board checks the rate is no more than two points over the market ({pc(rate)} now).</span>
          <div className="btn-row">
            <select aria-label="Amount" value={amount} onChange={(e) => setAmount(Number(e.target.value))}>{[25, 50, 100, 200].map((x) => <option key={x} value={x * 1_000_000}>{money(x * 1_000_000)}</option>)}</select>
            <select aria-label="Rate" value={extra} onChange={(e) => setExtra(Number(e.target.value))}>
              <option value={0}>At the market rate</option><option value={0.01}>One point over</option><option value={0.03}>Three points over</option>
            </select>
            <button className="btn small" onClick={() => say(bridgeLoan(game, amount, rate + extra), "The loan is on the club's books.")}>Lend it</button>
          </div>
        </div>
        <div className="panel stack tight">
          <h3>Related-party reviews</h3>
          {s.reviews.length ? <ul>{s.reviews.slice(0, 8).map((r, i) => <li key={i}>{shortDate(r.date)} {r.date.slice(0, 4)}: {r.what}. <span className="muted">{r.outcome}.</span></li>)}</ul> : <span className="muted">Nothing reviewed yet.</span>}
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Minutes</h3>
        {s.minutes.length ? <ul>{s.minutes.slice(0, 12).map((m, i) => <li key={i} className={m.passed ? "" : "bad"}>{shortDate(m.date)} {m.date.slice(0, 4)}: {m.text}</li>)}</ul> : <span className="muted">No votes yet.</span>}
      </div>
    </>
  );
}

/** The quarterly meetings: the promise on the table, the record of keeping them, and what each meeting asked. */
function BoardMeetings({ game, say }: { game: GameState; say: Say }) {
  const b = boardroom(game);
  const pl = openPledge(game);
  const ok = pl ? pledgeOnTrack(game, pl) : false;
  return (
    <div className="split">
      <div className="panel stack tight">
        <h3>Your pledge to the board</h3>
        {pl ? <>
          <span><strong>"{pl.text}."</strong></span>
          <span className={ok ? "good" : "bad"}>{ok ? "As things stand, it would be kept." : "As things stand, it would be broken."} Checked {shortDate(pl.due)} {pl.due.slice(0, 4)}.</span>
          {pl.kind === "payout" && !ok && <div className="btn-row"><button className="btn small" onClick={() => say(payPledge(game), "Paid. Every partner got their share.")}>Pay it now</button></div>}
        </> : <span className="muted">No promise open. The next meeting is {shortDate(nextMeeting(game.date))}.</span>}
        <span className="muted">Kept: {b.kept}. Broken: {b.broken}. Partners who asked for a pledge take a broken one hardest, and a record of broken ones makes every plan you present sound thinner.</span>
      </div>
      <div className="panel stack tight">
        <h3>Meetings</h3>
        {b.meetings.length ? <ul>{b.meetings.slice(0, 6).map((m, i) => <li key={i}>{m.period}: the board asked, "{m.ask}." <span className="muted">{m.choice ? `You chose: ${m.choice.toLowerCase()}.` : "Waiting on your answer."}</span></li>)}</ul> : <span className="muted">The board meets on the 20th of January, April, July and October.</span>}
      </div>
    </div>
  );
}

function Investors({ game, say }: { game: GameState; say: Say }) {
  const s = investors(game);
  return (
    <>
      <div className="panel stack tight">
        <h3>Quarterly reports</h3>
        <label className="field"><span className="label">What the partners are told</span>
          <select value={s.disclosure} onChange={(e) => { setDisclosure(game, e.target.value as InvestorsState["disclosure"]); say(null); }}>
            <option value="full">Everything: results, loans, open decisions</option>
            <option value="standard">The usual: money and results</option>
            <option value="minimal">The minimum: the money only</option>
          </select>
        </label>
        <span className="muted">Partners trust what they're shown. Investor-friendly terms promise full information, and a bare report breaks that promise.</span>
      </div>
      {s.partners.length === 0 && <p className="muted">No partners yet. Partners arrive when you sell a stake (Stakes tab).</p>}
      <div className="split">
        {s.partners.map((p) => {
          const r = partnerReturn(game, p);
          return (
            <div key={p.id} className="panel stack tight">
              <div className="gx-row"><Avatar name={p.name} icon={p.kind === "fund" ? "bank" : p.kind === "celebrity" ? "star" : p.kind === "family" ? "users" : "user"} />
                <div className="stack tight" style={{ flex: 1, minWidth: 0 }}><h3>{p.name}</h3><span className="muted">{KIND[p.kind]}. {p.background}.</span></div>
                <Chip icon="heart" tone={p.mood < 42 ? "bad" : p.mood >= 58 ? "good" : undefined}>{moodWord(p.mood)}</Chip></div>
              <Gauge size={110} value={r.multiple / 3} label="Stake worth" text={`${r.multiple.toFixed(2)}x`} sub={big(r.value)} tone={r.multiple < 1 ? "bad" : r.multiple >= 1.5 ? "good" : undefined} />
              <dl className="kv">
                <dt>Stake</dt><dd>{pc(p.pct)} since {shortDate(p.since)} {p.since.slice(0, 4)}</dd>
                <dt>Their money in</dt><dd>{big(p.paid + p.calls)}</dd>
                <dt>Paid back</dt><dd>{money(p.distributions)}</dd>
                <dt>Stake worth</dt><dd>{big(r.value)} ({r.multiple.toFixed(2)} times their money)</dd>
                <dt>How they feel</dt><dd className={p.mood < 42 ? "bad" : p.mood >= 58 ? "good" : ""}>{moodWord(p.mood)}</dd>
                <dt>Wants</dt><dd>{wantsWord(game, p)}</dd>
                {(() => { const g = partnerGoal(game, p); return <><dt>This year's goal</dt><dd className={g.met ? "good" : "bad"}>{g.text}. {g.status}, {g.met ? "on track" : "behind"}.</dd></>; })()}
                <dt>Complaints</dt><dd>{p.complaints}</dd>
                {p.putFrom && <><dt>Put right</dt><dd>From {shortDate(p.putFrom)} {p.putFrom.slice(0, 4)}</dd></>}
              </dl>
            </div>
          );
        })}
      </div>
      <div className="panel stack tight">
        <h3>Relations log</h3>
        {s.log.length ? <ul>{s.log.slice(0, 15).map((l, i) => <li key={i}>{shortDate(l.date)} {l.date.slice(0, 4)}: {l.text}</li>)}</ul> : <span className="muted">Nothing yet.</span>}
      </div>
    </>
  );
}

function Reports({ game }: { game: GameState }) {
  const s = investors(game);
  const r = returns(game);
  const early = r.years < 0.75;
  return (
    <>
      <div className="split">
        <div className="panel stack tight">
          <h3>Value</h3>
          <Stacked label={`Enterprise value ${billions(r.enterprise)}`} parts={[{ label: "Your equity", value: Math.max(0, r.ours), text: billions(r.ours), color: "var(--team)" }, { label: "Partners", value: Math.max(0, r.clubEquity - r.ours), text: billions(r.clubEquity - r.ours) }, { label: "Net debt", value: Math.max(0, r.netDebt), text: money(r.netDebt), color: "var(--bad)" }]} />
          <dl className="kv">
            <dt>Enterprise value</dt><dd>{billions(r.enterprise)}</dd>
            <dt>Net debt</dt><dd>{money(r.netDebt)}</dd>
            <dt>The club's equity</dt><dd>{billions(r.clubEquity)}</dd>
            <dt>Your share</dt><dd>{pc(r.share)}</dd>
            <dt>Your equity</dt><dd>{billions(r.ours)}</dd>
            {s.proceeds > 0 && <><dt>From selling shares</dt><dd>{money(s.proceeds)} ({money(s.gainsTax)} in capital-gains tax)</dd></>}
          </dl>
          <span className="muted">Enterprise value is what the club would sell for; your equity is your share of it after debt, plus cash.</span>
        </div>
        <div className="panel stack tight">
          <h3>Returns a year</h3>
          {early ? <span className="muted">Too early to say; returns show after about nine months.</span> : (<>
            <Bars signed rows={[
              { label: "Club value", value: r.evGrowth, text: pc(r.evGrowth), tone: r.evGrowth >= 0 ? "good" : "bad" },
              { label: "Your equity", value: r.nominal, text: pc(r.nominal), tone: r.nominal >= 0 ? "good" : "bad" },
              { label: "After inflation", value: r.real, text: pc(r.real), tone: r.real >= 0 ? "good" : "bad" },
              { label: "Hurdle", value: r.hurdle, text: pc(r.hurdle), color: "var(--muted)" },
            ]} />
            <dl className="kv">
              <dt>Club value</dt><dd>{pc(r.evGrowth)}</dd>
              <dt>Your equity</dt><dd>{pc(r.nominal)}</dd>
              <dt>After inflation</dt><dd>{pc(r.real)} <span className="muted">(prices up {pc(r.inflation)} a year)</span></dd>
              <dt>Your hurdle</dt><dd>{pc(r.hurdle)}</dd>
              <dt>Against the hurdle</dt><dd className={r.excess >= 0 ? "good" : "bad"}>{r.excess >= 0 ? "+" : ""}{pc(r.excess)}</dd>
            </dl>
          </>)}
          <span className="muted">The hurdle is the safe rate plus a stock-market premium, a premium for money you can't get out quickly, and more for the club's debt. Beating it means the risk paid.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>If the club ran short</h3>
        <Bars rows={contingency(game).map((c) => ({ label: c.source, value: c.amount, text: money(c.amount) }))} />
        {contingency(game).map((c) => <span key={c.source} className="muted"><strong>{c.source}:</strong> {c.how}</span>)}
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Reports sent</h3>
          {s.reports.length ? s.reports.slice(0, 4).map((x) => (
            <div key={x.date} className="stack tight"><strong>{x.period}</strong>{x.lines.map((l) => <span key={l} className="muted">{l}</span>)}</div>
          )) : <span className="muted">The first quarterly report goes out on the 15th of January, April, July or October.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Stake sales</h3>
          {s.sales.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Buyer</th><th className="num">Stake</th><th className="num">Price</th><th className="num">Implied value</th></tr></thead>
                <tbody>{s.sales.map((x, i) => <tr key={i}><td>{shortDate(x.date)} {x.date.slice(0, 4)}</td><td>{x.buyer} <span className="muted">({x.kind})</span></td><td className="num">{pctText(x.pct)}</td><td className="num">{big(x.price)}</td><td className="num">{billions(x.price / x.pct)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <span className="muted">None yet.</span>}
        </div>
      </div>
    </>
  );
}
