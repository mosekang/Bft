import type { CardInstance, ItemId, PlayerState, SynergyId } from "@dugout/protocol";
import { AUGMENT_BY_ID } from "../config/augments.js";
import { ITEM_BY_ID } from "../config/items.js";
import { SYNERGIES } from "../config/synergies.js";
import { cardOvr } from "../ratings.js";
import { emptyEffects, type TeamEffects } from "../sim/resolve.js";
import type { HitterMods, PitcherMods, TeamMods } from "../sim/types.js";
import type { RunContext } from "./context.js";
import { boardCards, countSynergies, type SynergyStatus } from "./synergies.js";

/** Non-sim consequences of the active board, consumed by settle / shop / events. */
export interface RunEffects {
  synergies: SynergyStatus[];
  /** Starter fatigue rounds for cards (INNING_EATER, MILITARY_DONE, IRON_ARM, OPENER). */
  starterFatigue: Map<string, number>;
  relieverFatigue: Map<string, number>;
  teamFatigueAdd: number;
  injuryImmune: Set<string>;
  teamInjuryChance: number | null;
  growthPerRound: Map<string, number>;
  /** Per-card growth cap (HS_PROSPECT tier); default 20. */
  growthCap: Map<string, number>;
  tradeSwaps: number;
  carouselSeconds: number;
  interestCap: number;
  rerollCost: number;
  xpCostMult: number;
  copiesPerStar: number;
  saveWinGold: number;
  revealRotation: boolean;
  revealInternals: boolean;
  revealSynergies: boolean;
}

export interface ComputedEffects {
  team: TeamEffects;
  run: RunEffects;
}

const DISPLAY_TO_INTERNAL_H: Record<string, string[]> = {
  power: ["hrRate", "xbhRate"], speed: ["speed", "sbSkill"], defense: ["def", "arm"], eye: ["bbRate"], contact: ["kRate", "contactL", "contactR"],
};
const DISPLAY_TO_INTERNAL_P: Record<string, string[]> = {
  control: ["bbRate"], stuff: ["kRate", "contactVsL", "contactVsR"], movement: ["hrRate", "gbRate"], stamina: ["stamina"], mental: ["mental"], defense: [], power: [], speed: [], eye: [],
};
const HITTER_MOD_KEYS: (keyof HitterMods)[] = ["hrMult", "kMult", "bbMult", "babipAdd", "infieldHitAdd", "doubleMult", "tripleMult", "sbSuccessAdd", "advanceAdd", "firstPaHrMult", "leadoffBabipAdd"];
const PITCHER_MOD_KEYS: (keyof PitcherMods)[] = ["kMult", "bbMult", "hrMult", "gbAdd", "pitchLimitAdd"];

/** Build simulator effects and run-level effects for a player's current board (§7, §8, §9). */
export function computeEffects(player: PlayerState, cards: Record<string, CardInstance>, ctx: RunContext, stage: number): ComputedEffects {
  const team = emptyEffects();
  const teamMods: Partial<TeamMods> = {};
  const run: RunEffects = {
    synergies: [], starterFatigue: new Map(), relieverFatigue: new Map(), teamFatigueAdd: 0, injuryImmune: new Set(), teamInjuryChance: null,
    growthPerRound: new Map(), growthCap: new Map(), tradeSwaps: 1, carouselSeconds: 6, interestCap: 5, rerollCost: 2, xpCostMult: 1, copiesPerStar: 3, saveWinGold: 0,
    revealRotation: false, revealInternals: false, revealSynergies: false,
  };
  const has = (a: string) => player.augments.includes(a as never);
  const hmods = (id: string): Partial<HitterMods> => team.hitterMods.get(id) ?? (team.hitterMods.set(id, {}), team.hitterMods.get(id)!);
  const pmods = (id: string): Partial<PitcherMods> => team.pitcherMods.get(id) ?? (team.pitcherMods.set(id, {}), team.pitcherMods.get(id)!);
  const addRating = (id: string, n: number) => team.ratingAdd.set(id, (team.ratingAdd.get(id) ?? 0) + n);
  const addInternal = (id: string, key: string, n: number) => {
    const m = team.internalAdd.get(id) ?? {};
    (m as Record<string, number>)[key] = ((m as Record<string, number>)[key] ?? 0) + n;
    team.internalAdd.set(id, m);
  };
  const mulH = (id: string, key: keyof HitterMods, v: number) => { const m = hmods(id); (m[key] as number) = ((m[key] as number | undefined) ?? 1) * v; };
  const addH = (id: string, key: keyof HitterMods, v: number) => { const m = hmods(id); (m[key] as number) = ((m[key] as number | undefined) ?? 0) + v; };
  const mulP = (id: string, key: keyof PitcherMods, v: number) => { const m = pmods(id); (m[key] as number) = ((m[key] as number | undefined) ?? 1) * v; };
  const addP = (id: string, key: keyof PitcherMods, v: number) => { const m = pmods(id); (m[key] as number) = ((m[key] as number | undefined) ?? 0) + v; };
  const mulTeam = (key: keyof TeamMods, v: number) => { (teamMods[key] as number) = ((teamMods[key] as number | undefined) ?? 1) * v; };
  const addTeam = (key: keyof TeamMods, v: number) => { (teamMods[key] as number) = ((teamMods[key] as number | undefined) ?? 0) + v; };

  const onBoard = boardCards(player, cards, ctx);
  const extraSynergy: Partial<Record<SynergyId, number>> = {};
  const tierAdd: Partial<Record<SynergyId, number>> = {};

  // --- items ------------------------------------------------------------------
  for (const { card, def } of onBoard) {
    for (const itemId of card.items) applyItem(itemId, card.instanceId, def.role === "H");
  }
  function applyItem(itemId: ItemId, id: string, isHitter: boolean) {
    const item = ITEM_BY_ID.get(itemId);
    if (!item) return;
    const map = isHitter ? DISPLAY_TO_INTERNAL_H : DISPLAY_TO_INTERNAL_P;
    for (const [k, v] of Object.entries(item.params)) {
      if (k in map) { for (const internal of map[k]!) addInternal(id, internal, v); continue; }
      if (isHitter && (HITTER_MOD_KEYS as string[]).includes(k)) { (k.endsWith("Mult") ? mulH : addH)(id, k as keyof HitterMods, v); continue; }
      if (!isHitter && (PITCHER_MOD_KEYS as string[]).includes(k)) { (k.endsWith("Mult") ? mulP : addP)(id, k as keyof PitcherMods, v); continue; }
      switch (k) {
        case "stealsEnabled": if (isHitter) hmods(id).stealsEnabled = true; break;
        case "ignoreCatcherArm": if (isHitter) hmods(id).ignoreCatcherArm = true; break;
        case "flyBabipAdd": addInternal(id, "def", 25); break;
        case "growthPerRound": run.growthPerRound.set(id, (run.growthPerRound.get(id) ?? 0) + v); break;
        case "postseasonImmune": run.injuryImmune.add(`PS:${id}`); break;
        case "injuryImmune": run.injuryImmune.add(id); break;
        case "fatigueAdd": if (!isHitter) run.starterFatigue.set(id, Math.max(0, (run.starterFatigue.get(id) ?? 2) + v)); break;
        case "starterFatigue": if (!isHitter) run.starterFatigue.set(id, Math.min(run.starterFatigue.get(id) ?? 99, v)); break;
        case "goldGloveCount": extraSynergy.GOLD_GLOVE = (extraSynergy.GOLD_GLOVE ?? 0) + v; break;
        case "teamErrorMult": mulTeam("errorMult", v); break;
        case "teamOppGroundBabipAdd": addTeam("oppGroundBabipAdd", v); break;
        case "teamFatigueAdd": run.teamFatigueAdd += v; break;
        case "teamInjuryChance": run.teamInjuryChance = v; break;
        case "tiredPenalty": teamMods.tiredPenalty = v; break;
        case "interestCapAdd": run.interestCap += v; break;
        case "rerollCost": run.rerollCost = Math.min(run.rerollCost, v); break;
        case "revealRotation": run.revealRotation = true; break;
        case "adjacentReplacementDef": break; // cosmetic-scale effect; applied as a team error reduction instead
        default: break;
      }
    }
  }

  // --- augments (pre-synergy parts) -------------------------------------------
  if (has("SMALL_BALL")) { teamMods.stealsEnabled = true; teamMods.buntEnabled = true; tierAdd.SPEEDSTER = 1; }
  if (has("REROLL_HOUSE")) run.rerollCost = Math.min(run.rerollCost, 1);
  if (has("STINGY_BALL")) run.interestCap = Math.max(run.interestCap, 7);
  if (has("BIG_SPENDER")) run.interestCap = Math.min(run.interestCap, 3);
  if (has("FARM_SYSTEM")) run.copiesPerStar = 2;
  if (has("DYNASTY")) run.xpCostMult = 1.25;
  if (has("SABERMETRICS")) { run.revealInternals = true; run.revealSynergies = true; }
  if (has("MASTER_MANAGER")) teamMods.closerLeadMax = 4;
  if (has("ABS")) teamMods.framingDisabled = true;
  if (has("LONG_BALL")) { mulTeam("hrMult", 1.25); mulTeam("kMult", 1.15); mulTeam("doubleMult", 0.9); }

  // --- synergies -----------------------------------------------------------------
  const statuses = countSynergies(player, cards, ctx, extraSynergy, tierAdd);
  run.synergies = statuses;
  const tierParams = (s: SynergyStatus) => (s.tier > 0 ? SYNERGIES[s.id].tiers[s.tier - 1] ?? {} : {});
  const holders = (id: SynergyId) => onBoard.filter(({ def }) => (def.origin as string) === id || (def.classes as string[]).includes(id) || (id === "LEFTY_BAT" && def.role === "H" && def.bats !== "R") || (id === "RIGHTY_BAT" && def.role === "H" && def.bats !== "L"));
  const prospectMult = has("PLAYER_DEVELOPMENT") ? 2 : 1;
  const collegeMult = has("PLAYER_DEVELOPMENT") ? 0 : 1;

  for (const s of statuses) {
    const p = tierParams(s);
    switch (s.id) {
      case "HS_PROSPECT":
        if (s.tier > 0) for (const { card } of holders(s.id)) { run.growthPerRound.set(card.instanceId, (run.growthPerRound.get(card.instanceId) ?? 0) + p["growthPerRound"]! * prospectMult); run.growthCap.set(card.instanceId, p["growthCap"]!); }
        break;
      case "COLLEGE":
        if (s.tier > 0) for (const { card } of holders(s.id)) addRating(card.instanceId, p["ratingAdd"]! * collegeMult);
        break;
      case "FOREIGN": {
        const farming = has("FOREIGN_FARMING");
        if (s.tier > 0) {
          for (const { card } of holders(s.id)) addRating(card.instanceId, p["ratingAdd"]! + (farming ? 5 : 0));
          mulTeam("hrMult", p["teamHrMult"]!);
        } else if (s.penalised) {
          const ov = SYNERGIES.FOREIGN.overflow!;
          for (const { card } of holders(s.id)) addRating(card.instanceId, ov["ratingAdd"]! * (farming ? 0.5 : 1));
          mulTeam("bbMult", farming ? 1 + (ov["teamBbMult"]! - 1) / 2 : ov["teamBbMult"]!);
        }
        break;
      }
      case "VETERAN":
        if (s.tier > 0) {
          for (const { card, def } of onBoard) if (def.role === "H") addH(card.instanceId, "rispAdd", p["rispContactPowerAdd"]!);
          if (stage >= 7) for (const { card } of holders(s.id)) if (!run.injuryImmune.has(`PS:${card.instanceId}`)) { addInternal(card.instanceId, "stamina", -10); addInternal(card.instanceId, "speed", -10); }
        }
        break;
      case "MILITARY_DONE":
        if (s.tier > 0) for (const { card, def } of holders(s.id)) {
          if (def.role === "H") run.injuryImmune.add(card.instanceId);
          else run.starterFatigue.set(card.instanceId, Math.min(run.starterFatigue.get(card.instanceId) ?? 99, 1));
        }
        break;
      case "JOURNEYMAN":
        if (s.tier > 0) { run.tradeSwaps = 2; run.carouselSeconds = 9; }
        break;
      case "LEFTY_BAT":
      case "RIGHTY_BAT":
        if (s.tier > 0) for (const { card } of holders(s.id)) { addH(card.instanceId, "platoonFavorAdd", p["platoonFavorAdd"]!); addH(card.instanceId, "platoonAgainstAdd", p["platoonAgainstAdd"]!); }
        break;
      case "SLUGGER":
        if (s.tier > 0) for (const { card } of holders(s.id)) { mulH(card.instanceId, "hrMult", p["hrMult"]!); mulH(card.instanceId, "kMult", p["kMult"]!); }
        break;
      case "CONTACT_HITTER":
        if (s.tier > 0) for (const { card } of holders(s.id)) { addH(card.instanceId, "babipAdd", p["babipAdd"]!); mulH(card.instanceId, "kMult", p["kMult"]!); }
        break;
      case "SPEEDSTER":
        if (s.tier > 0) {
          teamMods.stealsEnabled = true;
          for (const { card } of holders(s.id)) { addH(card.instanceId, "sbSuccessAdd", p["sbSuccessAdd"]!); addH(card.instanceId, "advanceAdd", p["advanceAdd"]!); addH(card.instanceId, "infieldHitAdd", p["infieldHitAdd"]!); }
        }
        break;
      case "GOLD_GLOVE":
        if (s.tier > 0) { addTeam("oppBabipAdd", p["oppBabipAdd"]!); mulTeam("errorMult", p["errorMult"]!); }
        break;
      case "CATCHER":
        if (s.tier > 0 && !has("ABS")) mulTeam("bbMult", p["teamBbMult"]!);
        break;
      case "FIREBALLER":
        if (s.tier > 0) for (const { card } of holders(s.id)) { mulP(card.instanceId, "kMult", p["kMult"]!); mulP(card.instanceId, "bbMult", p["bbMult"]!); }
        break;
      case "FINESSE":
        if (s.tier > 0) for (const { card } of holders(s.id)) { addP(card.instanceId, "gbAdd", p["gbAdd"]!); mulP(card.instanceId, "hrMult", p["hrMult"]!); }
        break;
      case "INNING_EATER":
        if (s.tier > 0) for (const { card, def } of holders(s.id)) if (def.role === "SP") { addP(card.instanceId, "pitchLimitAdd", p["pitchLimitAdd"]!); run.starterFatigue.set(card.instanceId, Math.min(run.starterFatigue.get(card.instanceId) ?? 99, p["starterFatigue"]!)); }
        break;
      case "CLOSER":
        if (s.tier > 0) { for (const { card, def } of holders(s.id)) if (def.role === "RP") { pmods(card.instanceId).isCloser = true; addP(card.instanceId, "lateLeadRatingAdd", p["lateLeadRatingAdd"]!); } run.saveWinGold = p["saveWinGold"]!; }
        break;
      case "CLUTCH":
        if (s.tier > 0) for (const { card, def } of holders(s.id)) if (def.role === "H") { addH(card.instanceId, "rispAdd", p["rispAdd"]!); addH(card.instanceId, "nonRispAdd", p["nonRispAdd"]!); }
        break;
    }
  }

  // --- augments (card-level) --------------------------------------------------------
  if (has("MONEYBALL")) for (const { card, def } of onBoard) if (def.role === "H" && def.cost === 1) { addInternal(card.instanceId, "bbRate", 15); mulH(card.instanceId, "bbMult", 1.2); }
  if (has("CLEANUP_CARRY")) {
    const hitters = onBoard.filter(({ def }) => def.role === "H");
    const top = hitters.reduce<typeof hitters[number] | null>((best, x) => (!best || cardOvr(x.def) > cardOvr(best.def) ? x : best), null);
    for (const h of hitters) addRating(h.card.instanceId, h === top ? 20 : -4);
  }
  if (has("OPENER")) for (const { card, def } of onBoard) if (def.role === "RP") { pmods(card.instanceId).openerOuts = 6; run.relieverFatigue.set(card.instanceId, 0); }
  if (has("ABS")) for (const { card, def } of onBoard) if (def.role !== "H" && def.pitcher && def.pitcher.bbRate >= 65) mulP(card.instanceId, "bbMult", 0.85);

  team.team = teamMods;
  return { team, run };
}

/** Augment definition lookup with a safe fallback. */
export function augmentName(id: string): string {
  return AUGMENT_BY_ID.get(id as never)?.nameKo ?? id;
}
