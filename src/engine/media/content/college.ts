// The words for college football and recruiting (cfbmedia.ts): commitments,
// flips, signing days, firings, hires, coaches leaving for the NFL,
// retirements, the transfer portal and the preseason risers and fallers.
// Slots: S (school: id, name, nick, full, conf, coach, rec, rank), F (another
// school, same shape), R (recruit: name, pos, stars, word, rank, home), C
// (coach: name, from, years, rec), P (prospect: name, pos, line, cls), T (NFL
// club: nick, full), year, list, n, buyout, last.
import { always, on, type AngleDef, type FamilyContent } from "../angles";
import type { FormatId } from "../formats";

type Words = { head: string[]; take: string[]; para: string[] };

function kind(formats: FormatId[], lede: FamilyContent["lede"], details: string[], plain: Words, extra: [string, number, Words][] = [], quote?: FamilyContent["quote"]): FamilyContent {
  return {
    family: "college",
    formats,
    lede,
    details,
    angles: [{ id: "plain", when: always(0.6), ...plain }, ...extra.map(([id, w, x]): AngleDef => ({ id, when: on(id, w), ...x }))],
    bank: BANK,
    quote,
  };
}

const BANK = {
  rec: ["[Recruiting analysts|The recruiting services|Evaluators who saw him in high school]"],
  "rec.hot": ["[Recruiting sites everywhere|The message boards|Recruiting insiders]"],
  coachQuote: [
    "We're building this thing the right way, one young man at a time.",
    "We sell the same thing every day: development, a degree and a chance to play on Sundays.",
    "Nothing changes about how we work. We recruit, we develop, we compete.",
  ],
  adQuote: [
    "We owe our players, our students and our fans a program that competes for championships.",
    "This decision was about the direction of the program, not any one season.",
    "We wanted a leader who knows how to build, recruit and win, and we found one.",
  ],
};

export const COLLEGE_CONTENT: Record<string, FamilyContent> = {
  // R, S; five, top10, home, g5, late.
  commit: kind(["report", "alert", "column", "feature", "podcast"], {
    news: ["{R.word} {R.pos} {R.name}, the No. {R.rank} recruit in the country, committed to {S.name}.", "{S.name} landed a commitment from {R.word} {R.pos} {R.name} of {R.home}, No. {R.rank} nationally."],
    opinion: ["{@open.column} {R.name} picked {S.name}."],
    analysis: ["{R.name} ({R.pos}, {R.home}) ranks No. {R.rank} in the class, and {S.name} just got him."],
    feature: ["Every recruiting story ends with a hat on a table. {R.name}'s ended with {S.name}."],
  }, ["<S.coach?{S.coach} and his staff [closed|finished the job|won out] after a long recruitment.>", "A commitment isn't a signature, [and plenty of programs will keep calling|so the next few months still matter|but this one looks solid]."], {
    head: ["{R.word} {R.pos} {R.name} commits to {S.name}", "{S.name} lands {R.word} {R.pos} {R.name}", "Commitment: {R.name} picks {S.name}"],
    take: ["{S.name} won a big recruiting battle", "What {R.name} means for {S.name}"],
    para: ["{R.name} [is the kind of player who changes a class|gives {S.name} a cornerstone|turns {S.name}'s class into something]."],
  }, [
    ["five", 2.5, { head: ["Five-star {R.pos} {R.name} picks {S.name}", "{S.name} lands a five-star: {R.name}"], take: ["A five-star changes everything for {S.name}"], para: ["Five-stars are rare: about thirty a year. {S.name} [has one now|just added another|got one of the best]."] }],
    ["top10", 2, { head: ["The No. {R.rank} recruit in America is going to {S.name}"], take: ["The best player in the class just made {S.name}'s day"], para: ["{@rec} have had {R.name} near the top since his sophomore year."] }],
    ["home", 1.5, { head: ["{R.name} stays home with {S.name}"], take: ["{S.name} kept a big one at home"], para: ["Keeping the best players in the state is job one, and {S.name} [did it|won that fight|held the border] with {R.name}."] }],
    ["g5", 2, { head: ["Stunner: {R.word} {R.name} picks {S.name}"], take: ["{S.name} just beat the giants"], para: ["Players ranked like {R.name} don't usually pick [a school outside the power conferences|{S.conf} programs]. {S.name} [sold him on playing early|made him the priority|out-worked everyone]."] }],
    ["late", 1, { head: ["Signing season: {R.name} picks {S.name}"], take: ["{R.name} waited, and {S.name} won"], para: ["{R.name} took his time, [visiting until the end|keeping everyone guessing|saying little], and picked {S.name}."] }],
  ]),

  // R, S (new), F (old); five, coachGone.
  flip: kind(["report", "alert", "column", "hottake"], {
    news: ["{R.word} {R.pos} {R.name} flipped his commitment from {F.name} to {S.name}."],
    opinion: ["{@open.column} {R.name} was a {F.name} commit. Not anymore."],
    analysis: ["{R.name}, No. {R.rank} in the class, is now headed to {S.name} instead of {F.name}."],
  }, ["Commitments aren't binding until a player signs, [and {S.name} kept calling|which is why nobody celebrates in July|and {F.name} found out the hard way]."], {
    head: ["Flip: {R.name} leaves {F.name} for {S.name}", "{S.name} flips {R.word} {R.pos} {R.name} from {F.name}"],
    take: ["{F.name} let {R.name} get away", "{S.name} wins the {R.name} tug-of-war"],
    para: ["Losing a commitment [stings|hurts|is a bad look] for {F.name}; for {S.name}, it's [a statement|the win of the cycle|proof the pitch works]."],
  }, [
    ["coachGone", 3, { head: ["After the coaching change, {R.name} flips to {S.name}"], take: ["This is what a coaching change costs {F.name}"], para: ["{R.name} committed to the coach who recruited him. With that coach gone, {F.name} [couldn't hold him|lost the relationship|was starting over]."] }],
    ["five", 2, { head: ["Five-star flip: {R.name} to {S.name}"], take: ["A five-star flip is a gut punch for {F.name}"], para: ["Five-stars don't flip often. When they do, [people notice|the whole class shifts|the message boards melt down]."] }],
  ]),

  // year, list, S (top class), n; early, national.
  signing: kind(["report", "column", "analytics", "feature", "podcast"], {
    news: ["<tag.early?The early signing period opened, and {n} of the nation's top recruits signed.><!tag.early?National Signing Day: the class of {year} is in.> The top classes: {list}."],
    opinion: ["{@open.column} <tag.early?Early signing day><!tag.early?Signing day> is when promises become signatures."],
    analysis: ["The class of {year}, by the recruiting services' points: {list}."],
    feature: ["<tag.early?In gyms and living rooms across the country,><!tag.early?On the first Wednesday of February,> high school seniors made it official."],
  }, ["{S.name} [sits on top|has the No. 1 class|won recruiting this year], [for now|on paper|at least on paper]. [Recruiting rankings miss plenty.|Half of every draft class was a three-star.|Stars aren't destiny.]"], {
    head: ["<tag.early?Early signing day: {S.name} on top><!tag.early?Signing day: {S.name} has the No. 1 class>", "The class of {year}: {S.name} leads the rankings"],
    take: ["{S.name} won the offseason. Now develop them", "Recruiting rankings are fun. They're also wrong a lot"],
    para: ["The top of the rankings: {list}. [The usual names.|Some familiar faces and a surprise or two.|A few programs are moving.]"],
  }, [
    ["national", 1, { head: ["National Signing Day winners and losers"], take: ["Signing day separates the programs that develop from the ones that collect"], para: ["The last uncommitted players [picked their schools|made their calls|signed on the dotted line], and the class of {year} is done."] }],
  ]),

  // C, S, rec, years, buyout; midseason, big, quick, long, champion.
  fired: kind(["report", "alert", "column", "hottake", "feature"], {
    news: ["{S.name} fired head coach {C.name}<tag.midseason? in the middle of the season><!tag.midseason? after a {rec} season>.", "{C.name} is out at {S.name} after {years} season{s:years}."],
    opinion: ["{@open.column} {S.name} made the call on {C.name}."],
    analysis: ["{C.name}'s {years} season{s:years} at {S.name} ended with a {rec} record this year and {buyout} still owed."],
    feature: ["Coaching changes come in one week in college football, and {S.name}'s came today."],
  }, ["The buyout runs about {buyout}.", "<tag.midseason?An assistant runs the team for the rest of the season.><!tag.midseason?The search starts now, and {S.name} wants a hire before the early signing period.>"], {
    head: ["{S.name} fires {C.name}", "{C.name} out at {S.name}", "{S.name} moves on from {C.name}"],
    take: ["{S.name} had to fire {C.name}", "{S.name} just made a mistake"],
    para: ["The program [expected more|was going the wrong way|ran out of patience], and {C.name} [paid for it|is the one who goes|takes the fall]."],
  }, [
    ["midseason", 3, { head: ["{S.name} fires {C.name} in midseason"], take: ["Firing a coach in October tells you how bad it got"], para: ["Programs rarely make a change before November. {S.name} [couldn't wait|saw enough|decided the season was already lost]."] }],
    ["big", 2, { head: ["Blue-blood opening: {S.name} fires {C.name}"], take: ["{S.name} is the best job open, and everyone knows it"], para: ["{S.name} is a destination job. [Every coach in the country will take the call|The search will be national|The money will be enormous]."] }],
    ["quick", 2, { head: ["{S.name} gives up on {C.name} after {years} season{s:years}"], take: ["{years} season{s:years} isn't enough time"], para: ["{years} season{s:years} [isn't long to build anything|is a short leash, even for college football|says the hire was wrong from the start]."] }],
    ["long", 1.5, { head: ["End of an era: {S.name} parts with {C.name}"], take: ["{C.name} deserved a better ending"], para: ["{C.name} was at {S.name} for {years} seasons. [That's a long run in this business|Few coaches last that long|The program won't look the same]."] }],
  ], () => ({ bank: "adQuote", who: "the athletic director", role: "in a statement" })),

  // C, S, from; fromHC (F), coord, retread, big.
  hired: kind(["report", "alert", "column", "feature", "podcast"], {
    news: ["{S.name} hired {C.name} as head coach.", "{C.name}, <C.from?{C.from}><!C.from?a longtime assistant>, is the new head coach at {S.name}."],
    opinion: ["{@open.column} {S.name} picked {C.name}."],
    analysis: ["{S.name}'s search ended with {C.name}<C.from? ({C.from})>."],
    feature: ["{C.name} has a new job, and {S.name} has a new direction."],
  }, ["[The first job is the recruiting calendar: the early signing period doesn't wait.|He inherits a roster and a class that need to hear from him now.|Expect the staff to fill in over the next two weeks.]"], {
    head: ["{S.name} hires {C.name}", "{C.name} is the new coach at {S.name}", "{S.name} names {C.name} head coach"],
    take: ["{S.name} got its man", "Grading the {S.name} hire"],
    para: ["{C.name} [is a good fit|is a bold choice|was the safe pick] for a program that [wants to win now|needs a rebuild|expects to contend]."],
  }, [
    ["fromHC", 2.5, { head: ["{C.name} leaves {F.name} for {S.name}"], take: ["{F.name} just became a stepping stone"], para: ["{C.name} won at {F.name}, and that's what bigger programs pay for. Now {F.name} [is searching|has to start over|needs its own hire]."] }],
    ["coord", 2, { head: ["First-time head coach: {S.name} hires {C.name}"], take: ["A coordinator's first job is always a gamble"], para: ["{C.name} has never been a head coach. [Neither had most of the great ones.|{S.name} is betting on the résumé.|It's a risk worth taking.]"] }],
    ["retread", 1.5, { head: ["Second chance: {S.name} hires {C.name}"], take: ["{C.name} gets another shot"], para: ["{C.name} was fired before. [Some coaches learn from it.|{S.name} believes he learned.|It's a hire that needs to work.]"] }],
    ["big", 1.5, { head: ["{S.name} lands its coach: {C.name}"], take: ["{C.name} has the job everyone wanted"], para: ["At {S.name}, [anything short of the playoff is a bad year|the expectations come with the paycheck|the honeymoon is short]."] }],
  ], () => ({ bank: "coachQuote", who: "the new coach", role: "at his introduction" })),

  // C, S, T (NFL club); big.
  left: kind(["report", "alert", "column", "feature"], {
    news: ["{C.name} is leaving {S.name} to coach the {T.full}."],
    opinion: ["{@open.column} {C.name} is going to the NFL."],
    analysis: ["{S.name} loses {C.name} to the {T.nick}, and starts a search of its own."],
    feature: ["The NFL called, and {C.name} answered."],
  }, ["{S.name} [opens a search|has a job to fill|has to keep its recruiting class together]."], {
    head: ["{C.name} leaves {S.name} for the {T.nick}", "{S.name} loses {C.name} to the NFL"],
    take: ["Will {C.name}'s college success translate?", "{S.name} was always going to lose {C.name}"],
    para: ["College coaches don't always make it on Sundays. {C.name} [thinks he will|has the {T.nick} believing|gets his chance]."],
  }),

  // C, S, years.
  retired: kind(["report", "feature", "column"], {
    news: ["{C.name} is retiring after {years} season{s:years} as head coach at {S.name}."],
    opinion: ["{@open.column} {C.name} is walking away."],
    feature: ["{years} season{s:years}, a lot of Saturdays and a lot of players: {C.name} is done."],
  }, ["{S.name} [starts a search|will look for a successor|has its first opening in years]."], {
    head: ["{C.name} retires at {S.name}", "{S.name}'s {C.name} calls it a career"],
    take: ["Thank you, {C.name}"],
    para: ["{C.name} [leaves the program in good hands|leaves a long shadow|did it his way]."],
  }),

  // P, F (old school), S (new school); up, qb.
  portal: kind(["report", "alert", "analytics", "column"], {
    news: ["{P.pos} {P.name} is transferring from {F.name} to {S.name}."],
    opinion: ["{@open.column} {P.name} is on the move."],
    analysis: ["{P.name} ({P.pos}) heads from {F.name} to {S.name}<P.line? after {P.line} last season>."],
  }, ["[The portal giveth and the portal taketh.|Every program lives in the portal now.|It's a two-way street.] NFL scouts will follow him to {S.name}."], {
    head: ["Transfer: {P.pos} {P.name} leaves {F.name} for {S.name}", "{S.name} lands {F.name} transfer {P.name}"],
    take: ["{S.name} won the portal this week"],
    para: ["{P.name} [wanted a bigger stage|wanted to play|needed a fresh start], and {S.name} [has one|offered it|gives him the shot]."],
  }, [
    ["up", 2, { head: ["Moving up: {P.name} goes from {F.name} to {S.name}"], take: ["{P.name} earned his shot at the big time"], para: ["Productive players at smaller schools get calls. {P.name} [took one|picked the biggest|is headed to the {S.conf}]."] }],
    ["qb", 2, { head: ["Quarterback transfer: {P.name} to {S.name}"], take: ["{S.name} found its quarterback in the portal"], para: ["Quarterbacks move more than anyone: [one starter per team|nobody wants to sit|a year on the bench is a long time]."] }],
  ]),

  // S, last, rank; rise, fall.
  program: kind(["column", "feature", "analytics", "podcast"], {
    opinion: ["{@open.column} <tag.rise?{S.name} is coming.><!tag.rise?{S.name} has a problem.>"],
    analysis: ["{S.name} went {last} last season<tag.rise? and opens at No. {rank} in the AP poll><!tag.rise? and starts this season unranked>."],
    feature: ["<tag.rise?Programs climb slowly, then all at once.><!tag.rise?Programs slip slowly, then all at once.> {S.name} [is the example this year|is where it's happening|is the story]."],
  }, ["<tag.rise?The recruiting classes have been getting better.><!tag.rise?The recruiting hasn't kept up.>", "<S.coach?{S.coach} is the man in charge.>"], {
    head: ["<tag.rise?On the rise: {S.name}><!tag.rise?Slipping: {S.name}>", "<tag.rise?Why {S.name} is a program to watch><!tag.rise?What happened to {S.name}?>"],
    take: ["<tag.rise?Believe in {S.name}><!tag.rise?{S.name} needs answers>"],
    para: ["<tag.rise?{S.name} [has climbed|keeps climbing|is building something].><!tag.rise?{S.name} [has slid|is going the wrong way|isn't what it was].>"],
  }),
};
