/**
 * Timeline validation: ordering, bounds, names against the protocol
 * catalogues and the per-event time budget (±10 %).
 */
import { CLIP_FALLBACKS, CLIPS, HAPTICS, SFX, SHOTS, type ClipName } from "@dugout/protocol";
import { EASES, FX_KINDS, type Step, type Timeline } from "./dsl.js";
import { JUICE } from "./juice.js";

export interface Problem {
  severity: "error" | "warning";
  code:
    | "UNSORTED"
    | "T_OUT_OF_RANGE"
    | "ENDS_AFTER_TIMELINE"
    | "UNKNOWN_CLIP"
    | "CLIP_FALLBACK"
    | "CLIP_MISSING"
    | "UNKNOWN_SHOT"
    | "UNKNOWN_SFX"
    | "UNKNOWN_HAPTIC"
    | "UNKNOWN_FX"
    | "UNKNOWN_EASE"
    | "BAD_VALUE"
    | "BUDGET";
  message: string;
  stepIndex?: number;
}

export interface ValidateOptions {
  /** Clips the loaded character asset actually has. Missing ones use CLIP_FALLBACKS (warning) or fail (error). */
  availableClips?: readonly ClipName[];
}

const EPS = 1e-6;
const has = (list: readonly string[], v: string): boolean => list.includes(v);

/** Resolves a clip against the available set via CLIP_FALLBACKS (chains allowed). */
export function resolveClip(clip: ClipName, available: readonly ClipName[]): ClipName | null {
  let c: ClipName | undefined = clip;
  for (let hops = 0; c && hops < CLIPS.length; hops++) {
    if (available.includes(c)) return c;
    c = CLIP_FALLBACKS[c];
  }
  return null;
}

function clipsOf(s: Step): ClipName[] {
  if (s.kind === "anim") return [s.clip];
  if (s.kind === "move" && s.clipWhileMoving) return [s.clipWhileMoving];
  return [];
}

function stepEnd(s: Step): number {
  switch (s.kind) {
    case "move":
    case "timeScale":
    case "shake":
      return s.t + s.dur;
    case "hitstop":
      return s.t + s.ms / 1000;
    default:
      return s.t;
  }
}

export function validateTimeline(tl: Timeline, opts: ValidateOptions = {}): Problem[] {
  const out: Problem[] = [];
  const add = (severity: Problem["severity"], code: Problem["code"], message: string, stepIndex?: number): void => {
    out.push(stepIndex === undefined ? { severity, code, message } : { severity, code, message, stepIndex });
  };
  if (!(tl.duration > 0)) add("error", "BAD_VALUE", `duration must be > 0 (got ${tl.duration})`);

  tl.steps.forEach((s, i) => {
    const prev = tl.steps[i - 1];
    if (prev && s.t < prev.t) add("error", "UNSORTED", `step ${i} t=${s.t} before previous t=${prev.t}`, i);
    if (s.t < 0 || s.t > tl.duration + EPS) add("error", "T_OUT_OF_RANGE", `step ${i} t=${s.t} outside [0, ${tl.duration}]`, i);
    if (stepEnd(s) > tl.duration + EPS) add("warning", "ENDS_AFTER_TIMELINE", `step ${i} (${s.kind}) ends at ${stepEnd(s)}`, i);

    for (const clip of clipsOf(s)) {
      if (!has(CLIPS, clip)) {
        add("error", "UNKNOWN_CLIP", `unknown clip "${clip}"`, i);
      } else if (opts.availableClips) {
        const resolved = resolveClip(clip, opts.availableClips);
        if (resolved === null) add("error", "CLIP_MISSING", `clip "${clip}" missing and no fallback available`, i);
        else if (resolved !== clip) add("warning", "CLIP_FALLBACK", `clip "${clip}" falls back to "${resolved}"`, i);
      }
    }
    switch (s.kind) {
      case "cam":
        if (!has(SHOTS, s.shot)) add("error", "UNKNOWN_SHOT", `unknown shot "${s.shot}"`, i);
        break;
      case "sfx":
        if (!has(SFX, s.id)) add("error", "UNKNOWN_SFX", `unknown sfx "${s.id}"`, i);
        if (s.volume !== undefined && (s.volume < 0 || s.volume > 1)) add("error", "BAD_VALUE", `volume ${s.volume} outside 0..1`, i);
        break;
      case "haptic":
        if (!Object.hasOwn(HAPTICS, s.id)) add("error", "UNKNOWN_HAPTIC", `unknown haptic "${s.id}"`, i);
        break;
      case "fx":
        if (!has(FX_KINDS, s.effect)) add("error", "UNKNOWN_FX", `unknown fx "${s.effect}"`, i);
        break;
      case "move":
        if (!has(EASES, s.ease)) add("error", "UNKNOWN_EASE", `unknown ease "${s.ease}"`, i);
        if (!(s.dur > 0)) add("error", "BAD_VALUE", `move dur must be > 0`, i);
        break;
      case "ball":
        if (!(s.path.flightTime > 0) || s.path.points.length < 2) add("error", "BAD_VALUE", "ball path needs flightTime > 0 and ≥ 2 points", i);
        break;
      case "hitstop":
        if (!(s.ms > 0)) add("error", "BAD_VALUE", "hitstop ms must be > 0", i);
        break;
      case "timeScale":
        if (!(s.scale > 0) || !(s.dur > 0)) add("error", "BAD_VALUE", "timeScale needs scale > 0 and dur > 0", i);
        break;
      case "board":
        if (s.text.trim() === "") add("error", "BAD_VALUE", "empty board text", i);
        break;
      default:
        break;
    }
  });

  const spec = JUICE.budget[tl.budgetKey] / tl.speed;
  if (Math.abs(tl.duration - spec) > spec * JUICE.budgetTolerance + EPS) {
    add("error", "BUDGET", `duration ${tl.duration}s outside ${spec}s ±${JUICE.budgetTolerance * 100}% for ${tl.budgetKey}`);
  }
  return out;
}

export const errorsOf = (problems: readonly Problem[]): Problem[] => problems.filter((p) => p.severity === "error");
