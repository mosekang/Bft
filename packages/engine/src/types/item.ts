import type { ItemId, Label } from "./common.js";
import type { Modifier } from "./modifiers.js";

export const BASE_ITEM_TYPES = [
  "BAT", // 배트 — power
  "SPIKES", // 스파이크 — speed
  "GLOVE", // 글러브 — defense
  "ROSIN_BAG", // 로진백 — control
  "ICING", // 아이싱 — fatigue recovery
  "SCOUTING_REPORT", // 전력분석 — reveal opponent rotation
] as const;
export type BaseItemType = (typeof BASE_ITEM_TYPES)[number];

export type ItemTier = "BASE" | "COMBINED";

export interface ItemDefinition {
  readonly id: ItemId;
  readonly tier: ItemTier;
  readonly label: Label;
  readonly description: Label;
  /** For COMBINED items: the two base types that make it (order-insensitive). */
  readonly recipe?: readonly [BaseItemType, BaseItemType];
  /** Who can hold it. */
  readonly holder: "BATTER" | "PITCHER" | "ANY";
  readonly modifiers: readonly Modifier[];
  /** Non-stat effects handled by the run loop (e.g. reveal rotations). */
  readonly special?: "REVEAL_ROTATIONS" | "CHANGE_BALLPARK";
}
