import type { Hand, HitterRatings, PitcherRatings, Throws } from "@dugout/protocol";
import { GAME, LEAGUE, PIVOT, PLATE, RATING_ADD, RATING_K, ratingMult } from "../config/league.js";
import type { StadiumDef } from "../config/stadiums.js";
import type { HitterMods, PitcherMods, TeamMods } from "./types.js";

export interface PaContext {
  batter: HitterRatings;
  batterHand: Hand;
  batterMods: HitterMods;
  pitcher: PitcherRatings;
  pitcherHand: Throws;
  pitcherMods: PitcherMods;
  /** Mods of the batting team (hr/k/double mults, bunts) */
  battingTeam: TeamMods;
  /** Mods of the fielding team (framing, opp babip). */
  fieldingTeam: TeamMods;
  stadium: StadiumDef;
  /** In-game fatigue steps past the pitch limit. */
  fatigueSteps: number;
  risp: boolean;
  /** Rating penalty from the previous inning's meltdown. */
  meltdownPenalty: number;
  /** 9th+ with a 1..3 lead for a closer. */
  closerActive: boolean;
  isFirstPa: boolean;
  isLeadoff: boolean;
  /** Inning beyond regulation. */
  extraInning: boolean;
  /** The batting team is the home team (HOME_ADVANTAGE, CHEER_SQUAD). */
  battingHome?: boolean;
}

export interface PaProbabilities {
  bb: number;
  k: number;
  hr: number;
  bip: number;
  /** Multiplier applied to BABIP from platoon. */
  platoonMult: number;
  /** BABIP add already combining contact ratings, mods, stadium type-independent parts. */
  babipAdd: number;
  /** Ground-ball share among balls in play. */
  gbShare: number;
}

/** Resolve a switch hitter to the side facing this pitcher. */
export function effectiveHand(bats: Hand, throws: Throws): Exclude<Hand, "S"> {
  if (bats === "S") return throws === "L" ? "R" : "L";
  return bats;
}

const clampProb = (p: number) => Math.max(LEAGUE.probMin, Math.min(LEAGUE.probMax, p));

/** Platoon multiplier for HR and BABIP (§6.3-1, §7.2). */
export function platoonMultiplier(batterHand: Exclude<Hand, "S">, pitcherHand: Throws, armAngle: number, mods: HitterMods): number {
  const scale = 1 + (PLATE.platoonArmPivot - armAngle) / PLATE.platoonArmDivisor;
  const opposite = batterHand !== pitcherHand;
  return opposite ? 1 + (PLATE.platoonBase + mods.platoonFavorAdd) * scale : 1 - (PLATE.platoonBase - mods.platoonAgainstAdd) * scale;
}

/** Suppression ratings after situational adds (closer, meltdown). */
function situationalPitcher(p: PitcherRatings, ctx: PaContext): PitcherRatings {
  let add = 0;
  if (ctx.closerActive) add += ctx.pitcherMods.lateLeadRatingAdd;
  add -= ctx.meltdownPenalty;
  if (add === 0) return p;
  const c = (v: number) => Math.max(1, Math.min(99, v + add));
  return { ...p, kRate: c(p.kRate), bbRate: c(p.bbRate), hrRate: c(p.hrRate), contactVsL: c(p.contactVsL), contactVsR: c(p.contactVsR) };
}

/** Batter ratings after clutch adds. */
function situationalBatter(b: HitterRatings, ctx: PaContext): HitterRatings {
  const add = ctx.risp ? ctx.batterMods.rispAdd + (ctx.battingHome ? ctx.battingTeam.homeRispAdd : 0) : ctx.batterMods.nonRispAdd;
  if (add === 0) return b;
  const c = (v: number) => Math.max(1, Math.min(99, v + add));
  return { ...b, kRate: c(b.kRate), contactL: c(b.contactL), contactR: c(b.contactR), hrRate: c(b.hrRate), xbhRate: c(b.xbhRate) };
}

/** §6.2 + §6.3: the four-way outcome split before the ball is in play. */
export function paProbabilities(ctx: PaContext): PaProbabilities {
  const hand = effectiveHand(ctx.batterHand, ctx.pitcherHand);
  const b = situationalBatter(ctx.batter, ctx);
  const p = situationalPitcher(ctx.pitcher, ctx);
  const rawPlatoon = platoonMultiplier(hand, ctx.pitcherHand, ctx.pitcher.armAngle, ctx.batterMods);
  const platoon = ctx.batterMods.noPlatoonPenalty ? Math.max(1, rawPlatoon) : rawPlatoon;
  const fatigue = ctx.fatigueSteps;

  let k = LEAGUE.kRate * ratingMult(b.kRate, RATING_K.hitter.kRate, PIVOT.hitter) * ratingMult(p.kRate, RATING_K.pitcher.kRate, PIVOT.pitcher);
  k *= ctx.batterMods.kMult * ctx.pitcherMods.kMult * ctx.battingTeam.kMult * ctx.stadium.kMult * 0.92 ** fatigue;
  if (hand === ctx.pitcherHand) k *= ctx.pitcherMods.sameHandKMult;

  let bb = LEAGUE.bbRate * ratingMult(b.bbRate, RATING_K.hitter.bbRate, PIVOT.hitter) * ratingMult(p.bbRate, RATING_K.pitcher.bbRate, PIVOT.pitcher);
  bb *= ctx.batterMods.bbMult * ctx.pitcherMods.bbMult * 1.15 ** fatigue;
  if (!ctx.fieldingTeam.framingDisabled) bb *= ctx.fieldingTeam.bbMult;
  if (ctx.risp) bb *= Math.exp(-(p.mental - PIVOT.pitcher) * 0.004);

  let hr = LEAGUE.hrRate * ratingMult(b.hrRate, RATING_K.hitter.hrRate, PIVOT.hitter) * ratingMult(p.hrRate, RATING_K.pitcher.hrRate, PIVOT.pitcher);
  hr *= platoon * ctx.batterMods.hrMult * ctx.pitcherMods.hrMult * ctx.battingTeam.hrMult * ctx.stadium.hrMult * 1.2 ** fatigue;
  if (ctx.isFirstPa) hr *= ctx.batterMods.firstPaHrMult;

  if (ctx.extraInning) {
    k *= GAME.extraInnings.kMult;
    bb *= GAME.extraInnings.bbMult;
    hr *= GAME.extraInnings.hrMult;
  }
  k = clampProb(k);
  bb = clampProb(bb);
  hr = clampProb(hr);
  let sum = k + bb + hr;
  if (sum > 0.95) {
    const s = 0.95 / sum;
    k *= s;
    bb *= s;
    hr *= s;
    sum = 0.95;
  }

  const contact = hand === "L" ? b.contactL : b.contactR;
  const contactVs = hand === "L" ? p.contactVsL : p.contactVsR;
  let babipAdd = (contact - PIVOT.hitter) * RATING_ADD.hitterContactBabip + (contactVs - PIVOT.pitcher) * RATING_ADD.pitcherContactBabip;
  babipAdd += ctx.batterMods.babipAdd + ctx.fieldingTeam.oppBabipAdd + 0.01 * fatigue;
  if (ctx.isLeadoff) babipAdd += ctx.batterMods.leadoffBabipAdd;
  if (ctx.battingHome) babipAdd += ctx.battingTeam.homeBabipAdd;
  if (ctx.extraInning) babipAdd += GAME.extraInnings.babipAdd;

  let gbShare = LEAGUE.battedBall.GROUND + (b.gbTend - PIVOT.hitter) * RATING_ADD.hitterGbTend + (p.gbRate - PIVOT.pitcher) * RATING_ADD.pitcherGbRate + ctx.pitcherMods.gbAdd;
  gbShare = Math.max(0.2, Math.min(0.75, gbShare));

  return { bb, k, hr, bip: 1 - sum, platoonMult: platoon, babipAdd, gbShare };
}
