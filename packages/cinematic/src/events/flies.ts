/** Balls caught in the air: FO, LO, PO, SF (§16.3). */
import type { BbType, SfxId } from "@dugout/protocol";
import { battedBallPath } from "../ball.js";
import { TimelineBuilder, type Timeline } from "../dsl.js";
import { JUICE } from "../juice.js";
import { budget, contactLight, fielder, finish, openPitch, runLegs, scoreIfRuns, type EventContext } from "./common.js";

const F = JUICE.fielding;

interface FlyOptions {
  bbType: BbType;
  flight: number;
  /** Cut to CAM_BALL before CAM_FIELD (high flies). */
  chase: boolean;
  glove: SfxId;
  /** Line drives get a tag-style hitstop on the catch. */
  snap: boolean;
}

/** Pitch → contact → catch → out call; returns the catch time. */
function airOut(b: TimelineBuilder, ctx: EventContext, o: FlyOptions): number {
  openPitch(b, ctx);
  const tc = contactLight(b, ctx, JUICE.contactAt.out);
  const f = ctx.play.fielderSlot;
  const path = battedBallPath({
    bbType: o.bbType,
    direction: ctx.play.direction,
    batterHand: ctx.play.batterHand,
    power: ctx.play.power,
    outcome: "out",
    fielderPos: ctx.layout[f],
    flightTime: o.flight,
    rng: ctx.rng,
  });
  b.ball(tc, path);
  if (o.chase) {
    b.cam(tc, "CAM_BALL", { ease: JUICE.camera.ease });
    b.cam(tc + JUICE.camera.ballShot, "CAM_FIELD", { ease: JUICE.camera.ease });
  } else {
    b.cam(tc + F.camDelay, "CAM_FIELD", { ease: JUICE.camera.ease });
  }
  const caught = tc + path.flightTime;
  const dive = o.bbType === "LD" && ctx.rng.chance(F.lineDiveChance);
  b.anim(caught - F.catchBefore, fielder(f), dive ? "catch_dive" : "catch_fly");
  b.sfx(caught, o.glove);
  if (o.snap) {
    b.hitstop(caught, JUICE.hitstopMs.tag);
    b.haptic(caught, "light");
  }
  const call = caught + F.callAfter;
  b.anim(call, "umpire", "umpire_out");
  b.sfx(call, "ump_out");
  return caught;
}

export function buildFlyOut(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const caught = airOut(b, ctx, { bbType: "FB", flight: JUICE.ball.flight.flyOut, chase: true, glove: "glove_pop_soft", snap: false });
  // Tag-ups (engine may move a runner 2B → 3B on a deep fly).
  runLegs(b, ctx, caught + F.callAfter, ctx.play.runnerMoves, { legDur: JUICE.legs.tagUp, endBy: budget("FO") });
  return finish(b, ctx, budget("FO"));
}

export function buildLineOut(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  airOut(b, ctx, { bbType: "LD", flight: JUICE.ball.flight.lineOut, chase: false, glove: "glove_pop_hard", snap: true });
  return finish(b, ctx, budget("LO"));
}

export function buildPopOut(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  airOut(b, ctx, { bbType: "PU", flight: JUICE.ball.flight.popUp, chase: true, glove: "glove_pop_soft", snap: false });
  return finish(b, ctx, budget("PO"));
}

export function buildSacFly(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const dur = budget("SF");
  const caught = airOut(b, ctx, { bbType: "FB", flight: JUICE.ball.flight.flyOut, chase: true, glove: "glove_pop_soft", snap: false });
  const t0 = caught + F.callAfter;
  const end = runLegs(b, ctx, t0, ctx.play.runnerMoves, { legDur: JUICE.legs.tagUp, endBy: dur - JUICE.arriveBefore });
  b.anim(end, "umpire", "umpire_safe");
  b.sfx(end, "ump_safe");
  scoreIfRuns(b, ctx, end);
  return finish(b, ctx, dur);
}
