// The writing grammar behind every composed story. A template is plain text
// with a few marks, so story ideas are written as words in content files, not
// as code:
//
//   {W.nick}        a slot from the story's facts (dotted paths reach inside)
//   {an:injury}     a modifier on a slot: an (a/an), cap (capital first), s (plural "s" when the number isn't 1),
//                   last (a surname), lower, ord (1st, 2nd)
//   {@verbWin}      a line from a phrase bank, itself a template (tone variants such as "verbWin.hot" win when they fit)
//   [beat|topped]   one of several wordings
//   <star?text>     text only when the slot is set (not empty, not 0, not false); <!star?text> when it isn't
//
// Words use their own random stream, so changing a phrase never moves a game
// result or anything else in the league.
import type { Rng } from "../rng";

export type Slot = string | number | boolean | undefined | null | Slots;
export interface Slots { [key: string]: Slot }
export type Bank = Record<string, readonly string[]>;
export type Tone = "straight" | "lively" | "hot";

export interface RenderContext {
  rng: Rng;
  banks: Bank;
  tone: Tone;
  /** Slots that were asked for and missing: the template linter reads this. */
  missing?: string[];
}

function lookup(slots: Slots, path: string): Slot {
  let cur: Slot = slots;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Slots)[part];
  }
  return cur;
}

function truthy(v: Slot): boolean {
  return v !== undefined && v !== null && v !== false && v !== 0 && v !== "";
}

function surnameOf(name: string): string {
  const parts = name.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(w));
  return parts[parts.length - 1] ?? name;
}

function modify(mod: string, raw: Slot, path: string): string {
  const text = raw === undefined || raw === null ? "" : String(raw);
  switch (mod) {
    case "an": return `${/^[aeiou]/i.test(text) && !/^(one|uni|use|eu)/i.test(text) ? "an" : "a"} ${text}`;
    case "cap": return text.charAt(0).toUpperCase() + text.slice(1);
    case "lower": return text.toLowerCase();
    // Lowercases a sentence's first letter to run it on, unless it starts an acronym ("QB", "NFL").
    case "uncap": return /^[A-Z][A-Z]/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
    case "s": return Number(raw) === 1 ? "" : "s";
    case "last": return surnameOf(text);
    case "ord": {
      const n = Number(raw);
      const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
      return `${n}${s}`;
    }
    default: throw new Error(`grammar: unknown modifier ${mod} on ${path}`);
  }
}

/** One line from a bank, preferring the tone's own variant. */
function fromBank(name: string, ctx: RenderContext): string | undefined {
  const lines = ctx.banks[`${name}.${ctx.tone}`] ?? ctx.banks[name];
  if (!lines?.length) return undefined;
  return lines[Math.floor(ctx.rng() * lines.length)];
}

/** Picks one line of a list and renders it. */
export function choose(lines: readonly string[], slots: Slots, ctx: RenderContext): string {
  if (!lines.length) return "";
  return render(lines[Math.floor(ctx.rng() * lines.length)], slots, ctx);
}

export function render(template: string, slots: Slots, ctx: RenderContext, depth = 0): string {
  let t = template;
  // Banks first, so a bank line can use every other mark.
  t = t.replace(/\{@([\w.]+)\}/g, (_, name: string) => {
    const line = fromBank(name, ctx);
    if (line === undefined) {
      ctx.missing?.push(`@${name}`);
      return "";
    }
    return depth > 6 ? line : render(line, slots, ctx, depth + 1);
  });
  // Conditions, innermost first.
  const cond = /<(!?)([\w.]+)\?([^<>]*)>/;
  for (let guard = 0; cond.test(t) && guard < 200; guard++) {
    t = t.replace(cond, (_, not: string, path: string, body: string) => (truthy(lookup(slots, path)) !== (not === "!") ? body : ""));
  }
  // Choices, innermost first.
  const alt = /\[([^[\]]*)\]/;
  for (let guard = 0; alt.test(t) && guard < 200; guard++) {
    t = t.replace(alt, (_, body: string) => {
      const opts = body.split("|");
      return opts[Math.floor(ctx.rng() * opts.length)];
    });
  }
  t = t.replace(/\{(?:(\w+):)?([\w.]+)\}/g, (_, mod: string | undefined, path: string) => {
    const v = lookup(slots, path);
    if (v === undefined || v === null || typeof v === "object") {
      ctx.missing?.push(path);
      return "";
    }
    return mod ? modify(mod, v, path) : String(v);
  });
  return depth ? t : tidy(t);
}

/** Spacing and sentence starts after the pieces are joined. */
export function tidy(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .replace(/([.!?])\s*\./g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/(^|[.!?]\s+)([a-z])/g, (whole: string, a: string, b: string, at: number, all: string) =>
      // "Jr. caught" and "No. 1" are not new sentences.
      (/\b(Jr|Sr|St|Mr|Dr|No|vs)\.\s+$/.test(all.slice(Math.max(0, at - 4), at + a.length)) ? whole : a + b.toUpperCase()))
    .trim();
}
