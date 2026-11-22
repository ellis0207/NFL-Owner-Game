import type { LabConfig, LabFacility, LabProfile, LabVenue } from "./types";
export const rates: Record<string, number>;
export function profile(v: LabVenue, c?: Partial<LabConfig>): LabProfile;
export function parkingDefaults(v: LabVenue): Partial<LabConfig>;
export function normalizeParking(v: LabVenue, c: LabConfig): LabConfig;
export interface LabParkingPlan {
  profile: LabProfile; config: LabConfig; baseSurface: number; baseGarage: number; shared: number; surface: number; garage: number;
  managed: number; total: number; added: number; surfaceAdded: number; garageFoot: number; convert: number; retire: number; levels: number;
  chosenLot: LabFacility | null; newAcres: number; land: number; hard: number; capital: number; budget: number; remainingAcres: number;
  demand: number; lines: { label: string; cost: number; basis: string }[];
  parcels: { enabled: boolean; acres: number; land: number; clearance: number; approvalMonths: number };
}
export function parkingPlan(v: LabVenue, c: LabConfig): LabParkingPlan;
