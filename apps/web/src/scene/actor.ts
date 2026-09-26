import type { Appearance } from "../lib/appearance.js";
import type { AnyClip } from "./clips.js";
import type { Aura, ItemLook } from "./synergyFx.js";

/** One figure on the field, dugout or stage. Mutable: stages update actors in place each frame. */
export interface Actor {
  id: string;
  ap: Appearance;
  /** Feet position in metres. */
  pos: [number, number, number];
  /** Facing (radians around +y; 0 faces +z / centre field). */
  yaw: number;
  scale: number;
  clip: AnyClip;
  /** Scene time (s) the clip started. Changing clip or clipStart crossfades 0.15 s. */
  clipStart: number;
  /** Left-handed mirror (batters hitting left, lefty throwers). */
  mirror: boolean;
  headgear: "cap" | "helmet" | "mask" | "none";
  prop: "bat" | "glove" | "none";
  role: "H" | "P" | "U" | "X";
  away?: boolean;
  star?: 1 | 2 | 3;
  hidden?: boolean;
  /** Synergy auras (§18.1). */
  auras?: Aura[];
  /** Item props (§18.2). */
  look?: ItemLook;
  /** Sleeve patch colour for quiet origins. */
  patch?: string;
}

export const yawTo = (from: readonly [number, number, number], to: readonly [number, number, number]): number => Math.atan2(to[0] - from[0], to[2] - from[2]);
