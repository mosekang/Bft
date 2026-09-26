import type { Cost } from "@dugout/protocol";

/** Copies of each card def in the shared pool, per cost (§4.4). */
export const POOL_COPIES: Readonly<Record<Cost, number>> = { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 };

/** Shop odds in % for cost 1..5, keyed by level (§4.4). */
export const SHOP_ODDS: Readonly<Record<number, Readonly<Record<Cost, number>>>> = {
  3: { 1: 75, 2: 25, 3: 0, 4: 0, 5: 0 },
  4: { 1: 55, 2: 30, 3: 15, 4: 0, 5: 0 },
  5: { 1: 45, 2: 33, 3: 20, 4: 2, 5: 0 },
  6: { 1: 30, 2: 40, 3: 25, 4: 5, 5: 0 },
  7: { 1: 19, 2: 30, 3: 35, 4: 15, 5: 1 },
  8: { 1: 17, 2: 24, 3: 32, 4: 24, 5: 3 },
  9: { 1: 15, 2: 18, 3: 25, 4: 30, 5: 12 },
  10: { 1: 5, 2: 10, 3: 20, 4: 40, 5: 25 },
};

/** Fictional pack composition (§5.3): card defs per cost and role. */
export const PACK_COMPOSITION: Readonly<Record<Cost, { hitters: number; sp: number; rp: number; ovr: readonly [number, number] }>> = {
  1: { hitters: 9, sp: 2, rp: 2, ovr: [45, 55] },
  2: { hitters: 9, sp: 3, rp: 1, ovr: [52, 62] },
  3: { hitters: 9, sp: 3, rp: 1, ovr: [60, 70] },
  4: { hitters: 8, sp: 3, rp: 1, ovr: [68, 78] },
  5: { hitters: 6, sp: 1, rp: 1, ovr: [78, 88] },
};
export const PACK_CARD_COUNT = 59;
