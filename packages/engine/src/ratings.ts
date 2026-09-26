import type { CardDef, HitterRatings, PitcherRatings, Pos, Role } from "@dugout/protocol";
import { BOARD } from "./config/board.js";

export interface HitterDisplay {
  readonly contact: number;
  readonly power: number;
  readonly eye: number;
  readonly speed: number;
  readonly defense: number;
}

export interface PitcherDisplay {
  readonly stuff: number;
  readonly control: number;
  readonly movement: number;
  readonly stamina: number;
  readonly mental: number;
}

export type Display = HitterDisplay | PitcherDisplay;

const clamp99 = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

/** Fielding rating at a position; unknown positions count as 40 (§5.1). */
export function defAt(h: HitterRatings, pos: Pos): number {
  if (pos === "DH") return BOARD.dhOnlyDefenseForOvr;
  return h.def[pos] ?? BOARD.defaultDef;
}

/** The five visible hitter ratings, derived from internals (§5.1 mapping). */
export function hitterDisplay(h: HitterRatings, primaryPos: Pos): HitterDisplay {
  return {
    contact: clamp99(0.5 * h.kRate + 0.25 * h.contactL + 0.25 * h.contactR),
    power: clamp99(0.6 * h.hrRate + 0.4 * h.xbhRate),
    eye: clamp99(h.bbRate),
    speed: clamp99(0.6 * h.speed + 0.4 * h.sbSkill),
    defense: clamp99(0.7 * defAt(h, primaryPos) + 0.3 * h.arm),
  };
}

/** The five visible pitcher ratings (§5.1 mapping). */
export function pitcherDisplay(p: PitcherRatings): PitcherDisplay {
  return {
    stuff: clamp99(0.5 * p.kRate + 0.25 * p.contactVsL + 0.25 * p.contactVsR),
    control: clamp99(p.bbRate),
    movement: clamp99(0.5 * p.hrRate + 0.5 * p.gbRate),
    stamina: clamp99(p.stamina),
    mental: clamp99(p.mental),
  };
}

/** OVR weights (§5.2). */
export const OVR_WEIGHTS = {
  hitter: { contact: 0.3, power: 0.25, eye: 0.15, speed: 0.1, defense: 0.2 },
  SP: { stuff: 0.3, control: 0.25, movement: 0.2, stamina: 0.15, mental: 0.1 },
  RP: { stuff: 0.4, control: 0.25, movement: 0.2, stamina: 0.05, mental: 0.1 },
} as const;

export function hitterOvr(d: HitterDisplay): number {
  const w = OVR_WEIGHTS.hitter;
  return w.contact * d.contact + w.power * d.power + w.eye * d.eye + w.speed * d.speed + w.defense * d.defense;
}

export function pitcherOvr(d: PitcherDisplay, role: Exclude<Role, "H">): number {
  const w = OVR_WEIGHTS[role];
  return w.stuff * d.stuff + w.control * d.control + w.movement * d.movement + w.stamina * d.stamina + w.mental * d.mental;
}

/** Display ratings for any card. */
export function cardDisplay(card: CardDef): Display {
  if (card.role === "H") {
    if (!card.hitter) throw new Error(`hitter card ${card.id} has no hitter ratings`);
    return hitterDisplay(card.hitter, card.pos);
  }
  if (!card.pitcher) throw new Error(`pitcher card ${card.id} has no pitcher ratings`);
  return pitcherDisplay(card.pitcher);
}

/** Overall rating of a card at ★ (no star bonus). */
export function cardOvr(card: CardDef): number {
  if (card.role === "H") return hitterOvr(cardDisplay(card) as HitterDisplay);
  return pitcherOvr(cardDisplay(card) as PitcherDisplay, card.role);
}
