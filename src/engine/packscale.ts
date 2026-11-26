// Leaf module. A historical pack built from a club's Week 1 list (every season
// before 2016, and the 1994-1998 season rosters) carries 50-70 players a club,
// where the 2026 data and later packs carry the 90 in camp. Ratings are ranks
// within each position (pipeline/ratings.py), so with fewer backups below them
// the starters rank lower: a starting corner reads about 73 instead of 84.
// The sim reads ratings and traits on an absolute scale (a pass's completion,
// a quarterback's pocket, a kick), so an early league played worse: more
// sacks, fewer completions. This lays each position of such a pack back on the
// 2026 scale: the same players in the same order, with the top of the position
// (SCALE_DEPTH a club, as talent.ts holds it) matching 2026's mean and spread.
// pipeline/draft_classes.py applies the same map before reading careers.

import type { HiddenRating, Position } from "./types";

/** The 2026 data's top of each position: mean and spread of the best SCALE_DEPTH a club. */
export const SCALE_2026: Partial<Record<Position, { depth: number; mean: number; sd: number }>> = {
  QB: { depth: 2, mean: 75.94, sd: 11.01 }, RB: { depth: 2, mean: 83.83, sd: 7.3 }, WR: { depth: 5, mean: 80.22, sd: 8.71 },
  TE: { depth: 3, mean: 78.95, sd: 9.4 }, OT: { depth: 3, mean: 79.78, sd: 9.34 }, OG: { depth: 3, mean: 76.76, sd: 10.78 },
  C: { depth: 2, mean: 73.39, sd: 11.92 }, EDGE: { depth: 4, mean: 78.99, sd: 9.69 }, IDL: { depth: 4, mean: 78.09, sd: 10.08 },
  LB: { depth: 4, mean: 80.06, sd: 8.9 }, CB: { depth: 5, mean: 78.29, sd: 9.92 }, S: { depth: 3, mean: 81.4, sd: 8.28 },
};
/** Packs with at least this many players a club already sit on the camp-roster scale. */
const CAMP_SIZE = 75;

interface PackLike { players: { id: string; team: string | null; position: Position }[]; teams: unknown[]; ratings: Record<string, HiddenRating>; scaled?: boolean }

/** The pack's ratings on the 2026 scale (once per pack object; specialists and fullbacks are left as they are). */
export function scalePack(pack: PackLike): Record<string, HiddenRating> {
  if (pack.scaled) return pack.ratings;
  pack.scaled = true;
  const clubs = pack.teams.length;
  const rostered = pack.players.filter((p) => p.team);
  if (rostered.length / clubs >= CAMP_SIZE) return pack.ratings;
  const fit = (x: number) => Math.max(25, Math.min(99, Math.round(x)));
  for (const [pos, ref] of Object.entries(SCALE_2026) as [Position, { depth: number; mean: number; sd: number }][]) {
    const top = rostered.filter((p) => p.position === pos && pack.ratings[p.id]).map((p) => pack.ratings[p.id].overall)
      .sort((a, b) => b - a).slice(0, ref.depth * clubs);
    if (top.length < 10) continue;
    const mean = top.reduce((a, b) => a + b, 0) / top.length;
    const sd = Math.sqrt(top.reduce((a, b) => a + (b - mean) ** 2, 0) / top.length) || ref.sd;
    const a = Math.max(0.8, Math.min(1.25, ref.sd / sd));
    const b = ref.mean - a * mean;
    for (const p of pack.players) {
      const r = p.position === pos ? pack.ratings[p.id] : undefined;
      if (!r) continue;
      const overall = fit(a * r.overall + b);
      r.potential = Math.max(overall, fit(a * r.potential + b));
      r.overall = overall;
      for (const k of Object.keys(r.traits)) r.traits[k] = fit(a * r.traits[k] + b);
    }
  }
  return pack.ratings;
}

/**
 * The 2026 staff's average hidden quality by role (real coaches rated from
 * their records). A pack's staff were drawn around 66 for every role, so its
 * real head coaches read like ordinary assistants and called plays worse than
 * any 2026 staff (more sacks, worse protection calls).
 */
const STAFF_2026: Record<string, Record<string, number>> = {
  COL: { evaluation: 67.8 }, DC: { development: 72.8, evaluation: 69.9, playCalling: 72.8 },
  GM: { capManagement: 71.1, evaluation: 76.4, negotiation: 73.2 },
  HC: { development: 76.7, evaluation: 76.4, gameManagement: 71.8, leadership: 80.3, playCalling: 81.1 },
  OC: { development: 70.6, evaluation: 66.9, playCalling: 66.8 }, PRO: { evaluation: 62.6 },
  STC: { development: 64.4, specialTeams: 71.4 }, TRN: { prevention: 65, recovery: 66.8 },
};

interface StaffPackLike { staff: { people: { id: string; role: string }[] }; hiddenStaff: Record<string, Record<string, number>>; staffScaled?: boolean }

/** The pack's staff moved, role by role, to the 2026 staff's average (each keeps their place among their peers). */
export function scaleStaff(pack: StaffPackLike): Record<string, Record<string, number>> {
  const h = pack.hiddenStaff;
  if (pack.staffScaled) return h;
  pack.staffScaled = true;
  const byRole: Record<string, string[]> = {};
  for (const p of pack.staff.people) if (h[p.id]) (byRole[p.role] ??= []).push(p.id);
  for (const [role, ids] of Object.entries(byRole)) {
    const want = STAFF_2026[role];
    if (!want) continue;
    for (const [k, target] of Object.entries(want)) {
      const vals = ids.map((id) => h[id][k]).filter((v): v is number => typeof v === "number");
      if (vals.length < 5) continue;
      const shift = target - vals.reduce((a, b) => a + b, 0) / vals.length;
      for (const id of ids) if (typeof h[id][k] === "number") h[id][k] = Math.max(40, Math.min(95, Math.round(h[id][k] + shift)));
    }
  }
  return h;
}
