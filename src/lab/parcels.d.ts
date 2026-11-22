import type { LabConfig, LabVenue } from "./types";
export interface LabParcel { id: string; name: string; acres: number; priceMultiplier: number; clearancePerAcre: number; approvalMonths: number; use: string; constraint: string }
export function developmentParcels(v: LabVenue): LabParcel[];
export function parcelPlan(v: LabVenue, c: Partial<LabConfig>): { enabled: boolean; all: LabParcel[]; selected: LabParcel[]; stalls: number; acres: number; land: number; clearance: number; approvalMonths: number };
