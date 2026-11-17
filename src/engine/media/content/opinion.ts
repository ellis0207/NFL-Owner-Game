// The words for opinion (media/opinion.ts): columns that argue a running
// thesis about a club week after week, radio and podcast rundowns of what the
// league is talking about, outlet-versus-outlet debates, mailbags, and
// Overreaction Monday. Slots: R and S (the voices: name, outlet), T (the
// club), P and Q (players), list, weeks, since, mail (the questions and
// answers, already written), and stance words.
import { always, on, type AngleDef, type FamilyContent } from "../angles";
import type { FormatId } from "../formats";

type Words = { head: string[]; take: string[]; para: string[] };

function kind(formats: FormatId[], lede: FamilyContent["lede"], details: string[], plain: Words, extra: [string, number, Words][] = []): FamilyContent {
  const ours: AngleDef = {
    id: "ours", when: on("ours", 0.4),
    head: ["What the {US.nick} should take from this"],
    take: ["The {US.nick} are in this conversation"],
    para: ["For the {US.nick}, [it's worth listening to|it's a fair point|it stings a little]."],
  };
  return {
    family: "opinion", formats, lede, details,
    angles: [{ id: "plain", when: always(0.6), ...plain }, ...extra.map(([id, w, x]): AngleDef => ({ id, when: on(id, w), ...x })), ours],
  };
}

export const OPINION_CONTENT: Record<string, FamilyContent> = {
  // R (the columnist), T, stance ("for real" or "frauds"), weeks, since; open, holding, shaky, right, wrong, real, fraud.
  thesis: kind(["column", "hottake"], {
    opinion: ["<tag.open?I'll say it now: the {T.nick} are {stance}.><!tag.open?{weeks} week{s:weeks} ago I said the {T.nick} were {stance}.>"],
  }, ["<T.rec?They are {T.rec}.>", "<tag.real?[Their point differential backs it up.|The film backs it up.]><!tag.real?[Look at the point differential.|Look at who they've beaten.]>"], {
    head: ["<tag.open?The {T.nick} are {stance}><!tag.open?Still saying it: the {T.nick} are {stance}>", "{R.name}: the {T.nick} are {stance}"],
    take: ["<tag.real?Believe in the {T.nick}><!tag.real?Don't believe the {T.nick}' record>"],
    para: ["<tag.real?[The schedule hasn't been kind and they've won anyway.|This roster is better than people think.|They win the close ones because they're good, not lucky.]><!tag.real?[They've beaten nobody.|The close wins will turn into close losses.|The record is lying to you.]>"],
  }, [
    ["holding", 2, { head: ["I was right about the {T.nick}, and it's not close"], take: ["Week {weeks} of being right about the {T.nick}"], para: ["Every week since {since} has made the case [stronger|clearer|louder]."] }],
    ["shaky", 2, { head: ["About my {T.nick} take"], take: ["I'm not backing off the {T.nick}. Yet"], para: ["The last couple of weeks [haven't helped|have tested this|have been loud], but I'm holding."] }],
    ["right", 3, { head: ["Told you so: the {T.nick} were {stance}"], take: ["Victory lap: the {T.nick} were exactly what I said"], para: ["Back on {since} I called it. [The season agreed.|Take a bow, me.|Receipts are receipts.]"] }],
    ["wrong", 3, { head: ["I was wrong about the {T.nick}", "Eating crow on the {T.nick}"], take: ["I owe the {T.nick} an apology"], para: ["On {since} I said the {T.nick} were {stance}. [I was wrong.|The season made a fool of me.|Columnists don't say this enough: I missed.]"] }],
  ]),

  // R (the host), T (the station's club), list (what people are talking about), topic; pod, local.
  rundown: kind(["hottake", "column", "notebook"], {
    opinion: ["<tag.pod?On this week's pod:><!tag.pod?On the show today:> {list}."],
    beat: ["What {T.city} is talking about: {list}."],
  }, ["[The phones were busy.|Call in.|The comments are already a mess.]"], {
    head: ["<tag.pod?The pod: {topic} and everything else><!tag.pod?The rundown: {topic} leads the show>", "<tag.pod?This week on the pod><!tag.pod?Today on the air>: {topic}"],
    take: ["Everybody has an opinion on {topic}"],
    para: ["[First hour was all about|We started with|The callers wanted] {topic}, and [it got loud|nobody agreed|we never got to the rest]."],
  }, [
    ["local", 2, { head: ["{T.city} sports radio: {topic}"], take: ["{T.city} can't stop talking about {topic}"], para: ["The {T.nick} callers [were fired up|were split|wanted answers] about {topic}."] }],
  ]),

  // R and S (two columnists, two outlets), T (the club, or the MVP leader's), P (the MVP leader), stanceR, stanceS; team, mvp.
  debate: kind(["column", "hottake", "feature"], {
    opinion: ["{R.name} and {S.name} don't agree<tag.team? about the {T.nick}><tag.mvp? about {P.name}>."],
    feature: ["Two outlets, two answers: {R.outlet}'s {R.name} and {S.outlet}'s {S.name} on <tag.team?the {T.nick}><tag.mvp?{P.name}>."],
  }, ["{R.name}: \"{stanceR}.\" {S.name}: \"{stanceS}.\""], {
    head: ["Debate: <tag.team?are the {T.nick} for real?><tag.mvp?is {P.name} the MVP?>", "{R.outlet} vs. {S.outlet}: <tag.team?the {T.nick}><tag.mvp?{P.name}'s case>"],
    take: ["One of these takes is wrong"],
    para: ["[You decide|Somebody is going to look bad in January|Both sound sure], and only one of them can be right."],
  }),

  // R (the columnist), T (the club, for a local mailbag), mail (the questions and answers); local.
  mailbag: kind(["column", "notebook"], {
    opinion: ["Your questions, my answers. {mail}"],
    beat: ["The mailbag is open. {mail}"],
  }, ["[Keep them coming.|Send more.|Next week: more of your questions.]"], {
    head: ["Mailbag: your questions<tag.local? about the {T.nick}>", "{R.name}'s mailbag<tag.local?: {T.nick} edition>", "You asked<tag.local?, about the {T.nick}>"],
    take: ["Mailbag: the questions you're all asking"],
    para: ["[Plenty of mail this week.|You had a lot on your minds.|The inbox was full.]"],
  }),

  // R (the columnist), T (hot club), X (cold club), list; ours.
  overreaction: kind(["hottake", "column"], {
    opinion: ["Overreaction Monday: {list}"],
  }, ["[Half of that is crazy. The other half is just loud.|Ask me again in December.|I said what I said.]"], {
    head: ["Overreaction Monday", "Overreaction Monday: the {T.nick} are winning it all", "Overreactions: blow up the {X.nick}"],
    take: ["Overreact? Me? Never"],
    para: ["It's one week. [Overreact anyway.|That's never stopped anyone.|Let's go.]"],
  }),
};

/** Mailbag questions by topic and the columnist's answers. Slots: A (the fan's handle), T, P, C. */
export const MAIL: Record<string, { q: string[]; a: string[] }> = {
  hotSeat: { q: ["{A} asks: is {C.name} coaching for his job?", "{A}: how long does {C.name} have?"], a: ["[Yes.|Probably.|It looks that way.] [Owners don't wait long anymore.|The next month decides it.|Watch the next two games.]"] },
  qbSwitch: { q: ["{A} asks: is {P.name} the {T.nick}' quarterback of the future?", "{A}: should the {T.nick} have made the quarterback switch?"], a: ["[Too early to say.|For now.|It was the right call.] [Give it a month.|The tape says yes.|The schedule gets harder.]"] },
  holdout: { q: ["{A}: will {P.name} and the {T.nick} get a deal done?"], a: ["[Eventually.|I think so.|It's closer than it looks.] [These usually end with a handshake.|Both sides need it.]"] },
  tradeRequest: { q: ["{A}: where does {P.name} end up?"], a: ["[Somewhere with cap room.|A contender.|Nowhere, yet.] [The price is the problem.|The asking price is high.]"] },
  losingStreak: { q: ["{A}: what's wrong with the {T.nick}?", "{A} asks: can the {T.nick} turn this around?"], a: ["[The line.|Turnovers.|Health.] [Fix that and the rest follows.|That's the whole story.]"] },
  winStreak: { q: ["{A} asks: are the {T.nick} for real?"], a: ["[Yes.|More than you think.|Ask me in December.] [The schedule's been fair.|They're doing it the right way.]"] },
  contractYear: { q: ["{A}: should the {T.nick} pay {P.name}?"], a: ["[Yes, at the right price.|Not at that price.|It depends on the cap.] [That's the whole negotiation.|Let him play it out.]"] },
  standings: { q: ["{A}: do the {T.nick} make the playoffs?", "{A} asks: what's the {T.nick}' ceiling this year?"], a: ["[If they stay healthy.|It's close.|I'd say yes.] <T.rec?At {T.rec}, it's in their hands.>"] },
  draft: { q: ["{A}: what should the {T.nick} do with their first pick?", "{A} asks: who's the {T.nick}' draft target?"], a: ["[Best player available.|Protect the quarterback.|Defense.] [Don't overthink it.|That's the need.]"] },
  offseason: { q: ["{A}: what's the {T.nick}' biggest need?", "{A} asks: will the {T.nick} be active in free agency?"], a: ["[The lines.|Corner.|A pass rusher.] [The cap space is there.|Watch March.]"] },
};
