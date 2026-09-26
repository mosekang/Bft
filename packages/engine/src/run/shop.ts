import type { Cost, GameState, PlayerState } from "@dugout/protocol";
import { COSTS } from "@dugout/protocol";
import { ECONOMY } from "../config/economy.js";
import { LEVELS, xpToNext } from "../config/levels.js";
import { POOL_COPIES, SHOP_ODDS } from "../config/shop.js";
import type { Rng } from "../rng.js";
import type { RunContext } from "./context.js";

/** Initial shared pool: every def × copies for its cost. */
export function initialPool(ctx: RunContext): Record<string, number> {
  const pool: Record<string, number> = {};
  for (const c of ctx.pack.cards) pool[c.id] = POOL_COPIES[c.cost];
  return pool;
}

/** Roll one shop (§4.4). Cards leave the pool while offered (returned on reroll). */
export function rollShop(state: GameState, player: PlayerState, rng: Rng, ctx: RunContext): { state: GameState; shop: (string | null)[] } {
  let pool = { ...state.pool };
  // Return currently offered, unlocked cards to the pool.
  for (const id of player.shop) if (id) pool[id] = (pool[id] ?? 0) + 1;
  const odds = SHOP_ODDS[Math.max(LEVELS.start, Math.min(LEVELS.max, player.level))]!;
  const shop: (string | null)[] = [];
  for (let i = 0; i < ECONOMY.shopSize; i++) {
    let cost = COSTS[rng.weightedIndex(COSTS.map((c) => odds[c]))]!;
    let picked: string | null = null;
    for (let tries = 0; tries < 5 && !picked; tries++) {
      const candidates = ctx.pack.cards.filter((c) => c.cost === cost && (pool[c.id] ?? 0) > 0);
      if (candidates.length > 0) {
        const weights = candidates.map((c) => pool[c.id] ?? 0);
        picked = candidates[rng.weightedIndex(weights)]!.id;
      } else {
        cost = Math.max(1, cost - 1) as Cost;
      }
    }
    if (picked) pool[picked] = (pool[picked] ?? 0) - 1;
    shop.push(picked);
  }
  return { state: { ...state, pool }, shop };
}

/** Return every offered card of a player to the pool (elimination, end of run). */
export function returnShopToPool(state: GameState, player: PlayerState): GameState {
  const pool = { ...state.pool };
  for (const id of player.shop) if (id) pool[id] = (pool[id] ?? 0) + 1;
  return { ...state, pool };
}

/** Add XP and level up as far as it goes (§4.3). */
export function addXp(player: PlayerState, xp: number): PlayerState {
  let level = player.level;
  let total = player.xp + xp;
  while (level < LEVELS.max && total >= xpToNext(level)) {
    total -= xpToNext(level);
    level++;
  }
  if (level >= LEVELS.max) total = 0;
  return { ...player, level, xp: total };
}
