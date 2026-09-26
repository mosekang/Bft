import type { CardDef, GameState, Pack, PlayerState } from "@dugout/protocol";
import { buildSchedule, type RoundSpec } from "../config/schedule.js";
import { createRng, type Rng } from "../rng.js";

/** Immutable per-run context shared by every rule module. */
export interface RunContext {
  readonly pack: Pack;
  readonly defs: ReadonlyMap<string, CardDef>;
  readonly schedule: readonly RoundSpec[];
}

export function createContext(pack: Pack): RunContext {
  return { pack, defs: new Map(pack.cards.map((c) => [c.id, c])), schedule: buildSchedule() };
}

/** Deterministic stream for `label` in the current round (§6.6 seed tree). */
export function roundRng(state: GameState, label: string): Rng {
  return createRng(state.seed, "run").fork(`r${state.roundIndex}`).fork(label);
}

export function currentRound(state: GameState, ctx: RunContext): RoundSpec {
  const r = ctx.schedule[Math.min(state.roundIndex, ctx.schedule.length - 1)];
  if (!r) throw new Error("empty schedule");
  return r;
}

export function getPlayer(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export function updatePlayer(state: GameState, id: string, patch: Partial<PlayerState> | ((p: PlayerState) => Partial<PlayerState>)): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)),
  };
}

export const alive = (p: PlayerState): boolean => p.eliminatedAt === undefined;

export type Result<T> = { ok: true; value: T } | { ok: false; code: import("@dugout/protocol").ErrorCode; msg: string };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(code: import("@dugout/protocol").ErrorCode, msg: string): Result<T> => ({ ok: false, code, msg });
