# NFL Owner Simulator

A browser game where you own an NFL franchise: hire the GM and coaches, manage
the cap, negotiate, draft, run the business, and live through the season one
day at a time. It starts in the 2026 preseason with real teams, rosters,
contracts and the real 2026-27 schedule.

Player ratings exist only inside the engine. As the owner you see what a real
owner would: past stats, contracts, and reports from your staff, whose quality
decides how accurate those reports are.

## Status

Playable: pick a team, run camp and the cut to 53, play the full 2026
season day by day through Super Bowl LXI, then run the 2027 offseason and the
2027 draft. Saves autosave in the browser,
go to the cloud on claude.ai, and export to a file.

The pages are grouped in the sidebar by part of the job (Desk, Team, Roster
building, Draft, Owner's office, League, Game); groups fold away and still
show what's waiting in them. The search box finds pages as well as people.
On a phone the sidebar becomes a Menu button with the section's other pages
under the date. Settings has a light, dark or device theme.

Every game is simulated play by play, with box scores and per-game stats for
preseason, regular season and playoffs, plus season totals and league leaders. Open-air games have weather
from each city's climate: wind takes away deep passes and long field goals,
cold and rain make the ball harder to hold, snow does both, and kicks carry in
Denver. Domes and retractable roofs play indoors. Teams on a short week, on a
long trip or playing a 1 PM East Coast game on a West Coast body clock play a
little flat, and teams off a bye are a little fresher. The box score shows the
conditions.
Each team has its real 2026 head coach, coordinators, special teams coach and
GM, running their real-life schemes. How well a player's traits fit those
schemes changes how that player performs (in the engine, not on screen). Players back from a long injury often start
slow for a few weeks, and a torn Achilles or ACL can take something away for
good. Injured reserve follows the league's rules: four games minimum, eight
return designations a season per team, and a 21-day practice window to
activate a player or lose him for the year. Players still hurt from before camp
go on PUP or the non-football injury list, and coming back from those doesn't
use a designation. Teams put anyone expected to miss about four games on IR, so
most use several designations a season. Play callers,
trainers and scouts all change results: injuries and recovery time, player
development, and how accurate the written staff reports are.

Contracts work like the real league. Deals are year by year with prorated
signing bonuses (five-year limit), void years, full and injury guarantees, and
dead money that accelerates on release, split across two years after June 1.
Every player has a made-up agent with a negotiating style and a client list,
and hidden priorities (money, winning, role, city, scheme, playing time, ego,
loyalty) that set a walk-away price you never see. Offers move morale and the
agent's trust; lowballs sting, and some agents leak to the press. You can
negotiate yourself or hand talks to the GM with a mandate and follow along.
CPU teams extend their own players by the same rules, starters hold out or
hold in at camp, and three made-up outlets grade every deal. The market is
built from live contracts, so a record deal resets its position and nudges
neighboring positions. Cash is tracked apart from the cap. Players who outplay their deals ask to redo them early: a starter whose market has
run well past his pay asks in the spring with years still left (rookie-deal players
only after their third season). The owner can open talks, promise talks after the
season or say no; a turned-down player may skip voluntary OTAs or hold in at camp,
and regular-season holdouts are rare, as they are since the 2020 CBA. Every team has to be under the cap at 4 PM ET on the first day of the league
year: the GM warns us a month and a week ahead, and makes the moves himself if
we're still over on the day. CPU front offices don't take on next year's money
they'd have no way to clear.

Veteran deals can carry incentives: playing-time tiers, position stats
(passing yards, sacks, interceptions and so on) and playoff bonuses. They show
up on about a quarter of real-money free-agent deals, mostly short "prove it"
deals and deals for older players or players coming off a lost season, worth
roughly a quarter of the salary. Following the CBA, an incentive the player
reached last season is likely to be earned and counts on this year's cap, and
the rest don't. Two days after the Super Bowl the books are squared: earned
incentives are paid, and the difference lands on next year's adjusted cap as a
credit or a charge. The owner can offer incentives in any negotiation, and
agents value them well below guaranteed money.

The offseason follows the real calendar. The 2027 cap is set in late
February and unused space rolls over. Each team gets one franchise or
transition tag, restricted and exclusive-rights players need tenders, and
first-round picks get fifth-year option calls. Teams re-sign their own players
until the negotiating window, restructure or cut to make room, and then all
32 teams bid in free agency. Players weigh money against winning, scheme,
role, city and loyalty, and bidding wars and "last looks" decide close calls.
Deals agreed in the window are signed when the league year opens, and the Top
51 rule applies until the next opener. Offer sheets on restricted players are
rare, as in the real league.

Free agency runs all year. The pool starts with the real 2026 free agents
(about 500 veterans and young players who were on no camp roster, minus
announced retirements), and every cut lands there too. Players with fewer
than four accrued seasons, and everyone after the trade deadline, go through
waivers first: claims are due by 4 PM the next business day and go by
priority (the 2026 draft order until late September, then the standings). A
team that claims a player takes over his salary. Practice squads (17 spots,
6 for veterans) form after the cutdown claims; each team protects four a
week, other teams can sign the rest to their 53, and coaches elevate up to two
per game, three times per player. In-season signings are one-year deals for
the weeks left, vested veterans on a Week 1 roster are owed the full season if
cut, and eliminated teams sign reserve/future deals in January. The Free
agents page has the pool, the waiver wire, the practice squad and a league
transaction wire.

Trades follow the league's rules too. The window runs from the new league
year to the trade deadline (4 PM ET, November 10); nothing moves from then
until the Super Bowl, and deals agreed after it become official when the new
league year opens. Teams trade players and picks in the next three drafts
(three 2027 first-rounders start out already traded, as in real life). A pick can carry a
condition: it moves up a round if the player traded plays half the snaps, reaches a stat
mark or is extended, or if the team makes the playoffs, and a 1st can be top-3, 5 or 10
protected (next year's 1st goes instead). Conditions settle the day after the Super Bowl,
at the new league year for extensions, or when the draft order is set for protection. The
team that acquires a player takes on the rest of his salary and its
guarantees for the weeks left; his signing bonus stays behind, with later
years' proration accelerating as dead money (onto next year after June 1).
Both teams have to be under the cap and inside the roster limit once a trade
is processed. Practice squad players, reserve/future signings, players who
haven't signed a tag or tender, and a matched offer-sheet player (to the team
that made the sheet, for a year) can't be traded, and a no-trade clause needs
the player's consent. Every front office values a trade through its GM's eye:
what a player is worth for the ability they see, against what he costs, at
the role he'd have, and where the team is headed (contenders pay for now,
rebuilders want picks and youth); picks are valued on a draft chart at their
projected slot. CPU teams trade with each other all year, most of all in the
last week before the deadline, and unhappy players ask out. The owner can
propose deals, ask what a player would cost, shop players on the trade block
and take or leave calls from other teams. Three outlets grade every trade.

College football runs alongside the NFL. All 138 FBS teams play the 2026
season in their 2026 conferences under their real head coaches: a generated
12-game schedule with the real rivalry weekend, Red River and Florida-Georgia
at their neutral sites, and Army-Navy on its own Saturday; conference title
games; the AP poll every Sunday and the playoff committee's ranking every
Tuesday from November 3; bowl season; and the 12-team College Football Playoff
on its real 2026-27 dates and sites. Teams are simulated at the score level.
The only players are the 2027 NFL draft prospects (about 640, generated for
each save), and each has season totals and a game log. Award watch lists turn
into semifinalists, finalists and winners on the real award calendar.

Scouting is how the owner learns who those prospects are. Each week the owner
points up to six assignments at a region, a conference, a school, positions, a
college system, or specific players, at one of three depths: film study,
campus visits or a deep dive. Narrow assignments fill a player's file fast;
broad ones learn a little about many. Every assignment costs money from a
$2.4M budget that runs to the draft, and campus trips cost more the farther
the school is from the team's building. Reports come out as a round range,
strengths and concerns, size and speed, scheme fit, makeup and medical as the
file fills in, with the accuracy of the college scouting director. Other teams
scout the class too.

The 2027 draft runs at the owner's pace, with no clock: advance one pick,
jump to our next pick, or run to the end of the day, and the GM makes any of
our picks the owner skips. Day 1 is the first round, Day 2 rounds two and
three, Day 3 rounds four through seven. The order comes from the final
standings (strength of schedule breaks ties, and tied teams rotate each
round), with the 32 compensatory picks NFL.com projected from the real 2026
free agency at the end of rounds 3-7. On the clock, the GM, head coach and
both coordinators each recommend a player, through their own eyes: how well
they evaluate, what side of the ball they coach, scheme fit and need, built on
what our scouts learned. Teams behind us call to trade up, we can ask any team
its price to move up, and CPU teams trade picks among themselves. Every front
office drafts from its own board. After each day the GM letter-grades every
pick against our board. Before the draft, underclassmen declare by mid-January
(some go back to school), the combine publishes heights, weights and workouts
in early March, and three outlets publish mock drafts every two to four weeks
from September: the first round only at first, four rounds by draft week.
Undrafted free agents sign as soon as the draft ends, and teams trim to 90.
Rookies sign rookie-scale deals at their slot. The game stops the day after
the draft. Check a draft with `npx vite-node tests/draft-report.ts [seed]`.

Five made-up media companies cover the league every day: The Gridiron Ledger
(the paper of record and the weekly power rankings), Sideline Report (breaking
news, injuries and previews), Cap Space Daily (contracts, grades and free
agency), The Blitz (sports-talk hot takes and the hot seat) and the Saturday
Sentinel (college football and the draft). They write up every game with
quotes, report injuries, signings, releases and trades, chase trade and free
agent rumors (some true, some not), run interviews, stat trends, previews and
playoff pictures, cover the college season and grade every team's draft. Agents
who leak contract talks leak to them. The Media page has the feed, filters and
each outlet's staff.

When something happens to the team, a reporter asks the owner for comment: a
loss, a win streak, an injury, a contract standoff, a trade rumor, a signing or
release, the deadline, the coach's job, the draft, another team's star. Each
question has four to six answers, and what an answer does is never shown. It
can move players' morale, the head coach's faith in the owner, agents' trust
and leverage, fans and the press, how each outlet covers (and grades) the team,
other teams' boards on draft prospects, and it can bring a league fine.
Promises are remembered: call a player untouchable and trade him, or call the
team a Super Bowl team and miss the playoffs, and the press brings it up.
Unanswered questions become "declined to comment." Check a save's coverage with
`npx vite-node tests/media-report.ts [seed]`.

The owner runs the business too. Every stadium is entered with its real
ownership and lease: some teams own their building (the Dolphins, Patriots,
Rams, Commanders and Panthers) and book any concert, fight or bowl game they
like and keep the money; the Giants and Jets own MetLife together and need
each other's sign-off; most teams run a publicly owned stadium under a lease,
booking events with the landlord's approval and keeping an agreed share; a
few (the Bears, Vikings, Saints, Texans, Colts and Cardinals) are tenants in
buildings their public authority runs and books; and the Chargers rent SoFi
from the Rams' owner. Rent, upkeep, stadium debt, naming rights, game-day
concession and parking shares, curfews and blackout dates (the Houston rodeo)
follow from that. Money comes in from the league's national revenue, the
shared gate pool (34% of general ticket money after a 15% stadium deduction,
split 32 ways), season and single-game tickets, suites and clubs,
concessions, parking, the team store, local sponsors, naming rights and
stadium events; playoff gates go to the league, and teams that give up a home
game abroad are made whole. Season tickets for 2026 are already sold when
the owner takes over; single-game prices, concessions and parking (where the
team controls them) can change any time, and next season's prices are set
after the regular season, with renewals and deposits in the spring. Prices,
empty seats and sellouts move the fans, the press writes about them, and the
owner gets asked. Department budgets (marketing, game-day experience,
community, medical, the training facility) cost money and change demand,
fan mood, injury recovery and the head coach's mood. Player cash (not cap
dollars), scouting trips and league fines are charged to the books; a team
that runs through its credit line needs the owner's money. The Business page
has the statement, the ledger, the gate, the stadium calendar and booking
requests, budgets and league-wide estimates of revenue and franchise values.
Check a save's books with `npx vite-node tests/business-report.ts [team] [seed]`.

The spring and summer are football too. Voluntary OTAs open the week before
Memorial Day and run three weeks, then a three-day mandatory minicamp in June.
Most players are there every day; established veterans often train on their
own, and starters who feel underpaid stay away, which makes a camp holdout
more likely. Skipping minicamp draws a CBA fine the owner can enforce or
excuse. A new scheme goes in faster the more players show up, and the young
players who were there every day get a head start. Players get hurt at OTAs
and working out on their own over the summer. In camp the coaches learn who
can play by watching practice and preseason games: their grades sharpen with
every rep, and a hot camp can fool them for a while. The head coach names the
open starting spots when camp opens, reports on the battles every Monday, and
settles them before the cutdown; the roster and cutdown pages note who won a
job, who had a strong or rough camp, and who skipped OTAs. Discipline is kept
to policy matters: failed PED tests (six-game suspensions served on the
reserve/suspended list, off the 53 and without pay), substance abuse policy
fines, missed meetings, and players sounding off in public, where the owner
decides whether to fine the player, meet with him or leave it to the coach.
The Camp page has the battles, spring attendance, the owner's pending calls
and discipline around the league.

The owners run the league. Three weeks before the annual meeting in March,
the Competition Committee and a few clubs publish specifically worded
proposals (a 35-second play clock, touchbacks at the 40, extra points from the
25, a ban on the push play, seeding playoff teams by record, an 18-man
practice squad, a later trade deadline and more), and a change needs 24 of 32
votes. Each one has a real effect on how games are played or how the
calendar and rosters work, starting the next season, but the game never tells
you what it will do to your team. You can submit one proposal a year, see
the front office's whip count, and spend a limited number of calls lobbying
other owners. How those owners feel about you moves with your votes, trades
and hiring away their coaches; good relations can become alliances that back
you in the room and make their front offices a little easier to deal with,
and bad ones become rivalries. The Owners page has the agenda, the other
owners and the rulebook.

The same meeting awards the Super Bowl about four seasons out and the draft
about two years out. Super Bowls go to domed and warm-weather stadiums a team
controls; any city can host the draft. You can enter a standard or a major
bid in the six weeks before the meeting. A newer building, a bigger market,
finished stadium upgrades, the size of the bid and your standing with the
other owners all count. A host's season brings more team store sales, a little
more ticket demand, warmer sponsors and a big week for the fans, and the league
takes over a Super Bowl stadium for the four weeks before the game.

Coaching searches follow the league's interview rules. Nobody interviews
another team's staff during the season. Staff on playoff teams can be
interviewed by video after the wild card round, but a second interview, and an
offer for a head coach or GM job, has to wait until their team is out or the
week before the Super Bowl. A hire from a team still playing becomes official
when its season ends.

Every staff has its real 2026 position coaches: a coach for each room
(quarterbacks through defensive backs) and an assistant special teams coach,
most with an assistant under them. They teach their rooms, so a good one helps
young players grow (about a third as much as the head coach does). The head
coach hires them and you approve or turn down his pick; a new head coach brings
some of his own people. Coaches remember whom they worked under, and teams
looking for a coordinator or head coach lean toward branches of winning trees.

Before the draft, the doctors examine every combine invitee and you pick the
45 prospects for formal interviews (the GM fills any you leave open). After
the combine you can bring in 30 prospects for top-30 visits and send position
coaches to run 10 private workouts. Every read is only as good as the people
making it: the medical staff for the physicals, the head coach and GM for the
interviews and visits, and the position coach for workouts.

Teams in publicly owned stadiums have real leases that run out. About three
seasons before yours ends, the city or stadium authority opens talks with an
offer: the length, the rent and public money for renovations. You can sign,
push for more money or a lower rent (each push wears on their patience), or
walk away for the year; an expired lease rolls over a year at a time at a
higher rent. Public money from a new lease pays for stadium projects first.
Relocation is not in the game yet.

The business has an offseason too. Local sponsors (the jersey patch, the
official bank, beer, airline and the rest) and the flagship radio and
preseason TV partners are named deals with their own terms; when one runs
out, the incumbent and rival companies bid each February, and what they'll
pay moves with the team's record, the fans and the building. Stadium and
facility projects (video boards, Wi-Fi, concourses, new seats, field-level
clubs, a bigger training facility, a recovery center) take one or two
offseasons to build and are shared with the public owner or the partner team
where there is one; tenants can't renovate a landlord's building. The college
scouting department is a budget line that sharpens draft reports. In late
June the media grade every team's offseason and the GM sends their own
grade; fans set an expected win total from last season and the offseason,
and the media settle on a few storylines about the team. When the regular
season ends, the record is measured against those expectations. The
Business page has Sponsors and Projects tabs; the Media page has the
storylines and grades.

Selling the game works like a real ticket office. General seats come in four
price zones, each home game is a marquee, standard or value game, and the
owner can price zones and tiers apart, turn on dynamic pricing, run group
sales and promotions (which give money away when the game would sell out
anyway), sell unused suites as corporate hospitality and route resales
through the team exchange. Each gate records paid tickets, no-shows, comps,
resales and suites in use. Season-ticket holders renew by tenure, and the
waiting list refills the seats they give up; suites renew with how much
companies used them; seat licenses raise cash and cost lasting trust. The
Fans tab covers the market (approximate metro population, growth, incomes,
competing teams, the economy), where fans live, trust and generational
loyalty, post-game surveys and the lifetime value of each kind of customer.
Sponsors can buy exclusivity where rights allow, the club negotiates stadium
naming rights where it controls the building and sells a practice-facility
name and a digital partnership, partners get year-end delivery reports with
make-goods, and some fail to pay or land in scandals. The forecast now plans
player pay from how the club actually spends against the cap.

The club runs its own store, media and game days. Jerseys are ordered
before the season by player on the staff's forecast, sell with the record
and injuries, and get marked down or liquidated when a player leaves; the
stores and online shop run in-house or through partners, counterfeiters
work the big games, and the league's licensing royalties stay national.
Rebrands (uniforms, a logo, even a new name) need the league's approval,
cost real money and lead time, and a new name costs fans' trust for years.
The Media tab shows the league's real TV and streaming deals, our share and
a range for after the 2029 opt-out, a content department with its shows,
social followers that make digital sponsorship worth more, beat writers and
their sources, a spokesperson for press questions and a searchable archive
of headlines. The Game day tab sets staffing, security, medical crews,
alcohol rules, the show, the menu, transit and a weather plan, and after
each home game the operations staff report lines, food, outages, incidents,
complaints and the game's own books, with recurring problems flagged and
three-game experiments.

The buildings wear out. The Buildings tab lists every part of the stadium
and the team facility (roof, heating and cooling, seats, the playing
surface, video boards, concourses, the network, parking; practice fields,
locker rooms, weight room, film rooms, kitchen, video systems, equipment)
with its condition, age and replacement cost, as the operations director
reads it or an engineering study measures it. A club that runs its stadium
chooses to maintain on schedule, put it off (a backlog that breaks more on
game days and that players notice) or stay ahead; the owner can replace a
part, switch between grass and turf, and see each project's payback. Owned
stadiums carry a value apart from the team, and a yearly players' and
staff survey rates the facilities. The Community tab runs the team
foundation (focus areas, made-up applicants, oversight, the owner's
personal gifts), programs from youth flag leagues to accessible game days,
a shared initiative with the city that helps in lease talks, player
appearances, player services and alumni. On the Front office page,
Departments covers travel (trip reports with real distances, early
arrival for long trips), security (drills, credentials, gambling education
against a new league suspension) and technology (core systems, backups,
ransomware and data breaches as decision memos).

The owner's office runs like a real club's. At the start you set up who
you are: a background (finance, real estate, a company you built, an old
football family or a former player, each with its own edge), how much money
you have outside the team, how hands-on you'll be, how freely you spend, how
many seasons you'll give a rebuild, and how much each of six goals matters
(championships, profit, franchise value, community, reputation and a stable
club). You can also take over a cash-strapped club or one bought with
$450 million of floating-rate debt. Every season is scored on all six goals,
whatever your weights, and goes on your record as owner, with your return on
the club against the stock market. Your own money is real: capital calls come
out of your cash (then outside holdings sold at a discount), and you pay the
income tax on the club, less the write-off of the purchase price. Priorities
shift with what happens, and you can set the head coach a target each season.

The Business page keeps proper books: an accrual income statement (bonuses
spread over contracts the way the cap counts them, season tickets counted as
the games are played, buildings depreciated), a balance sheet, a cash-flow
statement that ties to the bank, ratios against the league, and a drilldown
from any line to its payments. Each league year opens with an approved
budget and closes with an audit; the Plan tab shows budget against actual,
a cash reserve policy and a 5-, 10- or 20-year forecast with a range. The
Financing tab has the credit line, term loans from three lenders (a bank, a
sports lender and a private credit fund) with their own rates, fees,
repayment and covenants, a market rate that moves month to month, quarterly
covenant tests (a waiver the first time, a called loan the second),
refinancing offers before a loan comes due, and the league's debt limit.

The Front office page is the owner's executive team: a president and CEO, an
optional president of football operations, and chiefs for finance, revenue,
operations, legal, the stadium, marketing and technology (all made up). Their
ability is hidden and shows in their departments' results: borrowing costs,
sponsorship, business office costs, incidents, fan mood. You set the reporting
chart, hire through a search firm (resumes, the firm's read, three interview
questions, and terms that include whether they get to run their area), let
people go at the cost of severance and your name as an employer, and promote
deputies. For each kind of decision (signings, trades, coaching hires, ticket
prices, stadium bookings, local sponsors, borrowing) you decide yourself, have
the staff propose, or delegate within limits on contract size and debt, with
reports each time, weekly or only on surprises. Proposals come as decision
memos with the case, the money, the risks, a recommendation and a deadline;
you can send one back for research. The executives meet monthly, take tasks
(a savings drive, a sponsor push, a compliance review and more), are reviewed
each league year, and get calls from other clubs. A record tab keeps every
decision, incidents, monthly trends and whether your choices match the
priorities you set.

The Culture tab reads the building each month (trust, stability, fairness,
accountability, communication and morale) from what happened, and tracks the
working relationships: your GM's trust in you, how the GM and head coach get
along, sponsors' confidence, the community, and how many sources reporters
have inside. Overrides and lost authority get pushed back on, staff
complaints need handling (an outside investigation, an internal review or
closing it), unhappy executives resign, and details leak. A staff development
budget grows people, deputies most of all. The Executives tab draws the
organization chart.

Settings: scouting precision (sharper or foggier reads by your own staff, never
the truth), ironman (one continuing save), pauses that stop a multi-day sim
when something urgent lands, a "Sim a week" button, text size and high
contrast, and which panels the Today page shows. A new game can start from a
custom position (the club's cash, acquisition debt, your own cash and the
front office's quality). The sidebar search finds any player, coach,
executive, team or message, and the Owner's guide explains the cap, the
club's money, borrowing and how the league is run.

Every game in the league has a play-by-play feed and a drive chart: each
snap with the down, distance, spot, formation, personnel and coverage, who
made the tackle, and every flag, review and score. Full plays are kept through
the week after a game; after that a game keeps its box score and scoring
plays. Your own game, played from the Today page, comes in one play at a
time on a field view: a broadcast-style scoreboard (score, quarter, clock,
down and distance, timeouts, possession) over a drawing of the field with the
ball, the line of scrimmage, the line to gain, the drive so far and the path
of the last play. You can skip to the next drive, the next quarter or the
end, let it run on its own, or step back a play. Any game still holding its
full plays can be watched the same way from its box score. Pass rushers win or lose against
the blocker in front of them, so one weak tackle shows. Officials miss
calls; coaches challenge (two a game, a third after winning both, a timeout
lost on each failure), the booth reviews the last two minutes of each half
and overtime, and replay only reverses what the video shows clearly. After a
game you can ask the league office about a call that went against you. Before
each home game the stadium operations staff checks the field, game balls,
officials' rooms, chain crews, credentials, coach radios, broadcast setup and
security; a stronger operations director and game-day budget mean fewer
problems, and the rare incident costs money or draws a fine.

Every play has a value: expected points added (EPA), success rate and the
home team's win probability, with a win-probability chart and the plays that
turned each game (with a film note on why). The Analytics page has team and
player EPA, adjusted for opponents, and an analytics department you staff
and point at a research focus. Its fourth-down advice changes calls only when
the head coach takes it; credibility grows when advice works. Every club
builds a weekly game plan from the opponent's numbers (better coaches,
analysts and a full week make better plans), coordinators adjust at
halftime, and the league's play calling drifts toward what worked last
season. The Outlook tab explains the record (point margin, close games,
turnovers, schedule, injuries) and lists starters aging out or near the end
of their deals. "Sim to game day" stops the morning of your game.

Players are people. Each has a lasting character the staff describes in
words: how fast he learns, how he prepares, whether the room follows him.
The Clubhouse page shows the team's chemistry (continuity, leaders, mood and
the head coach; a small edge on the field), veterans mentoring young players
at their position, whom the coaches trust (which tips close depth chart
calls), players paid or drafted to start who are sitting, and the best-known
names, who sell jerseys. Now and then a player is excused for a personal
matter, and the club says nothing more. You set the practice load, rest
days for veterans and the strength staff, put up to eight young players on
development plans, and ask the coaches to try a player at a new position,
which he learns over weeks and may or may not suit. On the medical side,
first diagnoses are firmed up by follow-up tests, long rehabs hit setbacks
or run ahead, the doctors (and for concussions an independent consultant)
decide clearance, and big salaries can be insured against injury.

Game weeks run like the league's. Every team files a practice report on the
three practice days before a game (did not practice, limited, full, with the
reason) and a game status with the last one; veterans get the first day off.
The Game week page sets the practice plan (game plan work sharpens the plan
for the opponent, fundamentals help young players grow, recovery lightens
the load), lists the game-day inactives and the emergency quarterback, keeps
the pro scouts' short list of free agents at quarterback, kicker, punter and
long snapper, and reads the waiver risk at the bottom of the roster. A player
signed or claimed on game day can't play until the next game. In scouting,
five area and position scouts each cover a group of positions, sharpen our
reads there and carry a lean (the stopwatch, the stat sheet, big programs)
that colors their grades; the department can weigh tape, testing or
production, and a scout can be replaced. In the draft, the GM can make our
picks from any round on, and the clock runs ten minutes in the first round
down to four in the seventh. On contracts, many veteran deals now pay part of
the salary as per-game roster bonuses and workout bonuses, settled after the
season and the minicamp; mid-round rookies who play enough earn the proven
performance escalator; and every club must pay 89% of the caps in cash over
each four-year period (from 2027) or pay the shortfall to its players. In
contract talks you can write per-game bonuses (a share of the salary paid for
each game on the game-day roster), workout bonuses and escalators (a raise
the next year for playing 65% of the snaps); agents price per-game money by
how often their client misses games, and CPU teams write the same terms.

The league remembers. Pro Bowl rosters come out in late December, the
All-Pro teams the week after the regular season, and the awards (MVP,
offensive and defensive player and rookie of the year, comeback player and
coach of the year) at NFL Honors the week of the Super Bowl, voted on the
stats, the team's record, the film and reputation. Pro Bowls set the
fifth-year option's top tiers. Players become eligible for the Hall of Fame
five seasons after they retire. The History page keeps the honors, the Hall
of Fame classes, single-game and single-season marks against the real NFL
records, rivalries built from division games, playoff meetings and close
finishes, how every trade turned out, the club's eras under each head coach
and GM, contracts that set a new high at their position, and the club's
books and valuation by year. Title anniversaries make the news.

Football follow-ups (Batch L1). Player pages carry career stats from 2005
on (the real seasons, then every season played in the game), with career
milestones and records against the real NFL marks, career leaders and
careers ranked across eras on the History page, plus biographies of the
club's executives and coaches, rule eras and owner eras. Two and four
seasons after each draft and free agency period the staff re-grades them on
what players did, and each season ends with a coaching grade against the
talent on hand. Contracts can carry roster bonuses, an option bonus the club
exercises or declines, salary guaranteed only against a release for football
reasons or only against one to save cap room, and a no-trade clause; the
Cap page adds a five-year planner with trial deals, the compensatory pick
forecast from the league's formula, and the analysts' cap optimizer, and you
can sign another team's restricted free agent to an offer sheet. The sim reads
play-calling tendencies, blitz pickups and protection slides, quarterback
reads and shadow corners, broken tackles, composure in big moments, return
and punt plans, and new schemes that spread around the league. Camp has a
coach's room (preseason snaps, the roster-bubble meeting with up to three
asks to keep, the next-man-up order and the special teams plan). Scouting
splits its budget across travel, video, medical and data, adds a national
scout, pro scouts with an advance report before every game, four draft boards,
college stats adjusted for schedule and system, and a race for undrafted
players with bonus offers. The analytics department has named analysts, data
feeds, contract and availability models, experiments with noisy results, and
position assessments. Players learn a new playbook, wear down under heavy
snaps, respond to training differently and weigh money and family when they
think about retiring; the owner's standing with players and the medical staff
affect free agency, diagnoses and rehab.

Owner's office follow-ups (Batch L2). The Business page adds a Treasury
tab (supplier payment terms and collections, financial controls, audit
findings that come back worse if left unfixed, outside consultants, one
capital pool that every equipment and technology request competes for,
payroll by department, and layoffs with severance and a hit to morale) and a
Journal tab with every ledger entry in double-entry form and a trial
balance. The Front office page adds a People tab: succession plans and named
successors, quality-control coaches who sharpen game plans and can be
promoted, promotions from within, coaching extensions with partial
guarantees and playoff bonuses (a fired coach is owed only the guaranteed
share), the head coach's job security and votes of confidence, mandates for
each executive, working conditions and what each person remembers about
you. The Owner page shows how eight audiences judge you and how that has
moved over a year, your public line on football decisions (calls you make
quietly while saying otherwise tend to leak), elected officials who follow
their voters, staff and owner scandals, your calendar, and a slider from
past results through the forecast with ranges. New Football, Agreements and
Reports pages give the football overview, a searchable contract center with
an archive, and saved reports with the desk ranked by what needs you first.
Memos take follow-up questions, meeting agendas can be reordered, figures
carry confirmed/estimate/opinion labels and help, and Settings adds a full
realism preset, play modes that hand one side to the staff, a sandbox,
information levels and approval limits by area.

The league office (Batch M1). The league's national money is split into
media, sponsorship, licensing and other pools, with the league's own costs
taken off the top and a little held back each month until the spring audit,
which can open a dispute the owner may contest. New TV deals and a longer
season move the salary cap, the media deals can be renegotiated or opted out
of, and owners vote on sharing more of the gate and on a premium-seating
pool. A made-up commissioner runs the office under a contract the owners
vote to extend; five committees decide what reaches the floor, and the owner
can ask for a seat, bring proposals in a committee's name and argue in
committee. Owners line up issue by issue in coalitions, proposals can be
narrowed to one-season trials, failed ones come back revised, and the office
briefs every proposal on cost and difficulty. Season length (17 or 18
games), a second bye week, more international games, a sky judge and new
safety technology (the last two only after a trial season) are ordinary rule
votes; a longer season runs through the calendar, the schedule maker, the
cap, per-game pay and accrued seasons. From 2027 on the schedule maker picks
prime-time games by draw, keeps short weeks and long road trips down, flexes
late games and moves games for storms or stadium problems. 2026 stays the
real schedule.

Compliance and legal (Batch M2). A new Legal page. The compliance office
(staffed from the GM's assistant up to a department with outside counsel)
files roster moves and the ownership report on time, signs the yearly policy
acknowledgments and conflict disclosures, trains staff, and funds guaranteed
pay with the league in cash or with a letter of credit. The league audits
every club's cap in June, players in a trade with us pass physicals before it
is final (a failed one voids the trade), and league investigations move from
inquiry to interviews to findings, where cooperating, giving only what's
required or contesting changes the outcome, then to fines and lost draft
picks that repeat violations make heavier, with an appeal to the
commissioner. The league disciplines one to three clubs in a typical year. A
crisis playbook runs the response to stadium accidents, data breaches,
misconduct allegations and the like: the crisis team, the first statement,
internal or independent fact-finding, who speaks, what is disclosed, and
briefings for sponsors, staff and the league; denials the facts contradict
leave lasting damage that heals with clean years and real fixes. The legal
side names the club companies behind each agreement, how each kind ends and
renews, who must sign off by size, counsel's review of major signings,
privileged-records and retention policies, and disputes that go from
negotiation to mediation to arbitration or court, with an exposure report.

The economy, shocks and insurance (Batch N1). A national economy moves
month by month (output against trend, unemployment, household income,
corporate earnings, consumer confidence, inflation, building costs and real
estate), and each club's metro has its own local trend and population drift.
Recessions come out of those conditions (about one a decade at the default
setting) rather than on a timer. Household income and confidence move ticket
and store demand, corporate earnings move sponsor, suite and hospitality
budgets, the labor market and inflation move staff pay, building costs move
project prices, the cycle moves interest rates and the advertising market
behind the TV deals, and rates and confidence move franchise multiples. The
forecast shows revenue ranges that widen when the economy is shaky, a
scenario tool tests growth, rates, prices and attendance, past years show in
2026 dollars, and Settings has an economic volatility level. Stadium fires,
floods, structural defects and power failures (about once a decade), sponsor
collapses, attendance slumps, repair bills, inflation spikes and
construction overruns can hit the club. Property, liability and
business-interruption cover come with limits, deductibles and a flood rider,
priced on risk controls; claims go through the adjuster, sometimes a dispute,
and excluded losses are paid directly. An owner who can't fund the club puts
it in distress: outside investors, refinancing or a control partner, and the
league supervises a recovery plan if nothing changes. These live on the
Business page's Economy and risk tab.

Labor relations and the CBA (Batch N2). The players' union is its own side,
with a (made-up) leader and a mood of its own, and the real 2020 agreement
runs through the 2030 season. Talks on the next one open two years before it
expires: the owners' labor committee sets the league's goals, each side's
proposal moves month by month, and the owner picks a stance (hard line,
steady or labor peace) and priorities (an 18th game, the players' share, the
rookie pool); a seat on the committee makes that count fully. Most talks end
in a deal before the deadline. About a third end in an offseason lockout that
stops free agency, signings, trades and team activities, and a few run into
the season and cancel games: no gate, refunds for season-ticket holders, a
smaller national distribution and a hit to fans' trust. A tentative deal
needs 24 owners' votes and the players' ratification, and then applies at
once: the cap follows the new share, minimums and the rookie pool follow the
new scales, benefits, camp practice limits, safety provisions and the cash
floor change, and an 18th game (which the union trades only for a higher
share and fewer padded practices) goes into the rulebook. Contracts already
signed stay as written. The union files grievances that an arbitrator
decides unless the club settles. All of it is in a Labor relations panel on
the Owners page.

A new stadium is a multi-year project on the Business page. Feasibility
studies (about three months and $4M) compare the current site, a downtown
site and a suburban one on land, transit, parking, environmental risk and
development. The owner picks a roof, seats, an ownership model (team-owned,
a public authority, or a partnership), community benefits and a district
around the building, then asks the public side for money. The city's budget
office publishes its own impact study, an environmental review sets the
mitigation, rival suburbs sometimes pitch a site of their own, and voters
weigh the tax burden, the club's winning and fans' trust, the officials and
the economy. The council votes, and a tax district goes to a referendum on
Election Day. A failed vote leaves another round at a smaller ask, private
money, renovation, or saying other markets are on the table. Financing mixes
the owner's money, a 30-year stadium loan, the league's stadium program and
seat licenses, with a 5% contingency. Three contractors bid on fixed-price,
guaranteed-maximum or cost-plus terms; labor shortages, supply delays,
engineering surprises and change orders push most jobs 10-30% over and
sometimes a season late. Building on the current site means a temporary
home with smaller crowds. The new building opens on August 1 with a demand
lift that fades over five seasons, more premium seating, fresh facility
parts and a new lease (or none, if the team owns it). Other clubs plan and
open buildings too, starting from the real projects in Tennessee, Cleveland,
Washington and Kansas City; about one is approved every two to four years.
Lease talks can now also push maintenance onto the city, take a bigger
share of events, or add renewal options. Sponsors up for renewal ask where
the team will play, the training complex speeds rehab a little, and the
league inspects the field once a month.

Clubs can move. A market study compares a city's size, corporate base,
media market, football attachment, growth and the competition for the same
fans; the open markets are San Antonio, St. Louis, San Diego, Oakland,
Portland, Salt Lake City, Toronto and Columbus, plus a second team in a
metro big enough for one. Leaving costs the rest of the lease and, under a
non-relocation pledge, the public money back with a penalty. Applications
go in between January 1 and February 15, the league's relocation committee
reviews them, and the owners vote at the annual meeting (24 of 32), looking
hard at whether the club tried to stay. An approved move pays a relocation
fee over ten years and moving costs, ends the local sponsor and media
deals, resets the fan base to the new market's football attachment, and
lets the club keep its name, take a new one (through the league's rebrand
process) or leave the old one behind. The franchise keeps its records and
history, and the move goes on its timeline. A stopgap venue means a new
stadium; a moved club keeps its division unless the owners vote to realign.
CPU clubs move rarely, and only after a stadium plan fails at home.

The club can also grow abroad. The league grants marketing rights in up to
three countries for five years; localized content, fan events and youth
programs build an audience over years against other clubs chasing the same
fans, with merchandise through the league's licensee and local sponsors
outside the league's reserved categories. Income arrives in local currency,
so exchange rates move it, and a hedge can lock a year's rates. Games
abroad can carry a full fan program. Each spring the International Player
Pathway places a handful of overseas athletes with clubs, with an extra
practice-squad spot; clubs that take part and scout abroad can ask for one.

The owner can bring in partners. A new game starts with the owner holding
the whole club; the Ownership page sells a stake, either the owner's own
shares (the money goes to the owner, less capital-gains tax) or new shares
(the money goes into the club and everyone is diluted). Made-up buyers bid,
the league vets them, and its rules hold: the controlling owner keeps at
least 30%, and private-equity funds hold at most 10% together. Partners
share distributions and capital calls by their shares (one who misses a call
is diluted), and the owner pays tax only on their own share. Below
two-thirds of the shares, big borrowing, new shares, a new stadium, a move
and deals with the owner need the board's vote. Partners read a quarterly
report and grow content, restless or keen to leave; investor-friendly terms
give them a put after seven years. The Reports tab tracks the club's
enterprise value against the owner's equity, after inflation and against a
hurdle that charges for debt and illiquidity.

The owner's own money lives on Owner > Money. Outside holdings split into
stocks, bonds, real estate and the owner's own businesses, earning returns
month by month from the economy, with recessions hitting stocks and
businesses hardest; slow assets take months to sell. Personal debt costs
the market rate plus two points, borrowing against holdings risks a margin
call, and the page warns when the team is most of what the owner is worth
and compares the stake with the same money in stocks. A family office, a
family trust, a personal foundation (deductible, paying out 5% a year), a
chosen public profile and memos on conflicts between the owner's
businesses and the club round it out. None of it touches the club's books.

Clubs change hands. Ownership > Deals lists clubs for sale with the
seller's reason and appraises any club from revenue, market, stadium and
debt against comparable sales (three real ones and every sale in the save);
rival groups buy one to three clubs a decade. The player's own purchase runs
through diligence (hidden debt, lawsuits, leases, guarantees, deferred
repairs, dressed-up books), bids against rival groups with or without a
financing condition, 60 days of exclusivity, funding from the owner, the
family trust, limited partners, a fund and debt within the league limit,
the finance committee and a 24-vote owners' meeting, and closing costs.
Lenders can pull out and owners can vote it down. The player controls one
club: the old one is sold at closing, and the new one is taken over as it
stands, with a memo for any capital it needs. New game can start as a
buyer watching a club that's for sale or as a 10% partner who collects
distributions and can buy up to 49%; until they control a club, its staff
decide and its pages are read-only.

Owners age and die. Ownership > Succession tracks the owner's age and
health, lets them step back to chair or retire from daily duties, and
shows heirs only through what the family office, president and GM say
about them (sharper once an heir works at the club). The owner names a
successor and trustee for league pre-approval, plans for 40% estate tax
with liquidity and life insurance, buys out partners, or sells the whole
club through bankers, bids and the owners' vote, with net proceeds and
total return. Passed-over heirs can split the family and contest the
transfer. When the owner dies, hands on control or sells, the player goes
on as the heir (same club, contracts and history, a stepped-up basis),
has the estate sell and buys another club, or ends with a legacy review of
winning, money, buildings, culture and community. New game can start as
an heir with siblings as partners and estate tax owed; History > Owners
keeps the club's ownership history.

The other clubs are organizations. Owners > Clubs profiles each one: its
owner's approach, who makes the football calls, its budgets and money,
its management reputation and standing with candidates, what it
remembers and its ownership history. Owner patience feeds coach firings,
style and short cash feed free-agent bidding, owners meddle a few times a
season, clubs change course after seasons that argue with their plan and
when new owners arrive, good area scouts get hired away into bigger jobs,
and coaches sometimes leave without warning. Realignment can be proposed
at any time (Owners > Realignment). Reports adds a cause-and-effect log
(decisions, immediate effects and what followed in later seasons) and
year records (contracts, cap, books and rules as each league year
closed); big moves like a purchase or a sale run all or nothing. Signing
memos carry the coaches' estimate of added wins and playoff chances.

Long careers hold together. CPU teams use the franchise tag about as often
as real teams do, on starters they can't replace at the price, and clear the
room afterwards. Contract prices follow the going rate for players the league
sees the same way, so a player who reads as a mid-tier starter is paid like
one, and no deal goes much past the biggest real one at the position as a
share of the cap: the top quarterback deal stays near a quarter of the cap
instead of climbing every year. Rookie bonuses, roster bonuses and the
guarantees owed to released players are paid in cash, so teams spend about
the cap in cash each year, and the team's own costs rise with inflation like
its revenue. Saves from every earlier version still load, including ones
that stopped on the day after the old final draft. Check a long career with
`npx vite-node tests/longrun-report.ts [seasons] [seed]`.

Start in any season from 2011 to 2025 as well as 2026. Each season's data
(that year's rosters and contracts, schedule, stadiums, salary cap and minimum
salaries) is a separate file the page loads only when that season is chosen.
Earlier seasons play by their own rules: 16 games before 2021, a 12-team
playoff field before 2020, the old kickoff and extra-point rules and the 2011
labor deal until the 2020 one. With real history the league then follows the
real timeline (the caps each year, the 2020 deal, the Rams', Chargers' and
Raiders' moves, Washington's names, the clubs' sales). Alternate history,
at the start or later in Settings, freezes all of that so only the save's own
votes, moves and sales change it. History > Rules lists the real rule changes.
A custom league pack renames and repaints the clubs (city, name, colors); the
game checks the file and offers a template.


## Playing locally

```
npm install
npm run dev     # http://localhost:5173
npm test        # engine tests, including three full simulated seasons
npm run build   # dist/index.html (single file) and dist/game.html (claude.ai page)
```

## Code layout

- `src/engine/` game rules with no UI: cap math, roster moves, calendar, game sim (`gameday.ts` adds weather, rest and travel), standings and playoffs.
  `HIDDEN_RATINGS` is only read here. Contracts live in `contracts.ts` (deal model and cap rules),
  `market.ts` (prices, tags, tenders), `agents.ts`, `negotiation.ts`, `grades.ts`, `finance.ts` and `incentives.ts` (incentives, settled after the Super Bowl) `capplan.ts` (locked-in future cap money, the league-year compliance deadline) `redo.ts` (early redo asks, hold-ins and holdouts) and `conditions.ts` (conditional picks).
  The offseason calendar, tags, tenders, options and cap work are in `offseason.ts`; the free
  agent market is `freeagency.ts`; trades and draft pick ownership are `trades.ts`; the draft, mocks and the combine are `draft.ts`.
  The outlets are `outlets.ts`, daily coverage is `media.ts`, and press questions and their hidden effects are `press.ts`.
  The business side is `business.ts`, with every stadium's ownership and lease in `stadiums.ts`.
  The spring program (OTAs, minicamp, offseason injuries) is `spring.ts`, camp battles and the coaches'
  practice reads are `camp.ts`, and suspensions, fines and the owner's discipline calls are `discipline.ts`.
  Playing rules and the change catalog are `rules.ts`; owner relations, the league meeting and votes are `owners.ts`; Super Bowl and draft hosting bids are `hosting.ts`; interview rules for playoff teams' staff are `hiring.ts`; position coaches and their hiring are `positionCoaches.ts`; combine medicals and interviews, top-30 visits and private workouts are `visits.ts`; stadium leases with the city or stadium authority are `leases.ts`.
  The club's statements, budget and forecast are `books.ts`, its loans, credit line and covenants `debt.ts`, and the owner's profile, goals and scorecard `ownership.ts`.
  Executives and searches are `executives.ts`, decision rights and the audit trail `delegation.ts`, and memos, meetings, tasks, incidents and reviews `memos.ts`; culture rules and relationships are `culture.ts` and the monthly workplace (disputes, complaints, resignations, leaks, readings) `workplace.ts`.
  The locker room (character, chemistry, leaders, mentors, coach trust, roles, marketability, personal leave) is `clubhouse.ts`; practice load, the strength staff, development plans and position changes `training.ts`; diagnoses, rehab, medical clearance, protocol reviews and injury insurance `medical.ts`.
  Practice reports, the practice plan, the emergency list and game-day eligibility are `gameweek.ts`; the scouting staff and its leans `scouts.ts`; per-game and workout bonuses, the rookie escalator and the cash floor `bonuses.ts`.
  Pro Bowl, All-Pro, awards and the Hall of Fame are `honors.ts`; records, rivalries, trade outcomes, eras, contract milestones, anniversaries and yearly valuations `records.ts`.
  Expected points, EPA and win probability are `analytics.ts`; the analytics department, game plans, fourth-down advice and league trends `strategy.ts`; season attribution and the roster outlook `outlook.ts`.
  Career stats, milestones and era rankings are `careerstats.ts`; roster and option bonuses, partial guarantees, the cap planner, the comp formula and our offer sheets `contractextras.ts`; tendencies, protection, poise, return plans and new ideas in the sim `simtactics.ts`; the coach's room `coachroom.ts`; the scouting budget, pro scouts, draft boards and the undrafted race `scoutops.ts`; draft, signing and coaching re-grades `hindsight.ts`; playbook learning, load, training response, retirement thinking, the owner's standing and the doctors `playercare.ts`; analysts, data feeds, models and experiments `analysts.ts`; position assessments `assess.ts`.
  The season's games and bye weeks are `format.ts`; league revenue pools, the spring audit, revenue sharing and the TV deals `leaguemoney.ts`; the commissioner, committees, coalitions, briefings, technology trials and schedule moves `leagueoffice.ts`.
  The union, labor talks, lockouts, ratification and grievances are `labor.ts`, and the terms in force for each league year `cbaterms.ts`.
  New stadiums (studies, sites, design, financing, bids, the build and opening, and other clubs' projects) are `construction.ts`; the public side (impact studies, the environmental review, voters, council votes and referenda, rival suburbs, sponsors' questions) `politics.ts`.
  Relocation (markets, exit costs, the league's application and vote, the move, realignment) is `relocation.ts`; international rights, audiences, currency and the player pathway `global.ts`.
  The ownership group (partners, stake sales, the board and reserved matters, capital calls, investor reports, bridge loans, returns) is `investors.ts`.
  The owner's own wealth (holdings, personal debt, family office and trust, foundation, public profile, business conflicts) is `wealth.ts`.
  The franchise market (appraisals, listings, diligence, bids, financing, the league vote) is `franchisemarket.ts`; closing a purchase, switching clubs and the buyer and minority starts `takeover.ts`; owner aging, heirs, the estate, selling the club, the end of a tenure and the legacy review `succession.ts`; rival clubs' owners, governance, money, reputations, meddling and careers `rivals.ts`; the cause-and-effect log `causes.ts`; year records and all-or-nothing actions `archive.ts`.
  The national and metro economies, recessions, real dollars and scenarios are `economy.ts`; stadium disruptions, revenue and cost shocks, insurance and claims, and financial distress `shocks.ts`.
  The compliance office, filings, cap audits, guarantee funding, trade physicals and league investigations are `compliance.ts`; the crisis playbook `crisis.ts`; club companies, agreement terms, counsel's review, disputes and the exposure report `legal.ts`.
  Supplier terms, audits, consultants, capital, payroll and layoffs are `treasury.ts`; the double-entry journal `journal.ts`; succession, quality-control coaches, coaching guarantees, the hot seat, mandates, memory, the calendar and agendas `people.ts`; credibility, the public line, officials and scandals `standing.ts`; desk ranking, memo follow-ups, saved reports and play settings `desk.ts`.
  The play-by-play recorder and drive chart are `playlog.ts`, the field view's reading of a log `gamecast.ts` (drawn by `ui/GameCast.tsx`), officials and replay `officials.ts`, and game-day operations checks and questions to the league office `gameops.ts`.
  Local sponsors and radio/TV deals are `commerce.ts` (with `sponsors.ts` for rights, naming, deliverables and defaults), the ticket office `ticketing.ts`, the fan base and market `fans.ts`, merchandise and the brand `merch.ts`, team media `teammedia.ts`, game-day operations `venue.ts`, building upkeep `facilities.ts`, the foundation and player services `community.ts`, travel, security and technology `departments.ts`, stadium and facility projects `projects.ts`, and offseason grades, fan expectations and storylines `review.ts`.
  Historical starts: `pack.ts` loads a season's pack (`data/packs/<year>.json.gz`, from `pipeline/history_pack.py`) before the engine; `eras.ts` holds the era rules, real caps, old homes, names and owners; `eraevents.ts` plays the real timeline forward; `custompack.ts` checks and applies custom league packs.
- `src/ui/` React screens. `nav.ts` groups the pages for the sidebar and page search; `Tabs.tsx` sets long tab lists out in labeled rows (the Business page).
- `src/save/` autosave (IndexedDB), cloud saves and save files.

## College data

`data/college-2026/` is written by `pipeline/college_2026.py`: the 138 FBS
teams with 2026 conferences and head coaches (Wikipedia's current-coaches list,
October 2026), campus locations, college schemes (hand-entered for most
programs), NFL facility locations for travel costs, the real bowl and CFP dates,
and the generated regular-season schedule. Program strength is our own read and
stays hidden. Check a season with `npx vite-node tests/college-report.ts [seed]`.

## League data

`data/league-2026/` is generated by `pipeline/build_league.py` from open
[nflverse](https://github.com/nflverse/nflverse-data) data:

| File | What it holds |
|---|---|
| `teams.json` | 32 teams, divisions, home stadium, 2026 dead money and adjusted cap |
| `players.json` | ~2,900 players on rebuilt 90-man camp rosters plus ~500 unsigned free agents (`team: null`), with bio, draft, contract (year by year) and 2023-25 stats and snap counts |
| `hidden-ratings.json` | True overall, potential and durability. Engine only; never shown to the player |
| `schedule.json` | Hall of Fame Game, 48 preseason games, all 272 regular-season games, 13 playoff slots |
| `rules.json` | 2026 cap ($301.2M), minimum salaries, roster limits, league calendar, 2026 waiver order |
| `VALIDATION.md` | Checks against the real Week 1 rosters, team cap totals and schedule |

To rebuild:

```
pip install -r pipeline/requirements.txt
python pipeline/build_league.py            # uses cached downloads
python pipeline/build_league.py --refresh  # re-downloads everything
```

### Historical packs

`data/packs/<year>.json.gz` (2011-2025, 350-690 KB each) are built by
`python pipeline/history_pack.py 2011 2025`, which reruns the league pipeline
with `NFL_SEASON` set: rosters and contracts as signed by that season, stats
from the three seasons before it, the real schedule and playoff field, the
cap and minimum salaries, real head coaches with generated assistants.

### How the camp rosters are rebuilt

nflverse has no preseason roster snapshot. Its Regular Season Week 1 snapshot
does list every player released at final cutdown, so camp roster = that
snapshot minus players who retired. Players cut earlier in camp are missing,
and players claimed or signed after cutdown show up on their new team, so
camps run 87-99 players instead of exactly 90.

### How the free agent pool is built

`pipeline/free_agents.py` takes players who played in 2025 but are on no 2026
roster, plus veterans who signed after Week 1 without having been in a camp
(they were available all summer). Players with retired status, a hand-entered
list of announced 2026 retirements, players 37 or older, and veterans who
didn't play in 2024 or 2025 are left out. They are rated with the camp
rosters on the same scale, without changing anyone else's rating.

### Known gaps

- Historical packs: through 2016 the weekly roster files list only each
  team's 53 and reserve lists at the first game, so those camps open with
  about 50 to 60 players instead of 90. Coordinators, general managers,
  position coaches and the preseason schedule are generated for those seasons,
  and dead money starts from the contracts alone.
- Dead money and adjusted caps are a team-level OverTheCap snapshot
  (`pipeline/team_cap_2026.py`), taken in October 2026.
- About a third of contracts have no year-by-year line in the data; their cap
  hit is estimated as the deal's APY.
- Agents, agencies and media outlets are made up. The 2027 cap is OverTheCap's
  projection (about $327M) until the league sets it in the game, within about
  1% of that.
- The offseason doesn't model retirements, Pro Bowl tiers for fifth-year
  options, or offer sheets from the owner's own team yet. The 2027
  compensatory picks are NFL.com's projection, hand-entered in
  `src/engine/draft.ts`; draft classes are generated per save.
- Hidden ratings come from snaps, production, contract value and draft slot;
  traits add combine results and per-skill stats. The engine is calibrated to
  real league averages (`npx vite-node tests/calibrate.ts 4`).
- Staff (`pipeline/staff_2026.py`) is hand-entered: real HCs, OCs, DCs, STCs and
  GMs with their schemes and play callers. Some birth years are estimates.
  Trainers and scouting directors are generated. Position coaches
  (`pipeline/position_coaches_2026.py`, from the team sites and staff
  announcements) are real for all but about a dozen rooms; former players among
  them record the teams they played for.

Real names and teams are used for a private game. A public release would need
NFL and NFLPA licensing or a fictional league.
