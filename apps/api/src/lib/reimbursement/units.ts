/**
 * Centralized DT ↔ millimes conversion.
 * All internal calculations use millimes (integer arithmetic, no float issues).
 * 1 DT = 1 000 millimes.
 */

/** Convert dinars (DT) to millimes. Rounds to nearest integer. */
export function toMillimes(dt: number): number {
  return Math.round(dt * 1000);
}

/** Convert millimes to dinars (DT). */
export function toDinars(millimes: number): number {
  return millimes / 1000;
}
