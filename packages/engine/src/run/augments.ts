import type { AugmentId, AugmentRarity, GameState, PlayerState } from "@dugout/protocol";
import { AUGMENTS, AUGMENT_BY_ID, AUGMENT_RARITY_ODDS } from "../config/augments.js";
import { cardOvr } from "../ratings.js";
import type { Rng } from "../rng.js";
import type { RunContext } from "./context.js";
import { grantCard } from "./cards.js";
import { addXp } from "./shop.js";
import { xpToNext } from "../config/levels.js";

/** Three augments of one rarity, excluding ones the player already has (§9). */
export function offerAugments(player: PlayerState, rng: Rng): AugmentId[] {
  const rarities: AugmentRarity[] = ["SILVER", "GOLD", "PRISM"];
  let rarity = rarities[rng.weightedIndex(rarities.map((r) => AUGMENT_RARITY_ODDS[r]))]!;
  for (let tries = 0; tries < 3; tries++) {
    const pool = AUGMENTS.filter((a) => a.rarity === rarity && !player.augments.includes(a.id));
    if (pool.length >= 3) return rng.shuffle(pool).slice(0, 3).map((a) => a.id);
    rarity = rarity === "PRISM" ? "GOLD" : "SILVER";
  }
  return rng.shuffle(AUGMENTS.filter((a) => !player.augments.includes(a.id))).slice(0, 3).map((a) => a.id);
}

/** Apply the immediate part of an augment; ongoing parts live in computeEffects. */
export function applyAugmentPick(state: GameState, playerId: string, id: AugmentId, ctx: RunContext, rng: Rng): GameState {
  let s = state;
  const def = AUGMENT_BY_ID.get(id)!;
  s = { ...s, players: s.players.map((p) => (p.id === playerId ? { ...p, augments: [...p.augments, id], augmentOffer: undefined } : p)) };
  const p = () => s.players.find((x) => x.id === playerId)!;
  if (def.params["goldNow"]) s = { ...s, players: s.players.map((x) => (x.id === playerId ? { ...x, gold: x.gold + def.params["goldNow"]! } : x)) };
  if (def.params["levelNow"]) {
    const cur = p();
    const bumped = addXp(cur, Math.max(0, xpToNext(cur.level) - cur.xp));
    s = { ...s, players: s.players.map((x) => (x.id === playerId ? bumped : x)) };
  }
  if (id === "FRANCHISE") {
    // Offer three ★★ cards of cost ≤ 3 with enough pool copies.
    const candidates = ctx.pack.cards.filter((c) => c.cost <= 3 && (s.pool[c.id] ?? 0) >= 3).sort((a, b) => cardOvr(b) - cardOvr(a));
    const options = rng.shuffle(candidates.slice(0, 12)).slice(0, 3).map((c) => c.id);
    if (options.length > 0) s = { ...s, players: s.players.map((x) => (x.id === playerId ? { ...x, choice: { kind: "CARD", options, star: 2 } } : x)) };
  }
  return s;
}

/** Resolve a CARD choice (franchise). */
export function grantChosenCard(state: GameState, playerId: string, defId: string, star: 1 | 2, ctx: RunContext, copiesPerStar: number): GameState {
  const r = grantCard(state, playerId, defId, ctx, { star, copiesPerStar, fromPool: true });
  const s = r.ok ? r.state : state;
  return { ...s, players: s.players.map((x) => (x.id === playerId ? { ...x, choice: undefined } : x)) };
}
