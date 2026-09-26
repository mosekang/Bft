import type { Label } from "./common.js";

// ---------------------------------------------------------------------------
// Trait ids
// ---------------------------------------------------------------------------

export const ORIGIN_TRAITS = [
  "HS_PROSPECT", // 고졸 유망주
  "COLLEGE", // 대졸 즉시전력
  "FOREIGN", // 외국인 용병
  "VETERAN", // 베테랑
  "MILITARY_DONE", // 군필
  "JOURNEYMAN", // 저니맨
] as const;
export type OriginTrait = (typeof ORIGIN_TRAITS)[number];

export const CLASS_TRAITS = [
  "LEFTY_BAT", // 좌타
  "RIGHTY_BAT", // 우타
  "SLUGGER", // 슬러거
  "CONTACT_HITTER", // 컨택 히터
  "SPEEDSTER", // 스피드스터
  "GOLD_GLOVE", // 골든글러브
  "CATCHER", // 포수
  "FIREBALLER", // 파이어볼러
  "FINESSE", // 기교파
  "INNING_EATER", // 이닝이터
  "CLOSER", // 마무리
  "CLUTCH", // 클러치
] as const;
export type ClassTrait = (typeof CLASS_TRAITS)[number];

export type TraitId = OriginTrait | ClassTrait;
export const ALL_TRAITS: readonly TraitId[] = [...ORIGIN_TRAITS, ...CLASS_TRAITS];

// ---------------------------------------------------------------------------
// Synergy definitions
// ---------------------------------------------------------------------------

export type TraitKind = "ORIGIN" | "CLASS";

/**
 * How the count of trait holders maps to a tier.
 * - "AT_LEAST": tiers activate at >= each threshold (standard TFT).
 * - "EXACT":    the single tier activates only at exactly the threshold,
 *               and `overflowPenalty` applies above it (FOREIGN quota rule).
 */
export type ThresholdMode = "AT_LEAST" | "EXACT";

export interface SynergyTier {
  /** Number of distinct cards holding the trait on the *board* (bench never counts). */
  readonly count: number;
  readonly description: Label;
}

export interface SynergyDefinition {
  readonly id: TraitId;
  readonly kind: TraitKind;
  readonly label: Label;
  /** Baseball context for the codex. */
  readonly flavour: Label;
  readonly mode: ThresholdMode;
  /** Ascending by `count`. */
  readonly tiers: readonly SynergyTier[];
  /** Only for mode === "EXACT". */
  readonly overflowPenalty?: Label;
}

/** Runtime view: which traits are active on a board and at which tier. */
export interface ActiveSynergy {
  readonly id: TraitId;
  readonly count: number;
  /** 0 = inactive (shown greyed), 1..n = tier index + 1. */
  readonly tier: number;
  /** True when mode === "EXACT" and count exceeds the threshold. */
  readonly penalised: boolean;
}
