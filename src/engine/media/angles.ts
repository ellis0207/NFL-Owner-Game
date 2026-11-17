// Angles: the lens a story takes on a fact. Each angle says when it applies
// (from the fact's tags), how strongly, and carries its own headlines, opinion
// headlines and paragraph. A story type is fact type, angle and format.
import type { Fact, Family } from "./facts";
import type { FormatId, Group } from "./formats";
import type { Bank } from "./grammar";

export type Tags = Fact["tags"];

export interface AngleDef {
  id: string;
  /** How well the angle fits, 0 when it doesn't apply. */
  when: (t: Tags) => number;
  head: readonly string[];
  take: readonly string[];
  para: readonly string[];
}

export interface FamilyContent {
  family: Family;
  /** Formats the family can be written in, the straight news one first. */
  formats: FormatId[];
  lede: Partial<Record<Group, readonly string[]>>;
  /** Supporting facts after the angle's paragraph. */
  details: readonly string[];
  angles: AngleDef[];
  bank?: Bank;
  /** Who is quoted, from which bank. */
  quote?: (f: Fact) => { bank: string; who: string; role: string } | null;
}

/** Applies when a tag is set (true or a number above zero). */
export const on = (tag: string, w = 1) => (t: Tags) => (t[tag] ? w : 0);
export const all = (tags: string[], w = 1) => (t: Tags) => (tags.every((x) => t[x]) ? w : 0);
export const always = (w: number) => () => w;
