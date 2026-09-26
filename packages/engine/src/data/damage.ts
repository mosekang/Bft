/**
 * Fan-heart ("팬심") damage on a loss.
 *   damage = clamp(runDiff + stageBonus(stage), min, cap) * roundMultiplier
 * A 1-run loss stings a little; a blowout stings a lot, so that baseball's
 * single-game variance averages out across a run.
 */
export const FAN_HEARTS = {
  start: 100,
  minDamage: 2,
  maxDamage: 25,
  /** Added to the run differential; index = stage (0 unused). */
  stageBonus: [0, 0, 1, 2, 3, 4, 5, 6] as const,
  postseasonMultiplier: 2,
} as const;

export function lossDamage(runDiff: number, stage: number, multiplier = 1): number {
  const bonus = FAN_HEARTS.stageBonus[stage] ?? FAN_HEARTS.stageBonus[FAN_HEARTS.stageBonus.length - 1] ?? 0;
  const base = Math.max(FAN_HEARTS.minDamage, Math.min(FAN_HEARTS.maxDamage, Math.max(0, runDiff) + bonus));
  return base * multiplier;
}
