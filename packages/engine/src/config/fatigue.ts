/** Pitch counts, in-game fatigue, auto-manager and round-level fatigue (§6.4). */
export const PITCHING = {
  pitchesPerPa: { base: 3, strikeout: 1, walk: 2, randomMax: 2 },
  /** Limit `T = limitBase + stamina * limitPerStamina`. */
  limitBase: 60,
  limitPerStamina: 0.5,
  /** Every `decayStep` pitches past T: */
  decayStep: 15,
  decay: { kMult: 0.92, bbMult: 1.15, hrMult: 1.2, babipAdd: 0.01 },
  mental: { rispBbPerPoint: 0.004, meltdownRuns: 3, meltdownPerPoint: 0.05 },
  manager: {
    starterPullOverLimit: 15,
    starterPullRunsFrom5th: 5,
    starterPullLeadFrom8th: 3,
    closerLeadMin: 1,
    closerLeadMax: 3,
    relieverMaxOuts: 6,
    relieverMaxPitches: 25,
  },
} as const;

export const FATIGUE = {
  starterRounds: 2,
  relieverRoundsAfterTwoInnings: 1,
  tiredPenalty: 0.3,
  tiredInjuryChance: 0.1,
  injuryRounds: 2,
} as const;
