import type { Label, PhilosophyId } from "./common.js";
import type { Modifier } from "./modifiers.js";

/** Manager philosophies are the TFT "augments": pick 1 of 3, three times per run. */
export interface PhilosophyDefinition {
  readonly id: PhilosophyId;
  readonly label: Label;
  readonly description: Label;
  /** Rough power level; used to offer choices of comparable strength. */
  readonly tier: "SILVER" | "GOLD" | "PRISMATIC";
  readonly modifiers: readonly Modifier[];
  /** Rule changes the run loop must implement directly. */
  readonly rule?: PhilosophyRule;
}

export type PhilosophyRule =
  | "OPENER" // relievers may start; fatigue rules change
  | "ABS" // automatic ball-strike: framing disabled, control drives walks
  | "FARM_SYSTEM" // ★★ needs 2 copies instead of 3
  | "BIG_SPENDER" // interest cap 7
  | "SMALL_BALL" // auto bunt/steal, free SPEEDSTER tier
  | "CLEANUP_CARRY"; // one ★★★ doubles, everyone else -10%
