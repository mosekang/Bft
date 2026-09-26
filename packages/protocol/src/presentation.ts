/**
 * Presentation contract shared by the engine (which fills event meta),
 * packages/cinematic (which turns events into timelines) and the web client
 * (which plays timelines, sounds and haptics). DESIGN.md §15.4, §16, §17.
 * Pure data: no three.js, no DOM.
 */
import type { Pos } from "./enums.js";

/** Batted-ball type for presentation (§16.1). */
export const BB_TYPES = ["GB", "LD", "FB", "PU"] as const;
export type BbType = (typeof BB_TYPES)[number];

export const HIT_DIRECTIONS = ["pull", "center", "oppo"] as const;
export type HitDirection = (typeof HIT_DIRECTIONS)[number];

export const SWING_KINDS = ["contact", "miss", "looking", "bunt", "none"] as const;
export type SwingKind = (typeof SWING_KINDS)[number];

/**
 * One runner movement inside an event. Bases: 0 = home plate (the batter
 * before the play), 1..3 = bases, 4 = scored. `out` marks the runner being
 * put out while heading to `to`.
 */
export interface RunnerMove {
  runner: string;
  from: 0 | 1 | 2 | 3;
  to: 1 | 2 | 3 | 4;
  out?: boolean;
}

/**
 * Presentation fields the engine writes into `GameEvent.meta` for every
 * plate-appearance event (§16.1). Older fields (batterName, runs, …) stay.
 */
export interface PlayMeta {
  bbType?: BbType;
  direction?: HitDirection;
  /** Fielder who handled the ball. */
  fielderSlot?: Pos;
  runnerMoves: RunnerMove[];
  /** Pitches thrown in this plate appearance. */
  pitchCount: number;
  swing: SwingKind;
  /** (inning ≥ 7 ? 2 : 1) × (|score diff| ≤ 2 ? 2 : 1), before the play. */
  leverage: number;
  isHighlight: boolean;
  /** Effective batter hand vs this pitcher (switch hitters resolved). */
  batterHand: "L" | "R";
  pitcherHand: "L" | "R";
  /** Batter display power 1..99 (bat-crack strength, HR distance). */
  power: number;
}

/** Animation clip names (§15.4). Names are fixed; the asset validator checks them. */
export const CLIPS = [
  "idle_field",
  "idle_batter",
  "idle_pitcher",
  "idle_catcher",
  "pitch_windup",
  "pitch_stretch",
  "swing_contact",
  "swing_miss",
  "swing_check",
  "bunt",
  "run",
  "run_slide",
  "run_trot",
  "field_ground",
  "catch_fly",
  "catch_dive",
  "throw",
  "umpire_strike",
  "umpire_out",
  "umpire_safe",
  "react_strikeout",
  "react_hr",
  "celebrate",
  "dugout_cheer",
  "dugout_sad",
  "pickup",
  "drop",
  "walk_to_slot",
] as const;
export type ClipName = (typeof CLIPS)[number];

/** Fallbacks when a clip is missing (§15.4). */
export const CLIP_FALLBACKS: Partial<Record<ClipName, ClipName>> = {
  catch_dive: "catch_fly",
  swing_check: "swing_miss",
  run_trot: "run",
  pitch_stretch: "pitch_windup",
  react_strikeout: "idle_batter",
  react_hr: "idle_batter",
};

/** Camera shots (§16.2). */
export const SHOTS = ["CAM_PITCH", "CAM_BATTER", "CAM_BALL", "CAM_FIELD", "CAM_RUNNER", "CAM_CROWD", "CAM_PUNCH", "CAM_BOARD"] as const;
export type ShotName = (typeof SHOTS)[number];

/** Sound effect ids (§17.3). All are synthesised in-app (no third-party audio). */
export const SFX = [
  "bat_crack_weak",
  "bat_crack_mid",
  "bat_crack_strong",
  "glove_pop_soft",
  "glove_pop_hard",
  "ump_strike",
  "ump_out",
  "ump_safe",
  "ump_ball",
  "crowd_ambience",
  "crowd_hr_roar",
  "crowd_boo",
  "cheer_drum",
  "fireworks",
  "coin",
  "interest_tick",
  "reroll_shuffle",
  "card_drop",
  "fanfare",
  "damage_drum",
  "win_sting",
  "lose_sting",
  "level_up",
  "synergy_tone_1",
  "synergy_tone_2",
  "synergy_tone_3",
  "button",
  "error",
  "slide",
  "dust",
  "equip",
] as const;
export type SfxId = (typeof SFX)[number];
/** Looping sounds (ambience channel). */
export const SFX_LOOPS: readonly SfxId[] = ["crowd_ambience", "cheer_drum"];

/** Haptic strengths (§17.4): light 10 ms, medium 25 ms, heavy 45 ms. */
export const HAPTICS = { light: [10], medium: [25], heavy: [45], heavy2: [45, 60, 45], error: [15, 40, 15] } as const;
export type HapticId = keyof typeof HAPTICS;

/** Field coordinates in metres (§16.5). Home plate at origin, +z to centre field. */
export const FIELD_COORDS: Record<Pos | "P" | "UMP", [number, number, number]> = {
  C: [0, 0, -1],
  "1B": [20, 0, 26],
  "2B": [12, 0, 38],
  SS: [-12, 0, 38],
  "3B": [-20, 0, 26],
  LF: [-45, 0, 75],
  CF: [0, 0, 95],
  RF: [45, 0, 75],
  DH: [-14, 0, -6],
  P: [0, 0.25, 18.4],
  UMP: [0, 0, -2],
};
/** Base positions (90 ft ≈ 27.4 m square). 0 = home, 4 = home again. */
export const BASE_POS: [number, number, number][] = [
  [0, 0, 0],
  [19.4, 0, 19.4],
  [0, 0, 38.8],
  [-19.4, 0, 19.4],
  [0, 0, 0],
];
