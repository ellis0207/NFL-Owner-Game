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

Every game is simulated play by play, with box scores and per-game stats for
preseason, regular season and playoffs, plus season totals and league leaders.
Each team has its real 2026 head coach, coordinators, special teams coach and
GM, running their real-life schemes. How well a player's traits fit those
schemes changes how that player performs (in the engine, not on screen). Play callers,
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
neighboring positions. Cash is tracked apart from the cap.

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
(three 2027 first-rounders start out already traded, as in real life). The
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

Later: CBA talks, relocation and new stadiums, and difficulty settings.

## Playing locally

```
npm install
npm run dev     # http://localhost:5173
npm test        # engine tests, including three full simulated seasons
npm run build   # dist/index.html (single file) and dist/game.html (claude.ai page)
```

## Code layout

- `src/engine/` game rules with no UI: cap math, roster moves, calendar, game sim, standings and playoffs.
  `HIDDEN_RATINGS` is only read here. Contracts live in `contracts.ts` (deal model and cap rules),
  `market.ts` (prices, tags, tenders), `agents.ts`, `negotiation.ts`, `grades.ts` and `finance.ts`.
  The offseason calendar, tags, tenders, options and cap work are in `offseason.ts`; the free
  agent market is `freeagency.ts`; trades and draft pick ownership are `trades.ts`; the draft, mocks and the combine are `draft.ts`.
  The outlets are `outlets.ts`, daily coverage is `media.ts`, and press questions and their hidden effects are `press.ts`.
  The business side is `business.ts`, with every stadium's ownership and lease in `stadiums.ts`.
  The spring program (OTAs, minicamp, offseason injuries) is `spring.ts`, camp battles and the coaches'
  practice reads are `camp.ts`, and suspensions, fines and the owner's discipline calls are `discipline.ts`.
  Playing rules and the change catalog are `rules.ts`; owner relations, the league meeting and votes are `owners.ts`.
  Local sponsors and radio/TV deals are `commerce.ts`, stadium and facility projects `projects.ts`, and offseason grades, fan expectations and storylines `review.ts`.
- `src/ui/` React screens.
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
  Trainers and scouting directors are generated.

Real names and teams are used for a private game. A public release would need
NFL and NFLPA licensing or a fictional league.
