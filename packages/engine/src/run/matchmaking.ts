import type { GameState, PlayerState } from "@dugout/protocol";
import type { Rng } from "../rng.js";
import { alive } from "./context.js";

export interface Pairing {
  home: string;
  /** Opponent player id, or a ghost id "GHOST:<playerId>". */
  away: string;
  ghost: boolean;
}

/**
 * §10.3: random pairs among survivors, avoiding last round's opponent when
 * possible; with an odd count one team faces the most recently eliminated
 * team's ghost board.
 */
export function pairPlayers(state: GameState, rng: Rng): Pairing[] {
  const players = state.players.filter(alive);
  const ids = players.map((p) => p.id);
  let best: string[] = ids;
  let bestRematches = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 30; attempt++) {
    const order = rng.shuffle(ids);
    let rematches = 0;
    for (let i = 0; i + 1 < order.length; i += 2) {
      const a = state.players.find((p) => p.id === order[i])!;
      if (a.lastOpponent === order[i + 1]) rematches++;
    }
    if (rematches < bestRematches) {
      best = order;
      bestRematches = rematches;
    }
    if (rematches === 0) break;
  }
  const pairs: Pairing[] = [];
  for (let i = 0; i + 1 < best.length; i += 2) {
    const homeFirst = rng.chance(0.5);
    pairs.push({ home: homeFirst ? best[i]! : best[i + 1]!, away: homeFirst ? best[i + 1]! : best[i]!, ghost: false });
  }
  if (best.length % 2 === 1) {
    const odd = best[best.length - 1]!;
    const ghost = mostRecentlyEliminated(state);
    pairs.push({ home: odd, away: ghost ? `GHOST:${ghost.id}` : "PVE:CAMP", ghost: true });
  }
  return pairs;
}

export function mostRecentlyEliminated(state: GameState): PlayerState | undefined {
  const gone = state.players.filter((p) => p.eliminatedAt !== undefined);
  if (gone.length === 0) return undefined;
  return gone.reduce((a, b) => ((b.placement ?? 99) < (a.placement ?? 99) ? b : a));
}
