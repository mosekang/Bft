import type { CardInstance, GameState, ItemId, PlayerState, SpecialItemId } from "@dugout/protocol";
import { SPECIAL_ITEM_IDS } from "@dugout/protocol";
import { ITEM_BY_ID, SPECIAL_REWARD_OPTIONS } from "../config/items.js";
import type { Rng } from "../rng.js";
import { ownedIds } from "./cards.js";
import type { RunContext } from "./context.js";
import type { RunEffects } from "./effects.js";

/** Special items that take effect the moment they are picked (v3 §18.3). */
export const isInstantSpecial = (id: ItemId): boolean => ITEM_BY_ID.get(id)?.use === "INSTANT";

const param = (id: SpecialItemId, key: string) => ITEM_BY_ID.get(id)?.params[key] ?? 0;

/** Apply an INSTANT special for `playerId`; it never enters the inventory. */
export function applyInstantSpecial(state: GameState, playerId: string, id: ItemId, ctx: RunContext): GameState {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return state;
  const perks = { ...(p.perks ?? {}) };
  let cards = state.cards;
  let scoutingActive = p.scoutingActive;
  switch (id) {
    case "SCOUT_REPORT":
      perks.scoutRounds = Math.max(perks.scoutRounds ?? 0, param("SCOUT_REPORT", "scoutRounds"));
      scoutingActive = true;
      break;
    case "SUPPLEMENT": {
      const next: Record<string, CardInstance> = { ...cards };
      for (const cid of ownedIds(p)) {
        const c = next[cid];
        const def = c ? ctx.defs.get(c.defId) : undefined;
        if (c && def && def.role !== "H" && c.fatigue > 0) next[cid] = { ...c, fatigue: 0 };
      }
      cards = next;
      break;
    }
    case "CHEER_SONG":
      perks.cheerRounds = (perks.cheerRounds ?? 0) + param("CHEER_SONG", "cheerRounds");
      break;
    case "AGENT":
      perks.freeRerolls = (perks.freeRerolls ?? 0) + param("AGENT", "freeRerolls");
      break;
    default:
      return state;
  }
  return { ...state, cards, players: state.players.map((x) => (x.id === playerId ? { ...x, perks, scoutingActive } : x)) };
}

/** Count down per-game perks after a round with games (CHEER_SONG, SCOUT_REPORT). */
export function tickPerks(p: PlayerState): PlayerState {
  if (!p.perks) return p;
  const perks = { ...p.perks };
  if (perks.cheerRounds) perks.cheerRounds--;
  if (perks.scoutRounds) perks.scoutRounds--;
  return { ...p, perks };
}

/** Spend one AGENT free reroll, if any. */
export function spendFreeReroll(p: PlayerState): PlayerState {
  const n = p.perks?.freeRerolls ?? 0;
  return n > 0 ? { ...p, perks: { ...p.perks, freeRerolls: n - 1 } } : p;
}

/** Legend-match reward options: `SPECIAL_REWARD_OPTIONS` distinct specials. */
export function specialRewardOptions(rng: Rng): SpecialItemId[] {
  return rng.shuffle(SPECIAL_ITEM_IDS).slice(0, SPECIAL_REWARD_OPTIONS);
}

/**
 * BACKUP_CATCHER: with `fatigueRecoverChance`, one random tired pitcher among
 * `ownedIds` recovers `fatigueRecover` rounds. Returns the (possibly) updated cards.
 */
export function backupCatcherRecovery(cards: Record<string, CardInstance>, owned: readonly string[], eff: Pick<RunEffects, "fatigueRecoverChance" | "fatigueRecover">, ctx: RunContext, rng: Rng): Record<string, CardInstance> {
  if (eff.fatigueRecoverChance <= 0 || !rng.chance(eff.fatigueRecoverChance)) return cards;
  const tired = owned.filter((id) => { const c = cards[id]; const def = c ? ctx.defs.get(c.defId) : undefined; return !!c && !!def && def.role !== "H" && c.fatigue > 0; });
  if (tired.length === 0) return cards;
  const id = rng.pick(tired);
  const c = cards[id]!;
  return { ...cards, [id]: { ...c, fatigue: Math.max(0, c.fatigue - eff.fatigueRecover) } };
}
