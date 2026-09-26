/**
 * League baseline rates the Log5 step regresses toward (KBO-flavoured).
 * Per plate appearance. Target: 4.5–5.5 runs per team per game.
 */
export const LEAGUE_BASELINE = {
  walkRate: 0.09,
  hitByPitchRate: 0.012,
  strikeoutRate: 0.19,
  homeRunRate: 0.025,
  /** Batting average on balls in play. */
  babip: 0.31,
  /** Of balls in play: ground / line / fly / popup. */
  battedBallMix: { GROUND: 0.45, LINE: 0.21, FLY: 0.27, POPUP: 0.07 } as const,
  /** Of non-HR hits: single / double / triple. */
  hitMix: { "1B": 0.73, "2B": 0.22, "3B": 0.05 } as const,
  stolenBaseSuccess: 0.72,
  errorRatePerBip: 0.018,
  /** Stat multiplier for a replacement-level player relative to a 1-cost card. */
  replacementFactor: 0.85,
} as const;
