/**
 * Procedural animation clips (DESIGN §15.4). Every clip name in the shared
 * CLIPS list is implemented here as keyframed joint rotations, so no motion-
 * capture download is needed; the clip table is validated by a unit test.
 *
 * Axes (character faces +z, left side is +x):
 * - arms/legs hang along -y; rotation.x < 0 swings a limb forward/up,
 *   elbow/knee: el.x < 0 bends the forearm forward, kn.x > 0 bends the shin back.
 * - spine.x > 0 leans forward, spine.y twists, head.x > 0 looks down.
 * - sh*.z: + moves the left arm outward (+x); the right arm outward is −z.
 */
import type { ClipName } from "@dugout/protocol";

export const JOINTS = ["hips", "spine", "head", "shL", "elL", "shR", "elR", "hipL", "knL", "hipR", "knR", "bat"] as const;
export type Joint = (typeof JOINTS)[number];
export type Rot = readonly [number, number, number];
export interface Pose {
  /** Vertical hips offset (m, before figure scale). */
  lift: number;
  /** Forward root offset (m), used by slides/dives. */
  push: number;
  rot: Record<Joint, Rot>;
}
type Key = Partial<Record<Joint, Rot>> & { lift?: number; push?: number };
export interface Clip {
  dur: number;
  loop: boolean;
  keys: [number, Key][];
}

const Z: Rot = [0, 0, 0];
/** Standing rest: arms slightly out, bat on the shoulder. */
export const REST: Pose = {
  lift: 0,
  push: 0,
  rot: { hips: Z, spine: Z, head: Z, shL: [0, 0, 0.12], elL: [-0.15, 0, 0], shR: [0, 0, -0.12], elR: [-0.15, 0, 0], hipL: Z, knL: Z, hipR: Z, knR: Z, bat: [0.4, 0, 0] },
};

const c = (dur: number, loop: boolean, keys: [number, Key][]): Clip => ({ dur, loop, keys });

// Shared poses -------------------------------------------------------------
const ready: Key = { lift: -0.06, spine: [0.35, 0, 0], shL: [-0.5, 0, 0.25], elL: [-0.6, 0, 0], shR: [-0.5, 0, -0.25], elR: [-0.6, 0, 0], hipL: [-0.25, 0, 0.1], knL: [0.45, 0, 0], hipR: [-0.25, 0, -0.1], knR: [0.45, 0, 0] };
const stance: Key = { lift: -0.05, spine: [0.15, -0.35, 0], head: [0, 1.0, 0], shL: [-1.2, 0.5, -0.4], elL: [-1.3, 0, 0], shR: [-1.6, -0.6, 0.2], elR: [-1.7, 0, 0], hipL: [-0.15, 0, 0.18], knL: [0.3, 0, 0], hipR: [-0.1, 0, -0.18], knR: [0.3, 0, 0], bat: [-0.9, 0.9, 0.3] };
const squat: Key = { lift: -0.52, spine: [0.3, 0, 0], shL: [-1.0, 0, 0.3], elL: [-0.8, 0, 0], shR: [-0.5, 0, -0.35], elR: [-1.2, 0, 0], hipL: [-1.5, 0, 0.35], knL: [2.3, 0, 0], hipR: [-1.5, 0, -0.35], knR: [2.3, 0, 0] };
const sit: Key = { lift: -0.46, spine: [0.1, 0, 0], shL: [-0.5, 0, 0.1], elL: [-0.9, 0, 0], shR: [-0.5, 0, -0.1], elR: [-0.9, 0, 0], hipL: [-1.55, 0, 0.08], knL: [1.55, 0, 0], hipR: [-1.55, 0, -0.08], knR: [1.55, 0, 0] };
const runA: Key = { lift: 0.02, spine: [0.3, 0, 0], shL: [0.8, 0, 0.1], elL: [-1.4, 0, 0], shR: [-0.9, 0, -0.1], elR: [-1.5, 0, 0], hipL: [-0.95, 0, 0], knL: [0.35, 0, 0], hipR: [0.55, 0, 0], knR: [1.5, 0, 0] };
const runB: Key = { lift: 0.02, spine: [0.3, 0, 0], shL: [-0.9, 0, 0.1], elL: [-1.5, 0, 0], shR: [0.8, 0, -0.1], elR: [-1.4, 0, 0], hipL: [0.55, 0, 0], knL: [1.5, 0, 0], hipR: [-0.95, 0, 0], knR: [0.35, 0, 0] };
const mid: Key = { lift: -0.04, spine: [0.3, 0, 0], shL: [0, 0, 0.1], elL: [-1.4, 0, 0], shR: [0, 0, -0.1], elR: [-1.4, 0, 0], hipL: [-0.2, 0, 0], knL: [0.9, 0, 0], hipR: [-0.2, 0, 0], knR: [0.9, 0, 0] };

/** Extra internal poses (not part of the shared clip contract). */
export type InternalClip = "sit" | "cheer_stage";
export type AnyClip = ClipName | InternalClip;

export const CLIP_LIBRARY: Record<AnyClip, Clip> = {
  idle_field: c(2.4, true, [[0, ready], [1.2, { ...ready, lift: -0.08, spine: [0.4, 0, 0] }], [2.4, ready]]),
  idle_batter: c(1.6, true, [[0, stance], [0.8, { ...stance, bat: [-0.75, 1.05, 0.35], spine: [0.15, -0.42, 0] }], [1.6, stance]]),
  idle_pitcher: c(2.6, true, [
    [0, { shL: [-0.7, 0.4, -0.2], elL: [-1.5, 0, 0], shR: [-0.7, -0.4, 0.2], elR: [-1.5, 0, 0], hipL: [0, 0, 0.08], hipR: [0, 0, -0.08] }],
    [1.3, { lift: -0.02, head: [0.12, 0, 0], shL: [-0.75, 0.4, -0.2], elL: [-1.55, 0, 0], shR: [-0.75, -0.4, 0.2], elR: [-1.55, 0, 0], hipL: [0, 0, 0.08], hipR: [0, 0, -0.08] }],
    [2.6, { shL: [-0.7, 0.4, -0.2], elL: [-1.5, 0, 0], shR: [-0.7, -0.4, 0.2], elR: [-1.5, 0, 0], hipL: [0, 0, 0.08], hipR: [0, 0, -0.08] }],
  ]),
  idle_catcher: c(2.0, true, [[0, squat], [1.0, { ...squat, lift: -0.5, shL: [-1.1, 0, 0.3] }], [2.0, squat]]),
  pitch_windup: c(1.0, false, [
    [0, { shL: [-0.7, 0.4, -0.2], elL: [-1.5, 0, 0], shR: [-0.7, -0.4, 0.2], elR: [-1.5, 0, 0] }],
    [0.25, { spine: [-0.1, 0, 0], shL: [-2.7, 0, 0], elL: [-0.6, 0, 0], shR: [-2.7, 0, 0], elR: [-0.6, 0, 0] }],
    [0.5, { lift: 0.04, spine: [-0.15, 0.6, 0], shL: [-1.0, 0, 0.6], elL: [-1.2, 0, 0], shR: [0.2, 0, -1.3], elR: [-1.2, 0, 0], hipL: [-1.5, 0, 0], knL: [1.7, 0, 0] }],
    [0.7, { lift: -0.12, spine: [0.3, 0.3, 0], shL: [-0.4, 0, 0.9], elL: [-0.8, 0, 0], shR: [0.6, 0, -1.6], elR: [-1.6, 0, 0], hipL: [-1.0, 0, 0.2], knL: [0.6, 0, 0], hipR: [0.3, 0, 0], knR: [0.5, 0, 0] }],
    [0.82, { lift: -0.18, spine: [0.8, -0.5, 0], shL: [0.4, 0, 0.5], elL: [-1.2, 0, 0], shR: [-2.6, 0, -0.3], elR: [-0.2, 0, 0], hipL: [-0.9, 0, 0.2], knL: [0.5, 0, 0], hipR: [0.5, 0, 0], knR: [0.6, 0, 0] }],
    [1.0, { lift: -0.14, spine: [1.0, -0.7, 0], shL: [0.5, 0, 0.4], elL: [-1.0, 0, 0], shR: [-0.6, 0, 0.3], elR: [-0.3, 0, 0], hipL: [-0.6, 0, 0.2], knL: [0.5, 0, 0], hipR: [0.2, 0, 0], knR: [1.2, 0, 0] }],
  ]),
  pitch_stretch: c(0.8, false, [
    [0, { shL: [-0.9, 0.4, -0.3], elL: [-1.6, 0, 0], shR: [-0.9, -0.4, 0.3], elR: [-1.6, 0, 0] }],
    [0.3, { spine: [0, 0.4, 0], shL: [-0.9, 0, 0.5], elL: [-1.2, 0, 0], shR: [0.4, 0, -1.3], elR: [-1.4, 0, 0], hipL: [-0.8, 0, 0], knL: [1.0, 0, 0] }],
    [0.6, { lift: -0.16, spine: [0.8, -0.5, 0], shL: [0.4, 0, 0.5], elL: [-1.2, 0, 0], shR: [-2.6, 0, -0.3], elR: [-0.2, 0, 0], hipL: [-0.9, 0, 0.2], knL: [0.5, 0, 0], hipR: [0.5, 0, 0], knR: [0.6, 0, 0] }],
    [0.8, { lift: -0.12, spine: [0.9, -0.6, 0], shL: [0.5, 0, 0.4], elL: [-1.0, 0, 0], shR: [-0.6, 0, 0.3], elR: [-0.3, 0, 0], hipL: [-0.6, 0, 0.2], knL: [0.5, 0, 0], hipR: [0.2, 0, 0], knR: [1.2, 0, 0] }],
  ]),
  swing_contact: c(0.7, false, [
    [0, stance],
    [0.22, { ...stance, spine: [0.15, -0.55, 0], hipL: [-0.5, 0, 0.3], knL: [0.5, 0, 0], bat: [-1.0, 1.3, 0.4] }],
    [0.36, { lift: -0.1, spine: [0.25, 0.9, 0], head: [0.1, 0.4, 0], shL: [-1.4, -0.3, 0.4], elL: [-0.3, 0, 0], shR: [-1.3, 0.2, -0.2], elR: [-0.6, 0, 0], hipL: [-0.4, 0, 0.3], knL: [0.2, 0, 0], hipR: [0.2, 0, -0.1], knR: [0.8, 0, 0], bat: [-1.6, -0.2, 0] }],
    [0.7, { lift: -0.06, spine: [0.1, 1.5, 0], head: [0, 0.2, 0], shL: [-2.2, -0.3, 0.8], elL: [-1.2, 0, 0], shR: [-2.0, 0, -0.1], elR: [-1.4, 0, 0], hipL: [-0.2, 0, 0.2], hipR: [0.3, 0, -0.1], knR: [1.0, 0, 0], bat: [-0.6, -1.9, -0.9] }],
  ]),
  swing_miss: c(0.65, false, [
    [0, stance],
    [0.18, { ...stance, spine: [0.15, -0.55, 0], bat: [-1.0, 1.3, 0.4] }],
    [0.32, { lift: -0.14, spine: [0.45, 1.2, 0], shL: [-1.2, -0.3, 0.5], elL: [-0.2, 0, 0], shR: [-1.1, 0.2, -0.2], elR: [-0.4, 0, 0], hipL: [-0.5, 0, 0.3], hipR: [0.3, 0, -0.1], knR: [1.0, 0, 0], bat: [-1.7, -0.6, 0.2] }],
    [0.65, { lift: -0.16, spine: [0.55, 1.8, 0.2], head: [0.2, 0, 0], shL: [-1.6, -0.3, 0.8], elL: [-0.8, 0, 0], shR: [-1.5, 0, -0.1], elR: [-1.0, 0, 0], hipL: [-0.5, 0, 0.3], hipR: [0.3, 0, -0.1], knR: [1.1, 0, 0], bat: [-1.3, -1.9, 0.1] }],
  ]),
  swing_check: c(0.55, false, [[0, stance], [0.2, { ...stance, spine: [0.2, 0.3, 0], bat: [-1.3, 0.5, 0.2] }], [0.55, stance]]),
  bunt: c(0.7, false, [
    [0, stance],
    [0.3, { lift: -0.18, spine: [0.35, 0.9, 0], head: [0.1, 0.2, 0], shL: [-1.4, 0, 0.3], elL: [-0.6, 0, 0], shR: [-1.3, 0, -0.3], elR: [-0.9, 0, 0], hipL: [-0.4, 0, 0.3], knL: [0.7, 0, 0], hipR: [-0.4, 0, -0.3], knR: [0.7, 0, 0], bat: [-1.57, -1.57, 0] }],
    [0.7, { lift: -0.18, spine: [0.35, 0.9, 0], shL: [-1.4, 0, 0.3], elL: [-0.6, 0, 0], shR: [-1.3, 0, -0.3], elR: [-0.9, 0, 0], hipL: [-0.4, 0, 0.3], knL: [0.7, 0, 0], hipR: [-0.4, 0, -0.3], knR: [0.7, 0, 0], bat: [-1.57, -1.57, 0] }],
  ]),
  run: c(0.52, true, [[0, runA], [0.13, mid], [0.26, runB], [0.39, mid], [0.52, runA]]),
  run_slide: c(0.6, false, [
    [0, runA],
    [0.2, { lift: -0.4, push: 0.2, spine: [-0.6, 0, 0], shL: [-2.4, 0, 0.4], shR: [-2.4, 0, -0.4], hipL: [-1.3, 0, 0], knL: [0.3, 0, 0], hipR: [-1.0, 0, 0], knR: [1.2, 0, 0] }],
    [0.6, { lift: -0.78, push: 0.8, spine: [-1.1, 0, 0], head: [0.5, 0, 0], shL: [-2.8, 0, 0.5], shR: [-2.8, 0, -0.5], hipL: [-1.45, 0, 0], knL: [0.2, 0, 0], hipR: [-1.2, 0, 0], knR: [1.4, 0, 0] }],
  ]),
  run_trot: c(0.8, true, [
    [0, { ...runA, spine: [0.1, 0, 0], hipL: [-0.5, 0, 0], hipR: [0.3, 0, 0], knR: [0.9, 0, 0], shL: [0.4, 0, 0.1], shR: [-0.5, 0, -0.1] }],
    [0.4, { ...runB, spine: [0.1, 0, 0], hipL: [0.3, 0, 0], knL: [0.9, 0, 0], hipR: [-0.5, 0, 0], shL: [-0.5, 0, 0.1], shR: [0.4, 0, -0.1] }],
    [0.8, { ...runA, spine: [0.1, 0, 0], hipL: [-0.5, 0, 0], hipR: [0.3, 0, 0], knR: [0.9, 0, 0], shL: [0.4, 0, 0.1], shR: [-0.5, 0, -0.1] }],
  ]),
  field_ground: c(0.6, false, [
    [0, ready],
    [0.3, { lift: -0.36, spine: [1.15, 0, 0], head: [-0.5, 0, 0], shL: [-1.0, 0, 0.3], elL: [-0.2, 0, 0], shR: [-0.9, 0, -0.3], elR: [-0.3, 0, 0], hipL: [-1.1, 0, 0.35], knL: [1.3, 0, 0], hipR: [-1.1, 0, -0.35], knR: [1.3, 0, 0] }],
    [0.6, { ...ready, shL: [-0.9, 0, 0.3], elL: [-1.4, 0, 0] }],
  ]),
  catch_fly: c(0.7, false, [
    [0, ready],
    [0.35, { head: [-0.7, 0, 0], shL: [-2.9, 0, 0.3], elL: [-0.3, 0, 0], shR: [-2.6, 0, -0.3], elR: [-0.4, 0, 0] }],
    [0.7, { head: [-0.2, 0, 0], shL: [-1.2, 0, 0.2], elL: [-1.6, 0, 0], shR: [-1.0, 0, -0.2], elR: [-1.6, 0, 0] }],
  ]),
  catch_dive: c(0.8, false, [
    [0, ready],
    [0.35, { lift: -0.3, push: 0.4, hips: [0, 0, 0.9], spine: [0.3, 0, 0.3], shL: [-0.5, 0, 2.6], shR: [-0.3, 0, 1.2], hipR: [0, 0, -0.5] }],
    [0.8, { lift: -0.78, push: 1.0, hips: [0, 0, 1.45], spine: [0.1, 0, 0.2], shL: [-0.3, 0, 2.9], elL: [-0.1, 0, 0], shR: [-0.3, 0, 1.5], hipL: [0, 0, 0.2], hipR: [0, 0, -0.6], knR: [0.8, 0, 0] }],
  ]),
  throw: c(0.6, false, [
    [0, { ...ready, shL: [-0.9, 0, 0.3], elL: [-1.4, 0, 0] }],
    [0.25, { spine: [0, 0.8, 0], shL: [-1.2, 0, 0.8], elL: [-0.9, 0, 0], shR: [0.4, 0, -1.4], elR: [-1.5, 0, 0], hipL: [-0.7, 0, 0.2], knL: [0.5, 0, 0] }],
    [0.42, { lift: -0.1, spine: [0.7, -0.6, 0], shL: [0.3, 0, 0.5], elL: [-1.2, 0, 0], shR: [-2.5, 0, -0.2], elR: [-0.2, 0, 0], hipL: [-0.8, 0, 0.2], knL: [0.4, 0, 0], hipR: [0.4, 0, 0], knR: [0.6, 0, 0] }],
    [0.6, { lift: -0.06, spine: [0.6, -0.6, 0], shL: [0.3, 0, 0.4], elL: [-1.0, 0, 0], shR: [-0.5, 0, 0.3], elR: [-0.3, 0, 0], hipR: [0.2, 0, 0], knR: [1.0, 0, 0] }],
  ]),
  umpire_strike: c(0.9, false, [
    [0, { lift: -0.2, spine: [0.5, 0, 0], shL: [-0.4, 0, 0.3], elL: [-0.5, 0, 0], shR: [-0.4, 0, -0.3], elR: [-0.5, 0, 0], hipL: [-0.6, 0, 0.35], knL: [0.9, 0, 0], hipR: [-0.6, 0, -0.35], knR: [0.9, 0, 0] }],
    [0.3, { lift: -0.05, spine: [0.1, -0.6, 0], shR: [-1.4, 0, -0.6], elR: [-1.9, 0, 0], hipL: [-0.2, 0, 0.2], knL: [0.3, 0, 0], hipR: [0.1, 0, -0.2], knR: [0.4, 0, 0] }],
    [0.55, { lift: -0.18, spine: [0.3, -1.1, 0], shL: [-0.2, 0, 0.3], shR: [-1.5, 0, -1.5], elR: [-0.9, 0, 0], hipL: [-0.5, 0, 0.3], knL: [0.8, 0, 0], hipR: [0.3, 0, -0.3], knR: [0.6, 0, 0] }],
    [0.9, { lift: -0.14, spine: [0.25, -1.0, 0], shR: [-1.4, 0, -1.4], elR: [-1.2, 0, 0], hipL: [-0.5, 0, 0.3], knL: [0.7, 0, 0], hipR: [0.3, 0, -0.3], knR: [0.5, 0, 0] }],
  ]),
  umpire_out: c(0.7, false, [[0, {}], [0.25, { shR: [-2.6, 0, -0.2], elR: [-1.9, 0, 0] }], [0.45, { lift: -0.06, shR: [-2.3, 0, -0.2], elR: [-2.3, 0, 0] }], [0.7, { shR: [-2.5, 0, -0.2], elR: [-2.0, 0, 0] }]]),
  umpire_safe: c(0.7, false, [[0, {}], [0.2, { shL: [-1.3, 0, 0.4], shR: [-1.3, 0, -0.4], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0] }], [0.45, { lift: -0.08, spine: [0.2, 0, 0], shL: [0, 0, 1.55], shR: [0, 0, -1.55], elL: Z, elR: Z }], [0.7, { lift: -0.08, spine: [0.2, 0, 0], shL: [0, 0, 1.5], shR: [0, 0, -1.5], elL: Z, elR: Z }]]),
  react_strikeout: c(1.2, false, [[0, stance], [0.4, { spine: [0.3, 0.2, 0], head: [0.55, 0, 0], shL: [-0.2, 0, 0.1], shR: [-0.4, 0, -0.1], elR: [-0.8, 0, 0], bat: [1.2, 0, 0] }], [1.2, { spine: [0.35, 0.3, 0], head: [0.65, 0.2, 0], shL: [-0.1, 0, 0.1], shR: [-0.3, 0, -0.1], elR: [-0.6, 0, 0], bat: [1.3, 0, 0] }]]),
  react_hr: c(1.0, false, [[0, { spine: [0.1, 1.4, 0], shL: [-2.0, 0, 0.8], shR: [-1.9, 0, -0.1], bat: [-0.6, -1.9, -0.9] }], [0.35, { spine: [0, 0.6, 0], shL: [-0.2, 0, 0.3], shR: [-2.9, 0, -0.5], elR: [-0.2, 0, 0], bat: [2.4, 0, 0] }], [1.0, { head: [-0.25, 0, 0], shR: [-2.8, 0, -0.4], elR: [-0.6, 0, 0], bat: [2.4, 0, 0] }]]),
  celebrate: c(0.8, true, [[0, { shL: [-2.9, 0, 0.4], shR: [-2.9, 0, -0.4], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0] }], [0.4, { lift: 0.22, head: [-0.3, 0, 0], shL: [-2.7, 0, 0.8], shR: [-2.7, 0, -0.8], hipL: [-0.3, 0, 0], knL: [0.6, 0, 0], hipR: [-0.3, 0, 0], knR: [0.6, 0, 0] }], [0.8, { shL: [-2.9, 0, 0.4], shR: [-2.9, 0, -0.4], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0] }]]),
  dugout_cheer: c(0.6, true, [[0, { shL: [-2.4, 0, 0.5], elL: [-0.6, 0, 0], shR: [-2.4, 0, -0.5], elR: [-0.6, 0, 0] }], [0.3, { lift: 0.08, shL: [-2.8, 0, 0.2], elL: [-0.2, 0, 0], shR: [-2.8, 0, -0.2], elR: [-0.2, 0, 0] }], [0.6, { shL: [-2.4, 0, 0.5], elL: [-0.6, 0, 0], shR: [-2.4, 0, -0.5], elR: [-0.6, 0, 0] }]]),
  dugout_sad: c(3.0, true, [[0, { spine: [0.45, 0, 0], head: [0.6, 0, 0], shL: [-0.3, 0, 0.05], shR: [-0.3, 0, -0.05] }], [1.5, { lift: -0.02, spine: [0.5, 0, 0], head: [0.7, 0, 0], shL: [-0.35, 0, 0.05], shR: [-0.35, 0, -0.05] }], [3.0, { spine: [0.45, 0, 0], head: [0.6, 0, 0], shL: [-0.3, 0, 0.05], shR: [-0.3, 0, -0.05] }]]),
  pickup: c(0.5, true, [[0, { lift: 0.1, shL: [-0.4, 0, 1.2], elL: [-0.6, 0, 0], shR: [-0.4, 0, -1.2], elR: [-0.6, 0, 0], hipL: [-0.3, 0, 0.15], knL: [0.6, 0, 0], hipR: [0.1, 0, -0.15], knR: [0.3, 0, 0] }], [0.25, { lift: 0.14, shL: [-0.7, 0, 1.4], elL: [-0.9, 0, 0], shR: [-0.7, 0, -1.4], elR: [-0.9, 0, 0], hipL: [0.1, 0, 0.15], knL: [0.3, 0, 0], hipR: [-0.3, 0, -0.15], knR: [0.6, 0, 0] }], [0.5, { lift: 0.1, shL: [-0.4, 0, 1.2], elL: [-0.6, 0, 0], shR: [-0.4, 0, -1.2], elR: [-0.6, 0, 0], hipL: [-0.3, 0, 0.15], knL: [0.6, 0, 0], hipR: [0.1, 0, -0.15], knR: [0.3, 0, 0] }]]),
  drop: c(0.3, false, [[0, { lift: -0.22, spine: [0.3, 0, 0], shL: [-0.6, 0, 0.6], shR: [-0.6, 0, -0.6], hipL: [-0.6, 0, 0.1], knL: [1.0, 0, 0], hipR: [-0.6, 0, -0.1], knR: [1.0, 0, 0] }], [0.3, {}]]),
  walk_to_slot: c(1.0, true, [
    [0, { shL: [0.4, 0, 0.1], shR: [-0.4, 0, -0.1], hipL: [-0.45, 0, 0], hipR: [0.3, 0, 0], knR: [0.4, 0, 0] }],
    [0.5, { lift: 0.02, shL: [-0.4, 0, 0.1], shR: [0.4, 0, -0.1], hipL: [0.3, 0, 0], knL: [0.4, 0, 0], hipR: [-0.45, 0, 0] }],
    [1.0, { shL: [0.4, 0, 0.1], shR: [-0.4, 0, -0.1], hipL: [-0.45, 0, 0], hipR: [0.3, 0, 0], knR: [0.4, 0, 0] }],
  ]),
  sit: c(3.2, true, [[0, sit], [1.6, { ...sit, head: [0.1, 0.3, 0] }], [3.2, sit]]),
  cheer_stage: c(0.5, true, [[0, { shL: [-2.8, 0, 0.9], shR: [-0.2, 0, -0.9] }], [0.25, { lift: 0.1, shL: [-0.2, 0, 0.9], shR: [-2.8, 0, -0.9], hipR: [-0.9, 0, 0], knR: [1.2, 0, 0] }], [0.5, { shL: [-2.8, 0, 0.9], shR: [-0.2, 0, -0.9] }]]),
};

const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRot = (a: Rot, b: Rot, t: number): Rot => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function resolveKey(k: Key): Pose {
  const rot = {} as Record<Joint, Rot>;
  for (const j of JOINTS) rot[j] = k[j] ?? REST.rot[j];
  return { lift: k.lift ?? 0, push: k.push ?? 0, rot };
}
const RESOLVED = new Map<Clip, Pose[]>();
function resolved(clip: Clip): Pose[] {
  let r = RESOLVED.get(clip);
  if (!r) { r = clip.keys.map(([, k]) => resolveKey(k)); RESOLVED.set(clip, r); }
  return r;
}

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const rot = {} as Record<Joint, Rot>;
  for (const j of JOINTS) rot[j] = lerpRot(a.rot[j], b.rot[j], t);
  return { lift: lerp(a.lift, b.lift, t), push: lerp(a.push, b.push, t), rot };
}

/** Pose of `clip` at time `t` seconds (loops wrap, one-shots hold the last key). */
export function samplePose(name: AnyClip, t: number): Pose {
  const clip = CLIP_LIBRARY[name];
  const poses = resolved(clip);
  const time = clip.loop ? ((t % clip.dur) + clip.dur) % clip.dur : Math.min(Math.max(t, 0), clip.dur);
  const keys = clip.keys;
  for (let i = 0; i < keys.length - 1; i++) {
    const t0 = keys[i]![0], t1 = keys[i + 1]![0];
    if (time <= t1) return blendPose(poses[i]!, poses[i + 1]!, smooth(t1 > t0 ? (time - t0) / (t1 - t0) : 1));
  }
  return poses[poses.length - 1]!;
}

const SWAP: Partial<Record<Joint, Joint>> = { shL: "shR", shR: "shL", elL: "elR", elR: "elL", hipL: "hipR", hipR: "hipL", knL: "knR", knR: "knL" };
/** Mirror a pose left↔right (left-handed batters and throwers). */
export function mirrorPose(p: Pose): Pose {
  const rot = {} as Record<Joint, Rot>;
  for (const j of JOINTS) {
    const src = p.rot[SWAP[j] ?? j];
    rot[j] = [src[0], -src[1], -src[2]];
  }
  return { lift: p.lift, push: p.push, rot };
}

export const clipDuration = (name: AnyClip): number => CLIP_LIBRARY[name].dur;
export const clipLoops = (name: AnyClip): boolean => CLIP_LIBRARY[name].loop;
