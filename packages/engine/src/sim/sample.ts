import type { Board, CardDef, CardInstance, Pack, Pos } from "@dugout/protocol";
import { POS } from "@dugout/protocol";
import type { Rng } from "../rng.js";
import { cardOvr } from "../ratings.js";

export interface SampledRoster {
  board: Board;
  cards: Record<string, CardInstance>;
}

/**
 * Build a plausible random board with `level` real cards from a pack:
 * pitchers first (up to 3 SP), then hitters greedily by scarce positions.
 * Used by tests, `sim-game` and the training-team generator.
 */
export function sampleRoster(pack: Pack, rng: Rng, level: number, opts: { star?: 1 | 2 | 3; minCost?: number; maxCost?: number; prefix?: string } = {}): SampledRoster {
  const prefix = opts.prefix ?? "s";
  const pool = pack.cards.filter((c) => c.cost >= (opts.minCost ?? 1) && c.cost <= (opts.maxCost ?? 5));
  const cards: Record<string, CardInstance> = {};
  const slots: Partial<Record<string, string>> = {};
  let n = 0;
  const add = (def: CardDef, slot: string) => {
    const instanceId = `${prefix}${++n}`;
    cards[instanceId] = { instanceId, defId: def.id, star: opts.star ?? 1, items: [], fatigue: 0, injuredRounds: 0, growth: 0 };
    slots[slot] = instanceId;
  };
  let remaining = level;
  const pitchers = rng.shuffle(pool.filter((c) => c.role === "SP"));
  const relievers = rng.shuffle(pool.filter((c) => c.role === "RP"));
  const pitcherSlots = ["P1", "P2", "P3"] as const;
  const wantPitchers = Math.min(3, Math.max(1, Math.round(level * 0.25)));
  for (let i = 0; i < wantPitchers && remaining > 0; i++) {
    const def = i < 2 ? pitchers.pop() : (rng.chance(0.5) ? relievers.pop() : pitchers.pop());
    if (!def) break;
    add(def, pitcherSlots[i]!);
    remaining--;
  }
  const order: Pos[] = ["CF", "SS", "C", "2B", "3B", "RF", "LF", "1B", "DH"];
  const hitters = rng.shuffle(pool.filter((c) => c.role === "H"));
  for (const pos of order) {
    if (remaining <= 0) break;
    let idx = hitters.findIndex((c) => c.pos === pos);
    if (idx < 0) idx = hitters.findIndex((c) => c.pos2.includes(pos));
    if (idx < 0 && pos === "DH" && hitters.length > 0) idx = 0;
    if (idx < 0) continue;
    const def = hitters.splice(idx, 1)[0];
    if (!def) continue;
    add(def, pos);
    remaining--;
  }
  const byOvr = [...POS].sort((a, b) => {
    const oa = slots[a] ? cardOvr(pack.cards.find((c) => c.id === cards[slots[a]!]!.defId)!) : 0;
    const ob = slots[b] ? cardOvr(pack.cards.find((c) => c.id === cards[slots[b]!]!.defId)!) : 0;
    return ob - oa;
  });
  const board: Board = { slots: slots as Board["slots"], forcePitch: { P1: false, P2: false, P3: false }, order: byOvr };
  return { board, cards };
}

export function defsById(pack: Pack): Map<string, CardDef> {
  return new Map(pack.cards.map((c) => [c.id, c]));
}
