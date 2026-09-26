import type { Cost, Star } from "@dugout/protocol";

/** Economy (§4.2). */
export const ECONOMY = {
  startingGold: 0,
  /** Base income per round code; anything not listed pays `defaultBaseIncome`. */
  baseIncomeByRound: { "1-1": 2, "1-2": 2, "1-3": 3 } as Readonly<Record<string, number>>,
  defaultBaseIncome: 5,
  interestPer: 10,
  interestCap: 5,
  /** [streak length >=, bonus]. Applies to win and loss streaks alike. */
  streakBonus: [
    [2, 1],
    [4, 2],
    [6, 3],
  ] as const,
  rerollCost: 2,
  xpCost: 4,
  xpPerPurchase: 4,
  freeXpPerRound: 2,
  shopSize: 5,
  copiesPerStar: 3,
  maxItemsPerCard: 3,
  benchSize: 6,
} as const;

export function baseIncome(roundCode: string): number {
  return ECONOMY.baseIncomeByRound[roundCode] ?? ECONOMY.defaultBaseIncome;
}

export function interest(gold: number, cap: number = ECONOMY.interestCap): number {
  return Math.min(cap, Math.floor(gold / ECONOMY.interestPer));
}

export function streakBonus(streak: number): number {
  let bonus = 0;
  for (const [len, b] of ECONOMY.streakBonus) if (streak >= len) bonus = b;
  return bonus;
}

/** ★ = cost, ★★ = cost×3, ★★★ = cost×9, no exceptions (§4.2). */
export function sellValue(cost: Cost, star: Star): number {
  return cost * (star === 1 ? 1 : star === 2 ? 3 : 9);
}
