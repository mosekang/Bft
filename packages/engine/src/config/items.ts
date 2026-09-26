import type { CombinedItemId, ComponentItemId, ItemId, SpecialItemId } from "@dugout/protocol";

export interface ItemDef {
  readonly id: ItemId;
  readonly tier: "COMPONENT" | "COMBINED" | "SPECIAL";
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly recipe?: readonly [ComponentItemId, ComponentItemId];
  /** Numeric parameters consumed by the run loop / sim (Phase 2). */
  readonly params: Readonly<Record<string, number>>;
  /**
   * How a special item is used (v3 §18.3). INSTANT: applied the moment it is
   * picked, never enters the inventory. EQUIP: sits on a card like any item.
   * CONSUME_ON_EQUIP: targeted through EQUIP, applied to the card, then gone.
   * Absent: kept in the inventory (v2 specials).
   */
  readonly use?: "INSTANT" | "EQUIP" | "CONSUME_ON_EQUIP";
}

const component = (id: ComponentItemId, nameKo: string, descriptionKo: string, params: Record<string, number>): ItemDef => ({ id, tier: "COMPONENT", nameKo, descriptionKo, params });
const combined = (id: CombinedItemId, recipe: readonly [ComponentItemId, ComponentItemId], nameKo: string, descriptionKo: string, params: Record<string, number>): ItemDef => ({ id, tier: "COMBINED", recipe, nameKo, descriptionKo, params });
const special = (id: SpecialItemId, nameKo: string, descriptionKo: string, params: Record<string, number> = {}, use?: ItemDef["use"]): ItemDef => ({ id, tier: "SPECIAL", nameKo, descriptionKo, params, ...(use ? { use } : {}) });

/** Items (§8). */
export const ITEMS: readonly ItemDef[] = [
  component("BAT", "배트", "파워 +10", { power: 10 }),
  component("SPIKES", "스파이크", "스피드 +10", { speed: 10 }),
  component("GLOVE", "글러브", "수비 +10", { defense: 10 }),
  component("ROSIN", "로진백", "투수 제구 +10 / 타자 선구 +6", { control: 10, eye: 6 }),
  component("ICING", "아이싱", "투수 라운드 피로 −1 / 타자 부상 면역", { fatigueAdd: -1, injuryImmune: 1 }),
  component("SCOUTING", "전력분석", "팀: 다음 라운드 상대 로테이션·선발 공개", { revealRotation: 1 }),

  combined("BIG_BAT", ["BAT", "BAT"], "거포의 방망이", "파워 +25, 삼진 ×1.05", { power: 25, kMult: 1.05 }),
  combined("POWER_SPEED", ["BAT", "SPIKES"], "호타준족", "파워 +12, 스피드 +12, 3루타 ×1.5", { power: 12, speed: 12, tripleMult: 1.5 }),
  combined("TWO_WAY", ["BAT", "GLOVE"], "공수겸장", "파워 +12, 수비 +12", { power: 12, defense: 12 }),
  combined("PATIENT_SLUGGER", ["BAT", "ROSIN"], "선구안 강타자", "파워 +12, 선구 +12, 볼넷 ×1.15", { power: 12, eye: 12, bbMult: 1.15 }),
  combined("IRON_HITTER", ["BAT", "ICING"], "철인 타자", "파워 +12, 매 라운드 +1 성장", { power: 12, growthPerRound: 1 }),
  combined("GUESS_HITTER", ["BAT", "SCOUTING"], "노림수", "파워 +10, 첫 타석 홈런 ×1.3", { power: 10, firstPaHrMult: 1.3 }),
  combined("GREAT_THIEF", ["SPIKES", "SPIKES"], "대도", "스피드 +25, 도루 항상 활성, 성공률 +.10", { speed: 25, stealsEnabled: 1, sbSuccessAdd: 0.1 }),
  combined("OF_COMMANDER", ["SPIKES", "GLOVE"], "외야 사령관", "스피드 +12, 수비 +12, 담당 뜬공 BABIP −.03", { speed: 12, defense: 12, flyBabipAdd: -0.03 }),
  combined("LEADOFF", ["SPIKES", "ROSIN"], "리드오프", "선구 +12, 스피드 +12, 1번 타순 BABIP +.02", { eye: 12, speed: 12, leadoffBabipAdd: 0.02 }),
  combined("INFINITE_STAMINA", ["SPIKES", "ICING"], "무한 체력", "스피드 +12, S7 페널티 면제", { speed: 12, postseasonImmune: 1 }),
  combined("BATTERY_ANALYSIS", ["SPIKES", "SCOUTING"], "배터리 분석", "스피드 +8, 상대 포수 arm 무시", { speed: 8, ignoreCatcherArm: 1 }),
  combined("GOLDEN_GLOVE", ["GLOVE", "GLOVE"], "골든글러브", "수비 +25, 골든글러브 시너지 +1", { defense: 25, goldGloveCount: 1 }),
  combined("FIELD_GENERAL", ["GLOVE", "ROSIN"], "야전사령관", "수비 +12, 팀 실책 ×0.7", { defense: 12, teamErrorMult: 0.7 }),
  combined("IRON_WALL", ["GLOVE", "ICING"], "철벽", "수비 +12, 부상 면역, 대체선수 옆 칸 수비 +5", { defense: 12, injuryImmune: 1, adjacentReplacementDef: 5 }),
  combined("DEFENSIVE_SHIFT", ["GLOVE", "SCOUTING"], "수비 시프트", "팀: 상대 땅볼 BABIP −.025", { teamOppGroundBabipAdd: -0.025 }),
  combined("CONTROL_ARTIST", ["ROSIN", "ROSIN"], "컨트롤 아티스트", "투수 볼넷 ×0.75 / 타자 선구 +25", { bbMult: 0.75, eye: 25 }),
  combined("IRON_ARM", ["ROSIN", "ICING"], "철완", "투수: 한계 투구수 +25, 라운드 피로 1", { pitchLimitAdd: 25, starterFatigue: 1 }),
  combined("PITCH_SEQUENCING", ["ROSIN", "SCOUTING"], "볼배합의 신", "투수: 삼진 ×1.12, 홈런 ×0.90", { kMult: 1.12, hrMult: 0.9 }),
  combined("TRAINER", ["ICING", "ICING"], "트레이너", "팀: 모든 투수 라운드 피로 −1 (최소 1)", { teamFatigueAdd: -1, teamFatigueFloor: 1 }),
  combined("CONDITIONING_COACH", ["ICING", "SCOUTING"], "컨디셔닝 코치", "팀: 부상 확률 0, 피로 페널티 −15%", { teamInjuryChance: 0, tiredPenalty: 0.15 }),
  combined("FRONT_OFFICE", ["SCOUTING", "SCOUTING"], "프런트 오피스", "팀: 이자 상한 +2, 리롤 1골드", { interestCapAdd: 2, rerollCost: 1 }),

  special("RELOCATION", "구장 이전", "구장을 다시 선택한다"),
  special("FA_CONTRACT", "FA 계약서", "상점에서 원하는 코스트 카드 1장을 골드 없이 1회 구매"),
  special("CALL_UP", "콜업권", "벤치 칸 +2"),
  special("NUMBER_SUCCESSION", "등번호 계승", "장착 카드 ★ 1단계 상승 (★★★ 불가)"),
  // v3 §18.3 specials. INSTANT ones apply on pick; the others go through EQUIP.
  special("SCOUT_REPORT", "스카우트 리포트", "즉시: 다음 라운드 상대 보드 전체 공개 + 상대 로테이션 공개", { scoutRounds: 1 }, "INSTANT"),
  special("SUPPLEMENT", "체력 보충제", "즉시: 보유 투수 전원 라운드 피로 0", { clearFatigue: 1 }, "INSTANT"),
  special("CONTRACT_EXTENSION", "계약 연장", "장착: 내부치 전부 +3, 부상 면역 (아이템 칸 차지)", { ratingAdd: 3, injuryImmune: 1 }, "EQUIP"),
  special("CHEER_SONG", "응원가", "즉시: 3경기 동안 팀 득점권 컨택·파워 +4", { cheerRounds: 3, rispAdd: 4 }, "INSTANT"),
  special("TRAINING_CAMP", "트레이닝 캠프", "장착 시 소모: 그 선수 성장 +6 (영구)", { growthAdd: 6 }, "CONSUME_ON_EQUIP"),
  special("AGENT", "에이전트", "즉시: 다음 리롤 5회 무료", { freeRerolls: 5 }, "INSTANT"),
];

/** Special items offered by the Legend match reward (v3 §18.3): this many, drawn from every special. */
export const SPECIAL_REWARD_OPTIONS = 4;

export const ITEM_BY_ID: ReadonlyMap<ItemId, ItemDef> = new Map(ITEMS.map((i) => [i.id, i]));

/** Find the combined item for two components, order-insensitive. */
export function combineItems(a: ComponentItemId, b: ComponentItemId): CombinedItemId | undefined {
  const hit = ITEMS.find((i) => i.recipe && ((i.recipe[0] === a && i.recipe[1] === b) || (i.recipe[0] === b && i.recipe[1] === a)));
  return hit?.id as CombinedItemId | undefined;
}
