import { z } from "zod";

/** Batting side. */
export const HandSchema = z.enum(["L", "R", "S"]);
export type Hand = z.infer<typeof HandSchema>;

/** Throwing arm. */
export const ThrowsSchema = z.enum(["L", "R"]);
export type Throws = z.infer<typeof ThrowsSchema>;

/** Hitter board positions. DH is a lineup slot, never a fielding position. */
export const POS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"] as const;
export const PosSchema = z.enum(POS);
export type Pos = z.infer<typeof PosSchema>;

export const FIELD_POS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
export type FieldPos = (typeof FIELD_POS)[number];

export const PITCHER_SLOTS = ["P1", "P2", "P3"] as const;
export const PitcherSlotSchema = z.enum(PITCHER_SLOTS);
export type PitcherSlot = z.infer<typeof PitcherSlotSchema>;

/** All 12 board slots (§4.3). */
export const SLOTS = [...POS, ...PITCHER_SLOTS] as const;
export const SlotSchema = z.enum(SLOTS);
export type Slot = z.infer<typeof SlotSchema>;

export const RoleSchema = z.enum(["H", "SP", "RP"]);
export type Role = z.infer<typeof RoleSchema>;

export const CostSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type Cost = z.infer<typeof CostSchema>;
export const COSTS: readonly Cost[] = [1, 2, 3, 4, 5];

export const StarSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Star = z.infer<typeof StarSchema>;

/** Origin traits (§7.1). Exactly one per card. */
export const ORIGIN_TAGS = ["HS_PROSPECT", "COLLEGE", "FOREIGN", "VETERAN", "MILITARY_DONE", "JOURNEYMAN"] as const;
export const OriginTagSchema = z.enum(ORIGIN_TAGS);
export type OriginTag = z.infer<typeof OriginTagSchema>;

/**
 * Class traits (§7.2) stored on a card. LEFTY_BAT / RIGHTY_BAT are *derived*
 * from `bats` at synergy-count time (S counts as both) and never stored.
 */
export const CLASS_TAGS = [
  "SLUGGER",
  "CONTACT_HITTER",
  "SPEEDSTER",
  "GOLD_GLOVE",
  "CATCHER",
  "FIREBALLER",
  "FINESSE",
  "INNING_EATER",
  "CLOSER",
  "CLUTCH",
] as const;
export const ClassTagSchema = z.enum(CLASS_TAGS);
export type ClassTag = z.infer<typeof ClassTagSchema>;

export const DERIVED_CLASS_TAGS = ["LEFTY_BAT", "RIGHTY_BAT"] as const;
export type DerivedClassTag = (typeof DERIVED_CLASS_TAGS)[number];

/**
 * Board-derived synergies (v3 §18.3). Never stored on a card: counted from
 * card facts (`team`, `pos2`, `armAngle`, `bats`, batting order) at count time.
 */
export const BOARD_SYNERGY_IDS = ["HOMEGROWN", "UTILITY", "SIDEARM", "SWITCH_HITTER", "LEADOFF", "BACKUP_CATCHER"] as const;
export type BoardSynergyId = (typeof BOARD_SYNERGY_IDS)[number];

/** Every synergy id the engine can count. */
export const SYNERGY_IDS = [...ORIGIN_TAGS, ...CLASS_TAGS, ...DERIVED_CLASS_TAGS, ...BOARD_SYNERGY_IDS] as const;
export const SynergyIdSchema = z.enum(SYNERGY_IDS);
export type SynergyId = z.infer<typeof SynergyIdSchema>;

export const STADIUM_IDS = ["HITTER_FRIENDLY", "PITCHER_FRIENDLY", "ARTIFICIAL_TURF", "SEA_BREEZE", "DOME"] as const;
export const StadiumIdSchema = z.enum(STADIUM_IDS);
export type StadiumId = z.infer<typeof StadiumIdSchema>;

export const COMPONENT_ITEM_IDS = ["BAT", "SPIKES", "GLOVE", "ROSIN", "ICING", "SCOUTING"] as const;
export const ComponentItemIdSchema = z.enum(COMPONENT_ITEM_IDS);
export type ComponentItemId = z.infer<typeof ComponentItemIdSchema>;

export const COMBINED_ITEM_IDS = [
  "BIG_BAT", // 배트+배트 거포의 방망이
  "POWER_SPEED", // 배트+스파이크 호타준족
  "TWO_WAY", // 배트+글러브 공수겸장
  "PATIENT_SLUGGER", // 배트+로진백 선구안 강타자
  "IRON_HITTER", // 배트+아이싱 철인 타자
  "GUESS_HITTER", // 배트+전력분석 노림수
  "GREAT_THIEF", // 스파이크+스파이크 대도
  "OF_COMMANDER", // 스파이크+글러브 외야 사령관
  "LEADOFF", // 스파이크+로진백 리드오프
  "INFINITE_STAMINA", // 스파이크+아이싱 무한 체력
  "BATTERY_ANALYSIS", // 스파이크+전력분석 배터리 분석
  "GOLDEN_GLOVE", // 글러브+글러브 골든글러브
  "FIELD_GENERAL", // 글러브+로진백 야전사령관
  "IRON_WALL", // 글러브+아이싱 철벽
  "DEFENSIVE_SHIFT", // 글러브+전력분석 수비 시프트
  "CONTROL_ARTIST", // 로진백+로진백 컨트롤 아티스트
  "IRON_ARM", // 로진백+아이싱 철완
  "PITCH_SEQUENCING", // 로진백+전력분석 볼배합의 신
  "TRAINER", // 아이싱+아이싱 트레이너
  "CONDITIONING_COACH", // 아이싱+전력분석 컨디셔닝 코치
  "FRONT_OFFICE", // 전력분석+전력분석 프런트 오피스
] as const;
export const CombinedItemIdSchema = z.enum(COMBINED_ITEM_IDS);
export type CombinedItemId = z.infer<typeof CombinedItemIdSchema>;

export const SPECIAL_ITEM_IDS = [
  "RELOCATION",
  "FA_CONTRACT",
  "CALL_UP",
  "NUMBER_SUCCESSION",
  "SCOUT_REPORT", // 스카우트 리포트 (instant)
  "SUPPLEMENT", // 체력 보충제 (instant)
  "CONTRACT_EXTENSION", // 계약 연장 (equipped)
  "CHEER_SONG", // 응원가 (instant)
  "TRAINING_CAMP", // 트레이닝 캠프 (consumed on EQUIP)
  "AGENT", // 에이전트 (instant)
] as const;
export const SpecialItemIdSchema = z.enum(SPECIAL_ITEM_IDS);
export type SpecialItemId = z.infer<typeof SpecialItemIdSchema>;

export const ITEM_IDS = [...COMPONENT_ITEM_IDS, ...COMBINED_ITEM_IDS, ...SPECIAL_ITEM_IDS] as const;
export const ItemIdSchema = z.enum(ITEM_IDS);
export type ItemId = z.infer<typeof ItemIdSchema>;

export const AUGMENT_IDS = [
  "MONEYBALL",
  "REROLL_HOUSE",
  "STINGY_BALL",
  "FARM_SYSTEM",
  "SMALL_BALL",
  "LONG_BALL",
  "CLEANUP_CARRY",
  "OPENER",
  "ABS",
  "PLAYER_DEVELOPMENT",
  "FOREIGN_FARMING",
  "BIG_SPENDER",
  "FRANCHISE",
  "SABERMETRICS",
  "DYNASTY",
  "MASTER_MANAGER",
  "DATA_BASEBALL", // 데이터 야구
  "VETERAN_PREFERENCE", // 노장 우대
  "REBUILDING", // 리빌딩
  "HOME_ADVANTAGE", // 홈 어드밴티지
  "CHEER_SQUAD", // 응원단
  "ROOKIE_RACE", // 신인왕 레이스
  "TRADE_MASTER", // 트레이드 명가
  "MASTER_CATCHER", // 명포수
] as const;
export const AugmentIdSchema = z.enum(AUGMENT_IDS);
export type AugmentId = z.infer<typeof AugmentIdSchema>;

export const AugmentRaritySchema = z.enum(["SILVER", "GOLD", "PRISM"]);
export type AugmentRarity = z.infer<typeof AugmentRaritySchema>;

export const ARCHETYPES = [
  "LONG_BALL",
  "SMALL_BALL",
  "FOREIGN_RELIANT",
  "PROSPECTS",
  "DEFENSE_FIRST",
  "ECON",
  "COPYCAT",
  "REROLL",
] as const;
export const ArchetypeSchema = z.enum(ARCHETYPES);
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const PhaseSchema = z.enum(["LOBBY", "STADIUM", "PREP", "CAROUSEL", "AUGMENT", "EVENT", "PLAYBACK", "SETTLE", "GAME_OVER"]);
export type Phase = z.infer<typeof PhaseSchema>;

/** Game log event types (§6.5). */
export const EVENT_TYPES = [
  "BB",
  "HBP",
  "K",
  "HR",
  "1B",
  "2B",
  "3B",
  "GO",
  "FO",
  "LO",
  "PO",
  "DP",
  "SF",
  "SH",
  "E",
  "FC",
  "SB",
  "CS",
  "PITCHING_CHANGE",
  "INNING_END",
  "GAME_END",
] as const;
export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

/** Rating 1..99 (§5.1). */
export const RatingSchema = z.number().int().min(1).max(99);
export type Rating = z.infer<typeof RatingSchema>;
