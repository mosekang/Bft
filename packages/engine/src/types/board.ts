import type { CardId } from "./common.js";
import type { BatterPosition } from "./player.js";

/** Number of batting-order slots on the board. */
export const LINEUP_SIZE = 9;
/** Number of pitcher slots on the board (rotation and/or bullpen). */
export const PITCHER_SLOTS = 3;
/** Total board slots: what levels are counted against. */
export const BOARD_SIZE = LINEUP_SIZE + PITCHER_SLOTS;
export const BENCH_SIZE = 6;

/** One batting-order slot: which card (or null => replacement) plays which position. */
export interface LineupSlot {
  readonly cardId: CardId | null;
  /** Position played this game; one slot must be "DH". */
  readonly position: BatterPosition;
}

/** One of the three pitcher slots. */
export interface PitcherSlot {
  readonly cardId: CardId | null;
}

export interface Board {
  /** Index = batting order (0 = leadoff). Exactly LINEUP_SIZE entries. */
  readonly lineup: readonly LineupSlot[];
  /** Exactly PITCHER_SLOTS entries. Order = rotation order. */
  readonly pitchers: readonly PitcherSlot[];
  /**
   * "Bullpen day": skip the rotation this round and let relievers piece the
   * game together. The only in-game pitching choice the user makes.
   */
  readonly bullpenDay: boolean;
}

/** Bench: up to BENCH_SIZE cards, order preserved for the UI. */
export type Bench = readonly CardId[];
