import type { AugmentId, BoardSynergyId, CardDef, CardInstance, PlayerState } from "@dugout/protocol";
import { AUGMENT_BY_ID } from "../config/augments.js";
import { ITEM_BY_ID } from "../config/items.js";
import { cardOvr } from "../ratings.js";
import type { HitterMods, PitcherMods, TeamMods } from "../sim/types.js";
import type { RunEffects } from "./effects.js";
import type { SynergyStatus } from "./synergies.js";

/** Writers over the effect maps being built by `computeEffects`. */
export interface EffectSink {
  run: RunEffects;
  addRating(id: string, n: number): void;
  mulH(id: string, key: keyof HitterMods, v: number): void;
  addH(id: string, key: keyof HitterMods, v: number): void;
  mulP(id: string, key: keyof PitcherMods, v: number): void;
  addTeam(key: keyof TeamMods, v: number): void;
  hmods(id: string): Partial<HitterMods>;
}

export type OnBoard = readonly { card: CardInstance; def: CardDef }[];

/** A numeric param of an augment (config is the single source of numbers). */
export function augParam(id: AugmentId, key: string): number {
  return AUGMENT_BY_ID.get(id)?.params[key] ?? 0;
}

/** Effects of the six board synergies (v3 §18.3) for the counted members. */
export function applyBoardSynergy(id: BoardSynergyId, p: Readonly<Record<string, number>>, members: readonly string[], onBoard: OnBoard, sink: EffectSink): void {
  switch (id) {
    case "HOMEGROWN":
      for (const { card } of onBoard) sink.addRating(card.instanceId, p["ratingAdd"]!);
      break;
    case "UTILITY":
      for (const m of members) sink.hmods(m).offPositionPenaltyMult = Math.min(sink.hmods(m).offPositionPenaltyMult ?? 1, p["offPositionPenaltyMult"]!);
      break;
    case "SIDEARM":
      for (const m of members) sink.mulP(m, "sameHandKMult", p["sameHandKMult"]!);
      break;
    case "SWITCH_HITTER":
      for (const m of members) { sink.addH(m, "babipAdd", p["babipAdd"]!); if (p["noPlatoonPenalty"]) sink.hmods(m).noPlatoonPenalty = true; }
      break;
    case "LEADOFF":
      for (const m of members) { sink.mulH(m, "bbMult", p["bbMult"]!); sink.addH(m, "sbSuccessAdd", p["sbSuccessAdd"]!); }
      break;
    case "BACKUP_CATCHER":
      // Framing is folded into the CATCHER multiplier by the caller; the rest is run-level.
      sink.run.fatigueRecoverChance = Math.max(sink.run.fatigueRecoverChance, p["fatigueRecoverChance"]!);
      sink.run.fatigueRecover = Math.max(sink.run.fatigueRecover, p["fatigueRecover"]!);
      break;
  }
}

/** The youngest card on the board; ties go to the higher OVR, then the lower instance id. */
export function youngestOnBoard(onBoard: OnBoard): string | null {
  const sorted = [...onBoard].sort((a, b) => a.def.age - b.def.age || cardOvr(b.def) - cardOvr(a.def) || a.card.instanceId.localeCompare(b.card.instanceId));
  return sorted[0]?.card.instanceId ?? null;
}

/** Ongoing parts of the v3 augments and instant-item perks. */
export function applyExpansionAugments(player: PlayerState, onBoard: OnBoard, sink: EffectSink): void {
  const has = (a: AugmentId) => player.augments.includes(a);
  const { run } = sink;
  if (has("DATA_BASEBALL")) { run.revealInternals = true; run.firstRerollDiscount = Math.max(run.firstRerollDiscount, augParam("DATA_BASEBALL", "firstRerollDiscount")); }
  if (has("VETERAN_PREFERENCE")) for (const { card, def } of onBoard) if (def.origin === "VETERAN") sink.addRating(card.instanceId, augParam("VETERAN_PREFERENCE", "veteranAdd"));
  if (has("REBUILDING")) { run.hpGoldBonus += augParam("REBUILDING", "goldPerRound"); run.hpGoldMinHp = augParam("REBUILDING", "minHp"); }
  if (has("HOME_ADVANTAGE")) sink.addTeam("homeBabipAdd", augParam("HOME_ADVANTAGE", "homeBabipAdd"));
  if (has("CHEER_SQUAD")) { run.homeWinGold += augParam("CHEER_SQUAD", "homeWinGold"); sink.addTeam("homeRispAdd", augParam("CHEER_SQUAD", "homeRispAdd")); }
  if (has("ROOKIE_RACE")) { const y = youngestOnBoard(onBoard); if (y) sink.addRating(y, augParam("ROOKIE_RACE", "youngestAdd")); }
  if (has("TRADE_MASTER")) { run.tradeOptions = Math.max(run.tradeOptions, augParam("TRADE_MASTER", "tradeOptions")); run.tradeSwaps = Math.max(run.tradeSwaps, augParam("TRADE_MASTER", "tradeSwaps")); }

  const perks = player.perks ?? {};
  if ((perks.cheerRounds ?? 0) > 0) {
    const add = ITEM_BY_ID.get("CHEER_SONG")?.params["rispAdd"] ?? 0;
    for (const { card, def } of onBoard) if (def.role === "H") sink.addH(card.instanceId, "rispAdd", add);
  }
  if ((perks.scoutRounds ?? 0) > 0) run.revealOpponentBoard = true;
}

/** Framing strength multiplier from BACKUP_CATCHER and MASTER_CATCHER (applied to the CATCHER walk reduction). */
export function framingScale(player: PlayerState, statuses: readonly SynergyStatus[], tierParams: (s: SynergyStatus) => Readonly<Record<string, number>>): number {
  let scale = 1;
  const backup = statuses.find((s) => s.id === "BACKUP_CATCHER" && s.tier > 0);
  if (backup) scale *= tierParams(backup)["framingScale"] ?? 1;
  if (player.augments.includes("MASTER_CATCHER")) scale *= augParam("MASTER_CATCHER", "framingScale");
  return scale;
}
