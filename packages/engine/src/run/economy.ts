import type { PlayerState } from "@dugout/protocol";
import { ECONOMY, baseIncome, interest, streakBonus } from "../config/economy.js";
import type { RunEffects } from "./effects.js";

export interface IncomeBreakdown {
  base: number;
  interest: number;
  streak: number;
  saveBonus: number;
  /** Augment income (REBUILDING, CHEER_SQUAD home wins). */
  bonus: number;
  total: number;
}

type IncomeEffects = Pick<RunEffects, "interestCap" | "saveWinGold"> & Partial<Pick<RunEffects, "hpGoldBonus" | "hpGoldMinHp">>;

/** Per-round augment gold (REBUILDING) for a player at `hp`. */
export function hpGold(hp: number, effects: IncomeEffects): number {
  return (effects.hpGoldBonus ?? 0) > 0 && hp >= (effects.hpGoldMinHp ?? 0) ? effects.hpGoldBonus ?? 0 : 0;
}

/**
 * §4.2 round income. `saveWin` is true when the player won a save situation
 * with CLOSER active; `extraBonus` is gold earned by the game itself (home wins).
 * The REBUILDING bonus checks `player.hp` (pass the post-damage hp).
 */
export function roundIncome(player: PlayerState, roundCode: string, effects: IncomeEffects, saveWin: boolean, extraBonus = 0): IncomeBreakdown {
  const base = baseIncome(roundCode);
  const i = interest(player.gold, effects.interestCap);
  const streak = streakBonus(Math.max(player.winStreak, player.loseStreak));
  const saveBonus = saveWin ? effects.saveWinGold : 0;
  const bonus = hpGold(player.hp, effects) + extraBonus;
  return { base, interest: i, streak, saveBonus, bonus, total: base + i + streak + saveBonus + bonus };
}

export function rerollCost(effects: RunEffects): number {
  return Math.min(ECONOMY.rerollCost, effects.rerollCost);
}

/** What the player's next reroll costs: AGENT free rerolls, then DATA_BASEBALL's first-reroll discount. */
export function rerollCostFor(player: PlayerState, effects: RunEffects): number {
  if ((player.perks?.freeRerolls ?? 0) > 0) return 0;
  const cost = rerollCost(effects);
  return player.rerollCount === 0 ? Math.max(0, cost - effects.firstRerollDiscount) : cost;
}

export function xpCost(effects: RunEffects): number {
  return Math.round(ECONOMY.xpCost * effects.xpCostMult);
}
