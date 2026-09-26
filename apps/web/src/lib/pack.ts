import { PackSchema, type CardDef, type Pack } from "@dugout/protocol";
import { cardDisplay, cardOvr, createContext, type HitterDisplay, type PitcherDisplay } from "@dugout/engine";
import fictional from "@dugout/packs/fictional-v1.json";

/** The fictional pack shipped with the app. */
export const fictionalPack: Pack = PackSchema.parse(fictional);

/** Mutable active pack (private packs are imported on-device, §2). Switch only between runs. */
export let pack: Pack = fictionalPack;
export let ctx = createContext(pack);
export let defs = ctx.defs;

export function setActivePack(next: Pack): void {
  pack = next;
  ctx = createContext(next);
  defs = ctx.defs;
}

export function defOf(defId: string): CardDef {
  const d = defs.get(defId);
  if (!d) throw new Error(`unknown card ${defId}`);
  return d;
}

export function displayOf(def: CardDef): HitterDisplay | PitcherDisplay {
  return cardDisplay(def);
}

export const ovrOf = (def: CardDef): number => Math.round(cardOvr(def));

export const teamName = (id: string): string => pack.teams.find((t) => t.id === id)?.name ?? id;
export const teamColor = (id: string): string => pack.teams.find((t) => t.id === id)?.color ?? "#64748b";
