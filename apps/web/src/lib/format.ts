import type { CardDef, CardInstance, Pos } from "@dugout/protocol";
import { STAR_BONUS } from "@dugout/engine";
import { t } from "../i18n/index.js";
import { displayOf, ovrOf } from "./pack.js";

export const COST_COLORS: Record<number, string> = {
  1: "border-slate-400 text-slate-300",
  2: "border-emerald-400 text-emerald-300",
  3: "border-sky-400 text-sky-300",
  4: "border-fuchsia-400 text-fuchsia-300",
  5: "border-amber-400 text-amber-300",
};

export const stars = (n: number): string => "★".repeat(n);

export function shortName(def: CardDef): string {
  return def.name.length > 6 ? def.name.slice(0, 6) : def.name;
}

export function cardOvrWithStar(def: CardDef, card?: CardInstance): number {
  return ovrOf(def) + (card ? STAR_BONUS[card.star] + card.growth : 0);
}

export function displayBars(def: CardDef): { key: string; label: string; value: number }[] {
  const d = displayOf(def) as unknown as Record<string, number>;
  const keys = def.role === "H" ? ["contact", "power", "eye", "speed", "defense"] : ["stuff", "control", "movement", "stamina", "mental"];
  return keys.map((k) => ({ key: k, label: t(`card.${k}`), value: d[k] ?? 0 }));
}

export const posLabel = (pos: Pos | "P1" | "P2" | "P3"): string => (pos.startsWith("P") ? pos : t(`pos.${pos}`));

export function handLabel(def: CardDef): string {
  return def.role === "H" ? t(`bats.${def.bats}`) : t(`throws.${def.throws}`);
}

export function tagLabels(def: CardDef): string[] {
  return [t(`origin.${def.origin}`), ...def.classes.map((c) => t(`class.${c}`))];
}

export function roundLabel(code: string): string {
  return `S${code.replace("-", "-")}`;
}
