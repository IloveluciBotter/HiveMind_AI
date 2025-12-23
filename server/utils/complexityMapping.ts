export type ComplexityLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Maps a user's intelligence level (1-100) to the maximum allowed question complexity (1-5).
 * Expected by tests:
 *  1..20  -> 1
 * 21..40  -> 2
 * 41..60  -> 3
 * 61..80  -> 4
 * 81..∞   -> 5
 * Clamps weird values: <=20 => 1, >=81 => 5
 */
export function allowedComplexity(level: number): ComplexityLevel {
  const n = Number.isFinite(level) ? Math.floor(level) : 1;

  if (n <= 20) return 1;
  if (n <= 40) return 2;
  if (n <= 60) return 3;
  if (n <= 80) return 4;
  return 5;
}
