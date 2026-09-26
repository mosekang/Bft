/**
 * Recipe table for every sound id in the presentation contract (§17.3).
 * The explicit `Record<SfxId, Recipe>` type makes a missing id a compile error.
 */
import type { SfxId } from "@dugout/protocol";
import type { Recipe } from "./kit.js";
import { FIELD_RECIPES } from "./recipes-field.js";
import { UI_RECIPES } from "./recipes-ui.js";

export type { Channel, FilterSpec, Layer, NoiseColor, Recipe, Tremolo, Wave } from "./kit.js";
export { loopLength, recipeDuration } from "./kit.js";

export const RECIPES: Readonly<Record<SfxId, Recipe>> = { ...FIELD_RECIPES, ...UI_RECIPES };
