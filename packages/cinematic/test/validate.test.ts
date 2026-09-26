import { describe, expect, it } from "vitest";
import { CLIPS, type ClipName } from "@dugout/protocol";
import { TimelineBuilder, buildEventTimeline, errorsOf, resolveClip, scaleTimeline, validateTimeline, type Timeline } from "../src/index.js";
import { syntheticEvent } from "./helpers.js";

const base = (): Timeline => new TimelineBuilder().cam(0, "CAM_PITCH").anim(0.1, "pitcher", "pitch_windup").build({ id: "x", type: "BB", duration: 0.8 });

describe("validateTimeline", () => {
  it("accepts a well-formed timeline", () => {
    expect(validateTimeline(base())).toEqual([]);
  });

  it("flags unsorted steps, out-of-range t and unknown names", () => {
    const tl = base();
    const bad: Timeline = {
      ...tl,
      steps: [
        { t: 0.5, kind: "sfx", id: "nope" as never },
        { t: 0.2, kind: "cam", shot: "CAM_DRONE" as never },
        { t: 0.3, kind: "anim", who: "batter", clip: "moonwalk" as never },
        { t: 0.4, kind: "haptic", id: "buzz" as never },
        { t: 2, kind: "board", text: "X" },
      ],
    };
    const codes = validateTimeline(bad).map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["UNSORTED", "UNKNOWN_SFX", "UNKNOWN_SHOT", "UNKNOWN_CLIP", "UNKNOWN_HAPTIC", "T_OUT_OF_RANGE"]));
  });

  it("checks the duration budget (±10 %)", () => {
    const tl = { ...base(), duration: 1.2 };
    expect(errorsOf(validateTimeline(tl)).map((p) => p.code)).toContain("BUDGET");
    expect(errorsOf(validateTimeline({ ...base(), duration: 0.85 }))).toEqual([]);
    expect(errorsOf(validateTimeline(scaleTimeline(base(), 2)))).toEqual([]);
  });

  it("reports clip fallbacks as warnings and missing clips as errors", () => {
    const tl = buildEventTimeline(syntheticEvent("HR", { withMeta: true }), 0, 1);
    const available = CLIPS.filter((c) => c !== "run_trot" && c !== "react_hr");
    const problems = validateTimeline(tl, { availableClips: available });
    expect(problems.filter((p) => p.code === "CLIP_FALLBACK").every((p) => p.severity === "warning")).toBe(true);
    expect(problems.some((p) => p.code === "CLIP_FALLBACK")).toBe(true);
    expect(errorsOf(problems)).toEqual([]);
    const none: ClipName[] = ["idle_batter"];
    expect(errorsOf(validateTimeline(tl, { availableClips: none })).some((p) => p.code === "CLIP_MISSING")).toBe(true);
    expect(resolveClip("run_trot", ["run"])).toBe("run");
    expect(resolveClip("catch_dive", ["idle_field"])).toBeNull();
  });
});
