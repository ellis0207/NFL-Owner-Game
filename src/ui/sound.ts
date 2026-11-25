// The game's sounds, made in the browser with the Web Audio API: no sound
// files to download. Everything is a few oscillators and a burst of filtered
// noise, kept short and quiet, so it reads as a cue rather than music.
//
// Volume is a per-viewer preference (prefs.ts): off, low (the default) or
// full. Browsers only allow sound after the viewer has clicked or pressed a
// key, so the audio context is made on the first cue after one; until then
// cues are dropped silently. No module work happens at load time, so the sim
// worker can import the UI tree without touching `window`.
import { readPrefs } from "./prefs";

export type Cue = "win" | "loss" | "achievement" | "whistle" | "cheer" | "groan" | "notify" | "tick";

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

const LEVEL = { off: 0, low: 0.35, full: 1 } as const;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  // A context made before the viewer interacted would start suspended; wait for a real click.
  if (!ctx) {
    const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (active && !active.hasBeenActive) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = ac.sampleRate * 2;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  // A fixed pattern is fine for noise, and keeps Math.random out of the code base.
  let x = 0x2545f491;
  for (let i = 0; i < len; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    data[i] = ((x >>> 0) / 0xffffffff) * 2 - 1;
  }
  return noiseBuf;
}

/** A note with a soft attack and an exponential fade. */
function tone(ac: AudioContext, out: AudioNode, freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine"): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Filtered noise with a swell: a crowd, a breath of air through a whistle. */
function hiss(ac: AudioContext, out: AudioNode, at: number, dur: number, gain: number, freq: number, q: number, rise = 0.25): BiquadFilterNode {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(freq, at);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * rise);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at, (at * 7.3) % 1.5);
  src.stop(at + dur + 0.05);
  return f;
}

/** Plays a cue at the viewer's volume. Safe to call anywhere; does nothing when sound is off or not yet allowed. */
export function cue(name: Cue): void {
  const level = LEVEL[readPrefs().sound] ?? 0;
  if (!level) return;
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = 0.5 * level;
  out.connect(ac.destination);
  const t = ac.currentTime + 0.02;
  switch (name) {
    case "win": // A rising fifth and an octave: C, G, C.
      tone(ac, out, 523.25, t, 0.35, 0.22, "triangle");
      tone(ac, out, 783.99, t + 0.12, 0.35, 0.2, "triangle");
      tone(ac, out, 1046.5, t + 0.24, 0.6, 0.18, "triangle");
      break;
    case "loss": // Two low notes falling.
      tone(ac, out, 220, t, 0.45, 0.16, "sine");
      tone(ac, out, 164.81, t + 0.22, 0.7, 0.14, "sine");
      break;
    case "achievement": // A bright arpeggio with a shimmer on top.
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, out, f, t + i * 0.08, 0.5, 0.14, "triangle"));
      tone(ac, out, 2093, t + 0.32, 0.8, 0.05, "sine");
      break;
    case "whistle": { // Two blasts of a referee's whistle: a pitched hiss with a trill.
      for (const [start, len] of [[0, 0.22], [0.3, 0.55]] as const) {
        const f = hiss(ac, out, t + start, len, 0.5, 2900, 18, 0.1);
        const lfo = ac.createOscillator();
        const depth = ac.createGain();
        lfo.frequency.value = 28;
        depth.gain.value = 120;
        lfo.connect(depth).connect(f.frequency);
        lfo.start(t + start);
        lfo.stop(t + start + len);
        tone(ac, out, 2900, t + start, len, 0.04, "sine");
      }
      break;
    }
    case "cheer": // A crowd rising and falling away.
      hiss(ac, out, t, 1.8, 0.5, 900, 0.6, 0.3);
      hiss(ac, out, t + 0.05, 1.6, 0.25, 2200, 0.8, 0.35);
      break;
    case "groan": // A short, low crowd murmur.
      hiss(ac, out, t, 0.9, 0.22, 380, 0.9, 0.2);
      break;
    case "notify": // A soft two-note ping.
      tone(ac, out, 880, t, 0.18, 0.08, "sine");
      tone(ac, out, 1318.5, t + 0.09, 0.3, 0.07, "sine");
      break;
    case "tick":
      tone(ac, out, 1600, t, 0.05, 0.04, "square");
      break;
  }
  window.setTimeout(() => out.disconnect(), 3000);
}
