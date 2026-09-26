/**
 * Recipe data model and small builders for procedurally synthesised sounds.
 * Every sound in the game is made from these layers (oscillators and
 * filtered noise with envelopes); there is no third-party audio.
 */

export type Wave = "sine" | "square" | "sawtooth" | "triangle";
export type NoiseColor = "white" | "pink" | "brown";
export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch" | "peaking";
export type Channel = "sfx" | "ambience";

export interface FilterSpec {
  type: FilterType;
  /** Cutoff / centre frequency in Hz at the layer start. */
  freq: number;
  /** Exponential glide target reached at the layer end. */
  freqEnd?: number;
  q: number;
}

/** Amplitude LFO. For loop layers, `rate × loopLength` must be an integer. */
export interface Tremolo {
  rate: number;
  /** 0..1 fraction of the gain that is modulated. */
  depth: number;
}

export interface Layer {
  kind: "noise" | "osc";
  /** Oscillator wave (osc only, default sine). */
  wave?: Wave;
  /** Noise colour (noise only, default white). */
  color?: NoiseColor;
  /** Oscillator start frequency in Hz (ignored by noise layers). */
  freq: number;
  /** Exponential glide target in Hz, reached at the layer end. */
  freqEnd?: number;
  /** Pitch breakpoints `[seconds from layer start, Hz]`; overrides freq/freqEnd. */
  pitch?: readonly (readonly [number, number])[];
  /** Layer length in seconds (including attack and decay). */
  dur: number;
  /** Linear rise time in seconds (0 = instant). */
  attack: number;
  /** Exponential fall time in seconds at the end of the layer (0 = hard stop). */
  decay: number;
  /** Peak gain 0..1. */
  gain: number;
  filter?: FilterSpec;
  /** Start offset in seconds from the recipe start. */
  delay?: number;
  tremolo?: Tremolo;
}

export interface Recipe {
  channel: Channel;
  loop?: boolean;
  /** Loop period in seconds (loops only). Layer tails past it wrap to the start. */
  loopLength?: number;
  layers: readonly Layer[];
}

type Opts = Partial<Omit<Layer, "kind">>;

/** Filtered-noise layer with a fast attack and an exponential tail. */
export function noise(dur: number, gain: number, opts: Opts = {}): Layer {
  const attack = opts.attack ?? 0.002;
  return { kind: "noise", freq: 0, dur, gain, attack, decay: Math.max(0, dur - attack), ...opts };
}

/** Oscillator layer with a fast attack and an exponential tail. */
export function tone(wave: Wave, freq: number, dur: number, gain: number, opts: Opts = {}): Layer {
  const attack = opts.attack ?? 0.002;
  return { kind: "osc", wave, freq, dur, gain, attack, decay: Math.max(0, dur - attack), ...opts };
}

/** Steady layer for loops: no attack/decay so both loop ends match. */
export function steady(layer: Layer): Layer {
  return { ...layer, attack: 0, decay: 0 };
}

export const bp = (freq: number, q = 1, freqEnd?: number): FilterSpec =>
  freqEnd === undefined ? { type: "bandpass", freq, q } : { type: "bandpass", freq, q, freqEnd };
export const lp = (freq: number, q = 0.7, freqEnd?: number): FilterSpec =>
  freqEnd === undefined ? { type: "lowpass", freq, q } : { type: "lowpass", freq, q, freqEnd };
export const hp = (freq: number, q = 0.7): FilterSpec => ({ type: "highpass", freq, q });

/** MIDI note number to Hz (A4 = 69 = 440 Hz). */
export const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** Bell: fundamental plus inharmonic 2.76x and 5.4x partials. */
export function bell(freq: number, dur: number, gain: number, delay = 0): Layer[] {
  return [
    tone("sine", freq, dur, gain, { delay, attack: 0.003 }),
    tone("sine", freq * 2.76, dur * 0.45, gain * 0.35, { delay, attack: 0.002 }),
    tone("sine", freq * 5.4, dur * 0.2, gain * 0.12, { delay, attack: 0.001 }),
  ];
}

/** End time of a layer in seconds. */
export const layerEnd = (l: Layer): number => (l.delay ?? 0) + l.dur;

/** Full rendered length of a recipe in seconds (longest layer end). */
export function recipeDuration(r: Recipe): number {
  return r.layers.reduce((m, l) => Math.max(m, layerEnd(l)), 0);
}

/** Loop period for loop recipes, otherwise the full duration. */
export function loopLength(r: Recipe): number {
  return r.loop ? (r.loopLength ?? recipeDuration(r)) : recipeDuration(r);
}
