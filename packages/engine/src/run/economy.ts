import type { PlayerState } from "@dugout/protocol";
import { ECONOMY, baseIncome, interest, streakBonus } from "../config/economy.js";
import type { RunEffects } from "./effects.js";

export interface IncomeBreakdown {
  base: number;
  interest: number;
  streak: number;
  saveBonus: number;
  total: number;
}

/** §4.2 round income. `saveWin` is true when the player won a save situation with CLOSER active. */
export function roundIncome(player: PlayerState, roundCode: string, effects: RunEffects, saveWin: boolean): IncomeBreakdown {
  const base = baseIncome(roundCode);
  const i = interest(player.gold, effects.interestCap);
  const streak = streakBonus(Math.max(player.winStreak, player.loseStreak));
  const saveBonus = saveWin ? effects.saveWinGold : 0;
  return { base, interest: i, streak, saveBonus, total: base + i + streak + saveBonus };
}

export function rerollCost(effects: RunEffects): number {
  return Math.min(ECONOMY.rerollCost, effects.rerollCost);
}

export function xpCost(effects: RunEffects): number {
  return Math.round(ECONOMY.xpCost * effects.xpCostMult);
}
