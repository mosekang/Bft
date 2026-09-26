/**
 * Timeline DSL (DESIGN v3 §16.3). A timeline is a list of steps sorted by
 * `t` (seconds from the timeline start, 1× wall clock). Players interpret
 * steps; this package only produces data.
 */
import type { ClipName, EventType, HapticId, Pos, SfxId, ShotName } from "@dugout/protocol";

export type Vec3 = [number, number, number];
export type Side = "home" | "away";

export type ActorRef =
  | "batter"
  | "pitcher"
  | "catcher"
  | "umpire"
  | "crowd"
  | { fielder: Pos }
  | { runner: string }
  | { dugout: Side };

export const EASES = ["linear", "outCubic", "inOutCubic"] as const;
export type Ease = (typeof EASES)[number];

/** 0 = home plate, 1..3 = bases, 4 = home again (scored). */
export type BaseIndex = 0 | 1 | 2 | 3 | 4;
export type MoveTarget = Vec3 | { base: BaseIndex } | { slot: Pos };

export const FX_KINDS = ["spark", "dust", "fireworks", "confetti", "flash", "vignette", "crowdWave", "boo", "coinBurst"] as const;
export type FxKind = (typeof FX_KINDS)[number];

export type Trail = "normal" | "glow";

/**
 * Precomputed ball flight (§16.4). `points` are samples evenly spaced in
 * scene time over `flightTime`; `apex` is the arc height above the straight
 * chord between `from` and `to` (per bounce arc it is scaled by `damping`).
 */
export interface BallPath {
  from: Vec3;
  to: Vec3;
  apex: number;
  bounces: number;
  damping: number;
  /** Scene seconds (affected by timeScale steps). */
  flightTime: number;
  trail: Trail;
  points: Vec3[];
}

interface At {
  t: number;
}
export interface CamStep extends At {
  kind: "cam";
  shot: ShotName;
  follow?: ActorRef;
  /** Seconds used to ease moves within the shot. Cuts are instant. */
  ease?: number;
}
export interface AnimStep extends At {
  kind: "anim";
  who: ActorRef;
  clip: ClipName;
  loop?: boolean;
  speed?: number;
}
export interface MoveStep extends At {
  kind: "move";
  who: ActorRef;
  to: MoveTarget;
  dur: number;
  ease: Ease;
  clipWhileMoving?: ClipName;
}
export interface BallStep extends At {
  kind: "ball";
  path: BallPath;
}
export interface HitstopStep extends At {
  kind: "hitstop";
  ms: number;
}
export interface TimeScaleStep extends At {
  kind: "timeScale";
  scale: number;
  dur: number;
}
export interface ShakeStep extends At {
  kind: "shake";
  amp: number;
  dur: number;
}
export interface SfxStep extends At {
  kind: "sfx";
  id: SfxId;
  volume?: number;
}
export interface HapticStep extends At {
  kind: "haptic";
  id: HapticId;
}
/** Particle / screen effect. (`effect` rather than `kind`, which is the step discriminant.) */
export interface FxStep extends At {
  kind: "fx";
  effect: FxKind;
  at?: Vec3 | ActorRef;
  count?: number;
  /** Seconds, for timed screen effects such as `flash`. */
  dur?: number;
}
/** Scoreboard text. English codes ("HOME RUN", "INNING 5T"); the UI localises. */
export interface BoardStep extends At {
  kind: "board";
  text: string;
  flash?: boolean;
}
/** Tells the HUD to show the commentary line for `eventIndex`. */
export interface CaptionStep extends At {
  kind: "caption";
  eventIndex: number;
}
export interface ScoreStep extends At {
  kind: "score";
  /** [away, home] */
  score: [number, number];
}

export type Step =
  | CamStep
  | AnimStep
  | MoveStep
  | BallStep
  | HitstopStep
  | TimeScaleStep
  | ShakeStep
  | SfxStep
  | HapticStep
  | FxStep
  | BoardStep
  | CaptionStep
  | ScoreStep;
export type StepKind = Step["kind"];

export type TimelineType = EventType | "SUMMARY" | "INNING";
/** Key into the time budget table (`JUICE.budget`). */
export type BudgetKey = TimelineType | "K_BASES_LOADED";

export interface Timeline {
  id: string;
  type: TimelineType;
  budgetKey: BudgetKey;
  /** Playback speed the times were scaled for. */
  speed: 1 | 2;
  duration: number;
  steps: Step[];
  /** Source event for a single-event timeline. */
  eventIndex?: number;
  /** Inclusive event span covered by a summary / transition. */
  eventRange?: [number, number];
}

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const vec = (v: readonly number[]): Vec3 => [round2(v[0] ?? 0), round2(v[1] ?? 0), round2(v[2] ?? 0)];

/** Small mutable helper used by the builders; `build` sorts steps stably by `t`. */
export class TimelineBuilder {
  private readonly steps: Step[] = [];

  add(step: Step): this {
    this.steps.push({ ...step, t: round3(Math.max(0, step.t)) });
    return this;
  }
  cam(t: number, shot: ShotName, extra: { follow?: ActorRef; ease?: number } = {}): this {
    return this.add({ t, kind: "cam", shot, ...extra });
  }
  anim(t: number, who: ActorRef, clip: ClipName, extra: { loop?: boolean; speed?: number } = {}): this {
    return this.add({ t, kind: "anim", who, clip, ...extra });
  }
  move(t: number, who: ActorRef, to: MoveTarget, dur: number, ease: Ease, clipWhileMoving?: ClipName): this {
    const step: MoveStep = { t, kind: "move", who, to, dur: round3(dur), ease };
    if (clipWhileMoving) step.clipWhileMoving = clipWhileMoving;
    return this.add(step);
  }
  ball(t: number, path: BallPath): this {
    return this.add({ t, kind: "ball", path });
  }
  hitstop(t: number, ms: number): this {
    return this.add({ t, kind: "hitstop", ms });
  }
  timeScale(t: number, scale: number, dur: number): this {
    return this.add({ t, kind: "timeScale", scale, dur });
  }
  shake(t: number, amp: number, dur: number): this {
    return this.add({ t, kind: "shake", amp, dur });
  }
  sfx(t: number, id: SfxId, volume?: number): this {
    return this.add(volume === undefined ? { t, kind: "sfx", id } : { t, kind: "sfx", id, volume });
  }
  haptic(t: number, id: HapticId): this {
    return this.add({ t, kind: "haptic", id });
  }
  fx(t: number, effect: FxKind, extra: { at?: Vec3 | ActorRef; count?: number; dur?: number } = {}): this {
    return this.add({ t, kind: "fx", effect, ...extra });
  }
  board(t: number, text: string, flash?: boolean): this {
    return this.add(flash === undefined ? { t, kind: "board", text } : { t, kind: "board", text, flash });
  }
  caption(t: number, eventIndex: number): this {
    return this.add({ t, kind: "caption", eventIndex });
  }
  score(t: number, score: readonly [number, number]): this {
    return this.add({ t, kind: "score", score: [score[0], score[1]] });
  }

  build(meta: { id: string; type: TimelineType; budgetKey?: BudgetKey; duration: number; eventIndex?: number; eventRange?: [number, number] }): Timeline {
    const steps = this.steps
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.t - b.s.t || a.i - b.i)
      .map(({ s }) => s);
    const tl: Timeline = { id: meta.id, type: meta.type, budgetKey: meta.budgetKey ?? meta.type, speed: 1, duration: round3(meta.duration), steps };
    if (meta.eventIndex !== undefined) tl.eventIndex = meta.eventIndex;
    if (meta.eventRange) tl.eventRange = meta.eventRange;
    return tl;
  }
}

/** Scales every time quantity by `1 / speed` (speed 2 halves all times). */
export function scaleTimeline(tl: Timeline, speed: 1 | 2): Timeline {
  if (speed === tl.speed) return tl;
  const f = tl.speed / speed;
  const steps = tl.steps.map((s): Step => {
    const t = round3(s.t * f);
    switch (s.kind) {
      case "move":
        return { ...s, t, dur: round3(s.dur * f) };
      case "hitstop":
        return { ...s, t, ms: round3(s.ms * f) };
      case "timeScale":
      case "shake":
        return { ...s, t, dur: round3(s.dur * f) };
      case "fx":
        return s.dur === undefined ? { ...s, t } : { ...s, t, dur: round3(s.dur * f) };
      case "ball":
        return { ...s, t, path: { ...s.path, flightTime: round3(s.path.flightTime * f) } };
      case "anim":
        return { ...s, t, speed: round3((s.speed ?? 1) / f) };
      case "cam":
        return s.ease === undefined ? { ...s, t } : { ...s, t, ease: round3(s.ease * f) };
      default:
        return { ...s, t };
    }
  });
  return { ...tl, speed, duration: round3(tl.duration * f), steps };
}
