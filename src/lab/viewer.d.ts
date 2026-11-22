import type { LabConfig, LabVenue } from "./types";
export class Viewer {
  constructor(container: HTMLElement);
  night: boolean; hideRoof: boolean; rotate: boolean; mode: string; dirty: boolean;
  onSelect?: (label: { id: string; name: string; match?: string }) => void;
  load(v: LabVenue, c: LabConfig): void;
  reset(mode?: string): void;
  destroy(): void;
}
