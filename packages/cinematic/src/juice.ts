/**
 * Juice and timing numbers (DESIGN v3 §16, §17.1). Builders read every
 * presentation number from here; no magic numbers in `events/*`.
 * Times are seconds at 1× unless the key ends in `Ms`.
 */
import type { BbType, EventType } from "@dugout/protocol";
import type { BudgetKey } from "./dsl.js";

export const JUICE = {
  /** Spec time budget per timeline at 1× (§16.3). Validation allows ±10 %. */
  budget: {
    "1B": 2.0,
    "2B": 2.6,
    "3B": 2.6,
    HR: 4.5,
    K: 1.5,
    K_BASES_LOADED: 2.5,
    BB: 0.8,
    HBP: 1.0,
    SB: 1.8,
    CS: 1.8,
    DP: 2.2,
    E: 1.6,
    SF: 1.8,
    GO: 1.4,
    FO: 1.5,
    LO: 1.2,
    PO: 1.3,
    FC: 1.8,
    SH: 1.5,
    PITCHING_CHANGE: 1.0,
    INNING_END: 0.4,
    INNING: 0.4,
    SUMMARY: 0.6,
    GAME_END: 2.0,
  } satisfies Record<BudgetKey, number>,
  budgetTolerance: 0.1,

  /** Swing / contact moment after the windup starts. */
  contactAt: { hit: 0.72, hr: 0.9, out: 0.4, strike: 0.6, ball: 0.45 },

  hitstopMs: { contact: 80, strike: 40, tag: 30 },
  hr: {
    slowMo: { scale: 0.25, dur: 0.5 },
    crowdAt: 1.6,
    trotAt: 2.3,
    trotDur: 1.0,
    boardAt: 3.5,
    scoreAt: 3.6,
    flashMs: 100,
    fireworks: 200,
    confetti: 300,
  },
  shake: {
    contact: { amp: 0.15, dur: 0.15 },
    error: { amp: 0.1, dur: 0.2 },
    hr: { amp: 0.25, dur: 0.3 },
  },
  fx: { spark: 24, dustSlide: 60, dustTag: 40, coinBurst: 30 },
  crowdBooVolume: 0.7,
  /** Bat crack strength by batter power: < weak → weak, < mid → mid, else strong. */
  batCrack: { weakBelow: 55, midBelow: 75 },
  camera: { ease: 0.4, ballShot: 0.4 },

  /** Base-to-base leg durations for runner moves. */
  legs: { hit: 0.5, double: 0.55, triple: 0.42, out: 0.8, walk: 0.3, steal: 1.05, tagUp: 0.45 },
  /** Delay after contact before runners break. */
  runnerBreak: 0.1,
  /** Runners must arrive this long before the timeline ends. */
  arriveBefore: 0.1,
  /** Fraction of the ball flight a fielder spends chasing a hit before the failed attempt. */
  chaseFraction: 0.75,
  /** Strikeout beats: punch-out call and batter reaction after the pitch arrives. */
  strikeout: { callAfter: 0.15, reactAfter: 0.45, celebrateAt: 1.5 },
  /** Walk / hit-by-pitch: when the batter trots to first. */
  walk: { goAt: 0.5 },
  /** Fielding sequences for outs. `*After` / `*Before` are relative to the ball arriving. */
  fielding: {
    throwAfter: 0.2,
    fieldBefore: 0.1,
    catchBefore: 0.1,
    callAfter: 0.1,
    camDelay: 0.05,
    lineDiveChance: 0.3,
    buntCharge: 0.4,
    errorDropAfter: 0.0,
    booAfter: 0.05,
  },
  /** Stolen base / caught stealing beats. */
  steal: { throwAt: 0.5, slideLead: 0.25 },
  /** Game-flow beats: pitching change, game end, summary cards. */
  flow: {
    pitchingChange: { walkAt: 0.1, walkDur: 0.8 },
    gameEnd: { celebrateAt: 0.2, crowdAt: 1.0 },
    summary: { scoreAt: 0.3 },
  },
  /** Double play runner legs (batter / lead runner). */
  doublePlay: { batterLeg: 1.4, leadLeg: 0.95 },

  /** Ball flights (§16.4). Distances in metres, flight times in scene seconds. */
  ball: {
    contactHeight: 1.0,
    catchHeight: { ground: 0.3, air: 1.4 },
    samples: 24,
    angles: { pull: 28, center: 0, oppo: 22, jitter: 8 },
    types: {
      GB: { apex: 0.4, bounces: 2, damping: 0.5, dist: [40, 55] },
      LD: { apex: 3, bounces: 0, damping: 0.5, dist: [60, 90] },
      FB: { apex: 25, bounces: 0, damping: 0.5, dist: [70, 100] },
      PU: { apex: 30, bounces: 0, damping: 0.5, dist: [15, 40] },
    } satisfies Record<BbType, { apex: number; bounces: number; damping: number; dist: readonly [number, number] }>,
    hr: { apex: 30, dist: [110, 135] as [number, number] },
    /** Extra-base hits land deeper: fraction of the distance range skipped. */
    depth: { "1B": 0, "2B": 0.4, "3B": 0.7 },
    flight: { hit: 1.2, hr: 3.0, groundOut: 0.45, lineOut: 0.4, flyOut: 0.8, popUp: 0.7, throw: 0.3, steal: 0.6 },
    throwApex: 1.5,
    bunt: { dist: 7, apex: 0.2, height: 0.8, bounces: 1, damping: 0.5 },
  },

  /** Fielding layout (§16.5): outfielders shade toward right field vs lefties. */
  layout: { leftyOutfieldShiftX: 5 },

  /**
   * Reel budgets (§16.6). Optional cards (pitching changes, summaries,
   * inning transitions) are dropped while the total exceeds `target`;
   * highlights are dropped only while it exceeds `max`.
   */
  reel: {
    normal: { maxHighlights: 7, target: 20, max: 23 },
    compact: { maxHighlights: 4, target: 12, max: 14 },
    /** Highlight ranking when there are more candidates than slots. */
    importance: {
      perRun: 2,
      perLeverage: 0.5,
      bigStrikeout: 3,
      type: { HR: 4, "3B": 2, DP: 2, "2B": 1.5, SB: 1, CS: 1, E: 1, SF: 1, "1B": 0.5, K: 0.5 } as Partial<Record<EventType, number>>,
    },
  },
} as const;

export type Juice = typeof JUICE;
