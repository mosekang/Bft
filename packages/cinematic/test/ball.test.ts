import { FIELD_COORDS, HIT_DIRECTIONS } from "@dugout/protocol";
import { describe, expect, it } from "vitest";
import { SHOT_DEFS, battedBallPath, createRng, fieldingLayout, hitAngleDeg, hrDistance, sprayAngleOf, throwPath } from "../src/index.js";
import { SHOTS } from "@dugout/protocol";

const maxY = (pts: readonly (readonly number[])[]): number => Math.max(...pts.map((p) => p[1] ?? 0));
const dist = (p: readonly number[]): number => Math.hypot(p[0] ?? 0, p[2] ?? 0);

describe("hit angles", () => {
  it("right-handed batters pull to left field (negative x), lefties to right field", () => {
    expect(hitAngleDeg("pull", "R")).toBe(-28);
    expect(hitAngleDeg("oppo", "R")).toBe(22);
    expect(hitAngleDeg("pull", "L")).toBe(28);
    expect(hitAngleDeg("oppo", "L")).toBe(-22);
    expect(hitAngleDeg("center", "R")).toBe(0);
  });

  it("hit landing spots follow direction ± 8° jitter", () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const direction of HIT_DIRECTIONS) {
        for (const batterHand of ["L", "R"] as const) {
          const p = battedBallPath({ bbType: "LD", direction, batterHand, power: 60, outcome: "hit", rng: createRng(seed) });
          const a = sprayAngleOf(p.to);
          expect(Math.abs(a - hitAngleDeg(direction, batterHand))).toBeLessThanOrEqual(8 + 0.05);
        }
      }
    }
    const rPull = battedBallPath({ bbType: "FB", direction: "pull", batterHand: "R", power: 60, outcome: "hit", rng: createRng(1) });
    const lPull = battedBallPath({ bbType: "FB", direction: "pull", batterHand: "L", power: 60, outcome: "hit", rng: createRng(1) });
    expect(rPull.to[0]).toBeLessThan(0);
    expect(lPull.to[0]).toBeGreaterThan(0);
  });
});

describe("ball paths", () => {
  it("start at home plate and respect apex / distance per batted-ball type", () => {
    const cases = [
      { bbType: "LD", apex: 3, lo: 60, hi: 90 },
      { bbType: "FB", apex: 25, lo: 70, hi: 100 },
      { bbType: "PU", apex: 30, lo: 15, hi: 40 },
    ] as const;
    for (const c of cases) {
      for (let seed = 0; seed < 20; seed++) {
        const p = battedBallPath({ bbType: c.bbType, direction: "center", batterHand: "R", power: 60, outcome: "hit", rng: createRng(seed) });
        expect(p.from[0]).toBe(0);
        expect(p.from[2]).toBe(0);
        expect(p.apex).toBe(c.apex);
        expect(p.bounces).toBe(0);
        expect(dist(p.to)).toBeGreaterThanOrEqual(c.lo - 0.01);
        expect(dist(p.to)).toBeLessThanOrEqual(c.hi + 0.01);
        expect(maxY(p.points)).toBeGreaterThanOrEqual(c.apex);
        expect(maxY(p.points)).toBeLessThanOrEqual(c.apex + 1.1);
        expect(p.flightTime).toBe(1.2);
        expect(p.points[0]).toEqual(p.from);
        expect(p.points.at(-1)).toEqual(p.to);
      }
    }
  });

  it("ground balls hug the ground with 2 bounces damped by 0.5", () => {
    const p = battedBallPath({ bbType: "GB", direction: "pull", batterHand: "R", power: 60, outcome: "hit", rng: createRng(3) });
    expect(p.apex).toBe(0.4);
    expect(p.bounces).toBe(2);
    expect(p.damping).toBe(0.5);
    expect(maxY(p.points)).toBeLessThanOrEqual(1.1);
  });

  it("home runs fly 110–135 m by power with a 30 m apex, glow trail and 3 s flight", () => {
    const weak = battedBallPath({ bbType: "FB", direction: "center", batterHand: "R", power: 1, outcome: "hr", rng: createRng(1) });
    const strong = battedBallPath({ bbType: "FB", direction: "center", batterHand: "R", power: 99, outcome: "hr", rng: createRng(1) });
    expect(dist(weak.to)).toBeCloseTo(110, 1);
    expect(dist(strong.to)).toBeCloseTo(135, 1);
    expect(hrDistance(50)).toBeGreaterThan(110);
    expect(strong.apex).toBe(30);
    expect(strong.trail).toBe("glow");
    expect(strong.flightTime).toBe(3);
    expect(maxY(strong.points)).toBeGreaterThanOrEqual(30);
  });

  it("outs stop at the fielder's coordinate", () => {
    const layout = fieldingLayout("R");
    const p = battedBallPath({ bbType: "FB", direction: "pull", batterHand: "R", power: 60, outcome: "out", fielderPos: layout.LF, rng: createRng(2) });
    expect(p.to[0]).toBe(FIELD_COORDS.LF[0]);
    expect(p.to[2]).toBe(FIELD_COORDS.LF[2]);
    const t = throwPath(layout.SS, [0, 0, 38.8]);
    expect(t.bounces).toBe(0);
    expect(t.points.at(-1)?.[2]).toBeCloseTo(38.8, 1);
  });
});

describe("fielding layout", () => {
  it("defaults to FIELD_COORDS and shifts outfielders 5 m toward right field vs lefties", () => {
    const r = fieldingLayout("R");
    const l = fieldingLayout("L");
    expect(r.CF).toEqual(FIELD_COORDS.CF);
    for (const pos of ["LF", "CF", "RF"] as const) expect(l[pos][0]).toBe(FIELD_COORDS[pos][0] + 5);
    expect(l.SS).toEqual(FIELD_COORDS.SS);
  });
});

describe("SHOT_DEFS", () => {
  it("defines every shot", () => {
    expect(Object.keys(SHOT_DEFS).sort()).toEqual([...SHOTS].sort());
    expect(SHOT_DEFS.CAM_PITCH).toMatchObject({ mode: "fixed", position: [0, 1.6, -4] });
    expect(SHOT_DEFS.CAM_BATTER).toMatchObject({ mode: "fixed", position: [-5, 1.8, 2] });
    expect(SHOT_DEFS.CAM_BALL).toMatchObject({ mode: "follow", subject: "ball", offset: [0, 1, 3] });
  });
});
