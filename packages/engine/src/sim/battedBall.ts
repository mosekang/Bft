import type { FieldPos, Hand } from "@dugout/protocol";
import { LEAGUE, PIVOT, PLATE, typeBabip } from "../config/league.js";
import type { StadiumDef } from "../config/stadiums.js";
import type { Rng } from "../rng.js";
import type { HitterMods, SimHitter, TeamMods } from "./types.js";

export type BattedBallType = "GROUND" | "LINE" | "FLY" | "POPUP";
export type Direction = "PULL" | "CENTER" | "OPPO";
export type HitType = "1B" | "2B" | "3B";

/** Ground share comes from the matchup; the air-ball remainder keeps the league mix. */
export function chooseBattedBall(rng: Rng, gbShare: number): BattedBallType {
  const air = 1 - gbShare;
  const airTotal = LEAGUE.battedBall.LINE + LEAGUE.battedBall.FLY + LEAGUE.battedBall.POPUP;
  const i = rng.weightedIndex([gbShare, (air * LEAGUE.battedBall.LINE) / airTotal, (air * LEAGUE.battedBall.FLY) / airTotal, (air * LEAGUE.battedBall.POPUP) / airTotal]);
  return (["GROUND", "LINE", "FLY", "POPUP"] as const)[i]!;
}

export function chooseDirection(rng: Rng, pullTend: number): Direction {
  const shift = (pullTend - PIVOT.hitter) * 0.003;
  const pull = Math.max(0.2, Math.min(0.7, PLATE.direction.PULL + shift));
  const oppo = Math.max(0.05, Math.min(0.4, PLATE.direction.OPPO - shift));
  const i = rng.weightedIndex([pull, PLATE.direction.CENTER, oppo]);
  return (["PULL", "CENTER", "OPPO"] as const)[i]!;
}

/** Left/center/right field side for a direction given the batter's side. */
function fieldSide(dir: Direction, hand: Exclude<Hand, "S">): "LEFT" | "CENTER" | "RIGHT" {
  if (dir === "CENTER") return "CENTER";
  const pullSide = hand === "R" ? "LEFT" : "RIGHT";
  const oppoSide = hand === "R" ? "RIGHT" : "LEFT";
  return dir === "PULL" ? pullSide : oppoSide;
}

/** Which fielder handles the ball (§6.3-4). */
export function fielderFor(rng: Rng, type: BattedBallType, dir: Direction, hand: Exclude<Hand, "S">): { pos: FieldPos; infield: boolean } {
  const side = fieldSide(dir, hand);
  const infielder = (): FieldPos => {
    if (side === "LEFT") return rng.chance(0.45) ? "3B" : "SS";
    if (side === "RIGHT") return rng.chance(0.45) ? "1B" : "2B";
    return rng.chance(0.5) ? "SS" : "2B";
  };
  if (type === "GROUND") return { pos: infielder(), infield: true };
  if (type === "POPUP") {
    const r = rng.next();
    if (r < 0.15) return { pos: "C", infield: true };
    return { pos: infielder(), infield: true };
  }
  if (rng.chance(PLATE.shallowInfieldShare)) return { pos: infielder(), infield: true };
  return { pos: side === "LEFT" ? "LF" : side === "RIGHT" ? "RF" : "CF", infield: false };
}

export interface HitChanceInput {
  type: BattedBallType;
  babipAdd: number;
  platoonMult: number;
  stadium: StadiumDef;
  fielder: SimHitter;
  batter: SimHitter;
  fieldingTeam: TeamMods;
}

/** §6.3-5: probability a ball in play becomes a hit. */
export function hitProbability(i: HitChanceInput): number {
  let p = typeBabip(i.type) * i.platoonMult + i.babipAdd;
  p += PLATE.defenseBabipPerPoint * (i.fielder.defEff - PLATE.defensePivot);
  if (i.type === "GROUND") {
    p += i.stadium.groundBabipAdd + i.fieldingTeam.oppGroundBabipAdd;
    p += PLATE.infieldHitPerSpeed * (i.batter.r.speed - PIVOT.hitter) + i.batter.mods.infieldHitAdd + i.stadium.infieldHitAdd;
  }
  if (i.type === "LINE") p += i.stadium.lineBabipAdd;
  return Math.max(0.01, Math.min(0.95, p));
}

/** §6.3-6: single / double / triple split. */
export function chooseHitType(rng: Rng, type: BattedBallType, batter: SimHitter, mods: HitterMods, stadium: StadiumDef, battingTeam: TeamMods): HitType {
  const table = type === "POPUP" ? PLATE.hitTypeByBattedBall.GROUND : PLATE.hitTypeByBattedBall[type];
  const xbhMult = 1 + (batter.r.xbhRate - PIVOT.hitter) * PLATE.xbhPerPoint;
  let dbl = table["2B"] * xbhMult * stadium.doubleMult * mods.doubleMult * battingTeam.doubleMult;
  let tpl = table["3B"] * xbhMult * (1 + (batter.r.speed - PIVOT.hitter) * PLATE.triplePerSpeed) * mods.tripleMult;
  dbl = Math.max(0, dbl);
  tpl = Math.max(0, tpl);
  const single = Math.max(0.02, 1 - dbl - tpl);
  const i = rng.weightedIndex([single, dbl, tpl]);
  return (["1B", "2B", "3B"] as const)[i]!;
}

/** §6.3-7 error check on grounders and fly balls. */
export function errorProbability(type: BattedBallType, fielder: SimHitter, stadium: StadiumDef, fieldingTeam: TeamMods): number {
  if (type !== "GROUND" && type !== "FLY") return 0;
  return (PLATE.error.base * (100 - fielder.defEff)) / PLATE.error.divisor * stadium.errorMult * fieldingTeam.errorMult;
}

export function doublePlayProbability(batter: SimHitter, infieldDefAvg: number): number {
  const p = PLATE.doublePlay.base * (1 - (batter.r.speed - PIVOT.hitter) * PLATE.doublePlay.speedPerPoint) * (infieldDefAvg / 55) ** PLATE.doublePlay.defExponent;
  return Math.max(0.05, Math.min(0.9, p));
}

export function sacFlyProbability(runner: SimHitter, outfielderArm: number): number {
  const p = PLATE.sacFly.base + (runner.r.speed - PIVOT.hitter) * PLATE.sacFly.runnerSpeedPerPoint - (outfielderArm - PIVOT.hitter) * PLATE.sacFly.ofArmPerPoint;
  return Math.max(0.1, Math.min(0.95, p));
}
