import type { Cost } from "../types/player.js";

/**
 * Economy constants. TFT values are the starting point; every number here is
 * a tuning knob validated by `bot-arena` (see docs/DESIGN.md §8).
 */
export const ECONOMY = {
  startingGold: 0,
  baseIncome: 5,
  /** 1 gold of interest per this many gold held ... */
  interestPer: 10,
  /** ... up to this cap (BIG_SPENDER philosophy raises it to 7). */
  interestCap: 5,
  /** Streak bonus: [streak length >=, bonus gold]. Applies to win and loss streaks alike. */
  streakBonus: [
    [2, 1],
    [3, 2],
    [5, 3],
  ] as const,
  rerollCost: 2,
  xpCost: 4,
  xpPerPurchase: 4,
  /** XP granted automatically at the start of each round. */
  xpPerRound: 2,
  shopSize: 5,
  /** Copies of the same card needed to reach the next star (FARM_SYSTEM: 2). */
  copiesPerStar: 3,
  maxItemsPerCard: 2,
} as const;

/** Starting level = number of real players you may field at round 1. */
export const STARTING_LEVEL = 3;
export const MAX_LEVEL = 10;

/**
 * XP required to go from level N to N+1 (index = current level).
 * Level 1 and 2 are unreachable (we start at 3); kept for table completeness.
 */
export const XP_TO_NEXT_LEVEL: Readonly<Record<number, number>> = {
  1: 0,
  2: 2,
  3: 6,
  4: 10,
  5: 20,
  6: 36,
  7: 48,
  8: 76,
  9: 84,
  10: Number.POSITIVE_INFINITY,
};

/** Copies of every template in the shared pool, per cost. */
export const POOL_COPIES: Readonly<Record<Cost, number>> = {
  1: 29,
  2: 22,
  3: 18,
  4: 12,
  5: 10,
};

/** Number of distinct templates per cost the generator produces per run. */
export const TEMPLATES_PER_COST: Readonly<Record<Cost, number>> = {
  1: 14,
  2: 13,
  3: 13,
  4: 12,
  5: 8,
};

/** Shop odds (%) per level for cost 1..5. Index = level (0 unused). */
export const SHOP_ODDS: ReadonlyArray<Readonly<Record<Cost, number>>> = [
  { 1: 100, 2: 0, 3: 0, 4: 0, 5: 0 }, // level 0 (unused)
  { 1: 100, 2: 0, 3: 0, 4: 0, 5: 0 }, // 1
  { 1: 100, 2: 0, 3: 0, 4: 0, 5: 0 }, // 2
  { 1: 75, 2: 25, 3: 0, 4: 0, 5: 0 }, // 3
  { 1: 55, 2: 30, 3: 15, 4: 0, 5: 0 }, // 4
  { 1: 45, 2: 33, 3: 20, 4: 2, 5: 0 }, // 5
  { 1: 30, 2: 40, 3: 25, 4: 5, 5: 0 }, // 6
  { 1: 19, 2: 30, 3: 40, 4: 10, 5: 1 }, // 7
  { 1: 17, 2: 24, 3: 32, 4: 24, 5: 3 }, // 8
  { 1: 15, 2: 18, 3: 25, 4: 30, 5: 12 }, // 9
  { 1: 5, 2: 10, 3: 20, 4: 40, 5: 25 }, // 10
];

/** Sell value of a card. ★ = cost; higher stars refund the copies spent (minus 1 for cost > 1, like TFT). */
export function sellValue(cost: Cost, star: 1 | 2 | 3): number {
  const copies = star === 1 ? 1 : star === 2 ? 3 : 9;
  const raw = cost * copies;
  return cost === 1 || star === 1 ? raw : raw - 1;
}
