/**
 * Ball paths (DESIGN v3 §16.4). Origin home plate, +z centre field, +x right
 * field. A right-handed batter pulls toward left field (negative x).
 */
import type { BbType, HitDirection } from "@dugout/protocol";
import { round3, vec, type BallPath, type Trail, type Vec3 } from "./dsl.js";
import { JUICE } from "./juice.js";
import type { Rng } from "./rng.js";

const DEG = Math.PI / 180;
const B = JUICE.ball;

/** Spray angle in degrees from the +z axis (positive = toward right field). */
export function hitAngleDeg(direction: HitDirection, batterHand: "L" | "R", jitter = 0): number {
  const base = direction === "pull" ? -B.angles.pull : direction === "oppo" ? B.angles.oppo : B.angles.center;
  return (batterHand === "R" ? base : -base) + jitter;
}

/** Angle of a ground point from the +z axis, in degrees. */
export function sprayAngleOf(p: Vec3): number {
  return Math.atan2(p[0], p[2]) / DEG;
}

export function hrDistance(power: number): number {
  const u = (Math.min(99, Math.max(1, power)) - 1) / 98;
  return B.hr.dist[0] + (B.hr.dist[1] - B.hr.dist[0]) * u;
}

interface PathSpec {
  from: Vec3;
  to: Vec3;
  apex: number;
  bounces: number;
  damping: number;
  flightTime: number;
  trail: Trail;
}

/** Position along a path at normalised time u ∈ [0, 1]. */
export function ballPosition(p: Omit<BallPath, "points">, u: number): Vec3 {
  const arcs = p.bounces + 1;
  const weights = Array.from({ length: arcs }, (_, k) => p.damping ** k);
  const total = weights.reduce((a, b) => a + b, 0);
  const clamped = Math.min(1, Math.max(0, u));
  let start = 0;
  for (let k = 0; k < arcs; k++) {
    const w = (weights[k] ?? 0) / total;
    const end = k === arcs - 1 ? 1 : start + w;
    if (clamped <= end || k === arcs - 1) {
      const s = w === 0 ? 1 : (clamped - start) / (end - start);
      const y0 = k === 0 ? p.from[1] : 0;
      const y1 = k === arcs - 1 ? p.to[1] : 0;
      const h = p.apex * p.damping ** k;
      return [
        p.from[0] + (p.to[0] - p.from[0]) * clamped,
        y0 + (y1 - y0) * s + 4 * h * s * (1 - s),
        p.from[2] + (p.to[2] - p.from[2]) * clamped,
      ];
    }
    start = end;
  }
  return [p.to[0], p.to[1], p.to[2]];
}

function makePath(spec: PathSpec): BallPath {
  const base = {
    from: vec(spec.from),
    to: vec(spec.to),
    apex: spec.apex,
    bounces: spec.bounces,
    damping: spec.damping,
    flightTime: round3(spec.flightTime),
    trail: spec.trail,
  };
  const points: Vec3[] = [];
  for (let i = 0; i <= B.samples; i++) points.push(vec(ballPosition(base, i / B.samples)));
  return { ...base, points };
}

export type BallOutcome = "hit" | "out" | "hr";

export interface BattedBallRequest {
  bbType: BbType;
  direction: HitDirection;
  batterHand: "L" | "R";
  power: number;
  outcome: BallOutcome;
  /** For hits: deeper landing for extra-base hits. */
  hitType?: "1B" | "2B" | "3B";
  /** For outs: where the fielder catches / fields the ball. */
  fielderPos?: Vec3;
  flightTime?: number;
  rng: Rng;
}

const contactPoint = (): Vec3 => [0, B.contactHeight, 0];

/** Batted-ball flight from home plate. Outs stop at the fielder's coordinate. */
export function battedBallPath(req: BattedBallRequest): BallPath {
  const jitter = req.rng.range(-B.angles.jitter, B.angles.jitter);
  const dist01 = req.rng.next();
  if (req.outcome === "hr") {
    const angle = hitAngleDeg(req.direction, req.batterHand, jitter) * DEG;
    const d = hrDistance(req.power);
    return makePath({
      from: contactPoint(),
      to: [d * Math.sin(angle), 0, d * Math.cos(angle)],
      apex: B.hr.apex,
      bounces: 0,
      damping: B.types.FB.damping,
      flightTime: req.flightTime ?? B.flight.hr,
      trail: "glow",
    });
  }
  const t = B.types[req.bbType];
  if (req.outcome === "out" && req.fielderPos) {
    const y = req.bbType === "GB" ? B.catchHeight.ground : B.catchHeight.air;
    return makePath({
      from: contactPoint(),
      to: [req.fielderPos[0], y, req.fielderPos[2]],
      apex: t.apex,
      bounces: t.bounces,
      damping: t.damping,
      flightTime: req.flightTime ?? B.flight.hit,
      trail: "normal",
    });
  }
  const skip = req.hitType ? B.depth[req.hitType] : 0;
  const [lo, hi] = t.dist;
  const d = lo + (hi - lo) * (skip + (1 - skip) * dist01);
  const angle = hitAngleDeg(req.direction, req.batterHand, jitter) * DEG;
  return makePath({
    from: contactPoint(),
    to: [d * Math.sin(angle), 0, d * Math.cos(angle)],
    apex: t.apex,
    bounces: t.bounces,
    damping: t.damping,
    flightTime: req.flightTime ?? B.flight.hit,
    trail: "normal",
  });
}

/** A fielder's throw (flat arc, no bounce). */
export function throwPath(from: Vec3, to: Vec3, flightTime: number = B.flight.throw): BallPath {
  return makePath({
    from: [from[0], B.catchHeight.air, from[2]],
    to: [to[0], B.catchHeight.air, to[2]],
    apex: B.throwApex,
    bounces: 0,
    damping: B.types.LD.damping,
    flightTime,
    trail: "normal",
  });
}

/** A bunt: short roller toward `toward`, stopping `JUICE.ball.bunt.dist` out. */
export function buntPath(toward: Vec3, flightTime: number): BallPath {
  const len = Math.hypot(toward[0], toward[2]) || 1;
  const { dist: d, apex, height, bounces, damping } = B.bunt;
  return makePath({
    from: [0, height, 0],
    to: [(toward[0] / len) * d, 0, (toward[2] / len) * d],
    apex,
    bounces,
    damping,
    flightTime,
    trail: "normal",
  });
}
