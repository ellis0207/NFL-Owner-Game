// The words for the owner's own dealings with the press (media/ownerdesk.ts):
// the questions reporters ask at a press conference or an interview, the four
// kinds of answer the owner can give, the owner's posts on the Huddle and the
// fans' replies, and the stories the media write about all of it. Question and
// answer slots: T (our club), P (a player), C (the head coach: name), title,
// label. Story slots: O (the owner: name, title), T, R (the reporter: name,
// outlet), quote, occasion, n, topics, head (a report's headline), topic.
import { always, on, type AngleDef, type FamilyContent } from "../angles";
import type { FormatId } from "../formats";
import type { OwnerTone } from "../../types";

/** What reporters ask, by topic. Arc topics use the storyline's kind. */
export const ASK: Record<string, string[]> = {
  opener: ["What does success look like for the {T.nick} this season?", "Is this a playoff team?", "What's the one thing that has to go right this year?"],
  endSeason: ["How do you judge this season<T.rec?, at {T.rec}>?", "What has to change before next season?", "Was this year a step forward?"],
  coachFuture: ["Is {C.name} your head coach next season?", "Does {C.name} have your full confidence?"],
  gmFuture: ["Will the front office look the same next year?"],
  firing: ["Why make the change now?", "What went wrong with the last staff?", "Who made the final call on the firing?"],
  search: ["What are you looking for in the next head coach?", "How long will the search take?"],
  hire: ["What convinced you {C.name} is the right coach?", "How much say will {C.name} have over the roster?", "What did {C.name} say in the interview that won you over?"],
  signing: ["Why was {P.name} worth the money?", "Where does {P.name} fit on this team?", "Did you sign off on the {P.name} contract yourself?"],
  record: ["The {T.nick} are {T.rec}. What's your read?", "Are you happy with where the team is right now?"],
  money: ["Will you spend whatever it takes to win?", "Is money going to hold this team back?"],
  fans: ["What do you say to fans who are paying more every year?", "What do you owe the fans this season?", "Are ticket prices going up again?"],
  culture: ["What kind of team do you want this to be?", "How involved are you in football decisions?"],
  hotSeat: ["How secure is {C.name}'s job?", "Is {C.name} coaching for the job the rest of the way?"],
  qbSwitch: ["Who is your quarterback?", "Did you have a say in the quarterback change?"],
  holdout: ["Will {P.name} be on the field this season?", "Are you willing to pay {P.name} what he wants?"],
  contractYear: ["Will {P.name} get an extension?", "Is {P.name} part of the long-term plan?"],
  tradeRequest: ["Will you trade {P.name}?", "Can this relationship with {P.name} be fixed?"],
  scandal: ["What's your response to the {P.name} suspension?", "Does {P.name} have a future here?"],
  stadium: ["Where do things stand on the stadium?", "Should the public help pay for a new building?"],
  relocation: ["Are the {T.nick} staying in {T.city}?", "Can you promise the fans this team won't move?"],
  sale: ["Are you selling the team?"],
  labor: ["Is there going to be a lockout?", "Where do the owners stand in the labor talks?"],
  winStreak: ["What's behind this run?", "How good can this team be?"],
  losingStreak: ["How do you stop the slide?", "Is anyone's job in danger after this stretch?"],
  unbeaten: ["Can this team go unbeaten?"],
  winless: ["Is this team as bad as the record says?", "Is this season a rebuild now?"],
  rookie: ["How good can {P.name} be?"],
  breakout: ["Is {P.name} a star, and will you pay him like one?"],
  comeback: ["What does {P.name}'s comeback mean to this team?"],
  injuries: ["How does this team survive all these injuries?", "Is something wrong with the training staff?"],
  faChase: ["Are you in on {P.name}?"],
  capCrunch: ["How do you get under the cap without gutting the roster?"],
  topPick: ["Is this team playing for the top pick?"],
  division: ["How big are the next few weeks in the division race?"],
  lastRide: ["Is this {P.name}'s last season?"],
  feud: ["Are your coach and general manager on the same page?"],
  question: ["{title}"],
  promise: ["Are you keeping your promise: {title}?"],
  plain: ["What's your read on the {label} story?"],
};

type Answers = Partial<Record<OwnerTone, string[]>>;

/** How the owner can answer, by tone; a topic's own words come first and the general ones fill in. */
export const ANSWER: Record<string, Answers> = {
  general: {
    candid: ["[Honestly|To be straight with you], [we haven't been good enough|there's work to do|I'm not satisfied]. [That's on all of us|I own that|We'll fix it].", "[I won't sugarcoat it|I'll tell you the truth]: [we have to be better|it's been a hard stretch|we made mistakes]."],
    confident: ["[I believe in this group|We're going to be fine|Watch us]. [Mark my words|You'll see|Write that down].", "[This team is better than people think|We're right where we want to be|Good things are coming]."],
    deflect: ["[We'll see|It's too early to say|I'm not going to get into that]. [We take it a day at a time|Our focus is on the next game].", "[That's a football question|I leave that to the people I hired|I'll let the work speak]."],
    defiant: ["[I don't care what people outside think|Nobody in this building listens to the noise|The critics can say what they want]. [We know who we are|Our people know better].", "[You've been wrong about us before|Keep writing it|We'll see who's right in January]."],
  },
  player: {
    candid: ["[{P.name} has been good for us|We like {P.name}], and [we'll see where it goes|there's more to do|the rest is up to him]."],
    confident: ["{P.name} [is a big part of what we're building|is going to be here a long time|is one of the best at what he does]."],
    deflect: ["[I'll let {P.name}'s play speak|You'd have to ask the coaches about {P.name}|I don't talk about individual players]."],
    defiant: ["[People have doubted {P.name} before|Nobody here worries about {P.name}|{P.name} doesn't need my defense]."],
  },
  money: {
    candid: ["[We spend where it makes sense|There's a budget like anywhere else|We'll spend, but not foolishly]."],
    confident: ["[Whatever it takes|Money won't be what holds us back|Every dollar goes into winning]."],
    deflect: ["[I don't talk about the budget|That's between me and the front office|We'll see what the market looks like]."],
    defiant: ["[It's my money, and I'll spend it how I see fit|Nobody spends more than we do|Ask the other owners that question]."],
  },
  fans: {
    candid: ["[I know it's expensive|Our fans deserve better than they've gotten|I hear the complaints], and [I take it seriously|we have to earn it]."],
    confident: ["[Our fans are going to love this team|We'll give them something to cheer|It'll be worth every dollar]."],
    deflect: ["[We're always looking at the fan experience|Ticket prices are set by the business side]."],
    defiant: ["[We have a waiting list|Every seat is spoken for|The fans keep coming, so we must be doing something right]."],
  },
  culture: {
    candid: ["[I stay out of football decisions|I ask questions, but the football people decide|I'm involved, maybe more than I should be]."],
    confident: ["[A team that wins and wins the right way|Tough, smart and together|The best organization in football]."],
  },
  record: {
    candid: ["[It's not where we want to be|We've left games on the table|The record is about right, and that's the problem]."],
    confident: ["[We're better than this record|The best football is ahead of us|We'll be in the hunt]."],
  },
  opener: {
    candid: ["[Make the playoffs|Win more than we lose|Be better than last year]. Anything less and I'll be disappointed."],
    confident: ["[We're going to win the division|This is a playoff team|We're playing in January]. I'll say it now."],
    defiant: ["[Nobody picked us|Everyone's sleeping on us|Let them pick against us]. Good."],
  },
  endSeason: {
    candid: ["[It wasn't good enough|We fell short|I expected more]. [Nobody is safe from a hard look, me included|Everything is on the table]."],
    confident: ["[We're closer than the record says|Next year is going to be different|The foundation is there]."],
  },
  coachFuture: {
    candid: ["We'll [evaluate everything|talk after the season|look at the whole operation]. That includes {C.name}."],
    confident: ["{C.name} is our coach. [Period|End of story|Full stop]."],
    deflect: ["[Those conversations stay in house|I don't do those talks in public|We'll talk about it when the season's over]."],
  },
  hotSeat: {
    candid: ["[Results matter|Everyone is judged on results], and {C.name} knows that."],
    confident: ["{C.name} [isn't going anywhere|has my full support|is the right coach for this team]."],
  },
  firing: {
    candid: ["[It wasn't working|We weren't getting better|I had to make a hard call]. [It's on me to get the next one right|I own it]."],
    confident: ["[This was the right decision|We'll find the right person|The next coach will win here]."],
    defiant: ["[I don't owe anyone a long explanation|The results said enough|I'm not apologizing for wanting to win]."],
  },
  search: {
    candid: ["[Someone who can build a culture|A leader first|Someone who can develop young players], and I'll take my time to get it right."],
    confident: ["[This is one of the best jobs in football|We'll have our pick|The best candidates want to be here]."],
  },
  hire: {
    candid: ["[It came down to two people|It was a hard choice], and {C.name} [had the clearest plan|won me over in the room]."],
    confident: ["{C.name} is going to [win a lot of games here|bring a title to {T.city}|change this franchise]."],
  },
  signing: {
    candid: ["[It's a lot of money|We stretched for him], and [we know it|we'll have to get it right elsewhere]. {P.name} is worth the risk."],
    confident: ["{P.name} [changes our team|is the piece we were missing|is a winner]. [Easy decision|Money well spent]."],
  },
  holdout: {
    candid: ["[We want {P.name} here|We value {P.name}], and we're [working on it|talking every day|trying to find a deal that works]."],
    confident: ["{P.name} [will be here|is going to get a deal done|isn't going anywhere]."],
    defiant: ["[Nobody is bigger than the team|We have a contract with {P.name}|We don't negotiate in public]."],
  },
  contractYear: {
    candid: ["[We'd like to get something done|We've talked], but [it has to work for both sides|the price has to be right]."],
    confident: ["{P.name} [will be a {T.nick} for a long time|is part of the plan|is getting paid]."],
  },
  tradeRequest: {
    candid: ["[We'll listen|If the right offer comes, we'll look at it], but [we'd rather fix it|we're not giving him away]."],
    confident: ["[We're not trading {P.name}|{P.name} is staying|This gets fixed]."],
    defiant: ["[Players don't run this team|We'll trade him when it's right for us, not for him|He's under contract]."],
  },
  relocation: {
    candid: ["[I won't lie to you|It's complicated]: [the lease matters|we need a building that works]. {T.city} is my first choice."],
    confident: ["The {T.nick} [are staying in {T.city}|aren't going anywhere|belong to {T.city}]."],
  },
  stadium: {
    candid: ["[We need a new building|The stadium is behind the league], and [we're talking with the city|it has to make sense for everyone]."],
    confident: ["[We'll get a deal done|The new stadium is going to happen|{T.city} is getting a great building]."],
  },
  losingStreak: {
    candid: ["[It's been ugly|Nobody's happy], and [I won't pretend otherwise|changes are on the table]."],
    confident: ["[We'll snap out of it|This team will turn it around|One win changes everything]."],
  },
  winStreak: {
    candid: ["[We've been lucky in a couple of spots|It's a long season], but [I like how the guys play|it's fun right now]."],
    confident: ["[We can beat anyone|This team is the real thing|We're just getting started]."],
  },
  promise: {
    candid: ["[I meant it when I said it|I said it, and I'll be judged on it]. [We're working on it|We're not there yet]."],
    confident: ["[I keep my word|It'll be done|You'll see]."],
  },
};

/** What a tone of answer does to the room, in the coverage's eyes. */
export const TONE_LABEL: Record<OwnerTone, string> = { candid: "Candid", confident: "Confident", deflect: "Deflect", defiant: "Defiant", gracious: "Gracious", playful: "Playful" };

/** The owner's own posts on the Huddle, by the choice made. Slots: T, X (another club), score. */
export const OWNER_POST: Record<string, { label: string; text: string[] }> = {
  celebrate: { label: "Celebrate the win", text: ["[What a day|What a win|That's how you do it], {T.city}! <score?{score}.> [Proud of this team|Love this group|On to the next]."] },
  thanks: { label: "Thank the fans", text: ["[Thank you|Grateful for you|You make this place what it is], {T.city}. [Best fans in football|We see you|We do this for you].", "To every fan who [showed up|stuck with us|made noise] this week: thank you."] },
  jab: { label: "Take a shot at a rival", text: ["[Hey|Dear] {X.nick} fans: [see you soon|we're coming|how's the view from back there]?", "[Nothing like beating the {X.nick}|The {X.nick} still live in our heads? No, other way around]."] },
  accountability: { label: "Own the loss", text: ["[That one's on all of us|Not good enough|We owe you better], {T.city}. [We'll fix it|Back to work|I'm not happy either]."] },
  refs: { label: "Blame the officials", text: ["[Did anyone else see that call|The officiating today was a disgrace|We got robbed]. [The league needs to look at this|Unbelievable|Somebody explain it to me]."] },
  build: { label: "Talk up the future", text: ["[Big things coming|Building something special|The best is ahead of us], {T.city}. [Stay tuned|Trust the process|You'll see]."] },
};

/** Fans' replies to the owner's post, by how it landed. */
export const OWNER_REPLY: { good: string[]; bad: string[]; mixed: string[] } = {
  good: ["[Love this owner|Finally an owner who gets it|This is why I renewed]!", "[Respect|Big respect|Say it louder]. Go {T.nick}!", "[Owner of the year|Best owner in the league|We're lucky to have you]."],
  bad: ["[Spend some money first|Fix the team, then post|Read the room]. ", "[Nobody asked|Delete this|Ratio]. ", "[Cool post. Now lower ticket prices|Less posting, more winning]."],
  mixed: ["[We'll see|Prove it|Words are cheap]. Go {T.nick}.", "[OK|Sure|Noted]. Win on Sunday."],
};

/** Topics for an op-ed and the line it opens with. */
export const OPED: Record<string, { label: string; lede: string[] }> = {
  direction: { label: "Where the team is headed", lede: ["Every decision we make is about one thing: [bringing a championship to {T.city}|building a team that wins for years|winning the right way]."] },
  fans: { label: "What the fans mean to us", lede: ["[This team belongs to you|The {T.nick} are yours as much as mine|Nothing we do matters without you], and I want you to know what we're doing with your support."] },
  stadium: { label: "The stadium plan", lede: ["[A new stadium is about the next fifty years of football in {T.city}|Our building is falling behind the league|The stadium question deserves a straight answer], and I want to make the case directly."] },
  community: { label: "Our work in the community", lede: ["[A football team should give back to the city that raises it|Our players are part of this community|What we do off the field matters as much as Sundays]."] },
  league: { label: "Where the league should go", lede: ["[The league is at a crossroads|Football's next decade is being decided now|The other owners and I don't always agree], and fans deserve to hear one owner's view."] },
};

/** Things the owner can give a reporter first. */
export const EXCLUSIVE: Record<string, { label: string; line: string[] }> = {
  plans: { label: "The plan for next season", line: ["{O.name} laid out the plan in a sitdown with {R.name}: [win now|build through the draft|keep the core together]."] },
  coach: { label: "The head coach's future", line: ["{O.name} told {R.name} that <C?{C.name}><!C?the head coach> [will be back|is safe|has the owner's backing]."] },
  extension: { label: "A player's extension", line: ["{O.name} told {R.name} that the {T.nick} intend to extend <P?{P.name}><!P?a core player>."] },
  stadium: { label: "The stadium plan", line: ["{O.name} gave {R.name} the first look at where the stadium talks stand."] },
  deadline: { label: "Plans at the trade deadline", line: ["{O.name} told {R.name} the {T.nick} will be [buyers|active|aggressive] at the deadline."] },
};

type Words = { head: string[]; take: string[]; para: string[] };

function kind(formats: FormatId[], lede: FamilyContent["lede"], details: string[], plain: Words, extra: [string, number, Words][] = []): FamilyContent {
  return {
    family: "owner", formats, lede, details,
    angles: [{ id: "plain", when: always(0.6), ...plain }, ...extra.map(([id, w, x]): AngleDef => ({ id, when: on(id, w), ...x }))],
  };
}

export const OWNER_CONTENT: Record<string, FamilyContent> = {
  // O, T, quote, occasion, n, topics; candid, confident, deflect, defiant, gracious, playful, skipped.
  presser: kind(["report", "column", "notebook", "hottake"], {
    news: ["<tag.skipped?The {T.nick} owner did not take questions {occasion}; a spokesperson read a short statement.><!tag.skipped?{O.name} took {n} questions {occasion}.>"],
    beat: ["<tag.skipped?No questions from the owner {occasion}.><!tag.skipped?{O.name} stood at the podium for {n} questions {occasion}.>"],
    opinion: ["<tag.skipped?The owner wouldn't face us {occasion}.><!tag.skipped?I listened to {O.name} {occasion}, and here's what I heard.>"],
  }, ["<topics?Topics included {topics}.>", "<quote?The line that will stick: \"{quote}\"><T.rec? The {T.nick} are {T.rec}.>"], {
    head: ["<quote?{O.name}: \"{quote}\"><!quote?{O.name} meets the press>"],
    take: ["What {O.name} told us, and what it means"],
    para: ["[It was|It came across as] [a measured performance|a mixed bag|about what you'd expect] from the {T.nick} owner."],
  }, [
    ["candid", 2, { head: ["{O.name} gets candid about the {T.nick}"], take: ["Credit {O.name} for honesty"], para: ["[It was unusually frank|Straight talk from the top|Owners don't usually talk like this]. <quote?\"{quote}\">"] }],
    ["confident", 2, { head: ["{O.name} makes a promise"], take: ["{O.name} just raised the stakes"], para: ["[Bold words|That's a promise people will remember|Now the team has to back it up]. <quote?\"{quote}\">"] }],
    ["defiant", 2, { head: ["{O.name} takes on the critics"], take: ["{O.name} picked a fight. Smart?"], para: ["[It got combative|The room got tense|Nobody left that room with a friend]. <quote?\"{quote}\">"] }],
    ["gracious", 2, { head: ["{O.name} hands out the credit", "{O.name} thanks the people around the {T.nick}"], take: ["{O.name} said thank you. It works"], para: ["[Every answer seemed to end with somebody else's name|The owner kept steering the credit elsewhere|It was a gracious hour, if not a revealing one]. <quote?\"{quote}\">"] }],
    ["playful", 2, { head: ["{O.name} keeps the room laughing", "{O.name} jokes through the questions"], take: ["{O.name} played it for laughs. Did it land?"], para: ["[The room laughed more than once|There were jokes, and a few of them were good|It was the loosest press conference of the year]. <quote?\"{quote}\">"] }],
    ["deflect", 2, { head: ["{O.name} says plenty, reveals little"], take: ["{n} questions, no answers"], para: ["[A lot of words without much said|Every answer was a version of \"we'll see\"|Careful to a fault]."] }],
    ["skipped", 4, { head: ["{T.nick} owner skips questions", "No answers from {O.name}"], take: ["{O.name} won't face the music"], para: ["[That says something on its own|Silence is an answer too|Fans deserved better]."] }],
  ]),

  // O, T, R, quote, n; offrecord is never written; onrecord.
  interview: kind(["feature", "report"], {
    news: ["{O.name} sat down with {R.outlet}'s {R.name} for a one-on-one interview."],
    feature: ["In a rare sitdown with {R.name}, {O.name} talked about the {T.nick} for nearly an hour."],
  }, ["<quote?\"{quote}\"><T.rec? The {T.nick} are {T.rec}.>"], {
    head: ["One on one with {O.name}", "<quote?{O.name} to {R.outlet}: \"{quote}\"><!quote?{O.name} talks to {R.outlet}>"],
    take: ["Inside the mind of the {T.nick} owner"],
    para: ["{O.name} [was relaxed|was guarded|was talkative] and [covered a lot of ground|didn't dodge much|stayed on message]."],
  }),

  // O, T, R, C, P, line (what was given).
  exclusive: kind(["report"], {
    news: ["{line}"],
  }, ["The {T.nick} owner [spoke exclusively to|gave the news first to] {R.outlet}."], {
    head: ["Exclusive: {O.name} opens up to {R.outlet}", "{O.name} tells {R.outlet} where the {T.nick} are headed"],
    take: ["{O.name}'s exclusive"],
    para: ["Other outlets were left [chasing the story|to catch up|reading it here first]."],
  }),

  // O, T, R: an off-the-record conversation that a reporter printed.
  burned: kind(["report", "hottake", "column"], {
    news: ["{O.name} said more than intended in what was meant to be a private conversation with {R.name}, and it's now in print."],
    opinion: ["Off the record doesn't mean what {O.name} thought it meant."],
  }, ["<quote?\"{quote}\"> The {T.nick} [had no comment|did not dispute the account|called it a misunderstanding]."], {
    head: ["{O.name}'s private remarks go public", "What {O.name} said when the owner thought nobody was listening"],
    take: ["{O.name} got burned, and it's going to cost"],
    para: ["[It's an embarrassing day for the {T.nick}|Expect a few uncomfortable phone calls|Trust between the owner and the press just took a hit]."],
  }),

  // O, T, R, head; confirm, deny.
  response: kind(["report", "column"], {
    news: ["<tag.deny?The {T.nick} owner denied a report from {R.outlet}'s {R.name} about the club.><!tag.deny?{O.name} confirmed a report from {R.outlet}'s {R.name} about the club.>"],
    opinion: ["<tag.deny?{O.name} says {R.name} got it wrong.><!tag.deny?{R.name} had it right, and {O.name} says so.>"],
  }, ["<tag.deny?[\"There's nothing to it,\" {O.name} said.|\"That report is false,\" {O.name} said.]><!tag.deny?[\"I'm not going to deny it,\" {O.name} said.|\"Yes, that's accurate,\" {O.name} said.]>"], {
    head: ["<tag.deny?{O.name} denies report><!tag.deny?{O.name} confirms report>"],
    take: ["<tag.deny?Who do you believe: {O.name} or {R.name}?><!tag.deny?{O.name} stops the guessing>"],
    para: ["<tag.deny?[The denial puts the {T.nick} owner's word on the line|We'll find out soon enough who was right]><!tag.deny?[Straight answers are rare in this league|It's out in the open now]>."],
  }, [
    ["proved", 4, { head: ["The report {O.name} denied turned out to be true"], take: ["{O.name}'s denial didn't hold up"], para: ["[The owner's word just took a hit|Remember this the next time the {T.nick} deny something|{R.name} was right]."] }],
  ]),

  // O, T, R (the outlet that ran it), topic, lede.
  oped: kind(["column"], {
    opinion: ["{lede}"],
  }, ["[I'm proud of where we are, and clear about where we need to go.|You have my word that we'll keep you informed.|Thank you for reading, and for caring as much as I do.]"], {
    head: ["{O.name}: {topic}", "Guest column: {O.name} on {lower:topic}"],
    take: ["{O.name}: {topic}"],
    para: ["[This is a commitment I take personally.|I know words have to be matched by results.|The people of {T.city} deserve nothing less.]"],
  }),

  // O, T, R (the banned reporter); unban.
  ban: kind(["report", "hottake"], {
    news: ["<tag.unban?The {T.nick} have restored {R.outlet} reporter {R.name}'s access.><!tag.unban?The {T.nick} have pulled the credentials of {R.outlet} reporter {R.name}.>"],
    opinion: ["<tag.unban?The {T.nick} backed down.><!tag.unban?An owner banning a reporter is never a good look.>"],
  }, ["<tag.unban?[Cooler heads prevailed.|The ban lasted long enough to make headlines.]><!tag.unban?[Other outlets took notice.|The team gave no reason.|Media groups called it a mistake.]>"], {
    head: ["<tag.unban?{T.nick} lift ban on {R.name}><!tag.unban?{T.nick} ban {R.outlet} reporter {R.name}>"],
    take: ["<tag.unban?{O.name} blinks><!tag.unban?{O.name} picks a fight with the press>"],
    para: ["<tag.unban?[It's the right call, if a late one|Bans never last]><!tag.unban?[Thin skin is not a strategy|The coverage won't get friendlier from here|It only makes the story bigger]>."],
  }),

  // O, T, X: the owner's post that blew up.
  post: kind(["report", "hottake"], {
    news: ["{O.name} posted on the Huddle: \"{quote}\""],
    opinion: ["{O.name} logged on, and [now we're all talking about it|the internet did the rest]."],
  }, ["[The post spread quickly.|Fans on both sides weighed in.]"], {
    head: ["{O.name}'s post sets off the Huddle"],
    take: ["Owners should log off. {O.name} didn't"],
    para: ["[It was either great fun or a mistake, depending on who you ask|Somewhere a team spokesperson sighed]."],
  }, [
    ["jab", 3, { head: ["{O.name} takes a shot at the {X.nick}"], take: ["{O.name} just gave the {X.nick} bulletin-board material"], para: ["[The {X.nick} will have seen it|Rivalry week came early|Somebody print that out for the {X.nick} locker room]."] }],
    ["refs", 3, { head: ["{O.name} rips the officials"], take: ["{O.name} said what fans think. The league won't like it"], para: ["[Expect a call from the league office|That's a fine waiting to happen|The officiating complaint will cost something]."] }],
  ]),
};
