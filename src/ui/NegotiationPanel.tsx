import { useEffect, useMemo, useState } from "react";
import { agentFor, clientsOnTeam, STYLE_LABEL } from "../engine/agents";
import { dealOf, leagueYear } from "../engine/contracts";
import { addDays, ageOn, daysBetween, shortDate } from "../engine/dates";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "../engine/league";
import { comps, teamValue } from "../engine/market";
import { interestReport, market } from "../engine/freeagency";
import {
  capYearFor, checkOffer, delegate, draftDeal, endTalks, holdoutFines, moodRead, openTalks, sendOffer, startYearFor, talksFor,
} from "../engine/negotiation";
import { isOffseason, isPendingFreeAgent } from "../engine/offseason";
import { teamStaff } from "../engine/staff";
import type { GameState, Mandate, OfferTerms } from "../engine/types";
import { ContractTable, dealSummary } from "./ContractTable";
import { money } from "./format";

const M = 1_000_000;
const toM = (x: number) => Math.round((x / M) * 10) / 10;

export function termsLine(t: OfferTerms): string {
  const parts = [`${t.years} yr${t.years === 1 ? "" : "s"}`, `${money(t.total)} total`, `${money(t.total / t.years)}/yr`, `${money(t.guaranteed)} gtd`];
  if (t.injuryGuaranteed) parts.push(`+${money(t.injuryGuaranteed)} injury gtd`);
  if (t.signingBonus) parts.push(`${money(t.signingBonus)} signing bonus`);
  if (t.voidYears) parts.push(`${t.voidYears} void yr${t.voidYears === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

interface Form { years: number; apy: number; bonus: number; gtd: number; injury: number; voids: number; shape: OfferTerms["shape"] }

function formFrom(t: OfferTerms, factor: number): Form {
  return {
    years: t.years, apy: toM((t.total / t.years) * factor), bonus: toM(t.signingBonus * factor), gtd: toM(t.guaranteed * factor),
    injury: toM(t.injuryGuaranteed), voids: t.voidYears, shape: t.shape,
  };
}

function termsFrom(f: Form): OfferTerms {
  const total = Math.round(f.apy * f.years * 10) / 10;
  return {
    years: f.years, total: Math.round(total * M), signingBonus: Math.round(f.bonus * M), guaranteed: Math.round(f.gtd * M),
    injuryGuaranteed: Math.round(f.injury * M), voidYears: f.voids, shape: f.shape,
  };
}

export function NegotiationPanel({ game, id, onClose, changed }: { game: GameState; id: string; onClose: () => void; changed: () => void }) {
  const p = PLAYER_BY_ID[id];
  const us = game.userTeam;
  const neg = game.negotiations[id]?.team === us ? game.negotiations[id] : undefined;
  const open = neg?.status === "open";
  const agent = agentFor(id);
  const deal = dealOf(game, id);
  const gm = teamStaff(us).GM;
  const elig = talksFor(game, us, id);
  const kind = neg?.kind ?? elig.kind;
  const start = startYearFor(game, id, kind);
  const ps = game.players[id];
  const fa = market(game)[id];
  const reSign = kind === "extension" && isOffseason(game.date) && isPendingFreeAgent(game, id);
  const capYear = neg ? capYearFor(game, neg) : leagueYear(game.date);
  const gmValue = Math.round(teamValue(game, us, id, start) / 500_000) * 500_000;
  const lastAgent = neg ? [...neg.rounds].reverse().find((r) => r.from === "agent") : undefined;
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mandate, setMandate] = useState<Mandate["goal"]>("value");
  const [maxApy, setMaxApy] = useState<string>("");
  const others = clientsOnTeam(game, agent.id, us).filter((x) => x !== id);
  const fines = holdoutFines(game, id);

  useEffect(() => {
    if (lastAgent && !form) setForm(formFrom(lastAgent.terms, 0.9));
  }, [lastAgent, form]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const terms = form ? termsFrom(form) : null;
  const preview = useMemo(() => (neg && terms ? { check: checkOffer(game, neg, terms), deal: draftDeal(game, neg, terms) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, neg, neg?.rounds.length, JSON.stringify(terms)]);
  const compList = useMemo(() => comps(game, id), [game, id]);

  function begin() {
    openTalks(game, us, id, kind, "owner");
    setForm(null);
    changed();
  }
  function send() {
    if (!terms) return;
    const r = sendOffer(game, id, terms);
    if (!r.ok) setError(r.reason ?? "That offer doesn't work.");
    else { setError(null); changed(); }
  }
  function handToGm() {
    const m: Mandate = { goal: mandate, ...(maxApy ? { maxApy: Number(maxApy) * M } : {}) };
    delegate(game, id, m);
    changed();
  }
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => (f ? { ...f, [k]: k === "shape" ? e.target.value : Number(e.target.value) } : f));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer wide" role="dialog" aria-label={`Contract talks: ${p.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="btn-row" style={{ justifyContent: "flex-end" }}><button className="btn small" onClick={onClose}>Close</button></div>
        <header>
          <div>
            <h2>{p.name}</h2>
            <span className="muted">
              {p.position} · age {ageOn(p.birthDate, game.date) ?? "?"} · {ps?.team ? TEAM_BY_ID[ps.team].name : `Free agent${ps?.lastTeam ? `, last with the ${TEAM_BY_ID[ps.lastTeam].name}` : ""}`}
            </span>
          </div>
        </header>

        {kind === "free-agent" && fa?.status === "open" && open && <p className="notice">{interestReport(game, id, us)}</p>}
        {open && fa?.lastLook && fa.lastLook.until >= game.date && (
          <p className="notice error">Another team has an offer on the table. {agent.name} needs our best offer by {shortDate(fa.lastLook.until)}.</p>
        )}

        {game.players[id].holdout && (
          <div className="notice error">
            {game.players[id].holdout!.kind === "holdout" ? "Holding out" : "Holding in"} since {shortDate(game.players[id].holdout!.since)}
            {fines ? `. Fines so far: ${money(fines)}.` : ". Reported, but not practicing until there's a new deal."}
          </div>
        )}

        <section className="stack tight">
          <h3>Current contract</h3>
          {deal ? <><ContractTable deal={deal} from={leagueYear(game.date)} /><span className="muted">{dealSummary(deal)}{reSign ? `. Expires when the ${start} league year opens.` : ""}</span></> : <p className="muted">No contract: free agent.</p>}
        </section>

        <section className="split">
          <div className="card">
            <span className="label">Agent</span>
            <strong>{agent.name}</strong>
            <span>{agent.agency} · certified {agent.since}</span>
            <span className="muted">Reputation: {STYLE_LABEL[agent.style].toLowerCase()}.{others.length ? ` Also represents ${others.length} of our players: ${others.slice(0, 3).map((o) => PLAYER_BY_ID[o].name).join(", ")}${others.length > 3 ? "…" : ""}.` : ""}</span>
          </div>
          <div className="card">
            <span className="label">{gm ? `${gm.name}, general manager` : "General manager"}</span>
            <span>I value {p.name.split(" ").slice(-1)[0]} at about <strong>{money(gmValue)}</strong> a year on a new deal starting in {start}.</span>
            {open && neg && <span className="muted">{moodRead(game, neg)}</span>}
          </div>
        </section>

        {(!neg || neg.status === "ended") && (
          !elig.ok ? <p className="muted">{elig.reason}</p>
            : neg && daysBetween(neg.notes[0]?.date ?? neg.opened, game.date) < 14
              ? <p className="muted">Talks ended recently. {agent.name} will take our call again after {shortDate(addDays(neg.notes[0]?.date ?? neg.opened, 14))}.</p>
              : <div className="btn-row"><button className="btn primary" onClick={begin}>{`${neg ? "Reopen" : "Open"} ${kind === "free-agent" ? "free-agent" : reSign ? "re-signing" : "extension"} talks`}</button></div>
        )}

        {neg && (
          <section className="stack tight">
            <h3>Talks {neg.status === "agreed" ? "· agreed" : neg.status === "ended" ? "· ended" : neg.handler === "gm" ? "· handled by the GM" : ""}</h3>
            {open && neg.pending && <p className="notice">Offer sent. {agent.name} will get back to us{neg.replyOn ? ` by ${shortDate(neg.replyOn)}` : ""}.</p>}
            {open && neg.coolingUntil && game.date < neg.coolingUntil && <p className="notice error">{agent.name} isn't taking our calls until {shortDate(neg.coolingUntil)}.</p>}
            <ol className="plays">
              {[...neg.rounds].reverse().map((r, i) => (
                <li key={i}>
                  <span className="label">{shortDate(r.date)} · {r.from === "team" ? "Our offer" : agent.name}</span>
                  <div>{termsLine(r.terms)}</div>
                  {r.note && <div className="muted">{r.note}</div>}
                </li>
              ))}
            </ol>
            {neg.notes.length > 0 && (
              <details>
                <summary>GM's notes ({neg.notes.length})</summary>
                <ul>{neg.notes.map((n, i) => <li key={i}><span className="muted">{shortDate(n.date)}</span> {n.text}</li>)}</ul>
              </details>
            )}
          </section>
        )}

        {open && neg && neg.handler === "owner" && form && (
          <section className="stack tight panel">
            <h3>Our offer</h3>
            <div className="offer-grid">
              <label className="field">Years<input type="number" min={1} max={7} value={form.years} onChange={set("years")} /></label>
              <label className="field">Per year ($M)<input type="number" min={0.5} step={0.1} value={form.apy} onChange={set("apy")} /></label>
              <label className="field">Signing bonus ($M)<input type="number" min={0} step={0.1} value={form.bonus} onChange={set("bonus")} /></label>
              <label className="field">Fully guaranteed ($M)<input type="number" min={0} step={0.1} value={form.gtd} onChange={set("gtd")} /></label>
              <label className="field">Injury guarantee ($M)<input type="number" min={0} step={0.1} value={form.injury} onChange={set("injury")} /></label>
              <label className="field">Void years<input type="number" min={0} max={4} value={form.voids} onChange={set("voids")} /></label>
              <label className="field">Salary shape
                <select value={form.shape} onChange={set("shape")}>
                  <option value="flat">Flat</option><option value="rising">Rising</option><option value="front">Front-loaded</option>
                </select>
              </label>
            </div>
            {preview && (
              <>
                <ContractTable deal={preview.deal} from={Math.min(capYear, leagueYear(game.date))} />
                <span className="muted">
                  {money((terms?.total ?? 0))} total. The {capYear} cap hit changes by {money(preview.check.capChange)}; {money(preview.check.cashNow)} cash due at signing.
                  {kind === "free-agent" && game.date < RULES.keyDates.newLeagueYear ? " Agreements in the negotiating window are signed when the league year opens." : ""}
                </span>
                {!preview.check.ok && <span className="bad">{preview.check.reason}</span>}
              </>
            )}
            {error && <span className="bad">{error}</span>}
            <div className="btn-row">
              <button className="btn primary" disabled={!!neg.pending || !preview?.check.ok || (!!neg.coolingUntil && game.date < neg.coolingUntil)} onClick={send}>Send offer</button>
              {lastAgent && <button className="btn" onClick={() => setForm(formFrom(lastAgent.terms, 1))}>Match their terms</button>}
            </div>
          </section>
        )}

        {open && neg && (
          <section className="stack tight">
            <h3>{neg.handler === "gm" ? "Delegated to the GM" : "Hand it to the GM"}</h3>
            {neg.handler === "owner" ? (
              <div className="btn-row" style={{ alignItems: "end" }}>
                <label className="field">Mandate
                  <select value={mandate} onChange={(e) => setMandate(e.target.value as Mandate["goal"])}>
                    <option value="sign">Get it done</option><option value="value">Only at a fair price</option><option value="walk">Let the player walk</option>
                  </select>
                </label>
                <label className="field">Max per year ($M, optional)<input type="number" min={0} step={0.5} value={maxApy} onChange={(e) => setMaxApy(e.target.value)} /></label>
                <button className="btn" onClick={handToGm}>Hand to GM</button>
                <button className="btn danger" onClick={() => { endTalks(game, id, "You ended talks."); changed(); }}>End talks</button>
              </div>
            ) : (
              <div className="btn-row">
                <span className="muted">Mandate: {neg.mandate?.goal === "sign" ? "get it done" : neg.mandate?.goal === "walk" ? "let the player walk" : "only at a fair price"}{neg.mandate?.maxApy ? `, up to ${money(neg.mandate.maxApy)} a year` : ""}.</span>
                <button className="btn small" onClick={() => { delegate(game, id, null); setForm(null); changed(); }}>Take talks back</button>
              </div>
            )}
          </section>
        )}

        <section className="stack tight">
          <h3>Comparable contracts</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Team</th><th>Signed</th><th className="num">Years</th><th className="num">Per year</th><th className="num">Guaranteed</th><th className="num">Share of cap</th></tr></thead>
              <tbody>
                {compList.map((c) => (
                  <tr key={c.id}>
                    <td className="name">{c.name}</td><td>{c.team}</td><td>{c.signed.slice(0, 4)}</td>
                    <td className="num">{c.years}</td><td className="num">{money(c.apy)}</td><td className="num">{money(c.guaranteed)}</td>
                    <td className="num">{(c.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="muted">Recent deals at {p.position} for players with similar profiles. Agents use these too.</span>
        </section>
      </aside>
    </div>
  );
}
