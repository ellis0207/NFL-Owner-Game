// Play settings: the full-realism preset, play modes, information limits
// and the sandbox, which is labeled everywhere and can't be undone.
import { useState } from "react";
import { fullRealism, isRealism, makeSandbox, MODES, setPlayMode } from "../../engine/desk";
import type { GameState } from "../../engine/types";

export function PlaySettings({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const s = game.settings;
  return (
    <div className="panel stack tight">
      <h3>How you play</h3>
      {msg && <p className="notice">{msg}</p>}
      <span>{game.sandbox ? <strong className="bad">Sandbox game</strong> : isRealism(game) ? "Realism game: real rules, real money, real uncertainty." : "Custom realism settings."}</span>
      {!game.sandbox && <button className="btn small" onClick={() => { setMsg(fullRealism(game) ?? "Full realism is on: the real cap and finances, real scouting reads, one continuing save."); changed(); }}>Use full realism</button>}
      <label className="field"><span className="label">Play mode</span>
        <select value={s.mode ?? "owner"} onChange={(e) => { setPlayMode(game, e.target.value as NonNullable<typeof s.mode>); changed(); }}>
          {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <span className="muted">{MODES[s.mode ?? "owner"].what} You can still change any area on the Front office page.</span>
      <label className="field"><span className="label">Information you see</span>
        <select value={s.info ?? "real"} onChange={(e) => { s.info = e.target.value as NonNullable<typeof s.info>; changed(); }}>
          <option value="real">The usual: facts, staff estimates and opinions, labeled</option>
          <option value="limited">Confirmed facts only: no models, projections or ranges</option>
          {game.sandbox && <option value="full">Everything, including private information (sandbox only)</option>}
        </select>
      </label>
      {!game.sandbox && (sure
        ? <div className="btn-row"><span className="bad">A sandbox turns off the cap and money limits for good, and the game is labeled a sandbox from then on.</span><button className="btn small" onClick={() => { makeSandbox(game); setSure(false); changed(); }}>Make it a sandbox</button><button className="btn small" onClick={() => setSure(false)}>Cancel</button></div>
        : <button className="btn small" onClick={() => setSure(true)}>Turn this game into a sandbox...</button>)}
    </div>
  );
}
