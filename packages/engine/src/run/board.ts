import type { CardInstance, Location, PlayerState, Pos, Slot } from "@dugout/protocol";
import { PITCHER_SLOTS, POS } from "@dugout/protocol";
import { cardOvr } from "../ratings.js";
import type { RunContext } from "./context.js";
import { benchOf } from "./cards.js";
import { err, ok, type Result } from "./context.js";

export const isPitcherSlot = (s: Slot): s is "P1" | "P2" | "P3" => (PITCHER_SLOTS as readonly string[]).includes(s);

/** Real cards on the board. */
export function boardCount(p: PlayerState): number {
  return Object.values(p.board.slots).filter(Boolean).length;
}

function roleFits(def: { role: string }, slot: Slot): boolean {
  return isPitcherSlot(slot) ? def.role !== "H" : def.role === "H";
}

function readAt(p: PlayerState, loc: Location): string | null {
  return loc.kind === "slot" ? (p.board.slots[loc.slot] ?? null) : (benchOf(p)[loc.index] ?? null);
}

function writeAt(p: PlayerState, loc: Location, id: string | null): PlayerState {
  if (loc.kind === "slot") {
    const slots = { ...p.board.slots };
    if (id) slots[loc.slot] = id;
    else delete slots[loc.slot];
    return { ...p, board: { ...p.board, slots } };
  }
  const bench = benchOf(p);
  bench[loc.index] = id;
  return { ...p, bench };
}

/**
 * Move or swap between two locations (§4.3). Enforces role/slot fit and the
 * level cap. Bench index beyond capacity is invalid.
 */
export function moveCard(p: PlayerState, cards: Record<string, CardInstance>, ctx: RunContext, from: Location, to: Location): Result<PlayerState> {
  if (from.kind === "bench" && from.index >= benchOf(p).length) return err("INVALID_SLOT", "bench index out of range");
  if (to.kind === "bench" && to.index >= benchOf(p).length) return err("INVALID_SLOT", "bench index out of range");
  const a = readAt(p, from);
  const b = readAt(p, to);
  if (!a) return err("INVALID_CARD", "nothing to move");
  if (from.kind === to.kind && (from.kind === "slot" ? from.slot === (to as { slot: Slot }).slot : from.index === (to as { index: number }).index)) return ok(p);
  const defA = ctx.defs.get(cards[a]?.defId ?? "");
  const defB = b ? ctx.defs.get(cards[b]?.defId ?? "") : undefined;
  if (!defA) return err("INVALID_CARD", "unknown card");
  if (to.kind === "slot" && !roleFits(defA, to.slot)) return err("INVALID_SLOT", "role does not fit that slot");
  if (b && defB && from.kind === "slot" && !roleFits(defB, from.slot)) return err("INVALID_SLOT", "swapped card does not fit");
  // Level cap: moving from bench to an empty slot adds a real card.
  if (from.kind === "bench" && to.kind === "slot" && !b && boardCount(p) >= p.level) return err("LEVEL_CAP", "board is full for your level");
  let next = writeAt(p, from, b);
  next = writeAt(next, to, a);
  return ok(next);
}

/** Batting order: keep `order` a permutation; move `pos` to index `to`. */
export function reorder(p: PlayerState, pos: Pos, to: number): PlayerState {
  const order = p.board.order.filter((x) => x !== pos);
  order.splice(Math.max(0, Math.min(8, to)), 0, pos);
  return { ...p, board: { ...p.board, order } };
}

/** Default batting order: occupied slots by OVR desc, replacements last (§4.3 auto-sort). */
export function autoOrder(p: PlayerState, cards: Record<string, CardInstance>, ctx: RunContext): PlayerState {
  const score = (pos: Pos) => {
    const id = p.board.slots[pos];
    const def = id ? ctx.defs.get(cards[id]?.defId ?? "") : undefined;
    return def ? cardOvr(def) + (cards[id!]!.star - 1) * 10 : -1;
  };
  const order = [...POS].sort((a, b) => score(b) - score(a));
  return { ...p, board: { ...p.board, order } };
}

/** Drop any dangling ids (safety after sells/merges). */
export function pruneBoard(p: PlayerState, cards: Record<string, CardInstance>): PlayerState {
  const slots = { ...p.board.slots };
  for (const [slot, id] of Object.entries(slots) as [Slot, string | undefined][]) if (!id || !cards[id]) delete slots[slot];
  return { ...p, board: { ...p.board, slots }, bench: benchOf(p).map((b) => (b && cards[b] ? b : null)) };
}
