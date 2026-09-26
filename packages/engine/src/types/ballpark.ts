import type { BallparkId, Label } from "./common.js";
import type { Modifier } from "./modifiers.js";

export const BALLPARK_TYPES = [
  "HITTER_FRIENDLY", // 타자친화
  "PITCHER_FRIENDLY", // 투수친화
  "ARTIFICIAL_TURF", // 인조잔디
  "SEA_BREEZE", // 해풍구장
  "DOME", // 돔구장
] as const;
export type BallparkType = (typeof BALLPARK_TYPES)[number];

export interface BallparkDefinition {
  readonly id: BallparkId;
  readonly type: BallparkType;
  readonly label: Label;
  readonly description: Label;
  /** Applied to both teams while a game is played here. */
  readonly modifiers: readonly Modifier[];
  /** DOME: weather events (e.g. rain-out) do not apply. */
  readonly weatherProof: boolean;
}
