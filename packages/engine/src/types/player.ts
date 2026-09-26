import type { CardId, ItemId, Label, Probability, Rating, TemplateId } from "./common.js";
import type { TraitId } from "./synergy.js";

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Batting side (L/R/S = switch) or throwing arm (L/R). */
export type Hand = "L" | "R" | "S";
export type ThrowHand = Exclude<Hand, "S">;

export const FIELD_POSITIONS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
export type FieldPosition = (typeof FIELD_POSITIONS)[number];
/** DH is a lineup slot, never a fielding position. */
export type BatterPosition = FieldPosition | "DH";
export type PitcherRole = "SP" | "RP";
export type Position = BatterPosition | PitcherRole;

export type CardRole = "BATTER" | "STARTER" | "RELIEVER";

/** Card cost tier, 1 (common) .. 5 (legendary). */
export type Cost = 1 | 2 | 3 | 4 | 5;
export const COSTS: readonly Cost[] = [1, 2, 3, 4, 5];

/** 1 = regular card, 2 = starter (★★), 3 = franchise star (★★★). */
export type StarLevel = 1 | 2 | 3;

/** Pitcher arm slot; affects the width of the platoon split. */
export type ArmSlot = "OVERHAND" | "THREE_QUARTER" | "SIDEARM" | "SUBMARINE";

// ---------------------------------------------------------------------------
// Ratings — what the card shows (5 numbers) vs. what the engine uses
// ---------------------------------------------------------------------------

/** Five batter ratings visible on the card (1..99). */
export interface BatterDisplay {
  readonly contact: Rating;
  readonly power: Rating;
  readonly eye: Rating;
  readonly speed: Rating;
  readonly defense: Rating;
}

/** Five pitcher ratings visible on the card (1..99). */
export interface PitcherDisplay {
  readonly stuff: Rating;
  readonly control: Rating;
  readonly movement: Rating;
  readonly stamina: Rating;
  readonly mental: Rating;
}

/**
 * Batter internals: rates are per plate appearance, relative to the league
 * baseline (see `LEAGUE_BASELINE`). The Log5 step combines these with the
 * pitcher's rates and the baseline.
 */
export interface BatterInternals {
  /** Contact quality vs left-handed pitchers (drives BABIP / hit rate). */
  readonly contactVsL: Rating;
  /** Contact quality vs right-handed pitchers. */
  readonly contactVsR: Rating;
  readonly strikeoutRate: Probability;
  readonly walkRate: Probability;
  readonly homeRunRate: Probability;
  /** -1 = extreme ground-ball hitter, +1 = extreme fly-ball hitter. */
  readonly battedBallProfile: number;
  /** Probability a stolen-base attempt succeeds; attempts are gated by speed. */
  readonly stolenBaseSuccess: Probability;
  /** Fielding rating per position the player can play (1..99). */
  readonly fielding: Partial<Record<FieldPosition, Rating>>;
  /** Outfield / infield arm strength, used for extra-base and assist checks. */
  readonly arm: Rating;
}

export interface PitcherInternals {
  readonly strikeoutRate: Probability;
  readonly walkRate: Probability;
  readonly homeRunRate: Probability;
  /** Share of balls in play that are ground balls. */
  readonly groundBallRate: Probability;
  /** Multiplier applied to opposing batter quality when the batter is L / R. <1 favours the pitcher. */
  readonly platoonVsL: number;
  readonly platoonVsR: number;
  /** Pitch count at which stuff starts to decline. */
  readonly staminaPitches: number;
  /** Stuff lost per pitch beyond `staminaPitches`, as a fraction (e.g. 0.004). */
  readonly fatigueSlope: number;
  readonly armSlot: ArmSlot;
}

// ---------------------------------------------------------------------------
// Card definitions (in the pool) and card instances (owned)
// ---------------------------------------------------------------------------

export interface PlayerName {
  /** Full display name, e.g. "김번트" or "J. 라미레즈". */
  readonly full: string;
  readonly family: string;
  readonly given: string;
  /** ISO 3166-1 alpha-2, "KR" for domestic players. */
  readonly nationality: string;
}

/** Position aptitude: one primary, zero or more secondaries. */
export interface PositionAptitude {
  readonly primary: Position;
  readonly secondary: readonly Position[];
}

interface PlayerTemplateBase {
  readonly id: TemplateId;
  readonly name: PlayerName;
  /** One-line flavour nickname per star level, e.g. ["김번트", "김번트, 3루타 제조기", ...]. */
  readonly nicknames: readonly [string, string, string];
  readonly age: number;
  readonly cost: Cost;
  readonly bats: Hand;
  readonly throws: ThrowHand;
  readonly positions: PositionAptitude;
  /** Origin + class traits this card contributes to synergies. */
  readonly traits: readonly TraitId[];
}

export interface BatterTemplate extends PlayerTemplateBase {
  readonly role: "BATTER";
  readonly display: BatterDisplay;
  readonly internals: BatterInternals;
}

export interface PitcherTemplate extends PlayerTemplateBase {
  readonly role: "STARTER" | "RELIEVER";
  readonly display: PitcherDisplay;
  readonly internals: PitcherInternals;
}

export type PlayerTemplate = BatterTemplate | PitcherTemplate;

/** A card the player (or an AI) actually owns. */
export interface PlayerCard {
  readonly id: CardId;
  readonly templateId: TemplateId;
  readonly star: StarLevel;
  /** Up to `MAX_ITEMS_PER_CARD` items. */
  readonly items: readonly ItemId[];
  /** Accumulated growth from e.g. the HS_PROSPECT synergy, in rating points. */
  readonly growth: number;
  /** Pitchers only: rounds of fatigue remaining. 0 = fresh. */
  readonly fatigueRounds: number;
  /** Pitchers only: rounds of injury remaining. 0 = healthy. */
  readonly injuryRounds: number;
}

/**
 * A replacement-level player auto-filling an empty board slot.
 * Never in the pool, never sold, never starred. Names are always "○대체".
 */
export interface ReplacementPlayer {
  readonly kind: "REPLACEMENT";
  readonly name: string;
  readonly role: CardRole;
  readonly bats: Hand;
  readonly throws: ThrowHand;
  readonly position: Position;
  readonly template: PlayerTemplate;
}

/** Anything that can stand in a board slot. */
export type Occupant =
  | { readonly kind: "CARD"; readonly card: PlayerCard }
  | ReplacementPlayer;

export const isReplacement = (o: Occupant): o is ReplacementPlayer => o.kind === "REPLACEMENT";

export interface TraitTag {
  readonly id: TraitId;
  readonly label: Label;
}
