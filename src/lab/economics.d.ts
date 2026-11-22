import type { LabConfig, LabVenue } from "./types";
export const roofLabels: Record<string, string>;
export const facadeLabels: Record<string, string>;
export const surfaceLabels: Record<string, string>;
export const customVenue: LabVenue;
export function baseline(v: LabVenue): LabConfig;
export interface LabLine { label: string; cost: number; basis: string }
export interface LabEstimate { lines: LabLine[]; hard: number; regional: number; soft: number; contingency: number; land: number; total: number; low: number; high: number; months: number; delta: number }
export function estimate(v: LabVenue, c: LabConfig): LabEstimate;
export function money(n: number): string;
export function count(n: number): string;
