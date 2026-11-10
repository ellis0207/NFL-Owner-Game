// The staff's extra reads on a player's page: the strength coach and
// trainers, the analysts' contract and availability models, comparable
// players, an open option bonus, and an offer sheet for another team's
// restricted free agent.
import { useState } from "react";
import { availabilityModel, contractModel } from "../engine/analysts";
import { canOfferSheet, decideOption, sendOfferSheet } from "../engine/contractextras";
import { shortDate } from "../engine/dates";
import { PLAYER_BY_ID } from "../engine/league";
import { marketPrice } from "../engine/market";
import { leagueYear } from "../engine/contracts";
import { careNote, comparables, responseNote } from "../engine/playercare";
import type { GameState } from "../engine/types";
import { money } from "./format";
import { showEstimates } from "../engine/desk";
import { Evidence } from "./Help";

export function PlayerExtras({ game, id, changed }: { game: GameState; id: string; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const [showComps, setShowComps] = useState(false);
  const [sheet, setSheet] = useState({ years: 3, apy: 0 });
  const ours = game.players[id]?.team === game.userTeam;
  const deal = game.contracts[id];
  const option = ours && deal?.option && !deal.option.exercised && !deal.option.declined ? deal.option : null;
  // Models are estimates; with information limited to confirmed facts they stay hidden.
  const analysts = (game.analytics?.level ?? 0) > 0 && showEstimates(game);
  const model = analysts ? contractModel(game, id) : null;
  const sheetOk = canOfferSheet(game, id);
  const tender = game.offseason?.tenders[id];
  const care = ours ? careNote(game, id) : null;
  const comps = showComps ? comparables(game, id) : null;
  const name = (x: string) => PLAYER_BY_ID[x]?.name ?? x;

  return (
    <div className="stack">
      {said && <p className="notice">{said}</p>}
      {ours && (
        <p className="muted">
          {care ? `${care} ` : ""}Strength coach: {responseNote(game, id)}
        </p>
      )}
      {(model || analysts) && (
        <p className="muted">
          {model && <><Evidence kind="estimate" /> Analysts' contract model: worth about {money(model.apy)} a year (likely {money(model.range[0])} to {money(model.range[1])}), from {model.basis}. </>}
          {analysts && <>Availability model: expect him to miss about {availabilityModel(game, id)} games next season.</>}
        </p>
      )}
      {option && (
        <div className="row wrap">
          <span>Option bonus: {money(option.amount)} due by {shortDate(option.by)}. Exercise to keep the {option.year} years; decline to void them.</span>
          <button onClick={() => { setSaid(decideOption(game, id, true) ?? "Exercised."); changed(); }}>Exercise</button>
          <button onClick={() => { setSaid(decideOption(game, id, false) ?? "Declined; he is a free agent."); changed(); }}>Decline</button>
        </div>
      )}
      {tender && tender.team !== game.userTeam && (
        sheetOk.ok ? (
          <div className="row wrap">
            <span>Restricted free agent on a {money(tender.amount)} tender. Offer sheet:</span>
            <label>Years <input type="number" min={1} max={5} value={sheet.years} onChange={(e) => setSheet({ ...sheet, years: Number(e.target.value) })} /></label>
            <label>Per year ($M) <input type="number" min={0} value={sheet.apy || Math.round((tender.amount * 1.3) / 1e5) / 10} onChange={(e) => setSheet({ ...sheet, apy: Number(e.target.value) })} /></label>
            <button onClick={() => {
              const apy = (sheet.apy || Math.round((tender.amount * 1.3) / 1e5) / 10) * 1e6;
              const total = Math.round(apy * sheet.years);
              const ask = marketPrice(game, id, leagueYear(game.date)).apy * 0.9;
              setSaid(sendOfferSheet(game, id, { years: sheet.years, total, signingBonus: Math.round(total * 0.2), guaranteed: Math.round(total * 0.35), injuryGuaranteed: 0, voidYears: 0, shape: "flat" }, ask));
              changed();
            }}>Send offer sheet</button>
          </div>
        ) : <span className="muted">Offer sheet: {sheetOk.reason}</span>
      )}
      <div>
        {!showComps && <button className="link" onClick={() => setShowComps(true)}>Comparable players</button>}
        {comps && (
          <div className="split">
            <div>
              <strong>Contemporaries</strong>
              <ul>{comps.contemporaries.map((c) => <li key={c.id}>{name(c.id)}, {c.age}: {c.seasons} seasons, {c.perSeason} a season</li>)}{!comps.contemporaries.length && <li className="muted">No close matches</li>}</ul>
            </div>
            <div>
              <strong>Older players at his age</strong>
              <ul>{comps.pace.map((c) => <li key={c.id}>{name(c.id)}: {c.perSeason} a season by then, {c.note}</li>)}{!comps.pace.length && <li className="muted">No close matches</li>}</ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
