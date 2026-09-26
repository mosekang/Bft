/**
 * Every effect in the game (synergy, item, philosophy, ballpark, fatigue,
 * platoon, runner state) is expressed as a list of `Modifier`s applied to a
 * plate-appearance context. The Log5 step never knows *why* a rate changed,
 * which keeps the sim testable and the balance tunable from data files.
 */

export type ModifierTarget =
  // batter side
  | "bat.contact"
  | "bat.power"
  | "bat.eye"
  | "bat.speed"
  | "bat.defense"
  | "bat.strikeoutRate"
  | "bat.walkRate"
  | "bat.homeRunRate"
  | "bat.babip" // batting average on balls in play
  | "bat.stolenBaseAttempt"
  | "bat.stolenBaseSuccess"
  // pitcher side
  | "pit.stuff"
  | "pit.control"
  | "pit.movement"
  | "pit.stamina"
  | "pit.mental"
  | "pit.strikeoutRate"
  | "pit.walkRate"
  | "pit.homeRunRate"
  | "pit.groundBallRate"
  | "pit.fatigueRounds"
  // team / game level
  | "team.errorRate"
  | "team.opponentBabip"
  | "team.runnerAdvance"
  | "econ.interestCap"
  | "econ.starCopiesNeeded";

export type ModifierOp = "ADD" | "MUL";

export type ModifierSource =
  | { readonly kind: "SYNERGY"; readonly id: string; readonly tier: number }
  | { readonly kind: "ITEM"; readonly id: string }
  | { readonly kind: "PHILOSOPHY"; readonly id: string }
  | { readonly kind: "BALLPARK"; readonly id: string }
  | { readonly kind: "PLATOON" }
  | { readonly kind: "FATIGUE" }
  | { readonly kind: "SITUATION"; readonly id: string };

/** Optional gate: modifier applies only when the predicate holds. */
export type ModifierCondition =
  | { readonly kind: "ALWAYS" }
  | { readonly kind: "RISP" } // runner in scoring position
  | { readonly kind: "INNING_GTE"; readonly inning: number }
  | { readonly kind: "LEADING"; readonly byAtMost?: number }
  | { readonly kind: "VS_HAND"; readonly hand: "L" | "R" }
  | { readonly kind: "CARD_COST"; readonly cost: 1 | 2 | 3 | 4 | 5 }
  | { readonly kind: "STAGE_GTE"; readonly stage: number };

export interface Modifier {
  readonly target: ModifierTarget;
  readonly op: ModifierOp;
  /** ADD: rating points or probability delta. MUL: multiplier (1 = no-op). */
  readonly value: number;
  readonly source: ModifierSource;
  readonly when?: ModifierCondition;
}
