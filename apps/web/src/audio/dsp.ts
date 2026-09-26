/**
 * Pure sample-level helpers: seeded noise, loop wrapping and peak limiting.
 * No Web Audio here, so everything is unit-testable in Node.
 */
import type { NoiseColor } from "./kit.js";

/** mulberry32: tiny 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash, used to derive per-sound noise seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fills `out` with white, pink (Paul Kellet) or brown noise in about -1..1. */
export function fillNoise(out: Float32Array, color: NoiseColor, rand: () => number): Float32Array {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rand() * 2 - 1;
    if (color === "white") {
      out[i] = w;
    } else if (color === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
  }
  return out;
}

/**
 * Folds everything past `loopSamples` back onto the start (additive), so tails
 * of the last hits ring into the first beat and the loop is seamless.
 */
export function wrapLoop(data: Float32Array, loopSamples: number): Float32Array {
  const out = data.slice(0, loopSamples);
  for (let i = loopSamples; i < data.length; i++) {
    const j = (i - loopSamples) % loopSamples;
    out[j] = (out[j] ?? 0) + (data[i] ?? 0);
  }
  return out;
}

/** Scales `data` in place so its peak does not exceed `ceiling`. Returns the peak before scaling. */
export function limitPeak(data: Float32Array, ceiling = 0.95): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0));
  if (peak > ceiling) {
    const k = ceiling / peak;
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * k;
  }
  return peak;
}
