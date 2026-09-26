/** Plate-only outcomes: strikeout, walk, hit by pitch (§16.3). */
import { TimelineBuilder, type Timeline } from "../dsl.js";
import { JUICE } from "../juice.js";
import { budget, finish, openPitch, runLegs, scoreIfRuns, type EventContext } from "./common.js";

export function isBigStrikeout(ctx: EventContext): boolean {
  return ctx.event.type === "K" && ctx.play.basesLoaded && ctx.play.endsInning;
}

export function buildStrikeout(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const k = JUICE.strikeout;
  openPitch(b, ctx);
  const ts = JUICE.contactAt.strike;
  if (ctx.play.swing === "looking" || ctx.play.swing === "none") {
    b.anim(ts, "batter", "idle_batter");
  } else {
    b.anim(ts, "batter", ctx.play.swing === "bunt" ? "bunt" : "swing_miss");
  }
  const call = ts + k.callAfter;
  b.cam(call, "CAM_PUNCH");
  b.anim(call, "umpire", "umpire_strike");
  b.hitstop(call, JUICE.hitstopMs.strike);
  b.sfx(call, "glove_pop_hard");
  b.sfx(call, "ump_strike");
  b.haptic(call, "light");
  b.anim(ts + k.reactAfter, "batter", "react_strikeout");

  if (!isBigStrikeout(ctx)) return finish(b, ctx, budget("K"));
  const c = k.celebrateAt;
  b.cam(c, "CAM_FIELD", { follow: "pitcher", ease: JUICE.camera.ease });
  b.anim(c, "pitcher", "celebrate");
  b.anim(c, { dugout: ctx.fielding }, "dugout_cheer", { loop: true });
  b.anim(c, { dugout: ctx.batting }, "dugout_sad", { loop: true });
  b.fx(c, "crowdWave", { at: "crowd" });
  b.haptic(c, "medium");
  return finish(b, ctx, budget("K_BASES_LOADED"), "K_BASES_LOADED");
}

export function buildWalk(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const dur = budget("BB");
  openPitch(b, ctx);
  const t = JUICE.contactAt.ball;
  b.sfx(t, "glove_pop_soft");
  b.sfx(t, "ump_ball");
  const go = JUICE.walk.goAt;
  b.cam(go, "CAM_FIELD");
  const end = runLegs(b, ctx, go, ctx.play.runnerMoves, { legDur: JUICE.legs.walk, endBy: dur });
  scoreIfRuns(b, ctx, Math.min(end, dur));
  return finish(b, ctx, dur);
}

export function buildHitByPitch(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const dur = budget("HBP");
  openPitch(b, ctx);
  const t = JUICE.contactAt.ball;
  b.anim(t, "batter", "swing_check");
  b.hitstop(t, JUICE.hitstopMs.tag);
  b.sfx(t, "glove_pop_soft");
  b.shake(t, JUICE.shake.error.amp, JUICE.shake.error.dur);
  b.haptic(t, "light");
  b.fx(t, "boo", { at: "crowd" });
  const go = JUICE.walk.goAt + JUICE.runnerBreak;
  b.cam(go, "CAM_FIELD");
  const end = runLegs(b, ctx, go, ctx.play.runnerMoves, { legDur: JUICE.legs.walk, endBy: dur });
  scoreIfRuns(b, ctx, Math.min(end, dur));
  return finish(b, ctx, dur);
}
