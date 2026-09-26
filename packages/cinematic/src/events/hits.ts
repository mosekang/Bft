/** Hit timelines: 1B / 2B / 3B (§16.3) and the home run showcase. */
import { battedBallPath } from "../ball.js";
import { TimelineBuilder, type BaseIndex, type Timeline } from "../dsl.js";
import { JUICE } from "../juice.js";
import { basePos } from "../layout.js";
import { budget, contactJuice, fielder, finish, fitLeg, legsOf, openPitch, runLegs, scoreIfRuns, type EventContext } from "./common.js";

function buildBaseHit(ctx: EventContext, type: "1B" | "2B" | "3B"): Timeline {
  const b = new TimelineBuilder();
  const dur = budget(type);
  const { play } = ctx;
  openPitch(b, ctx);
  const launch = contactJuice(b, ctx, JUICE.contactAt.hit);
  const path = battedBallPath({
    bbType: play.bbType,
    direction: play.direction,
    batterHand: play.batterHand,
    power: play.power,
    outcome: "hit",
    hitType: type,
    rng: ctx.rng,
  });
  b.ball(launch, path);
  b.cam(launch, "CAM_BALL", { ease: JUICE.camera.ease });
  b.cam(launch + JUICE.camera.ballShot, "CAM_FIELD", { ease: JUICE.camera.ease });

  // The fielder chases and fails to make the play.
  const f = fielder(play.fielderSlot);
  const attempt = launch + path.flightTime * JUICE.chaseFraction;
  b.move(launch, f, path.to, attempt - launch, "outCubic", "run");
  b.anim(attempt, f, play.bbType === "GB" ? "field_ground" : "catch_fly");

  const t0 = launch + JUICE.runnerBreak;
  const base = type === "1B" ? JUICE.legs.hit : type === "2B" ? JUICE.legs.double : JUICE.legs.triple;
  const legDur = fitLeg(base, t0, dur - JUICE.arriveBefore, play.runnerMoves);
  const extraBase = type !== "1B";
  const batterEnd = runLegs(b, ctx, t0, play.runnerMoves, {
    legDur,
    ...(extraBase ? { finalClip: "run_slide" as const } : {}),
    only: (m) => m.runner === ctx.event.batter,
  });
  const othersEnd = runLegs(b, ctx, t0, play.runnerMoves, { legDur, only: (m) => m.runner !== ctx.event.batter });
  const arrive = Math.max(batterEnd, othersEnd);

  if (extraBase) {
    const batterBase = (play.runnerMoves.find((m) => m.runner === ctx.event.batter)?.to ?? (type === "2B" ? 2 : 3)) as BaseIndex;
    b.anim(batterEnd, "umpire", "umpire_safe");
    b.sfx(batterEnd, "slide");
    b.sfx(batterEnd, "dust");
    b.fx(batterEnd, "dust", { at: basePos(batterBase), count: JUICE.fx.dustSlide });
    b.sfx(batterEnd, "ump_safe");
  } else if (play.runs > 0) {
    // Close play at the plate.
    b.anim(othersEnd, "umpire", "umpire_safe");
    b.sfx(othersEnd, "ump_safe");
  }
  scoreIfRuns(b, ctx, arrive);
  return finish(b, ctx, dur);
}

export const buildSingle = (ctx: EventContext): Timeline => buildBaseHit(ctx, "1B");
export const buildDouble = (ctx: EventContext): Timeline => buildBaseHit(ctx, "2B");
export const buildTriple = (ctx: EventContext): Timeline => buildBaseHit(ctx, "3B");

export function buildHomeRun(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const hr = JUICE.hr;
  const { play } = ctx;
  openPitch(b, ctx);
  const launch = contactJuice(b, ctx, JUICE.contactAt.hr);
  const path = battedBallPath({
    bbType: "FB",
    direction: play.direction,
    batterHand: play.batterHand,
    power: play.power,
    outcome: "hr",
    rng: ctx.rng,
  });
  b.ball(launch, path);
  b.cam(launch, "CAM_BALL", { ease: JUICE.camera.ease });
  b.timeScale(launch, hr.slowMo.scale, hr.slowMo.dur);
  b.anim(launch, "batter", "react_hr");

  const c = hr.crowdAt;
  b.cam(c, "CAM_CROWD", { ease: JUICE.camera.ease });
  b.fx(c, "fireworks", { at: "crowd", count: hr.fireworks });
  b.fx(c, "confetti", { at: "crowd", count: hr.confetti });
  b.fx(c, "crowdWave", { at: "crowd" });
  b.fx(c, "flash", { dur: hr.flashMs / 1000 });
  b.sfx(c, "crowd_hr_roar");
  b.sfx(c, "fireworks");
  b.sfx(c, "fanfare");
  b.haptic(c, "heavy2");
  b.shake(c, JUICE.shake.hr.amp, JUICE.shake.hr.dur);
  b.anim(c, { dugout: ctx.batting }, "dugout_cheer", { loop: true });

  b.cam(hr.trotAt, "CAM_RUNNER", { follow: "batter", ease: JUICE.camera.ease });
  const maxLegs = Math.max(1, ...play.runnerMoves.map(legsOf));
  runLegs(b, ctx, hr.trotAt, play.runnerMoves, { legDur: hr.trotDur / maxLegs, clip: "run_trot" });

  b.cam(hr.boardAt, "CAM_BOARD");
  b.board(hr.boardAt, "HOME RUN", true);
  b.score(hr.scoreAt, ctx.event.scoreAfter);
  return finish(b, ctx, budget("HR"));
}
