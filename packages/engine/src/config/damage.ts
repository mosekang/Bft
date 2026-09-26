/** Fan-heart damage (§4.6). */
export const DAMAGE = {
  startHp: 100,
  /** Base by stage; index = stage. S1 uses the fixed PvE value instead. */
  stageBase: { 1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 9, 7: 12 } as Readonly<Record<number, number>>,
  runDiffCap: 8,
  postseasonMultiplier: 2,
  draw: 0,
  pve: { springCamp: 3, allStar: 3, legend: 6 },
  ghostMultiplier: 0.5,
} as const;

/** Damage for a PvP loss by `runDiff` in `stage`. */
export function lossDamage(runDiff: number, stage: number): number {
  const base = (DAMAGE.stageBase[stage] ?? DAMAGE.stageBase[7] ?? 12) + Math.min(Math.max(runDiff, 0), DAMAGE.runDiffCap);
  return stage >= 7 ? base * DAMAGE.postseasonMultiplier : base;
}
