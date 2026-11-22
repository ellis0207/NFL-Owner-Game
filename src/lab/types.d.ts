// Shapes the Stadium Lab modules pass around (they are plain JavaScript).
export interface LabVenue {
  id: string; team: string; conf?: string; name: string; city: string; capacity: number; opened?: number;
  roof: string; style: string; color: string; facadeColor: string; surface: string; description?: string; source?: string;
}
/** A design: the Lab's structure, experience, parking and land fields. */
export interface LabConfig {
  custom?: boolean; name?: string; capacity: number; roof: string; color: string; surface: string; facade: string;
  shape?: string; decks?: number; rake?: string; board: string; suites: number; solar: boolean; plaza: boolean;
  led: boolean; wifi: boolean; amenities: boolean; market: number; soft: number; contingency: number; land: number;
  parcelMode: boolean; parcelIds: string; parking: number; garageFoot: number; levels: number; convert: number;
  retire: number; convertLot: string; lease: number; landRate: number; [k: string]: unknown;
}
export interface LabFacility { id: string; name: string; control: string; type: string; dir?: string; spaces: number; quality?: string }
export interface LabProfile {
  context: string; source: string | null; sourceLabel: string; notes: string; acreage: number; rebuildAcres: number;
  price: number; heading: number; facilities: LabFacility[]; constraints: string[]; [k: string]: unknown;
}
