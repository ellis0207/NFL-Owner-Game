// The words for season narratives (media/narratives.ts): award ladders, the
// playoff picture, clinchings and eliminations, the deadline countdown, draft
// stock, anniversaries and sagas, draft classes years on, milestone and
// record watches, retrospectives, the league's year in review and tributes.
// Slots are listed with each kind.
import { always, on, type AngleDef, type FamilyContent } from "../angles";
import type { FormatId } from "../formats";

type Words = { head: string[]; take: string[]; para: string[] };

const OURS: AngleDef = {
  id: "ours", when: on("ours", 0.3),
  head: ["What it means for the {US.nick}"],
  take: ["The {US.nick} are part of this story"],
  para: ["For the {US.nick}, [this one is personal|it's the conversation in the building this week|it's the talk of the city]."],
};

function kind(formats: FormatId[], lede: FamilyContent["lede"], details: string[], plain: Words, extra: (AngleDef | [string, number, Words])[] = []): FamilyContent {
  return {
    family: "season",
    formats,
    lede,
    details,
    angles: [
      { id: "plain", when: always(0.6), ...plain },
      ...extra.map((a) => (Array.isArray(a) ? { id: a[0], when: on(a[0], a[1]), ...a[2] } : a)),
      OURS,
    ],
  };
}

export const SEASON_CONTENT: Record<string, FamilyContent> = {
  // P (leader), Q (a climber), W (last week's leader), award, short, week, list.
  award: kind(["column", "analytics", "hottake", "feature", "notebook"], {
    opinion: ["{@open.column} Week {week}, and the {award} race looks like this: {list}."],
    analysis: ["Our {short} ladder after week {week}: {list}."],
    feature: ["Every week, the {award} conversation changes a little. After week {week}, it reads: {list}."],
    beat: ["{P.name} is in the {short} conversation, and the locker room has noticed. The ladder after week {week}: {list}."],
  }, ["<P.line?{P.name} this season: {P.line}.>", "The voters decide in February. [A lot can change.|There's plenty of football left.|Nobody's locking anything in yet.]"], {
    head: ["{short} ladder, week {week}: {P.name} on top", "{short} watch: {P.name} leads the field", "The {short} race after week {week}"],
    take: ["{P.name} is the {short} right now. Here's why", "The {short} is {last:P.name}'s to lose"],
    para: ["{P.name} sits first, and the case is [simple|in the numbers|the film and the record together]."],
  }, [
    ["newLeader", 3, { head: ["New {short} favorite: {P.name} passes {W.name}", "{P.name} takes over the {short} race"], take: ["{W.name} had his moment. It's {last:P.name}'s race now"], para: ["{W.name} led the ladder a week ago. {P.name} [took the spot with another big game|climbed past him while he cooled off|is the name voters are saying now]."] }],
    ["holds", 1.2, { head: ["{P.name} stays atop the {short} ladder", "Still {P.name}: the {short} race, week {week}"], take: ["Nobody is catching {P.name}"], para: ["{P.name} [stays first for another week|keeps the top spot|has not given anyone an opening]."] }],
    ["climber", 2, { head: ["{Q.name} storms up the {short} ladder", "Climbing: {Q.name} enters the {short} race"], take: ["Don't sleep on {Q.name}"], para: ["The mover this week is {Q.name}, [who climbed into the conversation|who's playing his way onto ballots|who nobody had on this list a month ago]."] }],
    ["rookie", 1.5, { head: ["Rookie watch: {P.name} leads the {short} race"], take: ["{P.name} doesn't play like a rookie"], para: ["Rookies aren't supposed to be this ready. {P.name} [is|looks it every Sunday|has been from the first snap]."] }],
    ["late", 1.5, { head: ["Down the stretch: {P.name}'s {short} case"], take: ["The {short} will be decided in the next few weeks"], para: ["With the season winding down, every game is a ballot. {P.name} [has the inside track|can't afford a bad week|controls this race]."] }],
  ]),

  // T (division champion), div.
  clinch: kind(["report", "column", "notebook", "feature"], {
    news: ["The {T.full} clinched the {div} title."],
    opinion: ["{@open.column} The {T.nick} have won the {div}."],
    beat: ["It's official: the {T.nick} are {div} champions."],
    feature: ["Division titles don't come with trophies people remember, but they come with home playoff games. The {T.nick} have one."],
  }, ["<T.rec?They are {T.rec}.>", "[A home playoff game is guaranteed.|The {T.nick} will host in January.]"], {
    head: ["{T.nick} clinch the {div}", "Division champions: the {T.nick}", "The {T.nick} wrap up the {div}"],
    take: ["The {T.nick} earned this one", "A division title is the start, not the goal, for the {T.nick}"],
    para: ["The {T.nick} [put the division away|left no doubt|made it official], and now the question is seeding."],
  }),

  // T (eliminated club); early.
  eliminated: kind(["report", "column", "hottake", "notebook"], {
    news: ["The {T.full} were eliminated from playoff contention."],
    opinion: ["{@open.column} The {T.nick} are out."],
    beat: ["The math finally caught up with the {T.nick}: they can't make the playoffs."],
  }, ["<T.rec?They are {T.rec}.>", "[The rest of the season is about next year.|Draft position starts to matter now.|Evaluations start today.]"], {
    head: ["The {T.nick} are eliminated", "{T.nick} officially out of the playoff race", "No January for the {T.nick}"],
    take: ["The {T.nick} have to be honest about what went wrong", "What the {T.nick} play for now"],
    para: ["The {T.nick} [are playing for pride and jobs|will spend the last weeks auditioning players|have nothing left to chase but next year]."],
  }, [
    ["early", 2, { head: ["Out already: the {T.nick}' season is over in all but name"], take: ["It's too early to be out. The {T.nick} are"], para: ["Being eliminated this early [says a lot about the roster|puts every job in the building on the table|is the worst kind of clarity]."] }],
  ]),

  // conf, line, left, T (top seed), X (last team in), Y (first team out), bubble.
  playoffs: kind(["analytics", "column", "hottake", "feature"], {
    analysis: ["If the season ended today in the {conf}: {line}."],
    opinion: ["{@open.column} The {conf} picture: {line}."],
    feature: ["With {left} game{s:left} left, the {conf} playoff picture looks like this: {line}."],
  }, ["The bubble: {bubble}.", "<Y?The {Y.nick} are the first team out<Y.rec? at {Y.rec}>.>"], {
    head: ["{conf} playoff picture: {T.nick} on top", "If the season ended today: the {conf}", "The {conf} race with {left} to play"],
    take: ["The {conf} race is wide open below the {T.nick}", "Who's for real in the {conf}"],
    para: ["The {T.nick} hold the top seed<T.rec? at {T.rec}>. <X?The {X.nick} hold the last spot.>"],
  }, [
    ["late", 2, { head: ["Playoff scenarios: what's at stake in the {conf}"], take: ["Every game is a playoff game now"], para: ["[Tiebreakers are about to matter.|Scoreboard watching starts now.|Somebody good is going to be left out.] <Y?The {Y.nick} need help.>"] }],
    ["final", 3, { head: ["The final weekend: the {conf} comes down to this"], take: ["One week, everything on the line"], para: ["One game left. <X?The {X.nick} control their own fate for the last spot.> <Y?The {Y.nick} need a win and some help.>"] }],
  ]),

  // days, T (best record), X (worst), buyers, sellers; today, eve, buyer, seller.
  deadline: kind(["report", "column", "hottake", "analytics", "notebook"], {
    news: ["<tag.today?It's trade deadline day.><!tag.today?The trade deadline is {days} day{s:days} away.>"],
    opinion: ["{@open.column} <tag.today?The deadline is today.><!tag.today?{days} day{s:days} to the deadline.>"],
    analysis: ["<tag.today?Deadline day.><!tag.today?T-minus {days} day{s:days}.> Buyers by record: {buyers}. Sellers: {sellers}."],
    beat: ["<tag.today?The phones are busy today.><!tag.today?The deadline is {days} day{s:days} out, and the phones are busy.>"],
  }, ["The likely buyers: {buyers}. The likely sellers: {sellers}."], {
    head: ["<tag.today?Deadline day: what to watch><!tag.today?Trade deadline countdown: {days} day{s:days}>", "<tag.today?The deadline is here><!tag.today?{days} day{s:days} to the deadline: who's buying, who's selling>"],
    take: ["The {T.nick} should be aggressive", "The {X.nick} have to sell. Now"],
    para: ["The {T.nick} [have the best record and the most reason to push|are the team everyone expects to make a move]. The {X.nick} [should be taking calls on everyone|have veterans somebody wants]."],
  }, [
    ["eve", 2, { head: ["The night before the deadline"], take: ["Tomorrow decides a lot of seasons"], para: ["Most deals get done in the last [few hours|day|night]. Expect the phones to run late."] }],
    ["buyer", 2, { head: ["The {US.nick} at the deadline: buyers"], take: ["The {US.nick} can't stand still"], para: ["The {US.nick} are among the teams with the best records, and [fans want a move|a contender adds|the window is now]."] }],
    ["seller", 2, { head: ["The {US.nick} at the deadline: sellers"], take: ["The {US.nick} should sell, and they know it"], para: ["The {US.nick} are near the bottom, and [veterans are worth more to contenders|the future matters more than November|a sale is the honest move]."] }],
  ]),

  // D (prospect: name, pos, school), now, was, analyst, outlet; rise, fall, firstRound, gone, top10, fromNowhere.
  stock: kind(["column", "analytics", "feature"], {
    opinion: ["{@open.column} {D.name}'s stock is <tag.rise?climbing><!tag.rise?sliding>."],
    analysis: ["In {analyst}'s new mock, {D.pos} {D.name} of {D.school} <tag.gone?fell out of the top 64><!tag.gone?goes No. {now}><tag.fromNowhere?, after going unmentioned in the last one><!tag.fromNowhere?, after No. {was} in the last one>."],
    feature: ["Draft season is a stock market. This week, {D.name} of {D.school} is <tag.rise?up><!tag.rise?down>."],
  }, ["<tag.firstRound?He projects in the first round now.><!tag.firstRound?He projects on day two for now.>"], {
    head: ["<tag.rise?Stock up><!tag.rise?Stock down>: {D.pos} {D.name}, {D.school}", "<tag.rise?Rising><!tag.rise?Falling>: {D.name}"],
    take: ["<tag.rise?Believe the {D.name} hype><!tag.rise?Don't overreact to {D.name}'s slide>"],
    para: ["<tag.rise?Scouts are [talking about|warming to|circling back on] {D.name}.><!tag.rise?Scouts have [questions about|cooled on|second thoughts about] {D.name}.>"],
  }, [
    ["top10", 2, { head: ["{D.name} is a top-10 pick now"], take: ["{D.name} belongs in the top 10"], para: ["A top-10 grade changes everything: [the visits|the money|the expectations]."] }],
    ["gone", 2, { head: ["{D.name} drops out of the first round"], take: ["Somebody will get a steal in {D.name}"], para: ["Falling out of the first two rounds of a mock [happens|isn't the end|usually means a question about the medicals or the tape]."] }],
  ]),

  // T, years, headline, then; round, long.
  anniversary: kind(["notebook", "feature", "column"], {
    beat: ["{years} year{s:years} ago today: {headline}."],
    feature: ["On this date {years} year{s:years} ago, the headline read: {headline}."],
    opinion: ["{@open.column} {years} year{s:years} ago today: {headline}."],
  }, ["[Plenty has changed since.|Some of it still matters.|Fans of a certain age remember.]"], {
    head: ["{years} year{s:years} ago today: {headline}", "On this date: {headline}", "Looking back {years} year{s:years}: {headline}"],
    take: ["Looking back on {headline}"],
    para: ["[It's worth remembering how that went.|Hindsight is kinder to some of it than others.|Funny how things turn out.]"],
  }, [
    ["long", 2, { head: ["From the archives, {years} years ago: {headline}"], take: ["{years} years later, it still matters"], para: ["A lot of today's {T.nick} fans weren't around for it. [The older ones remember.|It shaped what came next.]"] }],
  ]),

  // T, years, title; fresh.
  saga: kind(["notebook", "column", "feature"], {
    beat: ["{years} year{s:years} ago: {title}."],
    opinion: ["{@open.column} {title}. That was {years} year{s:years} ago."],
    feature: ["It has been {years} year{s:years}: {title}."],
  }, ["It still comes up on the radio and in the stands."], {
    head: ["{years} year{s:years} later: {title}"],
    take: ["{years} year{s:years} on, {title} still matters"],
    para: ["<tag.fresh?For a lot of fans it's still fresh.><!tag.fresh?Time has softened some of it.>"],
  }),

  // years, year, P (the best of the class), Q (the first pick, if someone else), pb, size; firstWasBest, hasFirst.
  draftclass: kind(["feature", "column"], {
    feature: ["The {year} draft opened {years} years ago. Its first round has aged into a story of its own."],
    opinion: ["{@open.column} Re-draft the {year} first round, and {P.name} goes first."],
  }, ["<Q?{Q.name} went first overall that year.>"], {
    head: ["{years} years later: the {year} draft class", "Re-drafting {year}: {P.name} goes first", "The {year} first round, {years} years on"],
    take: ["{P.name} was the best of the {year} class"],
    para: ["{P.name}, taken as {P.draft}, [turned into the best player of the class|outplayed nearly everyone picked ahead of him|aged best of all of them]<tag.firstWasBest?, and he went first for a reason>."],
  }),

  // P, T, mark, now, need, what, holder; close.
  milestone: kind(["notebook", "report", "analytics"], {
    news: ["{P.name} is {need} away from {mark} career {what}."],
    analysis: ["Milestone watch: {P.name} has {now} career {what}, {need} short of {mark}."],
    beat: ["{P.name} is {need} away from {mark} career {what}, and his teammates know it."],
  }, ["<P.line?This season: {P.line}.>"], {
    head: ["Milestone watch: {P.name} closes in on {mark} {what}", "{P.name} nears {mark} career {what}"],
    take: ["{P.name}'s career deserves the moment"],
    para: ["{mark} career {what} [is a number very few reach|puts him in rare company|will be on his plaque if he gets there]."],
  }),

  // P, T, mark, now, need, what, holder; close.
  recordwatch: kind(["report", "column", "feature", "analytics"], {
    news: ["{P.name} is {need} {what} from passing {holder}'s career record of {mark}."],
    opinion: ["{@open.column} {holder}'s record is in danger."],
    analysis: ["{P.name}: {now} career {what}. {holder}'s record: {mark}."],
    feature: ["Some records feel permanent. {holder}'s {mark} career {what} was one of them. {P.name} is {need} away."],
  }, ["<P.line?This season: {P.line}.>"], {
    head: ["Record watch: {P.name} chases {holder}", "{P.name} closes in on the career {what} record"],
    take: ["Appreciate {P.name} while you can"],
    para: ["Passing {holder} would put {P.name} [alone at the top|in the record book for good|in every conversation about the greatest ever]."],
  }, [
    ["close", 3, { head: ["{P.name} could break {holder}'s record this week"], take: ["History this weekend"], para: ["The league is [sending people|getting ready|watching]: it could happen Sunday."] }],
  ]),

  // T, P (the club's best season), season; champion, runnerUp, playoffs, beat, fell, bad, good.
  retro: kind(["column", "feature", "notebook", "hottake"], {
    opinion: ["{@open.column} The {T.nick}' {season} season is over<T.rec? at {T.rec}>."],
    feature: ["Every season tells a story. The {T.nick}' {season} told this one."],
    beat: ["The {T.nick} are done for {season}. A look back."],
  }, ["<P?The season's best: {P.name}<P.line? ({P.line})>.>"], {
    head: ["The {T.nick}' {season} season in review", "Looking back: the {T.nick} in {season}", "Grading the {T.nick}' {season}"],
    take: ["What the {T.nick} learned in {season}", "The {T.nick}' season, honestly"],
    para: ["[It was a season of|There were|The {T.nick} had] [ups and downs|lessons|moments worth keeping and some worth forgetting]."],
  }, [
    ["champion", 6, { head: ["Champions: the {T.nick}' {season} season in review"], take: ["The {T.nick} built a champion. Here's how"], para: ["The {T.nick} won it all. [Every decision looks right now.|This one goes on the wall forever.|The parade route is set.]"] }],
    ["runnerUp", 3, { head: ["So close: the {T.nick}' {season}"], take: ["The {T.nick} were one game short"], para: ["The {T.nick} reached the Super Bowl and lost it. [That stings for a long time.|The window is open.|Nobody remembers who finished second, and that's the problem.]"] }],
    ["beat", 2, { head: ["The {T.nick} beat every expectation in {season}"], take: ["Nobody saw the {T.nick} coming"], para: ["The {T.nick} were picked lower than this, and [proved it wrong|outplayed the forecast|gave their fans a better year than promised]."] }],
    ["fell", 2, { head: ["Where it went wrong for the {T.nick} in {season}"], take: ["The {T.nick}' season was a failure"], para: ["The {T.nick} [expected more|fell short of the summer's hopes|have some explaining to do]. Changes may follow."] }],
    ["bad", 1.5, { head: ["The {T.nick}' lost season"], take: ["The {T.nick} need more than a tweak"], para: ["There isn't much to keep from this one, [other than a high draft pick|except a lesson|besides a few young players]."] }],
  ]),

  // T (champion), X (runner-up), P (MVP), season; repeat.
  yearinreview: kind(["feature", "column", "report"], {
    feature: ["The {season} season belongs to the {T.full}."],
    opinion: ["{@open.column} The {season} season is in the books."],
    news: ["The {T.full} are the {season} champions, having beaten the {X.full} in the Super Bowl."],
  }, ["<P?{P.name} was the league's Most Valuable Player.>"], {
    head: ["The {season} season in review", "{season}: the year in the NFL", "The {T.nick}' year: looking back at {season}"],
    take: ["What {season} taught us about the league"],
    para: ["The {T.nick} beat the {X.nick} for the title, and [the rest of the league is already chasing them|it felt earned|nobody can say they didn't deserve it]."],
  }, [
    ["repeat", 4, { head: ["Back to back: the {T.nick} own {season} too"], take: ["The {T.nick} are a dynasty now"], para: ["Two straight titles. [The league hasn't seen this in a while.|Everyone else is chasing.]"] }],
  ]),

  // P, T (last club), seasons, pb, ap, rings, from, to, clubs; legend, oneTeam, ring, honored.
  tribute: kind(["feature", "column", "report", "notebook"], {
    feature: ["{P.name} played {seasons} season{s:seasons}, from {from} to {to}."],
    opinion: ["{@open.column} {P.name} retired, and the league is poorer for it."],
    news: ["{P.pos} {P.name} has retired after {seasons} season{s:seasons}."],
    beat: ["{P.name} is retiring, and the building will feel different without him."],
  }, ["<tag.honored?He made {pb} Pro Bowl{s:pb}<tag.ring? and won {rings} title{s:rings}>.><!tag.honored?He played {seasons} season{s:seasons} for {clubs} club{s:clubs}.>"], {
    head: ["{P.name} retires after {seasons} season{s:seasons}", "Thank you, {P.name}", "{P.name} calls it a career"],
    take: ["{P.name} did it the right way", "What {P.name} meant to the game"],
    para: ["{P.name} [was the kind of player teammates trust|showed up every week|outlasted almost everyone he came in with]."],
  }, [
    ["legend", 4, { head: ["A legend says goodbye: {P.name} retires", "{P.name}, one of the greats, retires", "The end of the {P.name} era"], take: ["{P.name} is one of the best ever. Say it plainly"], para: ["Canton will call. [Nobody doubts it.|It's a question of when.|The only debate is first ballot or not.] {P.name} was one of the best of his time."] }],
    ["oneTeam", 2, { head: ["<T?{P.name} retires a {T.nick}, start to finish><!T?One club, one career: {P.name}>"], take: ["One team, whole career: {P.name}"], para: ["{P.name} played his whole career for one club, which [hardly happens anymore|fans there will never forget|makes him one of their own]."] }],
  ]),
};
