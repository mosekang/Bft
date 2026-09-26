/** League baseline and rating→probability constants (§6.1, §6.2). */
export const LEAGUE = {
  /** Per plate appearance. */
  bbRate: 0.09,
  kRate: 0.18,
  hrRate: 0.025,
  babip: 0.31,
  /** Batted-ball mix among balls in play. */
  battedBall: { GROUND: 0.45, LINE: 0.21, FLY: 0.27, POPUP: 0.07 },
  /** BABIP per batted-ball type (fly excludes home runs). */
  babipByType: { GROUND: 0.24, LINE: 0.68, FLY: 0.12, POPUP: 0.02 },
  /** Target runs per team per game and tolerance. */
  targetRuns: 4.8,
  targetRunsTolerance: 0.4,
  /** Probability clamp for pBB / pK / pHR. */
  probMin: 0.005,
  probMax: 0.6,
} as const;

/** Rating pivot: `mult(r) = exp((r - PIVOT) * k)`. */
export const RATING_PIVOT = 55;

/** `k` per rating (§6.2). Sign encodes direction. */
export const RATING_K = {
  hitter: { kRate: -0.018, bbRate: 0.02, hrRate: 0.03 },
  pitcher: { kRate: 0.018, bbRate: -0.02, hrRate: -0.022 },
} as const;

/** Additive coefficients per rating point above the pivot (§6.2). */
export const RATING_ADD = {
  hitterContactBabip: 0.0016,
  pitcherContactBabip: -0.0012,
  hitterGbTend: 0.004,
  pitcherGbRate: 0.004,
} as const;

/** Rating multiplier relative to league average. */
export function ratingMult(rating: number, k: number): number {
  return Math.exp((rating - RATING_PIVOT) * k);
}

/** Plate-appearance resolution constants (§6.3). */
export const PLATE = {
  platoonBase: 0.08,
  /** `platoonScale = 1 + (55 - armAngle) / 100`. */
  platoonArmPivot: 55,
  platoonArmDivisor: 100,
  /** Pull / center / opposite split of batted balls. */
  direction: { PULL: 0.45, CENTER: 0.35, OPPO: 0.2 },
  /** Share of liners/flies fielded by infielders (shallow). */
  shallowInfieldShare: 0.2,
  defenseBabipPerPoint: -0.0012,
  defensePivot: 50,
  infieldHitPerSpeed: 0.0006,
  hitTypeByBattedBall: {
    GROUND: { "1B": 0.95, "2B": 0.05, "3B": 0 },
    LINE: { "1B": 0.65, "2B": 0.3, "3B": 0.05 },
    FLY: { "1B": 0.25, "2B": 0.62, "3B": 0.13 },
  },
  xbhPerPoint: 0.006,
  triplePerSpeed: 0.01,
  doublePlay: { base: 0.55, speedPerPoint: 0.006, defExponent: 0.5 },
  sacFly: { base: 0.6, runnerSpeedPerPoint: 0.004, ofArmPerPoint: 0.004 },
  error: { base: 0.015, divisor: 50 },
  advance: {
    secondScoresOnSingle: 0.62,
    firstScoresOnDouble: 0.45,
    firstToThirdOnSingle: 0.28,
    speedPerPoint: 0.005,
    armPerPoint: 0.004,
    /** Of failed advances, share thrown out. */
    thrownOutOnFail: 0.25,
  },
  steal: {
    minSpeed: 65,
    attemptBase: 0.12,
    attemptPerSpeed: 0.01,
    successBase: 0.72,
    sbSkillPerPoint: 0.004,
    catcherArmPerPoint: 0.004,
    pitcherHoldPerPoint: 0.003,
  },
} as const;

/** Game flow (§6.5). */
export const GAME = {
  regulationInnings: 9,
  maxInnings: 12,
  designatedHitter: true,
  maxEventsPerGame: 120,
  highlightCount: 5,
  /** Performance budgets in ms. */
  budgetNodeMs: 30,
  budgetWorkerMs: 80,
  importance: {
    runsWeight: 2,
    lateInning: 7,
    lateInningWeight: 2,
    closeMargin: 2,
    closeWeight: 2,
    homeRun: 3,
    stolenBase: 1,
    doublePlay: 1,
    error: 2,
    basesLoadedInningEndingK: 3,
  },
} as const;
