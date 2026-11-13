import { useState } from "react";
import { VOLATILITY } from "../../engine/economy";
import type { GameState, Settings } from "../../engine/types";
import { PlaySettings } from "./PlaySettings";
import { SettingsLeague } from "./SettingsLeague";
import { readPrefs, writePrefs, type Prefs } from "../prefs";

export const TODAY_PANELS = ["Decision queue", "Staff", "Business", "Media", "Inbox"] as const;

const SCOUTING: Record<NonNullable<Settings["scouting"]>, string> = {
  sharp: "Sharper reads: your scouts and coaches miss by less. Easier.",
  real: "As real front offices see players: informed, never certain.",
  foggy: "Foggier reads: every report misses by more. Harder.",
};

export function SettingsScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs());
  const [confirmIron, setConfirmIron] = useState(false);
  const save = (p: Prefs) => { setPrefs(p); writePrefs(p); };
  const set = (s: Partial<Settings>) => { Object.assign(game.settings, s); changed(); };
  return (
    <section className="stack">
      <h2>Settings</h2>
      <div className="split">
        <div className="panel stack tight">
          <h3>Realism</h3>
          <dl className="kv">
            <dt>Salary cap</dt><dd>{game.settings.capRules === "real" ? "Real NFL rules" : "Off"}</dd>
            <dt>Owner finances</dt><dd>{game.settings.finances === "relaxed" ? "Relaxed: the team's cash is topped up" : "Real: you cover shortfalls"}</dd>
          </dl>
          <label className="field"><span className="label">Scouting precision</span>
            <select value={game.settings.scouting ?? "real"} onChange={(e) => set({ scouting: e.target.value as Settings["scouting"] })}>
              {Object.entries(SCOUTING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">Economic volatility</span>
            <select value={game.settings.economy ?? "normal"} onChange={(e) => set({ economy: e.target.value as Settings["economy"] })}>
              {Object.entries(VOLATILITY).map(([k, v]) => <option key={k} value={k}>{v.label}: {v.what}</option>)}
            </select>
          </label>
          <span className="muted">No setting shows a player's true rating. Precision changes how far your own staff's reads can be off; other teams see what they always saw.</span>
          <div className="stack tight">
            <strong>Ironman</strong>
            {game.settings.ironman
              ? <span>On. This game keeps one continuing save: no loading earlier saves from inside the game.</span>
              : confirmIron
                ? <div className="btn-row"><span className="warn">This can't be turned off.</span><button className="btn small danger" onClick={() => { set({ ironman: true }); setConfirmIron(false); }}>Turn on ironman</button><button className="btn small" onClick={() => setConfirmIron(false)}>Cancel</button></div>
                : <div className="btn-row"><span className="muted">Off. Live with every decision: one save, no going back.</span><button className="btn small" onClick={() => setConfirmIron(true)}>Turn on</button></div>}
          </div>
        </div>
        <div className="panel stack tight">
          <h3>Simulation</h3>
          <label className="field"><span className="label">When simming several days</span>
            <select value={game.settings.pause ?? "never"} onChange={(e) => set({ pause: e.target.value as Settings["pause"] })}>
              <option value="never">Keep going: the staff handles what comes up</option>
              <option value="urgent">Stop when an urgent decision lands on my desk</option>
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={prefs.followGames} onChange={(e) => save({ ...prefs, followGames: e.target.checked })} />
            <span><strong>Follow my games play by play</strong><br /><span className="muted">When you play your game from the Today page, it comes in one play at a time on a field view with a scoreboard, and you can skip ahead by drive or quarter.</span></span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={prefs.animate} onChange={(e) => save({ ...prefs, animate: e.target.checked })} />
            <span><strong>Animated players on the field view</strong><br /><span className="muted">Both teams line up before each snap and running plays are acted out; other plays still show the ball and arrow for now. It stays off when your device asks for reduced motion.</span></span>
          </label>
          <span className="muted">"Sim a week" in the header advances seven days, stopping early for the draft or (with pauses on) anything urgent. How much lands on your desk at all is set under Front office, Decision rights.</span>
        </div>
        <SettingsLeague game={game} changed={changed} />
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Display</h3>
          <label className="field"><span className="label">Text size</span>
            <select value={prefs.textSize} onChange={(e) => save({ ...prefs, textSize: Number(e.target.value) })}>
              {[0.9, 1, 1.15, 1.3, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
            </select>
          </label>
          <label className="field"><span className="label">Theme</span>
            <select value={prefs.theme} onChange={(e) => save({ ...prefs, theme: e.target.value as typeof prefs.theme })}>
              <option value="auto">Match this device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={prefs.contrast === "high"} onChange={(e) => save({ ...prefs, contrast: e.target.checked ? "high" : "normal" })} />
            <span><strong>High contrast</strong><br /><span className="muted">Darker secondary text and table lines.</span></span>
          </label>
          <span className="muted">Display settings are kept in this browser. Everything can be reached with the keyboard: Tab moves between controls, and the search box finds any player, coach, executive or team.</span>
        </div>
        <div className="panel stack tight">
          <h3>Today page</h3>
          <span className="muted">Choose the panels you want on the Today page.</span>
          {TODAY_PANELS.map((p) => (
            <label key={p} className="toggle">
              <input type="checkbox" checked={!prefs.hidden.includes(p)} onChange={(e) => save({ ...prefs, hidden: e.target.checked ? prefs.hidden.filter((h) => h !== p) : [...prefs.hidden, p] })} />
              <span>{p}</span>
            </label>
          ))}
        </div>
      </div>
      <PlaySettings game={game} changed={changed} />
    </section>
  );
}
