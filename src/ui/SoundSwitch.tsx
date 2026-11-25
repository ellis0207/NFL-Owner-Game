// The mute button in the header: sound on (at the level set in Settings) or off.
import { useEffect, useState } from "react";
import { readPrefs, writePrefs } from "./prefs";
import { cue } from "./sound";

export function SoundSwitch() {
  const [level, setLevel] = useState(() => readPrefs().sound);
  useEffect(() => {
    const sync = () => setLevel(readPrefs().sound);
    window.addEventListener("nfl-prefs", sync);
    return () => window.removeEventListener("nfl-prefs", sync);
  }, []);
  const on = level !== "off";
  const flip = () => {
    const p = readPrefs();
    const to = on ? "off" : "low";
    writePrefs({ ...p, sound: to });
    setLevel(to);
    if (to !== "off") cue("notify");
  };
  return (
    <button className="sound-switch" aria-pressed={on} onClick={flip} title={on ? "Sound on: click to mute" : "Sound off: click to turn it on"} aria-label={on ? "Mute sound" : "Turn sound on"}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
    </button>
  );
}
