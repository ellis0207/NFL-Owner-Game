// The owner's handbook: plain explanations of the rules and the money, for
// anyone new to the cap, club finance or how a league is governed.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Getting around",
    body: [
      "The sidebar groups every page by part of the job: your Desk (today, the calendar, inbox and media), the Team, Roster building, the Draft, the Owner's office (including the Business page), the League, and the Game itself. Fold away a group you rarely use by clicking its name; a folded group still shows how many things in it are waiting on you.",
      "The search box finds pages as well as people: type \"cap\", \"tickets\" or a player's name. On a phone, the Menu button opens the same list, and the other pages in the section you're in sit just under the date.",
      "Rest the mouse on almost anything to see its card: a player (contract, injury, the coaches' read), a team (record, next game, coach, owner, cap space), a coach or executive, a game, the cap space in the header, or any money line (the payments behind it and how it stands against the budget). Move into a card and rest on a name there for that name's card. On a phone, press and hold; tap anywhere else to close.",
    ],
  },
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
      "When you play your own game from the Today page, it comes in one play at a time: a scoreboard with the clock, down and distance, timeouts and who has the ball, over a drawing of the field. The blue line is the line of scrimmage, the yellow line is the line to gain, the shaded band is the drive so far and the dashed path is the last play. You can step ahead a play, a drive or a quarter, let it run on its own, or skip to the end. Any game that still has its full plays can be watched this way from its box score. Settings turns this off for your own games.",
      "The feed tells you exactly what happened on each play. An injury is marked on the play it happened, with whether the player is coming back and who replaced him. A play wiped out by a penalty shows what the play was before the flag brought it back. Timeouts are listed. Alerts mark a change at quarterback, before kickoff or during the game, and storylines as they develop: lead changes, a run of unanswered points, turnovers piling up, a passer over 300 yards. The box score so far stays next to the field.",
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
      "The Analysts tab names the staff, the data feeds you buy (tracking, film, college charting, injury histories, fan data) and experiments. An experiment tries a change on half the roster or half the games; the result comes with a margin of error, and a result inside it tells you nothing. Assessments break down quarterbacks, blockers, defenders and special teams from the box scores.",
      "Defenses read play-calling tendencies, so a staff that self-scouts stays harder to predict. Blitzes that aren't picked up turn into pressure fast, and quarterbacks differ in how they hold up late in close games.",
    ],
  },
  {
    title: "Contracts, camp and the draft room",
    body: [
      "A contract can carry roster bonuses due in March, an option bonus the club exercises to keep the later years (or declines to let him go), salary guaranteed only against a release for football reasons or only against one to clear cap room, and a no-trade clause. Agents value each of these. The Cap page plans five years ahead with trial deals, forecasts compensatory picks from the league's formula and lists the analysts' cap-saving moves.",
      "From the new league year until a week before the draft you can sign another team's tendered restricted free agent to an offer sheet from his page. His team has five days to match; if it doesn't, he's yours and you owe the pick his tender calls for.",
      "Camp's coach's room sets how long starters play in the preseason, who gets the backup snaps, the next-man-up order and the special teams plan. Five days before the cutdown the GM, the head coach and the analysts meet on the roster bubble; you can ask them to keep up to three players.",
      "Scouting splits its budget across travel, video, medical and data. The Draft page's Boards tab sorts our reads by value, risk, scheme fit and expected value, adjusts college stats for schedule and system, and takes bonus offers for undrafted players, who weigh your money and their chance to make the roster against other teams' offers.",
      "Two and four seasons after each draft and free agency period the staff grades them again on what players did; each season also gets a coaching grade against the talent on hand. Career stats go back to 2005.",
    ],
  },
  {
    title: "Running the office",
    body: [
      "The Business page's Treasury tab sets how fast the club pays suppliers and collects what it's owed, how strong its financial controls are, and which outside firms it engages. Audit findings arrive after the books close; fix them or they come back worse, and a material weakness means restating the year. Equipment and technology requests all draw on one capital pool: cash above the reserve plus half the unused credit line.",
      "Layoffs save money from the next bill on, cost severance now and make the work worse in proportion; everyone who stays notices. The Journal tab shows each ledger entry as a debit and a credit, with a trial balance that must tie.",
      "The Front office People tab plans succession, hires quality-control coaches (a small edge in each game plan, and future position coaches), promotes from within, and extends coaches with part of the salary guaranteed: a fired coach is owed only the guaranteed share. A head coach on the hot seat coaches scared; a public vote of confidence settles him, but firing him soon after is remembered.",
      "Eight audiences judge you: fans, players, staff, sponsors, the community, the league office, the press and lenders. Saying the football people decide while making the calls yourself tends to leak. Elected officials follow their voters more than they follow you.",
      "Figures carry labels: confirmed (from the books or the record), an estimate (a model or forecast, with a range) or an opinion (a staff judgment). Settings sets play modes, the information you see, a full realism preset, or a sandbox that can't be turned back.",
    ],
  },
  {
    title: "Labor and the CBA",
    body: [
      "The agreement with the players' union runs through 2030. Talks on the next one open two years before; set your stance and priorities in the Labor relations panel on the Owners page. A seat on the owners' labor committee makes your view count fully.",
      "Most talks end in a deal. If the deadline passes, the owners lock out the players: no free agency, trades or team activities. If it reaches the season, games are cancelled, tickets refunded and national money cut.",
      "A tentative deal needs 24 owners' votes and the players' ratification. The new terms apply at once to the cap, minimums, rookie pool and benefits; existing contracts stay as written. Grievances against the club can be settled before the hearing.",
    ],
  },
  {
    title: "A new stadium",
    body: [
      "Business > New stadium starts with feasibility studies: three sites, a demand forecast and a cost range. Pick a site, roof, seats, an ownership model and community benefits, then ask the public side for money (or pay for it all yourself and skip the vote).",
      "Voters weigh the tax per resident, the team's winning, fans' trust, the officials and the economy. Your own impact study, lobbying and commitments help; the city's budget office may debunk your numbers. A council votes, and a tax district goes to a referendum in November.",
      "If the vote fails: try again with a smaller ask, go private, renovate, or say other markets are on the table. Financing needs your share plus 5%. Fixed-price contracts cost more up front but leave most overruns with the builder. Building on the current site means a temporary home until opening day.",
    ],
  },
  {
    title: "Your own money",
    body: [
      "Owner > Money holds everything outside the club: cash, stocks, bonds, real estate and your own businesses. They move month by month with the economy; recessions hit stocks and businesses hardest. Stocks and bonds sell in a day, property takes about three months and a business about six, at a discount.",
      "You can borrow against your holdings at the market rate plus two points, but a deep fall in prices brings a margin call. Watch how much of your net worth is the team: a stake sale on the Ownership page spreads it out. The Money tab also compares your stake with what the same money would have earned in stocks.",
      "A family office runs your holdings for a fee; a family trust keeps money in the family but out of the club's reach. Your own foundation, separate from the club's, cuts your taxes and pays out 5% a year in grants. Choose how public to be, and expect counsel's memos when one of your companies crosses paths with the club.",
    ],
  },
  {
    title: "Partners and the board",
    body: [
      "You start owning the whole club. The Ownership page sells a stake: your shares (the money comes to you, less capital-gains tax) or new shares (the money goes into the club and everyone is diluted). Bids come back as a memo on Today, and the league vets every buyer. You must keep at least 30%, and private-equity funds can hold at most 10% together.",
      "With partners, distributions and capital calls go to everyone by their shares, and you pay tax only on your share. A partner who misses a capital call is diluted. Below two-thirds of the shares, big borrowing, new shares, a new stadium, a move and deals with you need the board's vote.",
      "Partners read a quarterly report and grow content or restless with results, the club's value and the money they get back. Unhappy ones complain; very unhappy ones want out, and investor-friendly terms give them a put after seven years. The Reports tab shows your equity's return against inflation and against a hurdle that charges for debt and illiquidity.",
    ],
  },
  {
    title: "Buying and selling clubs",
    body: [
      "Ownership > Deals lists clubs for sale and why: an estate, a family split, an owner who needs cash, a fight over control. Any club gets an appraisal from its revenue, market, stadium and debt, with comparable sales. A club changes hands only once every few years, at prices near the market multiple.",
      "Pursuing a club starts a month of diligence that can turn up hidden debt, lawsuits, a bad lease, guarantees the cash won't cover or deferred repairs. Then bid against rival groups; a financing condition protects you but sellers like it less, and an owner who isn't selling wants a lot more. A winning bid gets 60 days of exclusivity.",
      "Fund it with your money, the family trust, limited partners, a fund (10% at most) and debt within the league's limit, keeping at least 30%. The finance committee vets you and 24 owners must vote yes; lenders can pull out, and deals fail. You can control only one club, so the one you own is sold at closing, and you take over the new one as it stands, with any capital it needs.",
      "New game can also start you as a buyer watching a club that's for sale, or as a 10% partner who gets distributions and can buy up to 49%. Until you control a club, its staff make the calls and its pages are read-only.",
    ],
  },
  {
    title: "Succession and the end of your tenure",
    body: [
      "You age a year each January, and your health slips faster past seventy. Ownership > Succession lets you step back to chair (the executives run things and you keep control) or, with an approved successor, retire from daily duties.",
      "Heirs come with reports from the family office, the president and the GM: what they want, how they handle the business and the football, and how they get along. Reads are rough until an heir works at the club. Passing over one who wanted the job can split the family, and a split family can fight the transfer.",
      "Name a successor and a trustee, and ask the league to pre-approve them. Estate tax is 40% above the exemption; the Succession tab shows what the estate would owe and what it could pay. Life insurance in a trust covers the gap; otherwise the heirs pay over ten years or sell part of the club. You can also buy partners out, or sell the whole club through bankers, a bidding round and the owners' vote, and see what you'd net and your total return.",
      "When you die, hand the club on, or sell it, you choose: go on as the heir, with the same club, contracts and history; have the estate sell and buy another club; or end the game with a legacy review of winning, money, buildings, culture and the community. New game can also start you as an heir, with siblings as partners and estate tax to pay. History > Owners keeps the club's ownership history.",
    ],
  },
  {
    title: "Starting in another season",
    body: [
      "New game > When you start picks the season: 2026, or any season from 2011. An earlier start uses that year's real rosters (the Week 1 lists), contracts signed by then, the schedule, stadiums and city names (the Rams in St. Louis to 2015, the Chargers in San Diego to 2016, the Raiders in Oakland to 2019), head coaches, the salary cap, minimum salaries and that season's rules: 16 games before 2021, a 12-team playoff field before 2020, the 2011 labor deal until 2020. Coordinators, general managers and the preseason schedule are made up, and the game's dollar figures are scaled back to the era.",
      "With real history the timeline plays out: rule changes come in their seasons, the 2020 labor deal arrives, the caps are the real ones, clubs move and are sold when they really did. Alternate history (New game, or Settings later) stops all of that: only your league's own votes, moves and sales change things. History > Rules lists the real rule archive and what this league adopted.",
      "A custom league pack renames and repaints clubs: city, name and colors. Download the template on New game or Settings, edit it, and load it back; it's checked before it's applied. Each season's data loads when you pick it, so the page reloads once.",
    ],
  },
  {
    title: "The other clubs",
    body: [
      "Owners > Clubs profiles every other club: its owner's approach (win now, builder, profit first or steady), who makes the football calls (the owner, a football president, the GM or the head coach), its budgets and money, and its reputation with candidates. Owners who fire coaches often or run long searches find candidates hesitate.",
      "Clubs change course after seasons that argue with their plan, new owners bring new approaches, and a club whose money runs short cuts spending, borrows and may look for a buyer. A few times a season an owner steps into football decisions. Scouts get hired away into bigger jobs, and coaches sometimes leave without warning.",
      "Owners > Realignment asks the owners to swap our division with another club's. After a move geography usually carries it; otherwise tradition makes it a hard vote.",
      "Reports shows cause and effect: big decisions, what followed right away and what they led to in later seasons, plus each league year's contracts, cap, books and rules as they closed. Signing memos carry the coaches' estimate of what a player adds in wins and playoff chances.",
    ],
  },
  {
    title: "Moving the club",
    body: [
      "Business > Relocation compares markets. A move needs a study, an application between January 1 and February 15, and 24 owners' votes at the annual meeting. Owners want to see you tried to stay: a failed public vote or failed lease talks help.",
      "Leaving costs the rest of the lease, and public money back if you promised to stay. The league's relocation fee is paid over ten years. Local sponsors and media start over, and the new market's fans take years to build. Keep the name, take a new one, or leave it with the old city; the club's records come along either way.",
    ],
  },
  {
    title: "Growing abroad",
    body: [
      "Business > International: apply for rights in up to three countries (September to November). Content in the local language, fan events and merchandise build an audience over years; the first years cost more than they bring in. Money comes in local currency, so you can lock a year's exchange rates.",
      "The International Player Pathway places a few overseas athletes with clubs each spring. They're long projects with an extra practice-squad spot. Take part and fund international scouting to ask for one.",
    ],
  },
  {
    title: "The economy and risk",
    body: [
      "The economy moves every month, and your metro has its own trend. Household incomes move ticket and store demand; corporate earnings move sponsors and suites. Recessions come from the conditions, about once a decade at normal volatility (Settings).",
      "Business > Economy and risk shows the outlook, past years in 2026 dollars, a scenario tool, your insurance and claims, and any shocks. Better building upkeep, security and controls lower premiums. Flood needs its own rider, and wear and tear is never covered.",
      "If you can't put money into the club when it needs it, you can sell a minority stake, refinance or bring in a partner. Otherwise the league supervises the club under a recovery plan.",
    ],
  },
  {
    title: "Compliance, crises and legal",
    body: [
      "The Legal page holds the compliance office: better staffing and yearly training mean fewer late filings, cleaner cap audits and fewer violations. Sign the league certifications each summer, and choose whether guaranteed pay is funded in cash or with a letter of credit.",
      "When the league opens an inquiry, choose to cooperate, give only what's required, or contest it. Sanctions are fines and lost draft picks, heavier for repeat offenders, and can be appealed to the commissioner.",
      "In a crisis, work the playbook: the first response, the fact-finding, who speaks, what you disclose and who you brief. Denials the facts contradict leave lasting damage; real fixes speed the recovery. Disputes go from negotiation to mediation to arbitration or court, and the exposure report shows what each could cost.",
    ],
  },
  {
    title: "The league",
    body: [
      "Owners vote on rule changes at the March meeting; most need 24 of 32 votes. Relationships with other owners help with votes, trades and hosting bids.",
      "Interview rules protect teams still in the playoffs, and the draft, free agency and the trade deadline run on the real league calendar.",
      "The league office splits national money into pools, holds a little back until the spring audit, and briefs every proposal. Committees decide what reaches the floor: ask for a seat to argue there or to bring proposals in the committee's name.",
      "Owners vote issue by issue, so build a coalition for each issue you care about. Narrowing a proposal to a one-season trial wins votes. Season length, a second bye, international games and new technology are ordinary rule votes, and a longer season moves the calendar, the cap and players' pay.",
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
