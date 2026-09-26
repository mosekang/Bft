import type { SynergyId } from "@dugout/protocol";

/** BOARD synergies (v3 §18.3) are counted from card facts and the lineup, never from tags. */
export type SynergyKind = "ORIGIN" | "CLASS" | "BOARD";
export type ThresholdMode = "AT_LEAST" | "EXACT";

export interface SynergyDef {
  readonly id: SynergyId;
  readonly kind: SynergyKind;
  readonly nameKo: string;
  readonly mode: ThresholdMode;
  /** Ascending thresholds; tier i is active when count satisfies thresholds[i]. */
  readonly thresholds: readonly number[];
  /** Per-tier numeric parameters (§7). Keys are documented per synergy. */
  readonly tiers: readonly Readonly<Record<string, number>>[];
  /** Korean effect text per tier, for the codex. */
  readonly descriptionsKo: readonly string[];
  /** EXACT mode only: params applied when count exceeds the threshold. */
  readonly overflow?: Readonly<Record<string, number>>;
  readonly overflowDescriptionKo?: string;
  /** Minimum cards a pack must contain for this tag (§5.3). */
  readonly minPackCards: number;
}

/** Synergy table (§7). Numbers are the confirmed v2 values. */
export const SYNERGIES: Readonly<Record<SynergyId, SynergyDef>> = {
  HS_PROSPECT: {
    id: "HS_PROSPECT", kind: "ORIGIN", nameKo: "고졸 유망주", mode: "AT_LEAST", thresholds: [2, 4, 6],
    /** Caps tuned by bot-arena (ADR-0003: +20 → 6/12/20; ADR-0010: → 4/8/16): the prospect bot stayed the strongest archetype. */
    tiers: [{ growthPerRound: 1, growthCap: 4 }, { growthPerRound: 1, growthCap: 8 }, { growthPerRound: 2, growthCap: 16 }],
    descriptionsKo: ["매 라운드 종료 시 내부치 +1 (상한 +4)", "매 라운드 종료 시 내부치 +1 (상한 +8)", "매 라운드 종료 시 내부치 +2 (상한 +16)"],
    minPackCards: 6,
  },
  COLLEGE: {
    id: "COLLEGE", kind: "ORIGIN", nameKo: "대졸 즉시전력", mode: "AT_LEAST", thresholds: [2, 4],
    tiers: [{ ratingAdd: 5 }, { ratingAdd: 9 }],
    descriptionsKo: ["즉시 내부치 +5", "즉시 내부치 +9"],
    minPackCards: 6,
  },
  FOREIGN: {
    id: "FOREIGN", kind: "ORIGIN", nameKo: "외국인 용병", mode: "EXACT", thresholds: [2],
    tiers: [{ ratingAdd: 10, teamHrMult: 1.05 }],
    descriptionsKo: ["정확히 2명: 내부치 +10, 팀 홈런 ×1.05"],
    overflow: { ratingAdd: -15, teamBbMult: 1.1 },
    overflowDescriptionKo: "쿼터 위반: 외국인 전원 −15, 팀 볼넷 ×1.10",
    minPackCards: 4,
  },
  VETERAN: {
    id: "VETERAN", kind: "ORIGIN", nameKo: "베테랑", mode: "AT_LEAST", thresholds: [2, 4],
    tiers: [{ rispContactPowerAdd: 4, postseasonPenalty: 10 }, { rispContactPowerAdd: 8, postseasonPenalty: 10 }],
    descriptionsKo: ["팀 득점권 컨택·파워 +4 (S7에 스태미나·스피드 −10)", "팀 득점권 컨택·파워 +8 (S7에 스태미나·스피드 −10)"],
    minPackCards: 6,
  },
  MILITARY_DONE: {
    id: "MILITARY_DONE", kind: "ORIGIN", nameKo: "군필", mode: "AT_LEAST", thresholds: [2],
    tiers: [{ starterFatigue: 1, injuryChance: 0 }],
    descriptionsKo: ["투수: 선발 피로 1로 시작 · 타자: 부상 확률 0"],
    minPackCards: 4,
  },
  JOURNEYMAN: {
    id: "JOURNEYMAN", kind: "ORIGIN", nameKo: "저니맨", mode: "AT_LEAST", thresholds: [3],
    tiers: [{ tradeSwaps: 2, carouselSeconds: 9 }],
    descriptionsKo: ["트레이드 마감 교환 2회, FA 시장 9초"],
    minPackCards: 6,
  },
  LEFTY_BAT: {
    id: "LEFTY_BAT", kind: "CLASS", nameKo: "좌타", mode: "AT_LEAST", thresholds: [3, 5, 7],
    tiers: [{ platoonFavorAdd: 0.04, platoonAgainstAdd: -0.02 }, { platoonFavorAdd: 0.08, platoonAgainstAdd: -0.03 }, { platoonFavorAdd: 0.14, platoonAgainstAdd: -0.04 }],
    descriptionsKo: ["우투 상대 플래툰 +0.04, 좌투 상대 −0.02", "우투 상대 +0.08, 좌투 상대 −0.03", "우투 상대 +0.14, 좌투 상대 −0.04"],
    minPackCards: 6,
  },
  RIGHTY_BAT: {
    id: "RIGHTY_BAT", kind: "CLASS", nameKo: "우타", mode: "AT_LEAST", thresholds: [3, 5, 7],
    tiers: [{ platoonFavorAdd: 0.04, platoonAgainstAdd: -0.02 }, { platoonFavorAdd: 0.08, platoonAgainstAdd: -0.03 }, { platoonFavorAdd: 0.14, platoonAgainstAdd: -0.04 }],
    descriptionsKo: ["좌투 상대 플래툰 +0.04, 우투 상대 −0.02", "좌투 상대 +0.08, 우투 상대 −0.03", "좌투 상대 +0.14, 우투 상대 −0.04"],
    minPackCards: 6,
  },
  SLUGGER: {
    id: "SLUGGER", kind: "CLASS", nameKo: "슬러거", mode: "AT_LEAST", thresholds: [2, 4],
    tiers: [{ hrMult: 1.15, kMult: 1.08 }, { hrMult: 1.3, kMult: 1.12 }],
    descriptionsKo: ["홈런 ×1.15, 삼진 ×1.08", "홈런 ×1.30, 삼진 ×1.12"],
    minPackCards: 6,
  },
  CONTACT_HITTER: {
    id: "CONTACT_HITTER", kind: "CLASS", nameKo: "컨택 히터", mode: "AT_LEAST", thresholds: [3, 5],
    tiers: [{ babipAdd: 0.02, kMult: 0.92 }, { babipAdd: 0.04, kMult: 0.85 }],
    descriptionsKo: ["BABIP +.020, 삼진 ×0.92", "BABIP +.040, 삼진 ×0.85"],
    minPackCards: 6,
  },
  SPEEDSTER: {
    id: "SPEEDSTER", kind: "CLASS", nameKo: "스피드스터", mode: "AT_LEAST", thresholds: [2, 4],
    tiers: [{ stealsEnabled: 1, sbSuccessAdd: 0.05, advanceAdd: 0.06, infieldHitAdd: 0.01 }, { stealsEnabled: 1, sbSuccessAdd: 0.1, advanceAdd: 0.12, infieldHitAdd: 0.02 }],
    descriptionsKo: ["팀 도루 활성. 도루 성공 +.05, 추가 진루 +.06, 내야안타 +.010", "도루 성공 +.10, 추가 진루 +.12, 내야안타 +.020"],
    minPackCards: 6,
  },
  GOLD_GLOVE: {
    id: "GOLD_GLOVE", kind: "CLASS", nameKo: "골든글러브", mode: "AT_LEAST", thresholds: [2, 4, 6],
    tiers: [{ oppBabipAdd: -0.012, errorMult: 0.8 }, { oppBabipAdd: -0.025, errorMult: 0.6 }, { oppBabipAdd: -0.04, errorMult: 0.4 }],
    descriptionsKo: ["상대 BABIP −.012, 실책 ×0.8", "상대 BABIP −.025, 실책 ×0.6", "상대 BABIP −.040, 실책 ×0.4"],
    minPackCards: 6,
  },
  CATCHER: {
    id: "CATCHER", kind: "CLASS", nameKo: "포수", mode: "AT_LEAST", thresholds: [1],
    tiers: [{ teamBbMult: 0.93 }],
    descriptionsKo: ["프레이밍: 아군 투수 볼넷 ×0.93 (ABS 시 무효)"],
    minPackCards: 4,
  },
  FIREBALLER: {
    id: "FIREBALLER", kind: "CLASS", nameKo: "파이어볼러", mode: "AT_LEAST", thresholds: [2, 3],
    tiers: [{ kMult: 1.15, bbMult: 1.06 }, { kMult: 1.3, bbMult: 1.1 }],
    descriptionsKo: ["삼진 ×1.15, 볼넷 ×1.06", "삼진 ×1.30, 볼넷 ×1.10"],
    minPackCards: 6,
  },
  FINESSE: {
    id: "FINESSE", kind: "CLASS", nameKo: "기교파", mode: "AT_LEAST", thresholds: [2, 3],
    tiers: [{ gbAdd: 0.08, hrMult: 0.9 }, { gbAdd: 0.15, hrMult: 0.82 }],
    descriptionsKo: ["땅볼 +.08, 홈런 ×0.90", "땅볼 +.15, 홈런 ×0.82"],
    minPackCards: 6,
  },
  INNING_EATER: {
    id: "INNING_EATER", kind: "CLASS", nameKo: "이닝이터", mode: "AT_LEAST", thresholds: [2],
    tiers: [{ starterFatigue: 1, pitchLimitAdd: 15 }],
    descriptionsKo: ["선발 피로 1, 한계 투구수 +15"],
    minPackCards: 4,
  },
  CLOSER: {
    id: "CLOSER", kind: "CLASS", nameKo: "마무리", mode: "AT_LEAST", thresholds: [1],
    tiers: [{ lateLeadRatingAdd: 12, saveWinGold: 1 }],
    descriptionsKo: ["9회 이후 리드 시 억제치 +12. 세이브 승리 시 골드 +1"],
    minPackCards: 4,
  },
  CLUTCH: {
    id: "CLUTCH", kind: "CLASS", nameKo: "클러치", mode: "AT_LEAST", thresholds: [2, 4],
    tiers: [{ rispAdd: 6, nonRispAdd: -2 }, { rispAdd: 12, nonRispAdd: -3 }],
    descriptionsKo: ["득점권 컨택·파워 +6, 그 외 −2", "득점권 +12, 그 외 −3"],
    minPackCards: 6,
  },

  // --- board synergies (v3 §18.3): counted from card facts, no pack minimum ---
  HOMEGROWN: {
    id: "HOMEGROWN", kind: "BOARD", nameKo: "홈그로운", mode: "AT_LEAST", thresholds: [3, 5],
    tiers: [{ ratingAdd: 3 }, { ratingAdd: 6 }],
    descriptionsKo: ["같은 구단 출신 3명: 보드 전원 내부치 +3", "같은 구단 출신 5명: 보드 전원 내부치 +6"],
    minPackCards: 0,
  },
  UTILITY: {
    id: "UTILITY", kind: "BOARD", nameKo: "유틸리티", mode: "AT_LEAST", thresholds: [2, 4],
    tiers: [{ offPositionPenaltyMult: 0.5 }, { offPositionPenaltyMult: 0 }],
    descriptionsKo: ["부포지션 2개 이상 선수: 주포지션 밖 수비 감소 절반", "주포지션 밖 수비 감소 없음"],
    minPackCards: 0,
  },
  SIDEARM: {
    id: "SIDEARM", kind: "BOARD", nameKo: "사이드암", mode: "AT_LEAST", thresholds: [1],
    tiers: [{ sameHandKMult: 1.2 }],
    descriptionsKo: ["팔 각도 30 이하 투수: 같은 손 타자 상대 삼진 ×1.20"],
    minPackCards: 0,
  },
  SWITCH_HITTER: {
    id: "SWITCH_HITTER", kind: "BOARD", nameKo: "스위치히터", mode: "AT_LEAST", thresholds: [2],
    tiers: [{ babipAdd: 0.01, noPlatoonPenalty: 1 }],
    descriptionsKo: ["양타 타자: 플래툰 불리 없음, BABIP +.010"],
    minPackCards: 0,
  },
  LEADOFF: {
    id: "LEADOFF", kind: "BOARD", nameKo: "리드오프", mode: "AT_LEAST", thresholds: [1],
    tiers: [{ bbMult: 1.1, sbSuccessAdd: 0.03 }],
    descriptionsKo: ["1·2번 타순의 선구 70+ 타자: 볼넷 ×1.10, 도루 성공 +.03"],
    minPackCards: 0,
  },
  BACKUP_CATCHER: {
    id: "BACKUP_CATCHER", kind: "BOARD", nameKo: "백업 포수", mode: "AT_LEAST", thresholds: [2],
    tiers: [{ framingScale: 2, fatigueRecoverChance: 0.3, fatigueRecover: 1 }],
    descriptionsKo: ["포수 2명(DH 포함): 프레이밍 효과 ×2, 매 라운드 30% 확률로 피로한 투수 1명 피로 −1"],
    minPackCards: 0,
  },
};

/** Counting rules for BOARD synergies (v3 §18.3). */
export const BOARD_SYNERGY_RULES = {
  /** UTILITY: a hitter with at least this many secondary positions. */
  utilityMinPos2: 2,
  /** SIDEARM: a pitcher whose arm angle is at most this. */
  sidearmMaxArmAngle: 30,
  /** LEADOFF: batting-order spots counted (1-based: 1 and 2). */
  leadoffSpots: 2,
  /** LEADOFF: display eye (with star bonus and growth) at least this. */
  leadoffMinEye: 70,
} as const;

/** Tier index (1-based) for a count; 0 = inactive. `penalised` for EXACT overflow. */
export function synergyTier(def: SynergyDef, count: number): { tier: number; penalised: boolean } {
  if (def.mode === "EXACT") {
    const t = def.thresholds[0] ?? 0;
    if (count === t) return { tier: 1, penalised: false };
    if (count > t) return { tier: 0, penalised: true };
    return { tier: 0, penalised: false };
  }
  let tier = 0;
  def.thresholds.forEach((th, i) => {
    if (count >= th) tier = i + 1;
  });
  return { tier, penalised: false };
}
