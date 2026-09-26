import { describe, expect, it } from "vitest";
import { buildReel, errorsOf, validateTimeline, type Reel } from "../src/index.js";
import { syntheticGame, withTypicalHighlights } from "./helpers.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function checkReel(r: Reel, eventCount: number): void {
  for (const tl of r.timelines) expect(errorsOf(validateTimeline(tl))).toEqual([]);
  expect(r.eventIndexToTimeline).toHaveLength(eventCount);
  for (const ti of r.eventIndexToTimeline) expect(ti).toBeGreaterThanOrEqual(0);
  for (const h of r.highlights) expect(r.timelines[r.eventIndexToTimeline[h]!]?.eventIndex).toBe(h);
  expect(r.timelines.at(-1)?.type).toBe("GAME_END");
  const sum = r.timelines.reduce((a, t) => a + t.duration, 0);
  expect(r.duration).toBeCloseTo(sum, 3);
  expect(r.starts[0]).toBe(0);
}

describe("buildReel", () => {
  it("a typical 9-inning game with 7 highlights keeps all 7 and runs 20 ± 3 s at 1×", () => {
    const durations: number[] = [];
    for (const seed of SEEDS) {
      for (const withMeta of [false, true]) {
        const m = withTypicalHighlights(syntheticGame(seed, 7, withMeta));
        expect(m.highlights).toHaveLength(7);
        const r = buildReel(m);
        checkReel(r, m.events.length);
        expect(r.highlights).toHaveLength(7);
        expect(r.duration).toBeGreaterThanOrEqual(17);
        expect(r.duration).toBeLessThanOrEqual(23);
        durations.push(r.duration);
      }
    }
    console.info(`typical reel 1x durations: ${durations.join(", ")}`);
  });

  it("engine-style highlight picks (HR-heavy games included) stay within 20 ± 3 s", () => {
    const durations: number[] = [];
    for (const seed of SEEDS) {
      for (const withMeta of [false, true]) {
        const m = syntheticGame(seed, 7, withMeta);
        const r = buildReel(m);
        checkReel(r, m.events.length);
        expect(r.highlights.length).toBeGreaterThanOrEqual(4);
        expect(r.duration).toBeGreaterThanOrEqual(17);
        expect(r.duration).toBeLessThanOrEqual(23);
        durations.push(r.duration);
      }
    }
    console.info(`engine-style reel 1x durations: ${durations.join(", ")}`);
  });

  it("compact mode (best-of-3) runs ≈ 12 s with at most 4 highlights", () => {
    const durations: number[] = [];
    for (const seed of SEEDS) {
      const m = syntheticGame(seed, 7);
      const r = buildReel(m, { compact: true });
      checkReel(r, m.events.length);
      expect(r.highlights.length).toBeLessThanOrEqual(4);
      expect(r.duration).toBeGreaterThanOrEqual(9);
      expect(r.duration).toBeLessThanOrEqual(14);
      durations.push(r.duration);
    }
    console.info(`compact durations: ${durations.join(", ")}`);
  });

  it("speed 2 halves every time", () => {
    const m = syntheticGame(3);
    const r1 = buildReel(m);
    const r2 = buildReel(m, { speed: 2 });
    expect(r2.duration).toBeCloseTo(r1.duration / 2, 2);
    expect(r2.timelines).toHaveLength(r1.timelines.length);
    r1.timelines.forEach((tl, i) => {
      const fast = r2.timelines[i]!;
      expect(fast.speed).toBe(2);
      expect(fast.duration).toBeCloseTo(tl.duration / 2, 3);
      tl.steps.forEach((s, j) => expect(fast.steps[j]!.t).toBeCloseTo(s.t / 2, 3));
      const hs1 = tl.steps.filter((s) => s.kind === "hitstop");
      const hs2 = fast.steps.filter((s) => s.kind === "hitstop");
      hs1.forEach((s, j) => expect((hs2[j] as { ms: number }).ms).toBeCloseTo((s as { ms: number }).ms / 2, 3));
      expect(errorsOf(validateTimeline(fast))).toEqual([]);
    });
  });

  it("is deterministic for the same seed", () => {
    const m = syntheticGame(5);
    expect(JSON.stringify(buildReel(m, { seed: 99 }))).toBe(JSON.stringify(buildReel(m, { seed: 99 })));
    expect(JSON.stringify(buildReel(m))).toBe(JSON.stringify(buildReel(m)));
    expect(JSON.stringify(buildReel(m, { seed: 1 }))).not.toBe(JSON.stringify(buildReel(m, { seed: 2 })));
  });

  it("prefers meta.isHighlight over matchup.highlights", () => {
    const m = syntheticGame(4, 7, true);
    const flagged = m.events.flatMap((e, i) => (e.meta?.["isHighlight"] === true ? [i] : []));
    const r = buildReel({ ...m, highlights: [] });
    expect(r.highlights).toEqual(flagged);
  });

  it("summaries cover gaps and inning cards read INNING nX", () => {
    const m = syntheticGame(6);
    const r = buildReel(m);
    for (const tl of r.timelines.filter((t) => t.type === "SUMMARY")) {
      const text = tl.steps.find((s) => s.kind === "board");
      expect(text && "text" in text ? text.text : "").toMatch(/^INN \d+(-\d+)? (NO RUNS|AWAY \d+ HOME \d+)$/);
    }
    for (const tl of r.timelines.filter((t) => t.type === "INNING")) {
      const text = tl.steps.find((s) => s.kind === "board");
      expect(text && "text" in text ? text.text : "").toMatch(/^INNING \d+[TB]$/);
    }
  });

  it("handles a matchup with no highlights and no GAME_END event", () => {
    const m = syntheticGame(8);
    const r = buildReel({ ...m, highlights: [], events: m.events.slice(0, -1) });
    expect(r.timelines.at(-1)?.type).toBe("GAME_END");
    expect(r.duration).toBeGreaterThan(0);
  });
});
