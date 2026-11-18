// Difficulty: how hard the world pushes back on the owner. The football and
// the money stay real at every level; what changes is how much other people
// ask of us and how quickly they lose patience.
//
// - trade: how much more value CPU teams want before they say yes to us.
// - ask: how far above the market agents open, and how low they'll go, with us.
// - pressure: how hard a setback lands with the people around the owner: fans'
//   trust, the GM's trust, partners' moods, the cost of overruling someone.
//
// Picking a level also sets the scouting reads and the economy to match
// (`applyDifficulty`); the owner can still change those one at a time after.
// Leaf module: types only, so any system can read it.
import type { GameState, Settings } from "./types";

export type Difficulty = NonNullable<Settings["difficulty"]>;

export const DIFFICULTY: Record<Difficulty, { label: string; what: string; trade: number; ask: number; pressure: number; scouting: Settings["scouting"]; economy: Settings["economy"] }> = {
  rookie: { label: "Rookie owner", what: "Agents and other GMs give you a break, setbacks land softly, scouting reads are sharper and the economy stays calm.", trade: 0.9, ask: 0.94, pressure: 0.6, scouting: "sharp", economy: "calm" },
  standard: { label: "Standard", what: "The league as it is.", trade: 1, ask: 1, pressure: 1, scouting: "real", economy: "normal" },
  veteran: { label: "Veteran owner", what: "Other GMs want more for what they give up, agents open higher, and fans, partners and staff lose patience faster.", trade: 1.06, ask: 1.04, pressure: 1.25, scouting: "real", economy: "normal" },
  legend: { label: "Hall of Fame owner", what: "Every deal costs more, every setback lands hard, scouting reads are foggier and the economy swings.", trade: 1.12, ask: 1.08, pressure: 1.5, scouting: "foggy", economy: "volatile" },
};

export const DIFFICULTY_KEYS = Object.keys(DIFFICULTY) as Difficulty[];

export function difficulty(state: GameState | undefined): (typeof DIFFICULTY)[Difficulty] {
  return DIFFICULTY[state?.settings?.difficulty ?? "standard"];
}

/** A setback scaled by the level: losses grow on harder levels, gains stay as they are. */
export function hurt(state: GameState | undefined, delta: number): number {
  return delta < 0 ? delta * difficulty(state).pressure : delta;
}

/** Pick a level: it also sets the scouting reads and the economy that go with it. */
export function applyDifficulty(settings: Settings, level: Difficulty): void {
  const d = DIFFICULTY[level];
  settings.difficulty = level;
  settings.scouting = d.scouting;
  settings.economy = d.economy;
}
