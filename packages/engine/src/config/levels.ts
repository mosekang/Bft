/** Levels and board capacity (§4.3). */
export const LEVELS = {
  start: 3,
  max: 10,
  /** XP needed to go from level N to N+1. */
  xpToNext: { 3: 4, 4: 8, 5: 16, 6: 24, 7: 32, 8: 40, 9: 56 } as Readonly<Record<number, number>>,
} as const;

export function xpToNext(level: number): number {
  return LEVELS.xpToNext[level] ?? Number.POSITIVE_INFINITY;
}

/** Star bonuses to every internal rating (§4.5), capped at 99. */
export const STAR_BONUS = { 1: 0, 2: 12, 3: 25 } as const;
