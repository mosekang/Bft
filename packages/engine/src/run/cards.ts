import type { CardInstance, GameState, ItemId, PlayerState, Slot, Star } from "@dugout/protocol";
import { ECONOMY, sellValue } from "../config/economy.js";
import type { RunContext } from "./context.js";

export function benchCapacity(p: PlayerState): number {
  return ECONOMY.benchSize + p.benchBonus;
}

export function benchOf(p: PlayerState): (string | null)[] {
  const b = [...p.bench];
  while (b.length < benchCapacity(p)) b.push(null);
  return b.slice(0, benchCapacity(p));
}

export function freeBenchIndex(p: PlayerState): number {
  return benchOf(p).findIndex((x) => x === null);
}

/** Every instance id the player owns (board + bench). */
export function ownedIds(p: PlayerState): string[] {
  return [...Object.values(p.board.slots).filter((x): x is string => !!x), ...p.bench.filter((x): x is string => !!x)];
}

export function slotOf(p: PlayerState, instanceId: string): Slot | null {
  for (const [slot, id] of Object.entries(p.board.slots) as [Slot, string | undefined][]) if (id === instanceId) return slot;
  return null;
}

export function newInstance(state: GameState, defId: string, star: Star = 1): { state: GameState; card: CardInstance } {
  const instanceId = `c${state.nextInstanceId}`;
  const card: CardInstance = { instanceId, defId, star, items: [], fatigue: 0, injuredRounds: 0, growth: 0 };
  return { state: { ...state, nextInstanceId: state.nextInstanceId + 1, cards: { ...state.cards, [instanceId]: card } }, card };
}

/** Copies a card of `star` represents in the pool (1 / 3 / 9). */
export function poolCopies(star: Star, copiesPerStar = 3): number {
  return copiesPerStar ** (star - 1);
}

export function poolAdd(state: GameState, defId: string, n: number): GameState {
  return { ...state, pool: { ...state.pool, [defId]: (state.pool[defId] ?? 0) + n } };
}

/** Remove a card instance from a player's board/bench and the card table. */
export function removeInstance(state: GameState, playerId: string, instanceId: string): GameState {
  const { [instanceId]: _gone, ...cards } = state.cards;
  return {
    ...state,
    cards,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      const slots = { ...p.board.slots };
      for (const [slot, id] of Object.entries(slots) as [Slot, string | undefined][]) if (id === instanceId) delete slots[slot];
      return { ...p, board: { ...p.board, slots }, bench: p.bench.map((b) => (b === instanceId ? null : b)) };
    }),
  };
}

/**
 * Merge copies into the next star (§4.5). Called after any acquisition.
 * Returns the state and the merged card ids (for UI animation).
 */
export function autoMerge(state: GameState, playerId: string, ctx: RunContext, copiesPerStar = 3): { state: GameState; merged: string[] } {
  let s = state;
  const merged: string[] = [];
  for (let guard = 0; guard < 10; guard++) {
    const p = s.players.find((x) => x.id === playerId)!;
    const owned = ownedIds(p).map((id) => s.cards[id]!).filter(Boolean);
    let done = true;
    for (const star of [1, 2] as const) {
      const groups = new Map<string, CardInstance[]>();
      for (const c of owned) if (c.star === star) groups.set(c.defId, [...(groups.get(c.defId) ?? []), c]);
      for (const [defId, group] of groups) {
        if (group.length < copiesPerStar || !ctx.defs.has(defId)) continue;
        // Prefer keeping a board copy; keep the one with the most items.
        const onBoard = group.filter((c) => slotOf(p, c.instanceId) !== null);
        const keep = (onBoard[0] ?? group[0])!;
        const consumed = group.filter((c) => c !== keep).slice(0, copiesPerStar - 1);
        const items: ItemId[] = [...keep.items];
        const overflow: ItemId[] = [];
        for (const c of consumed) for (const it of c.items) (items.length < ECONOMY.maxItemsPerCard ? items : overflow).push(it);
        const growth = Math.max(keep.growth, ...consumed.map((c) => c.growth));
        for (const c of consumed) s = removeInstance(s, playerId, c.instanceId);
        s = { ...s, cards: { ...s.cards, [keep.instanceId]: { ...keep, star: (star + 1) as Star, items, growth } } };
        if (overflow.length) s = { ...s, players: s.players.map((pl) => (pl.id === playerId ? { ...pl, itemsUnequipped: [...pl.itemsUnequipped, ...overflow] } : pl)) };
        merged.push(keep.instanceId);
        done = false;
        break;
      }
      if (!done) break;
    }
    if (done) break;
  }
  return { state: s, merged };
}

/** Sell: refund gold, return copies to the pool, items to the inventory. */
export function sellCard(state: GameState, playerId: string, instanceId: string, ctx: RunContext, copiesPerStar = 3): GameState {
  const card = state.cards[instanceId];
  const def = card ? ctx.defs.get(card.defId) : undefined;
  if (!card || !def) return state;
  let s = removeInstance(state, playerId, instanceId);
  s = poolAdd(s, def.id, poolCopies(card.star, copiesPerStar));
  s = { ...s, players: s.players.map((p) => (p.id === playerId ? { ...p, gold: p.gold + sellValue(def.cost, card.star), itemsUnequipped: [...p.itemsUnequipped, ...card.items] } : p)) };
  return s;
}

/** Give a player a fresh card on the bench (or fail if no room and no merge). */
export function grantCard(state: GameState, playerId: string, defId: string, ctx: RunContext, opts: { star?: Star; copiesPerStar?: number; fromPool?: boolean } = {}): { state: GameState; ok: boolean; instanceId?: string } {
  const p = state.players.find((x) => x.id === playerId)!;
  const star = opts.star ?? 1;
  const copies = opts.copiesPerStar ?? 3;
  let idx = freeBenchIndex(p);
  if (idx < 0) {
    // Allowed only when this copy completes a merge.
    const same = ownedIds(p).map((id) => state.cards[id]!).filter((c) => c.defId === defId && c.star === star).length;
    if (same + 1 < copies) return { state, ok: false };
  }
  let s = state;
  if (opts.fromPool !== false) {
    const need = poolCopies(star, copies);
    if ((s.pool[defId] ?? 0) < need) return { state, ok: false };
    s = poolAdd(s, defId, -need);
  }
  const created = newInstance(s, defId, star);
  s = created.state;
  const bench = benchOf(p);
  if (idx < 0) bench.push(created.card.instanceId); // temporary overflow, cleared by the merge below
  else bench[idx] = created.card.instanceId;
  s = { ...s, players: s.players.map((x) => (x.id === playerId ? { ...x, bench } : x)) };
  const m = autoMerge(s, playerId, ctx, copies);
  s = m.state;
  // Trim any leftover overflow slot.
  s = { ...s, players: s.players.map((x) => (x.id === playerId ? { ...x, bench: benchOf(x) } : x)) };
  return { state: s, ok: true, instanceId: created.card.instanceId };
}
