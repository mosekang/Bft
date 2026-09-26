/**
 * Camera shot definitions (DESIGN v3 §16.2). Coordinates in metres, home
 * plate at the origin, +z toward centre field, +x toward right field.
 * Cuts between shots are instant; moves within a shot ease over
 * `JUICE.camera.ease` seconds.
 */
import { FIELD_COORDS, type ShotName } from "@dugout/protocol";
import type { Vec3 } from "./dsl.js";

/** Scoreboard position beyond the centre-field fence. */
export const SCOREBOARD_POS: Vec3 = [0, 14, 132];

export type ShotDef =
  | { mode: "fixed"; position: Vec3; target: Vec3; fov: number; description: string }
  | {
      mode: "follow";
      /** What the camera tracks. `actor` uses the cam step's `follow`. */
      subject: "ball" | "actor";
      /**
       * Offset in the subject's frame: [side (+ = right of travel), up,
       * back (+ = behind the direction of travel)].
       */
      offset: Vec3;
      fov: number;
      /** Used before the subject exists (e.g. ball not yet launched). */
      fallback: { position: Vec3; target: Vec3 };
      description: string;
    };

const mound = FIELD_COORDS.P;
const ump = FIELD_COORDS.UMP;

export const SHOT_DEFS: Record<ShotName, ShotDef> = {
  CAM_PITCH: {
    mode: "fixed",
    position: [0, 1.6, -4],
    target: [mound[0], 1.2, mound[2]],
    fov: 38,
    description: "Behind the catcher, low, looking at the mound.",
  },
  CAM_BATTER: {
    mode: "fixed",
    position: [-5, 1.8, 2],
    target: [0, 1.1, 0],
    fov: 42,
    description: "Third-base side on the batter.",
  },
  CAM_BALL: {
    mode: "follow",
    subject: "ball",
    offset: [0, 1, 3],
    fov: 55,
    fallback: { position: [0, 2, -3], target: [0, 1, 10] },
    description: "Chase camera 3 m behind the ball.",
  },
  CAM_FIELD: {
    mode: "fixed",
    position: [-38, 42, -30],
    target: [0, 0, 40],
    fov: 50,
    description: "High three-quarter view of the whole diamond.",
  },
  CAM_RUNNER: {
    mode: "follow",
    subject: "actor",
    offset: [4, 1.6, 0],
    fov: 45,
    fallback: { position: [24, 1.6, 20], target: [0, 1, 38.8] },
    description: "Side camera 4 m from the runner, tracking.",
  },
  CAM_CROWD: {
    mode: "fixed",
    position: [0, 12, 125],
    target: [0, 1, 0],
    fov: 60,
    description: "From the outfield stands back toward home plate.",
  },
  CAM_PUNCH: {
    mode: "fixed",
    position: [ump[0] + 0.4, 1.7, ump[2] + 2],
    target: [ump[0], 1.5, ump[2]],
    fov: 35,
    description: "Umpire, front, 2 m.",
  },
  CAM_BOARD: {
    mode: "fixed",
    position: [SCOREBOARD_POS[0], SCOREBOARD_POS[1], SCOREBOARD_POS[2] - 14],
    target: SCOREBOARD_POS,
    fov: 30,
    description: "Scoreboard close-up.",
  },
};
