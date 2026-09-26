import type { CarouselState, GameState, PlayerState } from "@dugout/protocol";
import { SCHEDULE } from "../config/schedule.js";
import type { Rng } from "../rng.js";
import { alive, type RunContext } from "./context.js";
import { randomComponent } from "./items.js";

/** Build the FA market for a stage (§10.1). Cards are taken from the pool. */
export function buildCarousel(state: GameState, stage: number, rng: Rng, ctx: RunContext): GameState {
  const [lo, hi] = SCHEDULE.carouselCosts[stage] ?? [1, 2];
  const pool = { ...state.pool };
  const cards: CarouselState["cards"] = [];
  for (let i = 0; i < SCHEDULE.carouselCards; i++) {
    const candidates = ctx.pack.cards.filter((c) => c.cost >= lo && c.cost <= hi && (pool[c.id] ?? 0) > 0);
    if (candidates.length === 0) break;
    const def = candidates[rng.weightedIndex(candidates.map((c) => pool[c.id] ?? 0))]!;
    pool[def.id] = (pool[def.id] ?? 0) - 1;
    cards.push(SCHEDULE.carouselWithItemStages.includes(stage) ? { defId: def.id, item: randomComponent(rng) } : { defId: def.id });
  }
  const order = orderByHp(state.players.filter(alive), rng).map((p) => p.id);
  const waveSize = stage >= 6 ? SCHEDULE.finalCarouselWaveSize : SCHEDULE.carouselWaveSize;
  return { ...state, pool, carousel: { cards, taken: cards.map(() => null), order, waveStart: 0, waveSize } };
}

/** Lowest hp picks first; ties broken by the round rng. */
export function orderByHp(players: PlayerState[], rng: Rng): PlayerState[] {
  return rng.shuffle(players).sort((a, b) => a.hp - b.hp);
}

/** Players allowed to pick right now. */
export function currentWave(c: CarouselState): string[] {
  return c.order.slice(c.waveStart, c.waveStart + c.waveSize).filter((id) => !c.taken.includes(id));
}

export function carouselDone(c: CarouselState): boolean {
  return c.order.every((id) => c.taken.includes(id)) || c.taken.every((t) => t !== null);
}

/** Advance the wave pointer when everyone in the current wave has picked. */
export function advanceWave(c: CarouselState): CarouselState {
  let next = c;
  while (!carouselDone(next) && currentWave(next).length === 0) next = { ...next, waveStart: next.waveStart + next.waveSize };
  return next;
}
