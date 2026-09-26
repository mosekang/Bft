import type { CardInstance, ComponentItemId, GameState, ItemId, PlayerState } from "@dugout/protocol";
import { COMPONENT_ITEM_IDS, SPECIAL_ITEM_IDS } from "@dugout/protocol";
import { ECONOMY } from "../config/economy.js";
import { ITEM_BY_ID, combineItems } from "../config/items.js";
import type { Rng } from "../rng.js";
import type { RunContext } from "./context.js";
import { err, ok, type Result } from "./context.js";
import { ownedIds } from "./cards.js";

export const isComponent = (id: ItemId): id is ComponentItemId => (COMPONENT_ITEM_IDS as readonly string[]).includes(id);
export const isSpecial = (id: ItemId): boolean => (SPECIAL_ITEM_IDS as readonly string[]).includes(id);

export function randomComponent(rng: Rng): ComponentItemId {
  return rng.pick(COMPONENT_ITEM_IDS);
}

export function threeComponents(rng: Rng): ComponentItemId[] {
  return rng.shuffle(COMPONENT_ITEM_IDS).slice(0, 3);
}

/**
 * Equip an item from the inventory onto an owned card (§8.1). Two components
 * on the same card combine immediately. Replacement players cannot hold items
 * (they are not cards, so they never appear here). Specials are equipped only
 * when their `use` is EQUIP (held like an item) or CONSUME_ON_EQUIP (applied
 * to the card and gone); the others stay in the inventory.
 */
export function equipItem(state: GameState, playerId: string, itemId: ItemId, instanceId: string, ctx: RunContext): Result<GameState> {
  const p = state.players.find((x) => x.id === playerId)!;
  const invIdx = p.itemsUnequipped.indexOf(itemId);
  if (invIdx < 0) return err("INVALID_ITEM", "item not in inventory");
  const card = state.cards[instanceId];
  if (!card || !ownedIds(p).includes(instanceId)) return err("INVALID_CARD", "card not owned");
  const def = ctx.defs.get(card.defId);
  const holder = ITEM_BY_ID.get(itemId);
  if (!def || !holder) return err("INVALID_ITEM", "unknown item");
  if (isSpecial(itemId) && holder.use !== "EQUIP") {
    if (holder.use !== "CONSUME_ON_EQUIP") return err("INVALID_ITEM", "special items are used from the inventory");
    // Consumed on the target card (TRAINING_CAMP): permanent growth, no item slot.
    const inv = [...p.itemsUnequipped];
    inv.splice(invIdx, 1);
    const growth = card.growth + (holder.params["growthAdd"] ?? 0);
    return ok({ ...state, cards: { ...state.cards, [instanceId]: { ...card, growth } }, players: state.players.map((x) => (x.id === playerId ? { ...x, itemsUnequipped: inv } : x)) });
  }
  let items: ItemId[] = [...card.items];
  if (isComponent(itemId)) {
    const otherIdx = items.findIndex((i) => isComponent(i));
    if (otherIdx >= 0) {
      const combined = combineItems(items[otherIdx] as ComponentItemId, itemId);
      if (!combined) return err("INVALID_ITEM", "cannot combine");
      items[otherIdx] = combined;
    } else {
      if (items.length >= ECONOMY.maxItemsPerCard) return err("INVALID_ITEM", "card holds 3 items already");
      items.push(itemId);
    }
  } else {
    if (items.length >= ECONOMY.maxItemsPerCard) return err("INVALID_ITEM", "card holds 3 items already");
    items.push(itemId);
  }
  const inv = [...p.itemsUnequipped];
  inv.splice(invIdx, 1);
  const cards: Record<string, CardInstance> = { ...state.cards, [instanceId]: { ...card, items } };
  return ok({ ...state, cards, players: state.players.map((x) => (x.id === playerId ? { ...x, itemsUnequipped: inv } : x)) });
}

export function giveItems(p: PlayerState, items: ItemId[]): PlayerState {
  return { ...p, itemsUnequipped: [...p.itemsUnequipped, ...items] };
}
