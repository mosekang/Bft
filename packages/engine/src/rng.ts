/**
 * Seeded, deterministic random number generator.
 *
 * Design goals:
 * - Same seed => same sequence, on every platform (no Math.random).
 * - Cheap to fork: each subsystem (shop, game, AI) gets its own labelled
 *   stream so that, e.g., an extra reroll never changes a game result.
 * - Serializable: `state()` / `fromState()` let a run be saved mid-round.
 *
 * Algorithm: sfc32 (Small Fast Counter, 32-bit) seeded via cyrb128 hash.
 * Both are public-domain constructions by Chris Doty-Humphrey / bryc.
 */

export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean;
  /** Uniformly pick one element. Throws on empty array. */
  pick<T>(items: readonly T[]): T;
  /** Pick an index proportional to `weights`. Throws if all weights are 0. */
  weightedIndex(weights: readonly number[]): number;
  /** Returns a new shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Derive an independent stream. Same parent state + label => same child. */
  fork(label: string): Rng;
  /** Snapshot of the internal state for persistence. */
  state(): RngState;
}

/** cyrb128: hash a string into four 32-bit words. */
export function hashSeed(input: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

class Sfc32 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState, private readonly label: string) {
    [this.a, this.b, this.c, this.d] = state;
    // Discard the first outputs so that similar seeds diverge quickly.
    for (let i = 0; i < 12; i++) this.next();
  }

  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`rng.int expects integers, got ${min}, ${max}`);
    }
    if (max < min) throw new RangeError(`rng.int: max (${max}) < min (${min})`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("rng.pick: empty array");
    return items[this.int(0, items.length - 1)] as T;
  }

  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (w < 0 || !Number.isFinite(w)) throw new RangeError(`rng.weightedIndex: bad weight ${w}`);
      total += w;
    }
    if (total <= 0) throw new RangeError("rng.weightedIndex: all weights are zero");
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    // Floating point edge: return the last non-zero weight.
    for (let i = weights.length - 1; i >= 0; i--) {
      if ((weights[i] as number) > 0) return i;
    }
    /* c8 ignore next */
    return 0;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  fork(label: string): Rng {
    // Mix the current state with the label so forks are stable and distinct.
    const mixed = hashSeed(`${this.label}/${label}:${this.a},${this.b},${this.c},${this.d}`);
    return new Sfc32(mixed, `${this.label}/${label}`);
  }

  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}

/** Create an RNG from a human-readable seed (e.g. "daily-2026-09-26"). */
export function createRng(seed: string | number, label = "root"): Rng {
  return new Sfc32(hashSeed(String(seed)), label);
}

/** Restore an RNG from a previously captured `state()`. */
export function rngFromState(state: RngState, label = "restored"): Rng {
  return new RestoredSfc32(state, label);
}

/** Same as Sfc32 but does not burn the warm-up outputs (state is already warm). */
class RestoredSfc32 extends Sfc32 {
  constructor(state: RngState, label: string) {
    super([0, 0, 0, 0], label);
    // Overwrite the warmed-up zero state with the captured one.
    Object.assign(this, { a: state[0], b: state[1], c: state[2], d: state[3] });
  }
}
