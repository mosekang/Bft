import type { Board, CardInstance, GameState } from "@dugout/protocol";
import { POS } from "@dugout/protocol";
import type { RunContext } from "./context.js";

/** A board snapshot as uploaded/downloaded for ghost play (§12.6). */
export interface GhostBoard {
  slots: Board["slots"];
  order?: Board["order"];
  cards: Record<string, CardInstance>;
  nickname?: string;
  stadium?: string;
}

/**
 * Replace a bot's board with a ghost snapshot before the round is played.
 * Cards are copied under fresh ids so they cannot collide with the run's
 * own instances; the ghost's fatigue is cleared (§12.6).
 */
export function applyGhostBoard(state: GameState, playerId: string, ghost: GhostBoard, ctx: RunContext): GameState {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return state;
  let next = state.nextInstanceId;
  const cards: Record<string, CardInstance> = { ...state.cards };
  // Drop the bot's previous ghost cards to keep the table small.
  for (const id of Object.keys(cards)) if (id.startsWith(`g:${playerId}:`)) delete cards[id];
  const slots: Board["slots"] = {};
  for (const [slot, oldId] of Object.entries(ghost.slots) as [keyof Board["slots"], string | undefined][]) {
    const c = oldId ? ghost.cards[oldId] : undefined;
    if (!c || !ctx.defs.has(c.defId)) continue;
    const id = `g:${playerId}:${next++}`;
    cards[id] = { ...c, instanceId: id, fatigue: 0, injuredRounds: 0 };
    slots[slot] = id;
  }
  const order = ghost.order && ghost.order.length === 9 ? ghost.order : [...POS];
  return {
    ...state,
    nextInstanceId: next,
    cards,
    players: state.players.map((x) => (x.id === playerId ? { ...x, board: { slots, order, forcePitch: x.board.forcePitch }, bench: x.bench.map(() => null), nickname: ghost.nickname ? `${ghost.nickname}(고스트)` : x.nickname, stadium: (ghost.stadium as typeof x.stadium) ?? x.stadium } : x)),
  };
}

/** Apply up to 7 ghosts to the alive bot players, in order. */
export function applyGhosts(state: GameState, ghosts: GhostBoard[], ctx: RunContext): GameState {
  let s = state;
  const bots = s.players.filter((p) => p.isBot && p.eliminatedAt === undefined);
  bots.forEach((b, i) => {
    const g = ghosts[i];
    if (g) s = applyGhostBoard(s, b.id, g, ctx);
  });
  return s;
}
