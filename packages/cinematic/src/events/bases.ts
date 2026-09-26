/** Stolen base / caught stealing (§16.3). */
import type { RunnerMove } from "@dugout/protocol";
import { throwPath } from "../ball.js";
import { TimelineBuilder, type BaseIndex, type Timeline } from "../dsl.js";
import { JUICE } from "../juice.js";
import { basePos } from "../layout.js";
import { baseRunnerId } from "../meta.js";
import { budget, coverFor, fielder, finish, runnerActor, tagPlay, type EventContext } from "./common.js";

function stealMove(ctx: EventContext): RunnerMove {
  const out = ctx.event.type === "CS";
  return ctx.play.runnerMoves[0] ?? (out ? { runner: baseRunnerId(1), from: 1, to: 2, out } : { runner: baseRunnerId(1), from: 1, to: 2 });
}

export function buildSteal(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const s = JUICE.steal;
  const move = stealMove(ctx);
  const out = ctx.event.type === "CS";
  const who = runnerActor(ctx, move.runner);
  const target = move.to as BaseIndex;

  b.caption(0, ctx.index);
  b.cam(0, "CAM_RUNNER", { follow: who, ease: JUICE.camera.ease });
  b.anim(0, "pitcher", "pitch_stretch");
  const t0 = JUICE.runnerBreak;
  const arrive = t0 + JUICE.legs.steal;
  b.move(t0, who, { base: target }, JUICE.legs.steal, "linear", "run");
  b.anim(arrive - s.slideLead, who, "run_slide");

  const flight = JUICE.ball.flight.steal;
  const cover = coverFor(target, "C");
  b.anim(s.throwAt, "catcher", "throw");
  b.ball(arrive - flight, throwPath(ctx.layout.C, basePos(target), flight));
  b.anim(arrive - JUICE.fielding.catchBefore, fielder(cover), "catch_fly");

  tagPlay(b, arrive, target, out, JUICE.fx.dustSlide);
  if (out) b.sfx(arrive, "slide");
  return finish(b, ctx, budget(ctx.event.type === "CS" ? "CS" : "SB"));
}
