import { PIVOT, PLATE, RATING_PIVOT } from "../config/league.js";
import type { Rng } from "../rng.js";
import type { SimHitter } from "./types.js";
import type { HitType } from "./battedBall.js";

/** Index 0 = first base. */
export type Bases = [SimHitter | null, SimHitter | null, SimHitter | null];

export interface AdvanceResult {
  bases: Bases;
  scored: SimHitter[];
  /** Runners thrown out trying for the extra base. */
  outs: number;
}

const clamp01 = (p: number) => Math.max(0.02, Math.min(0.98, p));

function extraBaseChance(base: number, runner: SimHitter, arm: number): number {
  return clamp01(base + (runner.r.speed - PIVOT.hitter) * PLATE.advance.speedPerPoint - (arm - RATING_PIVOT) * PLATE.advance.armPerPoint + runner.mods.advanceAdd);
}

/**
 * Try for an extra base: success advances; failure either holds (75 %) or is
 * thrown out (25 %) per §6.3-8.
 */
function attempt(rng: Rng, p: number): "SAFE" | "HOLD" | "OUT" {
  if (rng.chance(p)) return "SAFE";
  return rng.chance(PLATE.advance.thrownOutOnFail) ? "OUT" : "HOLD";
}

/** §6.3-8 runner advancement on a hit. `arm` is the fielder who played the ball. */
export function advanceOnHit(rng: Rng, bases: Bases, batter: SimHitter, hit: HitType | "HR", arm: number, outsBefore: number): AdvanceResult {
  const [r1, r2, r3] = bases;
  const scored: SimHitter[] = [];
  let outs = 0;
  const next: Bases = [null, null, null];

  if (hit === "HR") {
    for (const r of [r1, r2, r3]) if (r) scored.push(r);
    scored.push(batter);
    return { bases: next, scored, outs };
  }
  if (hit === "3B") {
    for (const r of [r1, r2, r3]) if (r) scored.push(r);
    next[2] = batter;
    return { bases: next, scored, outs };
  }
  if (hit === "2B") {
    if (r3) scored.push(r3);
    if (r2) scored.push(r2);
    if (r1) {
      const twoOut = outsBefore === 2 ? 0.15 : 0;
      const res = attempt(rng, extraBaseChance(PLATE.advance.firstScoresOnDouble + twoOut, r1, arm));
      if (res === "SAFE") scored.push(r1);
      else if (res === "OUT") outs++;
      else next[2] = r1;
    }
    next[1] = batter;
    return { bases: next, scored, outs };
  }
  // single
  if (r3) scored.push(r3);
  let secondHeldAtThird = false;
  if (r2) {
    const twoOut = outsBefore === 2 ? 0.15 : 0;
    const res = attempt(rng, extraBaseChance(PLATE.advance.secondScoresOnSingle + twoOut, r2, arm));
    if (res === "SAFE") scored.push(r2);
    else if (res === "OUT") outs++;
    else {
      next[2] = r2;
      secondHeldAtThird = true;
    }
  }
  if (r1) {
    if (secondHeldAtThird) next[1] = r1;
    else {
      const res = attempt(rng, extraBaseChance(PLATE.advance.firstToThirdOnSingle, r1, arm));
      if (res === "SAFE") next[2] = r1;
      else if (res === "OUT") outs++;
      else next[1] = r1;
    }
  }
  next[0] = batter;
  return { bases: next, scored, outs };
}

/** Everyone moves up one base (walk with force, error, bunt, wild sequences). */
export function forceAdvance(bases: Bases, batter: SimHitter | null, forceOnly: boolean): { bases: Bases; scored: SimHitter[] } {
  const [r1, r2, r3] = bases;
  const scored: SimHitter[] = [];
  const next: Bases = [null, null, null];
  if (forceOnly) {
    // Walk / HBP: runners advance only when forced.
    if (r1 && r2 && r3) scored.push(r3);
    else if (r3) next[2] = r3;
    if (r1 && r2) next[2] = r2;
    else if (r2) next[1] = r2;
    if (r1) next[1] = r1;
    next[0] = batter;
    return { bases: next, scored };
  }
  if (r3) scored.push(r3);
  if (r2) next[2] = r2;
  if (r1) next[1] = r1;
  next[0] = batter;
  return { bases: next, scored };
}

export interface StealDecision {
  attempt: boolean;
  success: boolean;
}

/** §6.3-9 steal of second. */
export function stealSecond(rng: Rng, runner: SimHitter, teamStealsEnabled: boolean, catcherArm: number, pitcherHold: number): StealDecision {
  if (!(teamStealsEnabled || runner.mods.stealsEnabled)) return { attempt: false, success: false };
  if (runner.r.speed < PLATE.steal.minSpeed) return { attempt: false, success: false };
  const attemptP = Math.min(0.5, PLATE.steal.attemptBase + (runner.r.speed - PLATE.steal.minSpeed) * PLATE.steal.attemptPerSpeed);
  if (!rng.chance(attemptP)) return { attempt: false, success: false };
  const arm = runner.mods.ignoreCatcherArm ? RATING_PIVOT : catcherArm;
  const p = PLATE.steal.successBase + (runner.r.sbSkill - PIVOT.hitter) * PLATE.steal.sbSkillPerPoint - (arm - RATING_PIVOT) * PLATE.steal.catcherArmPerPoint - (pitcherHold - PIVOT.pitcher) * PLATE.steal.pitcherHoldPerPoint + runner.mods.sbSuccessAdd;
  return { attempt: true, success: rng.chance(clamp01(p)) };
}
