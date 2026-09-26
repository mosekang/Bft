/** Pitcher fatigue rules (§5.3). */
export const FATIGUE = {
  /** Rounds a starter stays tired after starting a game. */
  starterRounds: 2,
  /** Stat multiplier while tired. */
  tiredMultiplier: 0.7,
  /** Chance a tired starter who pitches anyway gets hurt. */
  tiredInjuryChance: 0.15,
  injuryRounds: 3,
  /** Relievers can pitch every round; this caps their innings per game. */
  relieverMaxOuts: 6,
} as const;
