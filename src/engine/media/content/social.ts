// The words for the Huddle, the league's made-up social platform: fan voices
// by archetype, players' own posts, reporters breaking news and the clubs'
// official accounts. Templates use the story grammar. Slots: T (the poster's
// club), O (the other club, a nickname), P (a player), score, rec, text.
import type { Bank } from "../grammar";

/** The kinds of fan accounts every club has, with the words their handles are built from. */
export const ARCHETYPES = ["diehard", "homer", "doomer", "numbers", "casual", "oldtimer", "troll", "draftnik"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const HANDLE: Record<Archetype, { pre: string[]; post: string[] }> = {
  diehard: { pre: ["Diehard", "Bleed", "Forever", "Lifer", "TrueBlue", "Ride4"], post: ["", "Nation", "4Life", "Fan"] },
  homer: { pre: ["Believe", "AllIn", "Go", "WeReady", "Faithful"], post: ["", "Always", "Szn", "Up"] },
  doomer: { pre: ["Suffering", "SameOld", "Pain", "WhyDoICare", "Cursed"], post: ["", "Fan", "Again", "Forever"] },
  numbers: { pre: ["CapSheet", "EPAper", "Analytics", "WinProb", "Stats"], post: ["Guy", "Nerd", "Talk", ""] },
  casual: { pre: ["Sunday", "Tailgate", "GameDay", "Weekend", "Couch"], post: ["Mom", "Dad", "Vibes", "Crew"] },
  oldtimer: { pre: ["OldSchool", "BackInMyDay", "Since1979", "Grandpa", "Classic"], post: ["", "Ball", "Fan"] },
  troll: { pre: ["Roasting", "LOL", "Clown", "Fraudulent", "Ratio"], post: ["", "Bot", "Daily", "Watch"] },
  draftnik: { pre: ["MockDraft", "BigBoard", "DraftSzn", "Prospect", "Tape"], post: ["Junkie", "Guy", "Talk", ""] },
};

/** Fan posts by archetype and mood: good (the club's news is good), bad, or chatter. */
export const FAN: Record<Archetype, { good: string[]; bad: string[]; chat: string[] }> = {
  diehard: {
    good: ["LET'S GO {cap:T.nick}!!! [This team is different|I've waited all year for this|Never doubted them]", "<P?{P.name} is HIM.><!P?That's my team.> [Run it back|What a day to be a {T.nick} fan|Goosebumps]"],
    bad: ["I'll be back next week. I always am. [It still hurts|Pain|Why do we do this]", "[Rough one|Brutal|Gut punch]. Still {T.nick} til I die."],
    chat: ["<T.rec?{T.rec} and I'm still all in on the {T.nick}.><!T.rec?Counting the days until {T.nick} football.>", "Wearing my {T.nick} gear to work [again|all week|no matter what]."],
  },
  homer: {
    good: ["[Told you|Called it|Who doubted us?]. The {T.nick} are [for real|going all the way|the best team nobody talks about].", "<P?{P.name} for MVP. I said what I said.><!P?Super Bowl. Book it.>"],
    bad: ["[One game|One bad day|A blip]. The {T.nick} are still [the best team in the division|fine|going to the playoffs].", "Refs. That's the post."],
    chat: ["Name a better team than the {T.nick}. [I'll wait|You can't|Exactly]", "The {T.nick} [are going to surprise people|have the best roster in years|are a lock for January]."],
  },
  doomer: {
    good: ["Nice win. [Watch them blow it next week|Don't get used to it|Here comes the letdown].", "<P?Enjoy {P.name} while it lasts.><!P?Every good day is a setup for a worse one.>"],
    bad: ["[Same old {T.nick}|Of course|Every single year]. [Wake me up in April|Draft pick szn|I'm not even mad anymore].", "<T.rec?{T.rec}.><!T.rec?Here we go again.> [Sell everything|Blow it up|Fire everyone]."],
    chat: ["The {T.nick} will find a way to [ruin this|disappoint me|let me down]. They always do.", "Remind me why I'm a {T.nick} fan. [Genuinely asking|Anyone?]"],
  },
  numbers: {
    good: ["[Process over results|Good process|The underlying numbers back it up]: <P?{P.name}'s efficiency is real.><!P?the {T.nick} earned that one.>", "Win probability chart for the {T.nick} [looks great|was a thing of beauty|tells you everything]."],
    bad: ["[The fourth-down calls cost them|Turnover luck ran out|Regression came for them]. Run the numbers.", "Expected points say the {T.nick} [weren't as bad as it looked|got outplayed|left points on the field]."],
    chat: ["<T.rec?At {T.rec}, the {T.nick}' point differential says [more|less|about the same].><!T.rec?Projecting the {T.nick}' win total: [8.5|9.5|7.5].>", "Cap math for the {T.nick} next year [is tight|works|is a problem]."],
  },
  casual: {
    good: ["[Great day at the game with the kids|Wings and a win|Perfect Sunday]! Go {T.nick}!", "Love this team. <P?{P.name} is fun to watch!><!P?What a day.>"],
    bad: ["[At least the tailgate was fun|Tough one|Oh well]. Same time next week.", "Not our day. Still love the {T.nick}."],
    chat: ["Anyone going to the {T.nick} game this week? [Need a ride|Tailgate plans?|Bringing the kids]", "New {T.nick} jersey came in the mail today!"],
  },
  oldtimer: {
    good: ["[Run the ball, stop the run|That's football|Reminds me of the good teams]. Good win, {T.nick}.", "<P?{P.name} plays the game the right way.><!P?Old-fashioned football. Love to see it.>"],
    bad: ["In my day they'd have [run it on third and short|kicked the field goal|tackled somebody].", "Too many penalties, not enough football. [Sad to watch|Fundamentals]."],
    chat: ["Been watching the {T.nick} since before most of you were born. [Patience|Seen worse|This too shall pass].", "The game was better [when you could hit|before all the analytics|with real grass]."],
  },
  troll: {
    good: ["Even the {T.nick} win sometimes. [Cute|Enjoy it|Rare W]", "The {T.nick} beat {O}? [League is a joke|I'm moving to another sport|lol]"],
    bad: ["[Same old {T.nick}|lol|Ratio + {T.nick} lost]", "<T.rec?{T.rec} lmao.><!T.rec?The {T.nick} lol.> [Frauds|Never forget|Pack it up]"],
    chat: ["Reminder that the {T.nick} [haven't won anything|are frauds|will lose next week].", "{T.nick} fans are the most delusional fans in the league. [Fact|Sorry not sorry]"],
  },
  draftnik: {
    good: ["Good win, but [this hurts our draft slot|I was eyeing a top-10 pick|there goes the tank]", "<P?{P.name} looks like the player I mocked to us.><!P?The {T.nick} drafted well. Receipts.>"],
    bad: ["Every loss is a better pick. [Big board updated|Mock draft 4.0 incoming|Thinking QB]", "The {T.nick} need [a corner|an edge rusher|a quarterback|tackles] in April. [Badly|Desperately]"],
    chat: ["Way too early {T.nick} mock: [quarterback|edge rusher|corner|tackle] in round one.", "Who's watching the college games for {T.nick} draft targets?"],
  },
};

/** What fans say about a kind of news, by mood, before their own voice is added. */
export const NEWS_TAKE: Record<string, { good: string[]; bad: string[] }> = {
  signing: { good: ["Welcome to {T.city}, {P.name}!", "Signing {P.name} is [a win|exactly what we needed|huge]."], bad: ["{total} for {P.name}? [Overpaid|Yikes|Hope it works]."] },
  release: { good: ["Releasing {P.name} was the right call."], bad: ["Cutting {P.name}? [Why|Bad move|Didn't see that coming]."] },
  claim: { good: ["Nice pickup: {P.name} off waivers."], bad: ["Who is {P.name}?"] },
  injury: { good: ["Get well, {P.name}."], bad: ["Losing {P.name} [hurts|is brutal|changes everything]. [Next man up|Heal up]."] },
  trade: { good: ["Love the trade.", "Great deal for the {T.nick}."], bad: ["Who approved this trade?", "We got fleeced."] },
  seat: { good: ["Time for a change."], bad: ["{T.coach} has to go.", "Fire {T.coach}. [Today|Yesterday]."] },
  arc: { good: ["This storyline is getting good."], bad: ["I'm tired of this story."] },
  season: { good: ["What a season."], bad: ["Long season."] },
};

/** Players' own posts. */
export const PLAYER: Record<string, string[]> = {
  win: ["W. [On to the next|Big team win|We keep going]. <T?#{T.nick}>", "[God is good|Grateful|Blessed]. Love my brothers.", "Told y'all. [Locked in|Different breed|Just getting started]."],
  big: ["[Just doing my job|All glory to my teammates|Thank the O-line]. <score?{score}.>", "[They kept talking|Quiet confidence|Let the tape talk]."],
  signed: ["[Home|New chapter|Let's work], {T.city}.", "[Blessed|Grateful] to be a {T.nick}. [Let's get it|Can't wait]."],
  extended: ["[Not going anywhere|Home for a long time|Where I belong]. {T.city} 🤝", "Thank you to the {T.nick} for believing in me."],
  hurt: ["[I'll be back stronger|Setback, then comeback|Not done yet]. 🙏", "Thank you for all the messages. [See you soon|Back better than ever]."],
  cryptic: ["[Loyalty is a one-way street|Some things you just outgrow|Time for a new chapter|Know your worth]", "👀", "[Interesting week|Prayers for clarity|Business is business]."],
  trash: ["Same result next time, {O}.", "[Y'all talked all week|Quiet now?|Scoreboard]. {O}.", "{O} fans [real quiet|in shambles] right now."],
  retired: ["[Thank you, football|What a ride|Forever grateful]. [Chapter closed|Time for the next one].", "To everyone who believed in me: thank you. {T.city} forever."],
};

/** Reporters break the news: the alert in their own words. */
export const ALERT: Record<string, string[]> = {
  signing: ["[BREAKING|Sources]: The {T.full} are signing {P.pos} {P.name}: {yearsWord} years, {total}.", "{P.name} agrees to terms with the {T.nick}, per sources. {yearsWord} years, {total}."],
  release: ["The {T.nick} are releasing {P.pos} {P.name}, per sources.", "[Sources|Told]: {P.name} is being released by the {T.nick}."],
  claim: ["The {T.nick} have claimed {P.pos} {P.name} off waivers.", "Waiver claim: {P.name} to the {T.nick}."],
  injury: ["{T.nick} {P.pos} {P.name} is expected to miss {span} with {an:injury}, sources say.", "Injury update: {P.name} ({injury}) is out {span}, per sources."],
  trade: ["[BREAKING|Trade]: {head}.", "[Sources|Told]: {head}."],
  wire: ["{cap:text}.", "[Sources|Told]: {uncap:text}."],
};

/** Clubs' official accounts. */
export const CLUB: Record<string, string[]> = {
  signing: ["We've signed {P.pos} {P.name}. Welcome to {T.city}!", "Welcome, {P.name}. #{T.nick}"],
  win: ["{cap:T.nick} win! <score?{score}.> [On to the next one|What a game|Thank you, fans]."],
  loss: ["Final. <score?{score}.> Back to work."],
};

export const SOCIAL_BANK: Bank = {};
