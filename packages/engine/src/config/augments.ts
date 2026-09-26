import type { AugmentId, AugmentRarity } from "@dugout/protocol";

export interface AugmentDef {
  readonly id: AugmentId;
  readonly nameKo: string;
  readonly rarity: AugmentRarity;
  readonly descriptionKo: string;
  readonly params: Readonly<Record<string, number>>;
}

/** Manager philosophies (§9). */
export const AUGMENTS: readonly AugmentDef[] = [
  { id: "MONEYBALL", nameKo: "머니볼", rarity: "SILVER", descriptionKo: "1코스트 타자 선구 +15, 볼넷 ×1.2", params: { cost1EyeAdd: 15, cost1BbMult: 1.2 } },
  { id: "REROLL_HOUSE", nameKo: "리롤 명가", rarity: "SILVER", descriptionKo: "리롤 1골드", params: { rerollCost: 1 } },
  { id: "STINGY_BALL", nameKo: "짠물 야구", rarity: "SILVER", descriptionKo: "이자 상한 7", params: { interestCap: 7 } },
  { id: "FARM_SYSTEM", nameKo: "팜 시스템", rarity: "GOLD", descriptionKo: "★★에 2장, ★★★에 6장", params: { copiesPerStar: 2 } },
  { id: "SMALL_BALL", nameKo: "스몰볼", rarity: "GOLD", descriptionKo: "도루 항상 활성, 컨택 ≤ 50 타자 자동 번트(성공 .70), 스피드스터 단계 +1", params: { stealsEnabled: 1, buntContactMax: 50, buntSuccess: 0.7, speedsterTierAdd: 1 } },
  { id: "LONG_BALL", nameKo: "뻥야구", rarity: "GOLD", descriptionKo: "팀 홈런 ×1.25, 삼진 ×1.15, 2루타 ×0.9", params: { hrMult: 1.25, kMult: 1.15, doubleMult: 0.9 } },
  { id: "CLEANUP_CARRY", nameKo: "4번 몰빵", rarity: "GOLD", descriptionKo: "OVR 최고 타자 내부치 +20, 나머지 타자 −4", params: { topHitterAdd: 20, otherHittersAdd: -4 } },
  { id: "OPENER", nameKo: "오프너", rarity: "GOLD", descriptionKo: "RP가 P1에서 선발 가능(2이닝 후 교체), RP 라운드 피로 0", params: { openerOuts: 6, relieverFatigue: 0 } },
  { id: "ABS", nameKo: "ABS 도입", rarity: "GOLD", descriptionKo: "포수 프레이밍 무효(양 팀), 팀 투수 제구 65+ 볼넷 ×0.85", params: { framingDisabled: 1, controlThreshold: 65, bbMult: 0.85 } },
  { id: "PLAYER_DEVELOPMENT", nameKo: "육성형 구단", rarity: "GOLD", descriptionKo: "고졸 성장 2배, 대졸 효과 0", params: { prospectGrowthMult: 2, collegeMult: 0 } },
  { id: "FOREIGN_FARMING", nameKo: "용병 농사", rarity: "GOLD", descriptionKo: "외국인 정확히 2 보너스 +5, 쿼터 위반 페널티 절반", params: { foreignBonusAdd: 5, overflowPenaltyMult: 0.5 } },
  { id: "BIG_SPENDER", nameKo: "큰손 구단", rarity: "PRISM", descriptionKo: "즉시 25골드, 이자 상한 3", params: { goldNow: 25, interestCap: 3 } },
  { id: "FRANCHISE", nameKo: "프랜차이즈", rarity: "PRISM", descriptionKo: "즉시 ★★ 카드 1장 선택(3코스트 이하)", params: { freeTwoStarMaxCost: 3 } },
  { id: "SABERMETRICS", nameKo: "세이버메트릭스", rarity: "PRISM", descriptionKo: "상점 내부치 전부 공개, 상대 시너지 단계 공개", params: { revealInternals: 1, revealSynergies: 1 } },
  { id: "DYNASTY", nameKo: "왕조", rarity: "PRISM", descriptionKo: "레벨 +1 즉시, XP 비용 ×1.25", params: { levelNow: 1, xpCostMult: 1.25 } },
  { id: "MASTER_MANAGER", nameKo: "명장", rarity: "PRISM", descriptionKo: "자동 감독 강화, 마무리 조건 리드 4점까지", params: { closerLeadMax: 4, smartManager: 1 } },
  // v3 §18.3
  { id: "DATA_BASEBALL", nameKo: "데이터 야구", rarity: "GOLD", descriptionKo: "상점 내부치 공개, 라운드마다 첫 리롤 비용 −1", params: { revealInternals: 1, firstRerollDiscount: 1 } },
  { id: "VETERAN_PREFERENCE", nameKo: "노장 우대", rarity: "SILVER", descriptionKo: "베테랑 카드 내부치 +6, S7 페널티 없음", params: { veteranAdd: 6, postseasonImmune: 1 } },
  { id: "REBUILDING", nameKo: "리빌딩", rarity: "SILVER", descriptionKo: "팬심 60 이상이면 매 라운드 +2골드, 고졸 유망주 성장 +1", params: { goldPerRound: 2, minHp: 60, prospectGrowthAdd: 1 } },
  { id: "HOME_ADVANTAGE", nameKo: "홈 어드밴티지", rarity: "GOLD", descriptionKo: "홈 경기에서 아군 타자 BABIP +.012", params: { homeBabipAdd: 0.012 } },
  { id: "CHEER_SQUAD", nameKo: "응원단", rarity: "SILVER", descriptionKo: "홈 경기 승리마다 +1골드, 홈 경기 득점권 컨택·파워 +2", params: { homeWinGold: 1, homeRispAdd: 2 } },
  { id: "ROOKIE_RACE", nameKo: "신인왕 레이스", rarity: "GOLD", descriptionKo: "보드에서 가장 어린 선수 내부치 +10", params: { youngestAdd: 10 } },
  { id: "TRADE_MASTER", nameKo: "트레이드 명가", rarity: "GOLD", descriptionKo: "트레이드 마감: 제시 5장, 교환 2회", params: { tradeOptions: 5, tradeSwaps: 2 } },
  { id: "MASTER_CATCHER", nameKo: "명포수", rarity: "PRISM", descriptionKo: "포수 카드가 포수·백업 포수 시너지에 2명으로 계산, 프레이밍 ×1.5", params: { catcherCountMult: 2, framingScale: 1.5 } },
];

export const AUGMENT_BY_ID: ReadonlyMap<AugmentId, AugmentDef> = new Map(AUGMENTS.map((a) => [a.id, a]));

/** Offer rarity odds in % (§9). */
export const AUGMENT_RARITY_ODDS: Readonly<Record<AugmentRarity, number>> = { SILVER: 50, GOLD: 35, PRISM: 15 };
