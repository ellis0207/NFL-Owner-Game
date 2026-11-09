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
    title: "The clubhouse",
    body: [
      "Every player has a character the staff describes in words: how quickly he learns, how he prepares, and whether the room follows him. Chemistry comes from keeping your starters together, having veterans the room listens to, a happy and present roster, and the head coach. A close room plays slightly cleaner; it never makes up for talent.",
      "Veterans look after young players at their position, who then develop a little faster. The coaches build trust in players who play well and show up, and that trust tips close depth chart calls; a new head coach starts everyone over. Players who were paid or drafted to start notice when they sit.",
      "On the Development tab you set the practice load (heavier work grows young players faster and hurts more of them), rest days for veterans and the strength staff, and see the development plans you've set from players' pages. A position change takes weeks to learn and some players suit the new spot better than others.",
      "Medical: the first estimate of an injury is firmed up by tests a few days later. Long rehabs can hit setbacks. The doctors decide when a player is cleared; you can ask, they answer. Concussions are an independent consultant's call. Insurance on a big salary pays back most of it once a player has missed more than three straight weeks.",
    ],
  },
  {
    title: "Game week, scouts and bonuses",
    body: [
      "Every team files a practice report on the three practice days before a game: did not practice, limited or full, with the reason, and a game status with the last report. The practice plan on the Game week page trades a sharper game plan against growth for young players and a lighter load. A player signed or claimed on game day can't play until the next game, and a third quarterback is inactive but can come in if both active ones go out.",
      "Your five college scouts each cover a group of positions. Each has a lean, such as trusting the stopwatch or the stat sheet, that colors his grades; the prospect report says when it does. The department's emphasis (tape, testing or production) moves the board too. In the draft you can hand our picks to the GM from any round on.",
      "Many veteran deals pay part of the salary per game on the game-day roster and part for the spring workouts. The cap counts last season's games; the difference is settled after the season. Over each four-year period the club must pay players at least 89% of the salary caps in cash, or pay the shortfall to them. In talks you can write these yourself, along with escalators; an agent whose client misses games wants more for per-game money.",
    ],
  },
  {
    title: "Tickets, fans and sponsors",
    body: [
      "General seats are split into four zones; the cheaper the seat, the more its buyers react to price. Each home game is marquee, standard or value by the opponent, the rivalry, the kickoff and the weather, and you can price the tiers apart or let dynamic pricing move unsold seats through the week. Groups and promotions fill seats at a discount; a promotion at a game that would sell out anyway only gives money away. Holders who can't go resell their seats, and the ones nobody buys are most of the no-shows.",
      "Season-ticket holders renew by how long they've had their seats, how the season went, the price change and how they feel about the club; the waiting list refills what they leave. If you don't set next season's prices, the business staff does. Suites and club seats renew when companies used them. Seat licenses raise cash once, cost trust that lasts for years, and some holders walk away.",
      "The Fans tab shows the market (its population, incomes and the other teams competing for the same money), where fans live, trust in the club, generational loyalty, post-game surveys and what each kind of customer is worth over the years. The economy moves demand, price sensitivity and what sponsors spend.",
      "Sponsors can buy exclusivity in their category for about a fifth more, where rights allow: league rules keep sportsbooks from being exclusive, and a stadium operator's pouring rights limit beer and soft-drink deals. Where the club controls the stadium, it negotiates the naming rights. After each season partners get a report of what they received; short of the deal, the club owes make-goods. Partners can fail to pay, and one in the news can be dropped.",
    ],
  },
  {
    title: "Store, media and game day",
    body: [
      "Jerseys are ordered before the season by player, on the staff's forecast: order deep and you risk markdowns and a liquidator if a player leaves, order thin and the racks go empty. Sales follow the record, injuries and what nobody could forecast. The stores and the online shop can run in-house or through an operator or partner who takes a share and the risk. Counterfeiters work the big games unless the club pays to go after them. The league's licensing royalties are national money, shared equally.",
      "A new uniform, a new logo or a new name needs the league's approval and a season or two of lead time, and the league wants marks to last. A new name costs about $30M, old stock is written off, and longtime fans take years to forgive it; new gear sells well for a few seasons. A throwback line sells best in a title anniversary year.",
      "The national TV and streaming deals belong to the league and run through 2033, with an opt-out after 2029; the Media tab shows a range for what comes after. The club's own content department makes a podcast, a weekly local show and, if you want, a season documentary and content for the international market the league assigns. A bigger audience makes digital sponsorship worth more. Beat writers keep their own sources; open access warms them and leaks more. Choose who answers press questions for the club, and search every headline in the archive.",
      "The Game day tab sets the standing orders for home games: staff, security, medical crews, alcohol rules, the show, the menu, transit and a severe weather plan. After each game the operations staff report the lines, food that ran out or was thrown away, outages, ejections and medical calls, complaints and the game's own books. Problems that keep coming back get flagged. Experiments run for three games and report what the surveys said.",
    ],
  },
  {
    title: "Buildings, community and support departments",
    body: [
      "The Buildings tab lists every part of the stadium and the team facility with its condition, the year it went in and what replacing it costs. You see the operations director's read unless you pay for an engineering study. If the club runs its stadium you choose the maintenance plan: putting it off saves money but grows a backlog that breaks more on game days and that players notice; staying ahead costs more and keeps things newer. The team facility follows its budget. You can switch between grass and turf in the offseason, and the Projects tab shows each project's payback at last year's numbers.",
      "The team foundation gives grants to local groups in the focus areas you pick. The staff approve small, sound ones; the rest wait for you. Thin oversight is cheaper and lets a bad grant become a story. Programs beyond what the community budget pays for build trust slowly, and long commitments count most. Player services help rookies settle, cut down on conduct problems and make players likelier to stay; what players share with well-being staff is never shown to you.",
      "On the Front office page, Departments covers travel, security and technology: a budget level, standing policies, quarterly numbers and incidents. Road trips cost more the farther they go, and flying in two days early for a cross-country game takes the edge off the body clock. Security drills make game-day incidents smaller, and gambling education heads off suspensions. Old systems and loose policies invite ransomware and data breaches, which come to you as decision memos with legal notice deadlines.",
    ],
  },
  {
    title: "History and honors",
    body: [
      "Pro Bowl rosters come out in late December, the All-Pro teams after the regular season, and the awards at NFL Honors the week of the Super Bowl. Voters look at the stats, the team's record and the film, and a player with Pro Bowls behind him gets the benefit of the doubt. Pro Bowls also set the fifth-year option price for first-round picks.",
      "Players reach the Hall of Fame ballot five seasons after they retire; at most five go in each year. The History page keeps the record book against the real NFL records, your rivalries, how each trade turned out, the club's eras under each coach and GM, and its books and value by year.",
    ],
  },
  {
    title: "Analytics and game plans",
    body: [
      "EPA (expected points added) is how much a play changed the offense's expected score, from the down, distance and spot. A success is a play with positive EPA. Win probability comes from the score, the time left and the drive in progress. These numbers are public: every club can compute them.",
      "Your analytics department is a budget line on the Analytics page. A bigger staff gives sharper advice, and you choose what they research. Advice only helps when the coaches use it: the head coach's openness and the staff's credibility decide how often fourth-down advice is taken.",
      "Every week the coaches build a plan for the next opponent: what to attack and what to take away. Better coaches, a stronger analytics staff and a full week of preparation make better plans. At halftime coordinators adjust to what worked. You can read the plan, but you don't call it.",
      "After each season the league copies what worked: if passing pays more than usual, teams throw more and defenses play more two-deep coverage.",
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
