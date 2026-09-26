import type { Archetype, StadiumId, SynergyId } from "@dugout/protocol";

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
