// Tabs set out in labeled rows, for pages with too many views for one line.
export function GroupedTabs<T extends string>({ label, groups, value, onChange, note }: {
  label: string;
  groups: readonly { label: string; tabs: readonly T[] }[];
  value: T;
  onChange: (t: T) => void;
  /** Text after a tab's name, such as a count of things waiting. */
  note?: (t: T) => string;
}) {
  return (
    <div className="tab-groups" role="group" aria-label={label}>
      {groups.map((g) => (
        <div key={g.label} className="tab-group">
          <span className="label">{g.label}</span>
          <div className="tabs">
            {g.tabs.map((t) => <button key={t} aria-pressed={value === t} onClick={() => onChange(t)}>{t}{note?.(t) ?? ""}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}
