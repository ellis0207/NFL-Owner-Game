// The owner's handbook: plain explanations of the rules and the money, for
// anyone new to the cap, club finance or how a league is governed.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What you see and what you don't",
    body: [
      "You never see a player's rating. You see what an owner sees: stats, contracts, and what your coaches and scouts tell you. Better staff give you better reads, and a staff can be wrong.",
      "Executives work the same way: their ability shows in their department's results and their yearly reviews, never as a number.",
    ],
  },
  {
    title: "The salary cap",
    body: [
      "Each team's cap counts what its players cost this league year: base salary, roster and workout bonuses, and the signing bonus spread evenly over up to five years of the contract.",
      "Cutting or trading a player speeds up the signing bonus still to be counted: that is dead money. A cut after June 1 (or designated as one) splits it across two years.",
      "Unused cap space rolls over to next year. Guaranteed money is owed even if the player is released.",
      "Cap and cash are different: a big signing bonus is paid in cash now but counted on the cap over years. The Contracts and Cap pages show both.",
    ],
  },
  {
    title: "The club's money",
    body: [
      "About half of revenue is the league's national media and sponsorship deals, shared equally. The rest is local: tickets, premium seats, concessions, parking, local sponsors and radio, and stadium events.",
      "The books are kept on an accrual basis: bonuses are spread the way the cap counts them, season tickets are counted as games are played, and buildings are depreciated. The cash flow statement shows the real money.",
      "Each league year has a budget. The Plan tab shows how you're tracking against it and a forecast with a range, because forecasts are uncertain.",
    ],
  },
  {
    title: "Borrowing",
    body: [
      "The club has a credit line for short-term needs and can take term loans for bigger ones. Lenders price loans on how stretched the club is and on their trust in you.",
      "Loans come with covenants: limits on debt against operating income, and on how much of that income goes to paying it. Break one and lenders can step up the rate or call the loan; while you're in breach, you can't take money out of the club.",
      "The league limits how much debt a club can carry, with extra room for stadium projects.",
    ],
  },
  {
    title: "Your own money",
    body: [
      "Your stake is the club's value less its debt. Capital the club needs comes from your cash, then from selling outside holdings at a discount, then from borrowing against your name.",
      "The club passes its income through to you for tax. Most of the purchase price is written off over 15 years, which shelters income in the early years.",
    ],
  },
  {
    title: "Running the organization",
    body: [
      "You choose how much to decide yourself. For each kind of decision you can decide personally, have the staff propose and approve it, or delegate it within limits. Deals over your limits always come back to you.",
      "Proposals arrive as decision memos: the problem, the options, the money, the risks, a recommendation and a deadline. Waiting has a cost: players sign elsewhere and offers expire.",
      "People respond to how they're treated. Overriding the GM, taking authority back, firing often and leaving complaints unexamined all show in the culture readings, in who stays, and in what leaks.",
    ],
  },
  {
    title: "Games and the play-by-play",
    body: [
      "Every game in the league has a play-by-play and a drive chart. Open any score and pick Play by play or Drives. Full plays are kept through the week after a game; after that a game keeps its box score and scoring plays.",
      "When you play your own game from the Today page, it comes in a drive at a time. You can step ahead a drive or a quarter, or skip to the end. Settings turns this off.",
      "Officials miss calls. Coaches can challenge (two a game, a third after winning both, and a failed one costs a timeout), and the replay booth reviews the last two minutes of each half and overtime. Replay only reverses a call when the video is clear.",
      "After a game you can ask the league office about a call that went against you, from the Game day tab. It answers in a few days. The result never changes.",
      "Your stadium operations staff checks the field, game balls, officials' rooms, chain crews, credentials, coach radios, broadcast setup and security before every home game. A better operations director and a bigger game-day budget mean fewer problems.",
    ],
  },
  {
    title: "The league",
    body: [
      "Owners vote on rule changes at the March meeting; most need 24 of 32 votes. Relationships with other owners help with votes, trades and hosting bids.",
      "Interview rules protect teams still in the playoffs, and the draft, free agency and the trade deadline run on the real league calendar.",
    ],
  },
];

export function GuideScreen() {
  return (
    <section className="stack">
      <h2>Owner's guide</h2>
      {SECTIONS.map((s) => (
        <details key={s.title} className="panel">
          <summary><strong>{s.title}</strong></summary>
          <div className="stack tight" style={{ marginTop: 8 }}>{s.body.map((p, i) => <p key={i}>{p}</p>)}</div>
        </details>
      ))}
    </section>
  );
}
