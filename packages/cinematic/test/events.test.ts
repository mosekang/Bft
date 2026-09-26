import { EVENT_TYPES, type EventType } from "@dugout/protocol";
import { describe, expect, it } from "vitest";
import {
  EVENT_TIMELINE_BUILDERS,
  JUICE,
  buildEventTimeline,
  deriveRunnerMoves,
  errorsOf,
  validateTimeline,
  type Step,
  type Timeline,
} from "../src/index.js";
import { syntheticEvent } from "./helpers.js";

const stepsOf = <K extends Step["kind"]>(tl: Timeline, kind: K): Extract<Step, { kind: K }>[] =>
  tl.steps.filter((s): s is Extract<Step, { kind: K }> => s.kind === kind);

describe("EVENT_TIMELINE_BUILDERS", () => {
  it("covers every EVENT_TYPES value and nothing else", () => {
    expect(Object.keys(EVENT_TIMELINE_BUILDERS).sort()).toEqual([...EVENT_TYPES].sort());
    for (const t of EVENT_TYPES) expect(typeof EVENT_TIMELINE_BUILDERS[t]).toBe("function");
  });

  for (const withMeta of [false, true]) {
    it.each(EVENT_TYPES.map((t) => [t]))(`%s builds a valid timeline (meta: ${withMeta})`, (type: EventType) => {
      const tl = buildEventTimeline(syntheticEvent(type, { withMeta }), 5, 42);
      const problems = validateTimeline(tl);
      expect(errorsOf(problems)).toEqual([]);
      expect(problems.filter((p) => p.code === "ENDS_AFTER_TIMELINE" && p.severity === "warning").length).toBeLessThanOrEqual(1);
      expect(tl.type).toBe(type);
      expect(tl.eventIndex).toBe(5);
      expect(tl.duration).toBeCloseTo(JUICE.budget[tl.budgetKey], 3);
    });
  }
});

describe("home run", () => {
  const tl = buildEventTimeline(syntheticEvent("HR", { withMeta: true }), 3, 7);
  it("has the showcase juice", () => {
    expect(tl.duration).toBe(4.5);
    expect(stepsOf(tl, "hitstop").some((s) => s.ms === 80)).toBe(true);
    expect(stepsOf(tl, "timeScale").some((s) => s.scale === 0.25 && s.dur === 0.5)).toBe(true);
    expect(stepsOf(tl, "fx").find((s) => s.effect === "fireworks")?.count).toBe(200);
    expect(stepsOf(tl, "fx").find((s) => s.effect === "confetti")?.count).toBe(300);
    expect(stepsOf(tl, "fx").some((s) => s.effect === "crowdWave")).toBe(true);
    expect(stepsOf(tl, "fx").find((s) => s.effect === "flash")?.dur).toBe(0.1);
    const sfx = stepsOf(tl, "sfx").map((s) => s.id);
    expect(sfx).toEqual(expect.arrayContaining(["crowd_hr_roar", "fireworks", "fanfare", "bat_crack_strong"]));
    expect(stepsOf(tl, "haptic").map((s) => s.id)).toContain("heavy2");
    expect(stepsOf(tl, "board").find((s) => s.text === "HOME RUN")?.flash).toBe(true);
    expect(stepsOf(tl, "score").at(-1)?.score).toEqual([5, 3]);
    expect(stepsOf(tl, "cam").map((s) => s.shot)).toEqual(expect.arrayContaining(["CAM_PITCH", "CAM_BALL", "CAM_CROWD", "CAM_BOARD"]));
  });
  it("trots every runner home in 1 s with run_trot and a glowing ball", () => {
    const moves = stepsOf(tl, "move").filter((m) => m.clipWhileMoving === "run_trot");
    const batterLegs = moves.filter((m) => m.who === "batter");
    expect(batterLegs.map((m) => (m.to as { base: number }).base)).toEqual([1, 2, 3, 4]);
    expect(batterLegs.reduce((a, m) => a + m.dur, 0)).toBeCloseTo(1.0, 3);
    expect(moves.some((m) => typeof m.who === "object" && "runner" in m.who)).toBe(true);
    expect(stepsOf(tl, "ball")[0]?.path.trail).toBe("glow");
  });
});

describe("strikeout", () => {
  it("has CAM_PUNCH, umpire_strike, 40 ms hitstop and the reaction", () => {
    const tl = buildEventTimeline(syntheticEvent("K", { runners: [false, false, false] }), 0, 1);
    expect(tl.duration).toBe(1.5);
    expect(stepsOf(tl, "cam").some((s) => s.shot === "CAM_PUNCH")).toBe(true);
    expect(stepsOf(tl, "anim").some((s) => s.who === "umpire" && s.clip === "umpire_strike")).toBe(true);
    expect(stepsOf(tl, "anim").some((s) => s.who === "batter" && s.clip === "swing_miss")).toBe(true);
    expect(stepsOf(tl, "anim").some((s) => s.who === "batter" && s.clip === "react_strikeout")).toBe(true);
    expect(stepsOf(tl, "hitstop").map((s) => s.ms)).toEqual([40]);
    expect(stepsOf(tl, "sfx").map((s) => s.id)).toEqual(expect.arrayContaining(["glove_pop_hard", "ump_strike"]));
  });
  it("looking strikeout has no swing", () => {
    const tl = buildEventTimeline(syntheticEvent("K", { withMeta: true, runners: [false, false, false] }), 0, 1);
    expect(stepsOf(tl, "anim").some((s) => s.clip === "swing_miss")).toBe(false);
  });
  it("bases-loaded inning-ending K runs 2.5 s with celebration", () => {
    const tl = buildEventTimeline(syntheticEvent("K", { runners: [true, true, true], outs: 2, meta: { basesLoaded: true, endsInning: true } }), 0, 1);
    expect(tl.budgetKey).toBe("K_BASES_LOADED");
    expect(tl.duration).toBe(2.5);
    expect(stepsOf(tl, "anim").some((s) => s.who === "pitcher" && s.clip === "celebrate")).toBe(true);
    expect(stepsOf(tl, "anim").some((s) => typeof s.who === "object" && "dugout" in s.who && s.who.dugout === "home" && s.clip === "dugout_cheer")).toBe(true);
    expect(errorsOf(validateTimeline(tl))).toEqual([]);
  });
});

describe("other plays", () => {
  it("double play has two tag outs with 30 ms hitstops and dust 40", () => {
    const tl = buildEventTimeline(syntheticEvent("DP"), 0, 1);
    expect(stepsOf(tl, "hitstop").map((s) => s.ms)).toEqual([30, 30]);
    expect(stepsOf(tl, "fx").filter((s) => s.effect === "dust").map((s) => s.count)).toEqual([40, 40]);
    expect(stepsOf(tl, "sfx").filter((s) => s.id === "ump_out")).toHaveLength(2);
    expect(stepsOf(tl, "anim").filter((s) => s.clip === "throw")).toHaveLength(2);
  });
  it("error boos at 0.7 volume", () => {
    const tl = buildEventTimeline(syntheticEvent("E"), 0, 1);
    expect(stepsOf(tl, "sfx").find((s) => s.id === "crowd_boo")?.volume).toBe(0.7);
    expect(stepsOf(tl, "fx").some((s) => s.effect === "boo")).toBe(true);
  });
  it("stolen base slides into second on CAM_RUNNER", () => {
    const tl = buildEventTimeline(syntheticEvent("SB"), 0, 1);
    expect(stepsOf(tl, "cam")[0]).toMatchObject({ shot: "CAM_RUNNER", follow: { runner: "c7" } });
    expect(stepsOf(tl, "fx").find((s) => s.effect === "dust")?.count).toBe(60);
    const cs = buildEventTimeline(syntheticEvent("CS"), 0, 1);
    expect(stepsOf(cs, "anim").some((s) => s.clip === "umpire_out")).toBe(true);
  });
  it("bat crack follows power thresholds", () => {
    const crack = (power: number) =>
      stepsOf(buildEventTimeline(syntheticEvent("1B", { withMeta: true, meta: { power } }), 0, 1), "sfx").find((s) => s.id.startsWith("bat_crack"))?.id;
    expect(crack(40)).toBe("bat_crack_weak");
    expect(crack(60)).toBe("bat_crack_mid");
    expect(crack(90)).toBe("bat_crack_strong");
  });
  it("uses the stretch with runners on", () => {
    const on = buildEventTimeline(syntheticEvent("GO", { runners: [true, false, false] }), 0, 1);
    const off = buildEventTimeline(syntheticEvent("GO", { runners: [false, false, false] }), 0, 1);
    expect(stepsOf(on, "anim").some((s) => s.clip === "pitch_stretch")).toBe(true);
    expect(stepsOf(off, "anim").some((s) => s.clip === "pitch_windup")).toBe(true);
  });
  it("game end: winner celebrates, draw shows DRAW", () => {
    const e = syntheticEvent("GAME_END", { runners: [false, false, false], runs: 0 });
    const win = buildEventTimeline({ ...e, scoreAfter: [5, 2] }, 0, 1);
    expect(stepsOf(win, "anim").find((s) => s.clip === "celebrate")?.who).toEqual({ dugout: "away" });
    expect(stepsOf(win, "anim").find((s) => s.clip === "dugout_sad")?.who).toEqual({ dugout: "home" });
    const draw = buildEventTimeline({ ...e, scoreAfter: [3, 3] }, 0, 1);
    expect(stepsOf(draw, "board").map((s) => s.text)).toContain("DRAW");
  });
  it("inning end announces the next half", () => {
    const tl = buildEventTimeline({ ...syntheticEvent("INNING_END"), inning: 4, half: "B" }, 0, 1);
    expect(stepsOf(tl, "board")[0]?.text).toBe("INNING 5T");
  });
});

describe("deriveRunnerMoves", () => {
  it("derives forced and scoring moves without meta", () => {
    expect(deriveRunnerMoves(syntheticEvent("BB", { runners: [true, true, true], runs: 1 }))).toEqual([
      { runner: "base:3", from: 3, to: 4 },
      { runner: "base:2", from: 2, to: 3 },
      { runner: "base:1", from: 1, to: 2 },
      { runner: "c12", from: 0, to: 1 },
    ]);
    const dbl = deriveRunnerMoves(syntheticEvent("2B", { runners: [true, false, false], runs: 1 }));
    expect(dbl).toContainEqual({ runner: "base:1", from: 1, to: 4 });
    expect(dbl).toContainEqual({ runner: "c12", from: 0, to: 2 });
    expect(deriveRunnerMoves(syntheticEvent("K"))).toEqual([]);
  });
});
