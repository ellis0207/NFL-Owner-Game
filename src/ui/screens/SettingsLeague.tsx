import { useState } from "react";
import { bindCustomLeague, checkPack, packTemplate, setCustomLeague } from "../../engine/custompack";
import { applySeason } from "../../engine/seasons";
import { RULES } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { download } from "../NewGame";

/** Settings: the save's history (a historical start and alternate history) and its custom league pack. */
export function SettingsLeague({ game, changed }: { game: GameState; changed: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const e = game.era;
  const rebind = () => { applySeason(game); bindCustomLeague(game); changed(); };
  return (
    <div className="panel stack tight">
      <h3>League and history</h3>
      <dl className="kv">
        <dt>Started</dt><dd>{e ? `${e.start} season (historical start)` : "2026 season"}</dd>
        {game.customLeague && <><dt>League pack</dt><dd>{game.customLeague.name} ({Object.keys(game.customLeague.teams).length} clubs renamed)</dd></>}
      </dl>
      {e && (
        <label className="toggle">
          <input id="alt-history-setting" type="checkbox" checked={e.alt} onChange={(x) => {
            e.alt = x.target.checked;
            // Turned on mid-save, the league freezes as it is this season; turned off, the real timeline resumes.
            if (e.alt && RULES.season > e.start) e.altFrom = RULES.season; else delete e.altFrom;
            rebind();
          }} />
          <span><strong>Alternate history</strong><br /><span className="muted">On: the real timeline stops here (no more real rule changes, caps, moves, renames or club sales); only your league's own votes, moves and sales change things. Off: real history plays out from the season you're in.</span></span>
        </label>
      )}
      <label className="field"><span className="label">Custom league pack</span>
        <input type="file" accept=".json,application/json" onChange={async (x) => {
          const f = x.target.files?.[0];
          if (!f) return;
          const c = checkPack(await f.text());
          if (!c.ok) return setNote(`Not applied: ${c.errors.join(" ")}`);
          setCustomLeague(game, c.pack!);
          rebind();
          setNote(`Applied "${c.pack!.name}".${c.warnings.length ? " " + c.warnings.join(" ") : ""}`);
        }} />
      </label>
      {note && <span className={note.startsWith("Not") ? "bad" : "muted"}>{note}</span>}
      <div className="btn-row">
        <button className="btn small" onClick={() => download("league-pack.json", packTemplate())}>Download a template</button>
        {game.customLeague && <button className="btn small" onClick={() => { setCustomLeague(game, null); rebind(); setNote("Back to the real names and colors."); }}>Remove the pack</button>}
      </div>
      <span className="muted">A pack renames and repaints clubs (city, name, colors) and nothing else. It's checked before it's applied: the format version, known club codes, names of 1 to 30 characters, hex colors, and no two clubs alike.</span>
    </div>
  );
}
