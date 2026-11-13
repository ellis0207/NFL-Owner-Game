// The animation's art: player sprites rendered in Blender (pipeline/anim) and
// the play templates. They ship beside the page (dist/anim) and load the first
// time a field view opens; if they don't arrive the field view keeps to the
// ball and arrow.
import type { PlayBook } from "./stage";

export interface SpriteIndex {
  /** Pixels a frame, directions (rows), yards a frame spans, and where the feet are in it. */
  size: number;
  dirs: number;
  span: number;
  foot: [number, number];
  /** Per action: first column and number of frames. */
  actions: Record<string, [number, number]>;
  bodies: string[];
}

export interface AnimAssets {
  index: SpriteIndex;
  book: PlayBook;
  sheets: Record<string, ImageBitmap>;
}

let loading: Promise<AnimAssets | null> | null = null;

async function load(): Promise<AnimAssets | null> {
  try {
    const json = async (name: string) => {
      const res = await fetch(`anim/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const [index, book] = (await Promise.all([json("sprites.json"), json("plays.json")])) as [SpriteIndex, PlayBook];
    const sheets: Record<string, ImageBitmap> = {};
    for (const body of index.bodies) {
      const res = await fetch(`anim/${body}.webp`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sheets[body] = await createImageBitmap(await res.blob());
    }
    return { index, book, sheets };
  } catch {
    return null;
  }
}

/** The art, fetched once. Null when it can't be had (opened from a file, blocked, an old browser). */
export function animAssets(): Promise<AnimAssets | null> {
  return (loading ??= load());
}

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const tinted = new Map<string, HTMLCanvasElement>();

/**
 * A sprite sheet in a club's colors. The sheets are masks: red is the jersey,
 * green the helmet and pants, blue the gloves, socks and shoes. The home team
 * wears its color; the visitors wear white with their color on the helmet.
 */
export function teamSheet(a: AnimAssets, body: string, colors: [string, string], home: boolean): HTMLCanvasElement {
  const key = `${body}|${colors[0]}|${colors[1]}|${home}`;
  let c = tinted.get(key);
  if (c) return c;
  const src = a.sheets[body];
  c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const jersey = home ? hex(colors[0]) : [244, 244, 244];
  // A dark helmet on a dark jersey loses the head; the second color is lifted a little when the two are close.
  let second = home ? hex(colors[1]) : hex(colors[0]);
  if (home && Math.abs(jersey[0] - second[0]) + Math.abs(jersey[1] - second[1]) + Math.abs(jersey[2] - second[2]) < 90) second = [200, 204, 208];
  const plain = [236, 236, 236];
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i] / 255, gr = d[i + 1] / 255, b = d[i + 2] / 255;
    d[i] = Math.min(255, r * jersey[0] + gr * second[0] + b * plain[0]);
    d[i + 1] = Math.min(255, r * jersey[1] + gr * second[1] + b * plain[1]);
    d[i + 2] = Math.min(255, r * jersey[2] + gr * second[2] + b * plain[2]);
  }
  g.putImageData(img, 0, 0);
  tinted.set(key, c);
  return c;
}
