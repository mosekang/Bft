/**
 * On-field sounds: bat, glove, umpire calls, crowd, cheering drum, fireworks,
 * slides and dust. Pure data built with the helpers in kit.ts.
 */
import type { SfxId } from "@dugout/protocol";
import { bp, hp, lp, noise, steady, tone, type Layer, type Recipe } from "./kit.js";

/** Wooden bat crack: bright bandpassed noise snap + a small low thump. */
function batCrack(level: 0 | 1 | 2): Recipe {
  const centre = [2200, 2900, 3500][level]!;
  const layers: Layer[] = [
    noise(0.05 + level * 0.025, 0.45 + level * 0.2, { filter: bp(centre, 1.2 - level * 0.15), attack: 0.0008 }),
    noise(0.02 + level * 0.01, 0.12 + level * 0.12, { filter: hp(5500), attack: 0.0005 }),
    tone("sine", 140 + level * 20, 0.08 + level * 0.03, 0.22 + level * 0.14, { freqEnd: 60, attack: 0.001 }),
  ];
  if (level >= 1) layers.push(tone("sine", 1250, 0.06 + level * 0.03, 0.06 * level, { freqEnd: 1150 })); // wood ring
  if (level === 2) layers.push(tone("triangle", 90, 0.18, 0.25, { freqEnd: 45, delay: 0.004 }));
  return { channel: "sfx", layers };
}

/** Leather glove pop: low-mid noise burst with a very fast decay. */
function glovePop(hard: boolean): Recipe {
  const layers: Layer[] = [
    noise(hard ? 0.07 : 0.05, hard ? 0.8 : 0.5, { filter: bp(hard ? 1200 : 900, hard ? 1.2 : 1.5), attack: 0.0008 }),
    tone("sine", hard ? 260 : 220, hard ? 0.07 : 0.05, hard ? 0.4 : 0.25, { freqEnd: hard ? 110 : 120, attack: 0.001 }),
  ];
  if (hard) layers.push(noise(0.06, 0.4, { filter: lp(400) }));
  return { channel: "sfx", layers };
}

type Contour = readonly (readonly [number, number])[];

/**
 * Stylised umpire "call": a glottal-ish saw/square voice through two
 * formant bandpasses. Not speech, just a recognisable pitch contour.
 */
function voice(pitch: Contour, dur: number, formants: readonly [number, number], gain: number, opts: { delay?: number; wave?: "sawtooth" | "square" } = {}): Layer[] {
  const common = { pitch, attack: 0.015, decay: Math.min(0.12, dur * 0.4), delay: opts.delay ?? 0 };
  const wave = opts.wave ?? "sawtooth";
  return [
    tone(wave, pitch[0]![1], dur, gain, { ...common, filter: bp(formants[0], 4) }),
    tone(wave, pitch[0]![1], dur, gain * 0.6, { ...common, filter: bp(formants[1], 5) }),
    tone(wave, pitch[0]![1], dur, gain * 0.15, { ...common, filter: lp(2400) }),
  ];
}

/** Stadium crowd bed: pink noise bands with slow, loop-aligned swells (4 s). */
const crowdAmbience: Recipe = {
  channel: "ambience",
  loop: true,
  loopLength: 4,
  layers: [
    steady(noise(4, 0.4, { color: "pink", filter: lp(1600, 0.5), tremolo: { rate: 0.25, depth: 0.3 } })),
    steady(noise(4, 0.3, { color: "pink", filter: bp(850, 0.8), tremolo: { rate: 0.5, depth: 0.4 } })),
    steady(noise(4, 0.07, { filter: bp(3000, 1.2), tremolo: { rate: 0.75, depth: 0.5 } })),
    steady(noise(4, 0.2, { color: "brown", filter: lp(300) })),
  ],
};

/** KBO-style cheering drum: boom-boom-clap pattern at 120 bpm, 2 s loop. */
function cheerDrum(): Recipe {
  const boom = (t: number): Layer[] => [
    tone("sine", 115, 0.32, 0.75, { freqEnd: 55, delay: t, attack: 0.002 }),
    noise(0.07, 0.3, { filter: lp(250), delay: t }),
  ];
  const clap = (t: number): Layer[] =>
    [0, 0.011, 0.023].map((o, i) => noise(i === 2 ? 0.09 : 0.03, 0.3, { filter: bp(1500, 1.1), delay: t + o, attack: 0.0005 }));
  const layers = [...boom(0), ...boom(0.25), ...clap(0.5), ...boom(1), ...boom(1.25), ...clap(1.5), ...clap(1.75)];
  return { channel: "ambience", loop: true, loopLength: 2, layers };
}

/** Whistle glide up, then a boom and a scatter of crackle bursts. */
function fireworks(): Recipe {
  const crackle = Array.from({ length: 16 }, (_, i) =>
    noise(0.02 + (i % 3) * 0.008, 0.22 + ((i * 7) % 5) * 0.03, { filter: hp(2800 + ((i * 5) % 4) * 600), delay: 0.86 + i * 0.045 + ((i * 13) % 7) * 0.006, attack: 0.0005 }),
  );
  return {
    channel: "sfx",
    layers: [
      tone("sine", 700, 0.72, 0.18, { freqEnd: 2400, attack: 0.05, decay: 0.08, tremolo: { rate: 14, depth: 0.25 } }),
      noise(0.72, 0.05, { filter: bp(3000, 3), attack: 0.1, decay: 0.1 }),
      noise(0.6, 0.6, { filter: lp(320), delay: 0.74 }),
      tone("sine", 95, 0.4, 0.45, { freqEnd: 38, delay: 0.74 }),
      ...crackle,
    ],
  };
}

export const FIELD_RECIPES = {
  bat_crack_weak: batCrack(0),
  bat_crack_mid: batCrack(1),
  bat_crack_strong: batCrack(2),
  glove_pop_soft: glovePop(false),
  glove_pop_hard: glovePop(true),
  // Strike: rises, holds, then drops sharply ("stee-RIKE!").
  ump_strike: {
    channel: "sfx",
    layers: [
      ...voice([[0, 170], [0.18, 290], [0.3, 305], [0.34, 150], [0.46, 130]], 0.46, [720, 1150], 0.5),
      noise(0.05, 0.12, { filter: hp(4000), delay: 0.28 }),
    ],
  },
  // Out: one short punchy bark with a tiny consonant tick at the end.
  ump_out: {
    channel: "sfx",
    layers: [
      ...voice([[0, 230], [0.05, 275], [0.2, 190]], 0.21, [620, 1000], 0.55, { wave: "square" }),
      noise(0.025, 0.12, { filter: hp(3500), delay: 0.19 }),
    ],
  },
  // Safe: sibilant onset, then two falling parts ("saa-afe").
  ump_safe: {
    channel: "sfx",
    layers: [
      noise(0.09, 0.2, { filter: hp(4500), attack: 0.02 }),
      ...voice([[0, 300], [0.17, 265]], 0.18, [820, 1300], 0.45, { delay: 0.05 }),
      ...voice([[0, 265], [0.34, 145]], 0.36, [520, 1800], 0.45, { delay: 0.25 }),
    ],
  },
  // Ball: soft, short and low.
  ump_ball: {
    channel: "sfx",
    layers: voice([[0, 200], [0.16, 170]], 0.18, [500, 900], 0.32),
  },
  crowd_ambience: crowdAmbience,
  crowd_hr_roar: {
    channel: "sfx",
    layers: [
      noise(2.5, 0.8, { color: "pink", filter: bp(900, 0.7, 1400), attack: 0.45, decay: 1.4 }),
      noise(2.5, 0.5, { color: "pink", filter: lp(600), attack: 0.6, decay: 1.5 }),
      noise(2.3, 0.18, { filter: bp(2600, 1), attack: 0.4, decay: 1.2, tremolo: { rate: 7, depth: 0.35 } }),
    ],
  },
  crowd_boo: {
    channel: "sfx",
    layers: [
      noise(1.6, 0.7, { color: "pink", filter: bp(340, 3), attack: 0.3, decay: 0.8 }),
      noise(1.6, 0.35, { color: "pink", filter: bp(680, 4), attack: 0.35, decay: 0.8 }),
      tone("sawtooth", 112, 1.5, 0.14, { freqEnd: 94, filter: lp(420), attack: 0.35, decay: 0.7, tremolo: { rate: 5, depth: 0.2 } }),
    ],
  },
  cheer_drum: cheerDrum(),
  fireworks: fireworks(),
  // Dirt slide: gritty pink-noise sweep downwards.
  slide: {
    channel: "sfx",
    layers: [
      noise(0.45, 0.5, { color: "pink", filter: bp(1200, 0.8, 480), attack: 0.03, decay: 0.3, tremolo: { rate: 30, depth: 0.35 } }),
      noise(0.2, 0.2, { filter: lp(300), delay: 0.02 }),
    ],
  },
  dust: {
    channel: "sfx",
    layers: [noise(0.25, 0.3, { color: "pink", filter: lp(1500, 0.7, 600), attack: 0.02, decay: 0.22 })],
  },
} satisfies Partial<Record<SfxId, Recipe>>;
