/**
 * Synergy and item visuals (DESIGN §18.1, §18.2) as data: which aura, ring,
 * patch or prop a figure shows for its active synergies and equipped items.
 */
import type { CardDef, CardInstance, ItemId, SynergyId } from "@dugout/protocol";

export type AuraKind = "glow" | "ring" | "spin" | "spot";
export interface Aura { color: string; kind: AuraKind; strong: boolean }

/** First tier look + whether the top tier adds the "strong" variant. Unlisted synergies show nothing. */
export const SYNERGY_FX: Partial<Record<SynergyId, { color: string; kind: AuraKind }>> = {
  SLUGGER: { color: "#ff6b1a", kind: "glow" },
  CONTACT_HITTER: { color: "#3b82f6", kind: "ring" },
  SPEEDSTER: { color: "#22c55e", kind: "spin" },
  GOLD_GLOVE: { color: "#fbbf24", kind: "ring" },
  CATCHER: { color: "#e0f2fe", kind: "glow" },
  FIREBALLER: { color: "#ef4444", kind: "glow" },
  FINESSE: { color: "#a855f7", kind: "spin" },
  INNING_EATER: { color: "#60a5fa", kind: "ring" },
  CLOSER: { color: "#fef3c7", kind: "spot" },
  CLUTCH: { color: "#facc15", kind: "glow" },
  LEFTY_BAT: { color: "#22d3ee", kind: "ring" },
  RIGHTY_BAT: { color: "#f472b6", kind: "ring" },
  HS_PROSPECT: { color: "#86efac", kind: "ring" },
  // v3 §18.3 board synergies (derived from card facts, not tags).
  UTILITY: { color: "#cbd5e1", kind: "ring" },
  SIDEARM: { color: "#38bdf8", kind: "spin" },
  SWITCH_HITTER: { color: "#e879f9", kind: "ring" },
  BACKUP_CATCHER: { color: "#bae6fd", kind: "glow" },
};

/** Sleeve patches for the quieter origins (§18.1). */
export const PATCH_COLORS: Partial<Record<SynergyId, string>> = { COLLEGE: "#1e3a8a", MILITARY_DONE: "#4d5d2a", JOURNEYMAN: "#7c4a21" };

export interface ItemLook {
  /** Bat model index (0 natural, 1 black, 2 dark, 3 gold). */
  bat?: number;
  /** Glove tint index (0 brown, 1 black, 2 red, 3 gold). */
  glove?: number;
  spikes?: string;
  band?: string;
  rosin?: boolean;
  /** Team-wide dugout extras. */
  coach?: boolean;
  suits?: boolean;
}

const has = (items: readonly ItemId[], ...ids: ItemId[]) => ids.some((i) => items.includes(i));

export function itemLook(items: readonly ItemId[]): ItemLook {
  const out: ItemLook = {};
  if (has(items, "BIG_BAT")) out.bat = 3;
  else if (has(items, "BAT", "POWER_SPEED", "TWO_WAY", "PATIENT_SLUGGER", "IRON_HITTER", "GUESS_HITTER")) out.bat = 1;
  if (has(items, "GOLDEN_GLOVE")) out.glove = 3;
  else if (has(items, "GLOVE", "OF_COMMANDER", "FIELD_GENERAL", "IRON_WALL", "DEFENSIVE_SHIFT", "TWO_WAY")) out.glove = 2;
  if (has(items, "GREAT_THIEF")) out.spikes = "#ef4444";
  else if (has(items, "SPIKES", "POWER_SPEED", "OF_COMMANDER", "LEADOFF", "INFINITE_STAMINA", "BATTERY_ANALYSIS")) out.spikes = "#4ade80";
  if (has(items, "IRON_ARM")) out.band = "#1d4ed8";
  else if (has(items, "ICING", "IRON_HITTER", "INFINITE_STAMINA", "IRON_WALL", "TRAINER", "CONDITIONING_COACH")) out.band = "#60a5fa";
  if (has(items, "ROSIN", "PATIENT_SLUGGER", "LEADOFF", "FIELD_GENERAL", "CONTROL_ARTIST", "IRON_ARM", "PITCH_SEQUENCING")) out.rosin = true;
  if (has(items, "SCOUTING", "GUESS_HITTER", "BATTERY_ANALYSIS", "DEFENSIVE_SHIFT", "PITCH_SEQUENCING", "CONDITIONING_COACH")) out.coach = true;
  if (has(items, "FRONT_OFFICE")) out.suits = true;
  return out;
}

/** Tags a card contributes (mirror of engine tagsOf for visuals; handedness from `bats`). */
export function visualTags(def: CardDef): SynergyId[] {
  const tags: SynergyId[] = [def.origin, ...def.classes];
  if (def.role === "H") {
    if (def.bats === "L" || def.bats === "S") tags.push("LEFTY_BAT");
    if (def.bats === "R" || def.bats === "S") tags.push("RIGHTY_BAT");
    if (def.bats === "S") tags.push("SWITCH_HITTER");
    if (def.pos2.length >= 2) tags.push("UTILITY");
    if (def.classes.includes("CATCHER")) tags.push("BACKUP_CATCHER");
  } else if (def.pitcher && def.pitcher.armAngle <= 30) tags.push("SIDEARM");
  return tags;
}

/** Auras for a card given the team's active synergy tiers (id → tier, 0 = inactive) and each synergy's max tier. */
export function aurasFor(def: CardDef, tiers: ReadonlyMap<SynergyId, number>, maxTier: ReadonlyMap<SynergyId, number>): Aura[] {
  const out: Aura[] = [];
  for (const tag of visualTags(def)) {
    const fx = SYNERGY_FX[tag];
    const tier = tiers.get(tag) ?? 0;
    if (!fx || tier <= 0) continue;
    out.push({ color: fx.color, kind: fx.kind, strong: tier >= (maxTier.get(tag) ?? 99) });
  }
  return out.slice(0, 3);
}

/** HS_PROSPECT growth shows as a slightly bigger figure: +1% per growth step, max +8% (§18.1). */
export const growthScale = (def: CardDef, card: CardInstance | undefined): number => (def.origin === "HS_PROSPECT" && card ? 1 + Math.min(0.08, card.growth * 0.01) : 1);
