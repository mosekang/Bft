/**
 * HUD and shop sounds: coins, cards, stings, synergy bells, buttons.
 * Pure data built with the helpers in kit.ts.
 */
import type { SfxId } from "@dugout/protocol";
import { bell, hp, lp, midi, noise, tone, type Layer, type Recipe } from "./kit.js";

/** Brass-ish saw arpeggio with an opening lowpass. */
function brass(notes: readonly number[], step: number, lastDur: number, gain: number): Layer[] {
  return notes.flatMap((n, i) => {
    const last = i === notes.length - 1;
    const dur = last ? lastDur : step * 1.6;
    const opts = { delay: i * step, attack: 0.012, decay: last ? lastDur * 0.7 : step, filter: lp(900, 1, 3200) };
    return [tone("sawtooth", midi(n), dur, gain, opts), tone("square", midi(n - 12), dur, gain * 0.35, opts)];
  });
}

function synergyTone(step: 1 | 2 | 3): Recipe {
  const base = [midi(76), midi(81), midi(86)][step - 1]!; // E5, A5, D6
  const layers = bell(base, 1.0, 0.4);
  if (step >= 2) layers.push(...bell(base * 1.5, 0.8, 0.22, 0.07));
  if (step === 3) layers.push(...bell(base * 2, 0.9, 0.18, 0.14), noise(0.4, 0.05, { filter: hp(7000), delay: 0.14, tremolo: { rate: 18, depth: 0.6 } }));
  return { channel: "sfx", layers };
}

export const UI_RECIPES = {
  // Two bright square blips (B5 -> E6).
  coin: {
    channel: "sfx",
    layers: [
      tone("square", midi(83), 0.075, 0.2, { decay: 0.02, filter: lp(6000) }),
      tone("square", midi(88), 0.22, 0.2, { delay: 0.07, decay: 0.19, filter: lp(6000) }),
    ],
  },
  interest_tick: {
    channel: "sfx",
    layers: [tone("triangle", 2200, 0.035, 0.25), noise(0.01, 0.1, { filter: hp(6000) })],
  },
  // Five quick card flicks, 40 ms apart.
  reroll_shuffle: {
    channel: "sfx",
    layers: [
      ...Array.from({ length: 5 }, (_, i) =>
        noise(0.035, 0.32 + (i % 2) * 0.05, { filter: { type: "bandpass", freq: 3600 - i * 150, freqEnd: 2400, q: 1.5 }, delay: i * 0.04, attack: 0.001 }),
      ),
      tone("triangle", 1500, 0.04, 0.08, { freqEnd: 2200, delay: 0.2 }),
    ],
  },
  card_drop: {
    channel: "sfx",
    layers: [
      tone("sine", 150, 0.12, 0.45, { freqEnd: 70 }),
      noise(0.06, 0.3, { filter: lp(500) }),
      tone("triangle", 1800, 0.025, 0.12, { delay: 0.02 }),
    ],
  },
  // Short major arpeggio: C5 E5 G5 C6.
  fanfare: { channel: "sfx", layers: brass([72, 76, 79, 84], 0.09, 0.5, 0.18) },
  damage_drum: {
    channel: "sfx",
    layers: [
      tone("sine", 160, 0.45, 0.8, { freqEnd: 52 }),
      tone("triangle", 320, 0.12, 0.2, { freqEnd: 110 }),
      noise(0.08, 0.4, { filter: lp(800) }),
    ],
  },
  // Rising major triad landing on the octave.
  win_sting: {
    channel: "sfx",
    layers: [72, 76, 79, 84].flatMap((n, i) => {
      const dur = i === 3 ? 0.62 : 0.16;
      const delay = i * 0.12;
      return [tone("triangle", midi(n), dur, 0.35, { delay }), tone("square", midi(n), dur, 0.08, { delay, filter: lp(3000) })];
    }),
  },
  // Falling minor: G4 Eb4 C4, the last one drooping.
  lose_sting: {
    channel: "sfx",
    layers: [67, 63, 60].flatMap((n, i) => {
      const last = i === 2;
      const opts = { delay: i * 0.2, attack: 0.02, filter: lp(1100), ...(last ? { freqEnd: midi(59) } : {}) };
      return [tone("sawtooth", midi(n), last ? 0.7 : 0.22, 0.2, opts), tone("triangle", midi(n - 12), last ? 0.7 : 0.22, 0.25, opts)];
    }),
  },
  // Fast rising arpeggio plus a high sparkle.
  level_up: {
    channel: "sfx",
    layers: [
      ...[72, 76, 79, 84, 88].map((n, i) => tone("square", midi(n), 0.09, 0.16, { delay: i * 0.05, filter: lp(4000) })),
      ...bell(midi(100), 0.35, 0.12, 0.27),
      ...bell(midi(103), 0.35, 0.1, 0.32),
      noise(0.35, 0.05, { filter: hp(7000), delay: 0.25, tremolo: { rate: 20, depth: 0.6 } }),
    ],
  },
  synergy_tone_1: synergyTone(1),
  synergy_tone_2: synergyTone(2),
  synergy_tone_3: synergyTone(3),
  button: {
    channel: "sfx",
    layers: [tone("triangle", 1400, 0.025, 0.16, { freqEnd: 1100 }), noise(0.008, 0.05, { filter: hp(4000) })],
  },
  // Low buzz, twice.
  error: {
    channel: "sfx",
    layers: [0, 0.16].map((delay) => tone("square", 140, 0.12, 0.22, { delay, attack: 0.004, decay: 0.03, filter: lp(900) })),
  },
  // Metallic ting.
  equip: {
    channel: "sfx",
    layers: [
      ...bell(midi(96), 0.5, 0.22),
      tone("triangle", midi(103), 0.3, 0.08, { delay: 0.03 }),
      noise(0.012, 0.12, { filter: hp(6000) }),
    ],
  },
} satisfies Partial<Record<SfxId, Recipe>>;
