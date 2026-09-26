import type { CardDef, CardInstance, PlayerState, SynergyId } from "@dugout/protocol";
import { SYNERGY_IDS } from "@dugout/protocol";
import { SYNERGIES, synergyTier } from "../config/synergies.js";
import type { RunContext } from "./context.js";

export interface SynergyStatus {
  id: SynergyId;
  count: number;
  tier: number;
  penalised: boolean;
}

/** Synergy tags a card contributes (handedness derived from `bats`, hitters only). */
export function tagsOf(def: CardDef): SynergyId[] {
  const out: SynergyId[] = [def.origin, ...def.classes];
  if (def.role === "H") {
    if (def.bats === "L" || def.bats === "S") out.push("LEFTY_BAT");
    if (def.bats === "R" || def.bats === "S") out.push("RIGHTY_BAT");
  }
  return out;
}

/** Cards on the board (not bench), resolved to their defs. */
export function boardCards(player: PlayerState, cards: Record<string, CardInstance>, ctx: RunContext): { card: CardInstance; def: CardDef }[] {
  const out: { card: CardInstance; def: CardDef }[] = [];
  for (const id of Object.values(player.board.slots)) {
    const card = id ? cards[id] : undefined;
    const def = card ? ctx.defs.get(card.defId) : undefined;
    if (card && def) out.push({ card, def });
  }
  return out;
}

/**
 * Count synergies on the board (§7). `extra` adds virtual members
 * (GOLDEN_GLOVE item → GOLD_GLOVE +1) and `tierAdd` bumps a tier (SMALL_BALL).
 */
export function countSynergies(player: PlayerState, cards: Record<string, CardInstance>, ctx: RunContext, extra: Partial<Record<SynergyId, number>> = {}, tierAdd: Partial<Record<SynergyId, number>> = {}): SynergyStatus[] {
  const counts = new Map<SynergyId, number>();
  for (const { def } of boardCards(player, cards, ctx)) for (const t of tagsOf(def)) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [k, v] of Object.entries(extra) as [SynergyId, number][]) counts.set(k, (counts.get(k) ?? 0) + v);
  return SYNERGY_IDS.map((id) => {
    const count = counts.get(id) ?? 0;
    const def = SYNERGIES[id];
    let { tier, penalised } = synergyTier(def, count);
    const bump = tierAdd[id] ?? 0;
    if (bump && def.mode === "AT_LEAST") tier = Math.min(def.thresholds.length, tier + bump);
    return { id, count, tier, penalised };
  }).filter((s) => s.count > 0 || (tierAdd[s.id] ?? 0) > 0);
}

export function activeSynergies(statuses: SynergyStatus[]): SynergyStatus[] {
  return statuses.filter((s) => s.tier > 0 || s.penalised);
}
