import type { Archetype, AugmentId, BoardSynergyId, ItemId, StadiumId, SynergyId } from "@dugout/protocol";

export interface ArchetypeDef {
  readonly id: Archetype;
  readonly nameKo: string;
  readonly preferredTags: readonly SynergyId[];
  readonly rerollTendency: "NONE" | "LOW" | "MID" | "HIGH" | "VERY_HIGH";
  readonly levelPace: "SLOW" | "STANDARD" | "FAST" | "FIXED";
  readonly fixedLevel?: number;
  /** Gold kept in reserve before rerolling. `null` = keep the interest line. */
  readonly reserveGold: number | null;
  readonly preferredStadium?: StadiumId;
}

/** Bot archetypes (§11.1). */
export const ARCHETYPE_DEFS: Readonly<Record<Archetype, ArchetypeDef>> = {
  LONG_BALL: { id: "LONG_BALL", nameKo: "뻥야구팀", preferredTags: ["SLUGGER", "RIGHTY_BAT", "FIREBALLER"], rerollTendency: "LOW", levelPace: "STANDARD", reserveGold: null, preferredStadium: "HITTER_FRIENDLY" },
  SMALL_BALL: { id: "SMALL_BALL", nameKo: "스몰볼팀", preferredTags: ["SPEEDSTER", "CONTACT_HITTER", "FINESSE"], rerollTendency: "MID", levelPace: "STANDARD", reserveGold: null, preferredStadium: "ARTIFICIAL_TURF" },
  FOREIGN_RELIANT: { id: "FOREIGN_RELIANT", nameKo: "용병의존팀", preferredTags: ["FOREIGN", "VETERAN"], rerollTendency: "LOW", levelPace: "STANDARD", reserveGold: null },
  PROSPECTS: { id: "PROSPECTS", nameKo: "유망주팀", preferredTags: ["HS_PROSPECT", "CONTACT_HITTER"], rerollTendency: "HIGH", levelPace: "SLOW", reserveGold: 30 },
  DEFENSE_FIRST: { id: "DEFENSE_FIRST", nameKo: "수비의팀", preferredTags: ["GOLD_GLOVE", "CATCHER", "FINESSE"], rerollTendency: "MID", levelPace: "STANDARD", reserveGold: null, preferredStadium: "PITCHER_FRIENDLY" },
  ECON: { id: "ECON", nameKo: "이자팀", preferredTags: [], rerollTendency: "NONE", levelPace: "SLOW", reserveGold: 50 },
  COPYCAT: { id: "COPYCAT", nameKo: "카피팀", preferredTags: [], rerollTendency: "MID", levelPace: "STANDARD", reserveGold: null },
  REROLL: { id: "REROLL", nameKo: "리롤팀", preferredTags: [], rerollTendency: "VERY_HIGH", levelPace: "FIXED", fixedLevel: 7, reserveGold: 10 },
};

/** Shop scoring weights (§11.2). */
export const BOT_SHOP_SCORE = { ovr: 0.5, tagFit: 20, starProgress: 15, costPenalty: 3 } as const;

/**
 * Board synergies (v3 §18.3) a card would feed, in tag-fit units (a
 * preferred tag is worth 1). Added on top of the archetype's preferred tags.
 */
export const BOT_BOARD_SYNERGY_FIT: Readonly<Record<BoardSynergyId, number>> = {
  HOMEGROWN: 0.3, UTILITY: 0.3, SIDEARM: 0.3, SWITCH_HITTER: 0.4, LEADOFF: 0.2, BACKUP_CATCHER: 0.4,
};

/** Board synergies each archetype actively chases (counted like preferred tags). */
export const BOT_BOARD_SYNERGY_PREFS: Readonly<Record<Archetype, readonly BoardSynergyId[]>> = {
  LONG_BALL: ["HOMEGROWN"], SMALL_BALL: ["LEADOFF", "SWITCH_HITTER"], FOREIGN_RELIANT: ["SWITCH_HITTER"], PROSPECTS: ["HOMEGROWN"],
  DEFENSE_FIRST: ["UTILITY", "BACKUP_CATCHER", "SIDEARM"], ECON: [], COPYCAT: [], REROLL: ["UTILITY", "SIDEARM"],
};

/** Augment preference per archetype, best first (§11.2-6). Unlisted: rarity only. */
export const BOT_AUGMENT_PREFS: Readonly<Record<Archetype, readonly AugmentId[]>> = {
  LONG_BALL: ["LONG_BALL", "CLEANUP_CARRY", "HOME_ADVANTAGE", "BIG_SPENDER"],
  SMALL_BALL: ["SMALL_BALL", "ABS", "HOME_ADVANTAGE", "MONEYBALL"],
  FOREIGN_RELIANT: ["FOREIGN_FARMING", "VETERAN_PREFERENCE", "BIG_SPENDER", "DYNASTY"],
  PROSPECTS: ["PLAYER_DEVELOPMENT", "FARM_SYSTEM", "REROLL_HOUSE"],
  DEFENSE_FIRST: ["MASTER_CATCHER", "ABS", "MASTER_MANAGER", "OPENER"],
  ECON: ["STINGY_BALL", "BIG_SPENDER", "REBUILDING", "CHEER_SQUAD", "DYNASTY"],
  COPYCAT: ["SABERMETRICS", "FRANCHISE", "TRADE_MASTER", "DYNASTY"],
  REROLL: ["REROLL_HOUSE", "DATA_BASEBALL", "FARM_SYSTEM", "MONEYBALL"],
};

/** Reward-choice preference (items and specials), best first. */
export const BOT_ITEM_PREFS: readonly ItemId[] = [
  "TRAINING_CAMP", "NUMBER_SUCCESSION", "CONTRACT_EXTENSION", "AGENT", "CHEER_SONG", "FA_CONTRACT", "SUPPLEMENT", "CALL_UP", "SCOUT_REPORT", "RELOCATION",
  "BAT", "GLOVE", "ROSIN", "SPIKES", "ICING", "SCOUTING",
];
