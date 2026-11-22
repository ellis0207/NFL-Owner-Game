import { billions } from "../../engine/business";
import { shortDate } from "../../engine/dates";
import {
  biddableMarkets, bidForExpansion, expansion, expansionBids, expansionShortfall, withdrawExpansionBid,
} from "../../engine/expansion";
import { TEAMS, teamLabel } from "../../engine/league";
import { PLAYER_BY_ID } from "../../engine/league";
import { tenure } from "../../engine/takeover";
import type { GameState } from "../../engine/types";
import { Card, EmptyState, StatRow, StatTile } from "../kit";
import { money } from "../format";

const STAGE: Record<string, string> = {
  quiet: "Not on the table", floated: "Bids open", approved: "Approved", joined: "Joined", rejected: "Voted down",
};

/** League expansion: the commissioner's proposal, the bidding cities, the vote, the new clubs and the expansion draft. */
export function ExpansionPanel({ game, say }: { game: GameState; say: (t: string | null) => void }) {
  const x = expansion(game);
  const bids = expansionBids(game);
  const ours = x.bids.find((b) => b.user);
  const canBid = x.stage === "floated" && !!x.bidsDue && game.date <= x.bidsDue && !ours && tenure(game).role === "control";
  const short = canBid ? expansionShortfall(game, x.fee) : 0;
  return (
    <section className="stack">
      <StatRow>
        <StatTile label="Expansion" value={STAGE[x.stage]} note={x.stage === "quiet" ? "The commissioner can raise it at an annual meeting" : x.voteDate && x.stage === "floated" ? `Owners vote ${shortDate(x.voteDate)}` : undefined} />
        <StatTile label="Clubs" value={TEAMS.length} />
        {x.fee > 0 && <StatTile label="Fee per new club" value={billions(x.fee)} />}
        {x.shareYears > 0 && <StatTile label="Our share still to come" value={money(x.shareLeft)} note={`${x.shareYears} installment${x.shareYears === 1 ? "" : "s"}`} />}
      </StatRow>
      {x.stage === "quiet" && <EmptyState title="No expansion proposal">The league adds clubs two at a time, one to each conference. When the commissioner floats it, cities bid with ownership groups, the owners vote, and the fee is split among the existing clubs. You can bid for one of the new clubs yourself.</EmptyState>}
      {bids.length > 0 && x.stage !== "joined" && (
        <Card title="The bidding cities" kicker={x.bidsDue && x.stage === "floated" ? `Bids due ${shortDate(x.bidsDue)}` : undefined}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>City</th><th>Group</th><th>Metro</th><th>Stadium</th></tr></thead>
              <tbody>
                {bids.map(({ market: m, bid }) => (
                  <tr key={m.id}>
                    <td>{m.city}{bid.user ? " (our bid)" : ""}</td>
                    <td>{bid.group}</td>
                    <td>{m.pop.toFixed(1)}M</td>
                    <td>{m.venue.name}{m.venue.ready ? "" : " (stopgap)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ours && x.stage === "floated" && <button onClick={() => say(withdrawExpansionBid(game) ?? "We withdrew our bid.")}>Withdraw our bid</button>}
        </Card>
      )}
      {canBid && (
        <Card title="Bid for a new club">
          <span className="muted">The fee is {billions(x.fee)}. Partners can take up to 30%; the rest is yours, and the {teamLabel(game.userTeam)} would be sold when the new club opens.{short > 0 ? ` We'd be ${money(short)} short today.` : ""}</span>
          <label className="field"><span className="label">City</span>
            <select defaultValue="" disabled={short > 0} onChange={(e) => e.target.value && say(bidForExpansion(game, e.target.value) ?? "Our bid is in.")}>
              <option value="">Choose a city</option>
              {biddableMarkets(game).map((m) => <option key={m.id} value={m.id}>{m.city}</option>)}
            </select>
          </label>
        </Card>
      )}
      {x.clubs.length > 0 && (
        <Card title="The new clubs">
          {x.clubs.map((c) => (
            <p key={c.id}>{c.city} {c.name}: {c.group}, {c.conference} {c.division}, first season {c.joins}{c.user ? " (ours)" : ""}{c.activated ? `, opened ${shortDate(c.activated)}` : ""}.</p>
          ))}
          {x.yes !== undefined && <span className="muted">{x.yes} owners voted for it.</span>}
        </Card>
      )}
      {x.picks.length > 0 && (
        <Card title="Expansion draft">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Club</th><th>Player</th><th>From</th></tr></thead>
              <tbody>
                {x.picks.map((p) => <tr key={p.player}><td>{teamLabel(p.club)}</td><td>{PLAYER_BY_ID[p.player]?.position} {PLAYER_BY_ID[p.player]?.name}</td><td>{teamLabel(p.from)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {x.log.length > 0 && (
        <Card title="Log">
          {x.log.slice(0, 12).map((l, i) => <p key={i} className="muted">{shortDate(l.date)}: {l.text}</p>)}
        </Card>
      )}
    </section>
  );
}
