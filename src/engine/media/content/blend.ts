// The words that let any story combine with others (media/blend.ts): the
// structures shared by every family (an explainer, an "ask the insider"
// Q&A, a podcast segment), a second angle folded into a story, the
// reporter's own voice, a line tying the news to a club's running storyline
// or place in the standings, and daily roundups. Slots: H (the story's
// headline), K (the second angle's take), by, cohost, show, CX (the club in
// context: teamSlots), item list, n, week, theme words.

/** Explainer: what happened, why it matters, what's next. */
export const EXPLAIN_HEAD = ["[Explained|What it means|Why it matters|The short version]: {H}", "{H}, explained", "{H}: what you need to know"];
export const EXPLAIN_OPEN = ["[What happened|The news|Start here]:", "[In short|The basics|First, the facts]:"];
export const EXPLAIN_WHY = ["[Why it matters|Why it's a big deal|The bigger picture]:", "[What it changes|The stakes]:"];
export const EXPLAIN_NEXT = ["[What's next|What to watch|Where it goes from here]:", "[Next up|Keep an eye on]:"];

/** What to watch next, by family. */
export const NEXT: Record<string, string[]> = {
  game: ["[The next game says more about whether it sticks.|Film review comes first, then a short week.|The standings will look different by Sunday night.]"],
  performance: ["[The question is whether he can do it again.|Opponents will scheme for it now.|One more game like that and it's a trend.]"],
  injury: ["[The next injury report will tell us more.|The depth chart gets its test this week.|A second opinion is usually the next step.]"],
  signing: ["[He'll be in the building within days.|Camp will show where he fits.|The cap math gets sorted out next.]"],
  release: ["[Waivers come next, and somebody may take a flier.|The money saved has to go somewhere.|The roster spot opens for a younger player.]"],
  claim: ["[He'll have to learn the playbook fast.|The practice field will show whether it was worth it.]"],
  trade: ["[Physicals, then paperwork, then the first practice in new colors.|The other shoe may still drop.|Watch who uses the extra cap room.]"],
  rumor: ["[Until it's done, it's talk.|If it's real, it won't stay quiet long.|Watch for a denial, or the lack of one.]"],
  arc: ["[The next chapter is coming soon.|Nobody thinks this one is over.|Every week adds a page.]"],
  season: ["[The calendar keeps moving.|Next week reshuffles all of it.|It'll look different in a month.]"],
  wire: ["[Expect more on this soon.|Follow-up questions are already coming.|The league tends to move fast on these.]"],
  owner: ["[The owner's words will be measured against what comes next.|Actions will say more than any quote.]"],
  default: ["[More to come.|It's worth watching.|We'll know more soon.]"],
};

/** Ask the insider: the question a reader would ask, then the answer. */
export const QA_HEAD = ["[Ask the insider|Your questions|Mailbag|Reader question]: {H}", "{by} answers: {H}"];
export const QA_ASK = [
  "[A reader asks|From the inbox|This week's question]: \"{H}. [Is it as big as it sounds?|Should anyone be worried?|What happens next?|Who comes out ahead?|Is this overblown?|What's the real story?]\"",
  "\"[Everybody's talking about it|My group chat is arguing about it|I saw the headline]: {H}. [What's your read?|Help me understand it.|Is the hype real?]\"",
];
export const QA_ANSWER = ["{by}: [Good question.|Fair question.|Let's take it seriously.|Short answer: it depends.|I've been asking around.]"];

/** A podcast segment: the host's take and a co-host's push. */
export const PODCAST_HEAD = ["{show}: {H}", "On {show}: {H}", "{show} [ep.|episode] {n}: {H}"];
export const PODCAST_OPEN = [
  "On today's episode of {show}, {by} and {cohost} [went long on|broke down|argued about|kept coming back to] this one.",
  "{by} [opened|led off] {show} with it, and {cohost} [wasn't letting it go|had thoughts|jumped in fast].",
];
export const PODCAST_PUSH = [
  "{cohost}'s [counter|angle|read|pushback]: \"{K}.\"",
  "[Then|And then] {cohost} [took it somewhere else|added a wrinkle|flipped it]: \"{K}.\"",
];
export const PODCAST_CLOSE = ["[Listener calls ran long.|They'll revisit it next week.|The comments section has opinions.|Full episode wherever you get podcasts.]"];

/** Connecting a second angle into the same story. */
export const CONNECT = [
  "[There's another layer to this.|And that's not the only thread.|Look closer and there's more.|There's a second story inside the first.|Don't miss the other part of it.]",
  "[Meanwhile,|At the same time,|Then there's this:|Also worth noting:]",
];

/** The reporter's own voice, by style and the kind of piece. */
export const VOICE: Record<"stats" | "oldschool", string[]> = {
  stats: [
    "[The underlying numbers back it up.|Per the charting data, it isn't a fluke.|The efficiency numbers tell the same story.|Run the expected points and it holds up.]",
    "[Sample size matters, and this one is starting to count.|The model saw this coming.|It shows up in success rate, not just the box score.]",
  ],
  oldschool: [
    "[That's football the way it's supposed to be played.|You win in the trenches; you always have.|Toughness still wins in this league.]",
    "[No spreadsheet needed for this one.|Some things you see with your own eyes.|Ask any old lineman and you'll get the same answer.]",
  ],
};

/** A line tying a story to a club's situation: its running storylines and its place in the standings. */
export const CONTEXT: Record<string, string[]> = {
  hotSeat: ["[All of it lands on|None of it helps] {CX.coach}, whose seat was already warm.", "It's one more data point in the debate over {CX.coach}'s job."],
  losingStreak: ["The {CX.nick} have lost {CX.losses} straight, and everything gets read through that.", "[For a team on a {CX.losses}-game skid|With the losses piling up], every move gets a harder look."],
  winStreak: ["The {CX.nick} have won {CX.wins} in a row, and the mood around them shows it.", "[It comes in the middle of a {CX.wins}-game winning streak.|Momentum is on the {CX.nick}' side right now.]"],
  unbeaten: ["The {CX.nick} are still unbeaten, which raises the stakes on everything."],
  winless: ["The {CX.nick} are still looking for their first win."],
  holdout: ["And the holdout hanging over the {CX.nick} hasn't gone anywhere."],
  tradeRequest: ["The trade request in the {CX.nick} building is still the elephant in the room."],
  contractYear: ["Contract-year subplots are never far away in {CX.city}."],
  capCrunch: ["Every move in {CX.city} now runs through a tight cap."],
  injuries: ["It's one more thing for a roster already thinned by injuries."],
  division: ["It all matters in a {CX.div} race that's still tight."],
  stadium: ["The stadium fight in {CX.city} is never far from any of it."],
  relocation: ["The relocation talk around the {CX.nick} hangs over all of it."],
  sale: ["With the club possibly changing hands, everything is a little uncertain."],
  feud: ["The tension between the {CX.nick} coach and front office colors all of it."],
  qbSwitch: ["The quarterback change still colors everything the {CX.nick} do."],
  topPick: ["Every result now matters for draft position, too."],
  scandal: ["The suspension story is still in the background."],
  search: ["The coaching search shapes every decision right now."],
  lead: ["The {CX.nick} sit atop the {CX.div} at {CX.rec}.", "At {CX.rec}, the {CX.nick} lead the {CX.div}."],
  cellar: ["The {CX.nick} sit last in the {CX.div} at {CX.rec}.", "At {CX.rec}, the {CX.nick} are chasing everybody in the {CX.div}."],
  middle: ["At {CX.rec}, the {CX.nick} are in the thick of it."],
};

/** Daily roundups: several stories in one. */
export const ROUNDUP: Record<string, { head: string[]; open: string[]; close: string[] }> = {
  injuries: {
    head: ["[Injury report|Around the league: injuries|Who's hurt]: {first}<more? and {more} more>", "Injury roundup: {first}<more?, plus {more} more>"],
    open: ["[A rough day in the training rooms.|The injury news from around the league.|Here's who got hurt.]"],
    close: ["[Updates as teams release them.|Practice reports later this week will tell us more.]"],
  },
  moves: {
    head: ["[Transaction wire|Moves around the league|Today's transactions]: {first}<more? and {more} more>", "Roster moves: {first}<more?, plus {more} more>"],
    open: ["[A busy day on the wire.|The league's roster moves.|Who signed, who's out, who got claimed.]"],
    close: ["[More moves are likely before the week is out.|The waiver wire never sleeps.]"],
  },
  rumors: {
    head: ["[Rumor mill|What we're hearing|Around the league: the buzz]: {first}<more? and more>", "The buzz: {first}"],
    open: ["[A rundown of the reports making the rounds.|What the insiders are saying.|Talk, some of it true.]"],
    close: ["[Treat all of it as talk until it isn't.|Some of these will be wrong. Some won't.]"],
  },
  week: {
    head: ["What we learned in Week {week}", "Week {week}: {n} things we learned", "Week {week} takeaways: {first}"],
    open: ["[A full Sunday, and here's what stood out.|Week {week} in a few lines.|What mattered from the week's games.]"],
    close: ["[On to Week {next}.|The standings shuffle again next week.|See you next Sunday.]"],
  },
  local: {
    head: ["{CX.nick} notebook: {first}<more? and more>", "{CX.nick} roundup: {first}"],
    open: ["[A busy day around the {CX.nick}.|Several things to cover today.|Plenty going on with the {CX.nick}.]"],
    close: ["[The team is back at it tomorrow.|More from the facility tomorrow.]"],
  },
};
