/** Ground-ball plays: GO, DP, FC, E, SH (§16.3). */
import type { Pos, RunnerMove } from "@dugout/protocol";
import { battedBallPath, buntPath, throwPath } from "../ball.js";
import { TimelineBuilder, type BaseIndex, type Timeline, type Vec3 } from "../dsl.js";
import { JUICE } from "../juice.js";
import { basePos } from "../layout.js";
import { budget, contactLight, coverFor, fielder, finish, openPitch, runLegs, scoreIfRuns, tagPlay, type EventContext } from "./common.js";

const F = JUICE.fielding;

/** Pitch, light contact and a grounder to the fielder; returns when the ball arrives. */
function grounder(b: TimelineBuilder, ctx: EventContext): { arrive: number; at: Vec3 } {
  openPitch(b, ctx);
  const tc = contactLight(b, ctx, JUICE.contactAt.out);
  b.cam(tc + F.camDelay, "CAM_FIELD", { ease: JUICE.camera.ease });
  const at = ctx.layout[ctx.play.fielderSlot];
  const path = battedBallPath({
    bbType: "GB",
    direction: ctx.play.direction,
    batterHand: ctx.play.batterHand,
    power: ctx.play.power,
    outcome: "out",
    fielderPos: at,
    flightTime: JUICE.ball.flight.groundOut,
    rng: ctx.rng,
  });
  b.ball(tc, path);
  const arrive = tc + path.flightTime;
  b.anim(arrive - F.fieldBefore, fielder(ctx.play.fielderSlot), "field_ground");
  return { arrive, at };
}

/** Umpire out call without the tag juice (routine plays). */
function outCall(b: TimelineBuilder, t: number, catcher: Pos): void {
  b.anim(t, fielder(catcher), "catch_fly");
  b.sfx(t, "glove_pop_soft");
  b.anim(t, "umpire", "umpire_out");
  b.sfx(t, "ump_out");
}

/** Throw from `from` to `base`; returns the arrival time. */
function throwTo(b: TimelineBuilder, ctx: EventContext, t: number, thrower: Pos, from: Vec3, base: BaseIndex): number {
  const flight = JUICE.ball.flight.throw;
  b.anim(t, fielder(thrower), "throw");
  b.ball(t, throwPath(from, basePos(base), flight));
  return t + flight;
}

const breakAt = (): number => JUICE.contactAt.out + JUICE.runnerBreak;

export function buildGroundOut(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const { arrive, at } = grounder(b, ctx);
  const f = ctx.play.fielderSlot;
  let call: number;
  if (f === "1B") {
    b.move(arrive, fielder(f), { base: 1 }, JUICE.ball.flight.throw, "outCubic", "run");
    call = arrive + JUICE.ball.flight.throw;
  } else {
    call = throwTo(b, ctx, arrive + F.throwAfter, f, at, 1);
  }
  outCall(b, call, coverFor(1, f === "1B" ? "C" : f));
  const end = runLegs(b, ctx, breakAt(), ctx.play.runnerMoves, { legDur: JUICE.legs.out });
  scoreIfRuns(b, ctx, Math.min(end, budget("GO")));
  return finish(b, ctx, budget("GO"));
}

function leadOut(moves: readonly RunnerMove[], batter: string): RunnerMove | undefined {
  return moves.filter((m) => m.out && m.runner !== batter).sort((a, b) => b.to - a.to)[0];
}

export function buildDoublePlay(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const { arrive, at } = grounder(b, ctx);
  const f = ctx.play.fielderSlot;
  const lead = leadOut(ctx.play.runnerMoves, ctx.event.batter);
  const firstBase = (lead?.to ?? 2) as BaseIndex;
  const pivot = coverFor(firstBase, f);
  const t1 = throwTo(b, ctx, arrive + F.throwAfter, f, at, firstBase);
  b.anim(t1, fielder(pivot), "catch_fly");
  tagPlay(b, t1, firstBase, true, JUICE.fx.dustTag);
  const t2 = throwTo(b, ctx, t1 + F.throwAfter, pivot, basePos(firstBase), 1);
  b.anim(t2, fielder(coverFor(1, pivot)), "catch_fly");
  tagPlay(b, t2, 1, true, JUICE.fx.dustTag);

  const t0 = breakAt();
  const dp = JUICE.doublePlay;
  runLegs(b, ctx, t0, ctx.play.runnerMoves, { legDur: dp.batterLeg, only: (m) => m.runner === ctx.event.batter });
  runLegs(b, ctx, t0, ctx.play.runnerMoves, { legDur: dp.leadLeg, only: (m) => m.runner !== ctx.event.batter });
  scoreIfRuns(b, ctx, t2);
  return finish(b, ctx, budget("DP"));
}

export function buildFieldersChoice(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const { arrive, at } = grounder(b, ctx);
  const f = ctx.play.fielderSlot;
  const lead = leadOut(ctx.play.runnerMoves, ctx.event.batter);
  const base = (lead?.to ?? 2) as BaseIndex;
  const t1 = throwTo(b, ctx, arrive + F.throwAfter, f, at, base);
  b.anim(t1, fielder(coverFor(base, f)), "catch_fly");
  tagPlay(b, t1, base, true, JUICE.fx.dustTag);
  const end = runLegs(b, ctx, breakAt(), ctx.play.runnerMoves, { legDur: JUICE.legs.out });
  scoreIfRuns(b, ctx, Math.min(end, budget("FC")));
  return finish(b, ctx, budget("FC"));
}

export function buildError(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const { arrive } = grounder(b, ctx);
  const f = fielder(ctx.play.fielderSlot);
  b.anim(arrive + F.errorDropAfter, f, "drop");
  const boo = arrive + F.booAfter;
  b.fx(boo, "boo", { at: "crowd" });
  b.sfx(boo, "crowd_boo", JUICE.crowdBooVolume);
  b.shake(boo, JUICE.shake.error.amp, JUICE.shake.error.dur);
  b.haptic(boo, "light");
  const end = runLegs(b, ctx, breakAt(), ctx.play.runnerMoves, { legDur: JUICE.legs.hit, endBy: budget("E") - JUICE.arriveBefore });
  scoreIfRuns(b, ctx, Math.min(end, budget("E")));
  return finish(b, ctx, budget("E"));
}

const INFIELD: readonly Pos[] = ["C", "1B", "2B", "3B", "SS"];

export function buildSacrificeBunt(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  openPitch(b, ctx);
  const tc = JUICE.contactAt.out;
  b.anim(tc, "batter", "bunt");
  b.sfx(tc, "bat_crack_weak");
  b.cam(tc + F.camDelay, "CAM_FIELD", { ease: JUICE.camera.ease });
  const f: Pos = INFIELD.includes(ctx.play.fielderSlot) ? ctx.play.fielderSlot : "3B";
  const path = buntPath(ctx.layout[f], F.buntCharge);
  b.ball(tc, path);
  b.move(tc + F.camDelay, fielder(f), path.to, F.buntCharge, "outCubic", "run");
  const arrive = tc + F.camDelay + F.buntCharge;
  b.anim(arrive, fielder(f), "field_ground");
  const call = throwTo(b, ctx, arrive + F.throwAfter, f, path.to, 1);
  outCall(b, call, coverFor(1, f));
  runLegs(b, ctx, breakAt(), ctx.play.runnerMoves, { legDur: JUICE.legs.out });
  return finish(b, ctx, budget("SH"));
}
