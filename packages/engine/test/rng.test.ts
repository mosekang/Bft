import { describe, expect, it } from "vitest";
import { createRng, hashSeed, rngFromState } from "../src/rng.js";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng("daily-2026-09-26");
    const b = createRng("daily-2026-09-26");
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different seeds, even similar ones", () => {
    const a = createRng("seed-1");
    const b = createRng("seed-2");
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("accepts numeric seeds", () => {
    expect(createRng(42).next()).toBe(createRng("42").next());
  });

  it("produces floats in [0, 1) with a roughly uniform mean", () => {
    const rng = createRng("uniform");
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });
});

describe("int", () => {
  it("covers the whole inclusive range", () => {
    const rng = createRng("int");
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) seen.add(rng.int(3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it("rejects bad ranges", () => {
    const rng = createRng("int");
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
  });
});

describe("chance", () => {
  it("handles the edges without consuming randomness", () => {
    const rng = createRng("chance");
    const before = rng.state();
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.state()).toEqual(before);
  });

  it("matches the requested probability", () => {
    const rng = createRng("chance");
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
    expect(hits / 10_000).toBeCloseTo(0.3, 1);
  });
});

describe("pick / weightedIndex / shuffle", () => {
  it("pick returns members and throws on empty", () => {
    const rng = createRng("pick");
    const items = ["a", "b", "c"];
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("weightedIndex respects weights and never picks zero-weight entries", () => {
    const rng = createRng("weights");
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10_000; i++) counts[rng.weightedIndex([0, 75, 25, 0])]!++;
    expect(counts[0]).toBe(0);
    expect(counts[3]).toBe(0);
    expect(counts[1]! / 10_000).toBeCloseTo(0.75, 1);
  });

  it("weightedIndex rejects all-zero or negative weights", () => {
    const rng = createRng("weights");
    expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => rng.weightedIndex([1, -1])).toThrow(RangeError);
  });

  it("shuffle is a permutation and does not mutate the input", () => {
    const rng = createRng("shuffle");
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(out).not.toEqual(input); // astronomically unlikely to be identity for this seed
  });
});

describe("fork", () => {
  it("child streams are independent of how the sibling is consumed", () => {
    const root1 = createRng("run");
    const shop1 = root1.fork("shop");
    const game1 = root1.fork("game");
    shop1.next();
    shop1.next(); // extra rerolls...
    const g1 = game1.next();

    const root2 = createRng("run");
    root2.fork("shop"); // ...must not change the game stream
    const g2 = root2.fork("game").next();
    expect(g1).toBe(g2);
  });

  it("different labels give different streams", () => {
    const root = createRng("run");
    expect(root.fork("a").next()).not.toBe(root.fork("b").next());
  });
});

describe("state round-trip", () => {
  it("restores and continues the exact same sequence", () => {
    const rng = createRng("save");
    rng.next();
    rng.next();
    const snapshot = rng.state();
    const expected = [rng.next(), rng.next(), rng.int(0, 100)];
    const restored = rngFromState(snapshot);
    expect([restored.next(), restored.next(), restored.int(0, 100)]).toEqual(expected);
  });

  it("hashSeed yields four unsigned 32-bit words", () => {
    for (const w of hashSeed("anything")) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
