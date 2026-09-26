/**
 * Deterministic player look (DESIGN §15.3). Everything derives from
 * hash(cardDef.id) plus a few card facts, so the same player has the same
 * face in the card portrait, the 3D field, the dugout and the replay.
 * Shared by the SVG portrait (lib/avatar.tsx) and the 3D figures (scene/).
 */
import type { CardDef, PackTeam } from "@dugout/protocol";
import { hashSeed } from "@dugout/engine";
import { pack } from "./pack.js";

export const SKIN_TONES = ["#f3d2b3", "#e9bf98", "#d9a577", "#b87a4b", "#8c5530", "#5e3a22"] as const;
export const HAIR_COLORS = ["#141414", "#241710", "#3d2616", "#6a4424", "#b88a3e", "#8a8a8a"] as const;
/** 8 hair styles: 0 buzz, 1 short crop, 2 side part, 3 spiky, 4 long back, 5 curly, 6 bald, 7 mohawk-lite. */
export type HairStyle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 4 beards: 0 none, 1 stubble, 2 goatee, 3 full. */
export type Beard = 0 | 1 | 2 | 3;
/** 3 builds: 0 slim, 1 regular, 2 big (§15.3 bone scale 0.92/1.0/1.1). */
export type Build = 0 | 1 | 2;
export type Uniform = "plain" | "pinstripe" | "sleeve" | "sash";

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  beard: Beard;
  build: Build;
  eyes: 0 | 1 | 2;
  brow: 0 | 1 | 2;
  mouth: 0 | 1 | 2;
  /** Jersey number 1..99 (replacement players wear 00 → 0). */
  number: number;
  primary: string;
  secondary: string;
  uniform: Uniform;
  /** Team wordmark (2–4 letters). */
  short: string;
  /** Sleeve band colour by cost (§18.2). */
  sleeve: string;
  replacement: boolean;
  /** Left-handed thrower (glove on the right hand). */
  lefty: boolean;
  /** Bat model 0..3 and glove tint 0..2. */
  bat: number;
  glove: number;
}

export const COST_COLORS: Record<number, string> = { 1: "#9aa3ad", 2: "#2fbf71", 3: "#3b82f6", 4: "#a855f7", 5: "#f5b301" };

/** Skin-tone weights by nationality (index into SKIN_TONES). */
const SKIN_BY_NATION: Record<string, readonly number[]> = {
  KR: [0, 0, 1, 1, 2], JP: [0, 1, 1, 2], AU: [0, 0, 1, 2, 3], US: [0, 1, 2, 3, 4, 5],
  DO: [2, 3, 4, 4, 5], VE: [2, 3, 3, 4, 5], CU: [2, 3, 4, 5],
};

const pick = <T,>(arr: readonly T[], n: number): T => arr[Math.abs(n) % arr.length]!;

export function teamLook(teamId: string): { primary: string; secondary: string; uniform: Uniform; short: string } {
  const t: PackTeam | undefined = pack.teams.find((x) => x.id === teamId);
  const primary = t?.color ?? "#64748b";
  return { primary, secondary: t?.secondary ?? "#f1f1f1", uniform: t?.uniform ?? "plain", short: t?.short ?? (t?.name ?? teamId).slice(0, 3).toUpperCase() };
}

export function appearanceOf(def: CardDef): Appearance {
  const [a, b, c, d] = hashSeed(`look:${def.id}`);
  const nation = def.nationality ?? (def.origin === "FOREIGN" ? "US" : "KR");
  const skinIdx = pick(SKIN_BY_NATION[nation] ?? SKIN_BY_NATION.KR!, a);
  const veteran = def.origin === "VETERAN" || def.age >= 33;
  const prospect = def.origin === "HS_PROSPECT" || def.age <= 21;
  const beardRoll = (d >>> 3) % 100;
  const beard: Beard = veteran ? (beardRoll < 70 ? (((d >>> 9) % 3) + 1) as Beard : 0) : beardRoll < (nation === "KR" ? 12 : 45) ? (((d >>> 9) % 3) + 1) as Beard : 0;
  const slugger = def.classes.includes("SLUGGER") || def.classes.includes("FIREBALLER");
  const speed = def.classes.includes("SPEEDSTER");
  const build: Build = prospect || speed ? ((c % 4 === 0 ? 1 : 0) as Build) : slugger ? ((c % 4 === 0 ? 1 : 2) as Build) : ((c % 5 === 0 ? 2 : c % 5 === 1 ? 0 : 1) as Build);
  let hairIdx = nation === "KR" || nation === "JP" ? (b % 3) : b % HAIR_COLORS.length;
  if (veteran && b % 3 === 0) hairIdx = 5; // greying veterans
  const look = teamLook(def.team);
  const style = ((b >>> 5) % 8) as HairStyle;
  return {
    skin: SKIN_TONES[skinIdx]!,
    hair: HAIR_COLORS[hairIdx]!,
    hairStyle: veteran || style !== 6 ? style : 1,
    beard,
    build,
    eyes: ((c >>> 4) % 3) as Appearance["eyes"],
    brow: ((c >>> 7) % 3) as Appearance["brow"],
    mouth: ((d >>> 13) % 3) as Appearance["mouth"],
    number: ((a >>> 8) % 99) + 1,
    ...look,
    sleeve: COST_COLORS[def.cost] ?? COST_COLORS[1]!,
    replacement: false,
    lefty: def.throws === "L",
    bat: (d >>> 17) % 4,
    glove: (a >>> 19) % 3,
  };
}

/** Grey faceless replacement ("김대체"): number 00, no team colours (§5.4, §15.3). */
export function replacementAppearance(seed: string): Appearance {
  const [a] = hashSeed(`repl:${seed}`);
  return {
    skin: "#9aa0a6", hair: "#6b7280", hairStyle: 1, beard: 0, build: 1, eyes: 0, brow: 0, mouth: 1, number: 0,
    primary: "#6b7280", secondary: "#9ca3af", uniform: "plain", short: "REP", sleeve: "#6b7280",
    replacement: true, lefty: false, bat: a % 4, glove: 0,
  };
}

/** Uniform look for opponents without card defs (PvE bosses, ghosts). */
export function genericAppearance(seed: string, primary: string, secondary = "#f1f1f1"): Appearance {
  const [a, b, c, d] = hashSeed(`gen:${seed}`);
  return {
    skin: pick(SKIN_TONES, a % 4), hair: pick(HAIR_COLORS, b % 4), hairStyle: ((b >>> 4) % 8) as HairStyle, beard: (d % 4) as Beard,
    build: (c % 3) as Build, eyes: (c % 3) as 0 | 1 | 2, brow: (d % 3) as 0 | 1 | 2, mouth: (a % 3) as 0 | 1 | 2, number: (a % 99) + 1,
    primary, secondary, uniform: "plain", short: "", sleeve: "#9aa3ad", replacement: false, lefty: b % 4 === 0, bat: a % 4, glove: b % 3,
  };
}
