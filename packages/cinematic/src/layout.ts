/**
 * Fielding layout (DESIGN v3 §16.5). Defaults are `FIELD_COORDS`; against a
 * left-handed batter the outfielders shade toward right field (+x).
 */
import { BASE_POS, FIELD_COORDS, type Pos } from "@dugout/protocol";
import type { BaseIndex, Vec3 } from "./dsl.js";
import { JUICE } from "./juice.js";

export type LayoutKey = Pos | "P" | "UMP";
export type FieldLayout = Record<LayoutKey, Vec3>;

const OUTFIELD: readonly LayoutKey[] = ["LF", "CF", "RF"];

export function fieldingLayout(batterHand: "L" | "R"): FieldLayout {
  const out = {} as FieldLayout;
  for (const key of Object.keys(FIELD_COORDS) as LayoutKey[]) {
    const [x, y, z] = FIELD_COORDS[key];
    const shift = batterHand === "L" && OUTFIELD.includes(key) ? JUICE.layout.leftyOutfieldShiftX : 0;
    out[key] = [x + shift, y, z];
  }
  return out;
}

export function basePos(base: BaseIndex): Vec3 {
  const p = BASE_POS[base] ?? BASE_POS[0]!;
  return [p[0], p[1], p[2]];
}
