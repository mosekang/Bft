/** Board rules (§4.3). */
export const BOARD = {
  hitterSlots: 9,
  pitcherSlots: 3,
  totalSlots: 12,
  /** Defensive efficiency by fit. DH is always 1.0. */
  positionEfficiency: { primary: 1.0, secondary: 0.9, other: 0.65, dh: 1.0 },
  /** Fielding value assumed for positions a hitter has no rating for. */
  defaultDef: 40,
  /** Defense used in OVR for DH-only hitters. */
  dhOnlyDefenseForOvr: 40,
} as const;

/** Replacement players (§5.4). */
export const REPLACEMENT = {
  rating: 38,
  pitcherStamina: 45,
  bats: "R",
  throws: "R",
  /** Surnames used for "○대체". */
  surnames: ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"],
  suffix: "대체",
} as const;
