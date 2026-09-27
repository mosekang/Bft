/**
 * Rule-based tagging shared by the CSV converter and the roster builder
 * (§5.6): class tags from the five display ratings, origin from age and
 * nationality.
 */
import type { ClassTag, OriginTag, Pos, Role } from "@dugout/protocol";

/** Display-level view of a hitter for tagging. */
export interface HitterTagView {
  readonly contact: number;
  readonly power: number;
  readonly speed: number;
  readonly defense: number;
}

/** Display-level view of a pitcher for tagging. */
export interface PitcherTagView {
  readonly stuff: number;
  readonly movement: number;
  readonly stamina: number;
  readonly mental: number;
}

/** A class tag's rule outcome: `ok` is the §5.6 condition, `margin` ranks strength (and near misses). */
export interface ClassMargin {
  readonly tag: ClassTag;
  readonly ok: boolean;
  readonly margin: number;
}

/** §5.6 thresholds. */
export const CLASS_THRESHOLDS = {
  slugger: 70,
  contact: 70,
  speed: 70,
  goldGlove: 72,
  fireballer: 72,
  finesseMovement: 68,
  finesseStuffBelow: 65,
  inningEater: 72,
  closer: 70,
  clutchMental: 75,
} as const;

/**
 * Hitter class rules in canonical order (SLUGGER, CONTACT_HITTER, SPEEDSTER, GOLD_GLOVE).
 * CATCHER and CLUTCH are decided by position and by a roll respectively, not here.
 */
export function hitterClassMargins(d: HitterTagView, pos: Pos): ClassMargin[] {
  const t = CLASS_THRESHOLDS;
  const sluggerOk = d.power >= t.slugger && d.contact < d.power;
  return [
    { tag: "SLUGGER", ok: sluggerOk, margin: sluggerOk ? d.power - t.slugger : Math.min(d.power - t.slugger, d.power - d.contact) - 1 },
    { tag: "CONTACT_HITTER", ok: d.contact >= t.contact, margin: d.contact - t.contact },
    { tag: "SPEEDSTER", ok: d.speed >= t.speed, margin: d.speed - t.speed },
    { tag: "GOLD_GLOVE", ok: pos !== "DH" && d.defense >= t.goldGlove, margin: pos === "DH" ? -99 : d.defense - t.goldGlove },
  ];
}

/** Pitcher class rules in canonical order (FIREBALLER, FINESSE, INNING_EATER, CLOSER, CLUTCH). */
export function pitcherClassMargins(d: PitcherTagView, role: Exclude<Role, "H">): ClassMargin[] {
  const t = CLASS_THRESHOLDS;
  const finesse = Math.min(d.movement - t.finesseMovement, t.finesseStuffBelow - 1 - d.stuff);
  return [
    { tag: "FIREBALLER", ok: d.stuff >= t.fireballer, margin: d.stuff - t.fireballer },
    { tag: "FINESSE", ok: d.movement >= t.finesseMovement && d.stuff < t.finesseStuffBelow, margin: finesse },
    { tag: "INNING_EATER", ok: role === "SP" && d.stamina >= t.inningEater, margin: role === "SP" ? d.stamina - t.inningEater : -99 },
    { tag: "CLOSER", ok: role === "RP" && d.stuff >= t.closer, margin: role === "RP" ? d.stuff - t.closer : -99 },
    { tag: "CLUTCH", ok: d.mental >= t.clutchMental, margin: d.mental - t.clutchMental },
  ];
}

/** Class tags a role may carry (§5.6; CATCHER is positional). */
export const ROLE_CLASSES: Readonly<Record<Role, readonly ClassTag[]>> = {
  H: ["SLUGGER", "CONTACT_HITTER", "SPEEDSTER", "GOLD_GLOVE", "CLUTCH"],
  SP: ["FIREBALLER", "FINESSE", "INNING_EATER", "CLUTCH"],
  RP: ["FIREBALLER", "FINESSE", "CLOSER", "CLUTCH"],
};

/**
 * Origin by rule (§5.6): FOREIGN for a non-KR nationality, HS_PROSPECT at
 * age ≤ 22, VETERAN at age ≥ 32; `undefined` means "deal from the domestic pool".
 */
export function ruleOrigin(age: number, nationality: string | undefined): OriginTag | undefined {
  if (nationality !== undefined && nationality !== "KR") return "FOREIGN";
  if (age <= 22) return "HS_PROSPECT";
  if (age >= 32) return "VETERAN";
  return undefined;
}
