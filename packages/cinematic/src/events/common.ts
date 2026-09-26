/**
 * Shared pieces for per-event timeline builders: the event context, the
 * pitch/contact openers, runner legs and small ActorRef helpers.
 */
import type { ClipName, GameEvent, Pos, RunnerMove, SfxId } from "@dugout/protocol";
import { TimelineBuilder, type ActorRef, type BaseIndex, type BudgetKey, type Side, type Timeline, type Vec3 } from "../dsl.js";
import { JUICE } from "../juice.js";
import { basePos, fieldingLayout, type FieldLayout } from "../layout.js";
import { resolvePlay, type ResolvedPlay } from "../meta.js";
import { createRng, mixSeed, type Rng } from "../rng.js";

export interface EventContext {
  event: GameEvent;
  index: number;
  play: ResolvedPlay;
  rng: Rng;
  layout: FieldLayout;
  /** Side in the field for this half-inning. */
  fielding: Side;
  batting: Side;
}

export type EventTimelineBuilder = (ctx: EventContext) => Timeline;

/** Builds the context for event `index`; the RNG stream depends only on (seed, index). */
export function createEventContext(event: GameEvent, index: number, seed = 0): EventContext {
  const rng = createRng(mixSeed(seed >>> 0, index));
  const play = resolvePlay(event, rng);
  return {
    event,
    index,
    play,
    rng,
    layout: fieldingLayout(play.batterHand),
    fielding: event.half === "T" ? "home" : "away",
    batting: event.half === "T" ? "away" : "home",
  };
}

export function finish(b: TimelineBuilder, ctx: EventContext, duration: number, budgetKey?: BudgetKey): Timeline {
  const meta = { id: `ev${ctx.index}-${ctx.event.type}`, type: ctx.event.type, duration, eventIndex: ctx.index };
  return b.build(budgetKey ? { ...meta, budgetKey } : meta);
}

export const budget = (key: BudgetKey): number => JUICE.budget[key];

export const fielder = (pos: Pos): ActorRef => ({ fielder: pos });

export function runnerActor(ctx: EventContext, runner: string): ActorRef {
  return runner === ctx.event.batter ? "batter" : { runner };
}

export function crackSfx(power: number): SfxId {
  if (power < JUICE.batCrack.weakBelow) return "bat_crack_weak";
  if (power < JUICE.batCrack.midBelow) return "bat_crack_mid";
  return "bat_crack_strong";
}

/** Caption + CAM_PITCH + windup (stretch with runners on). */
export function openPitch(b: TimelineBuilder, ctx: EventContext): void {
  b.caption(0, ctx.index);
  b.cam(0, "CAM_PITCH", { ease: JUICE.camera.ease });
  b.anim(0, "pitcher", ctx.play.anyRunners ? "pitch_stretch" : "pitch_windup");
  b.anim(0, "batter", "idle_batter", { loop: true });
}

/** Full hit juice at contact; returns the time the ball leaves the bat. */
export function contactJuice(b: TimelineBuilder, ctx: EventContext, t: number): number {
  const stop = JUICE.hitstopMs.contact;
  b.anim(t, "batter", "swing_contact");
  b.hitstop(t, stop);
  b.fx(t, "spark", { at: "batter", count: JUICE.fx.spark });
  b.sfx(t, crackSfx(ctx.play.power));
  b.haptic(t, "medium");
  b.shake(t, JUICE.shake.contact.amp, JUICE.shake.contact.dur);
  return t + stop / 1000;
}

/** Light contact for routine outs: swing + crack only. */
export function contactLight(b: TimelineBuilder, ctx: EventContext, t: number): number {
  b.anim(t, "batter", ctx.play.swing === "bunt" ? "bunt" : "swing_contact");
  b.sfx(t, ctx.play.swing === "bunt" ? "bat_crack_weak" : crackSfx(ctx.play.power));
  return t;
}

export interface LegOptions {
  legDur: number;
  clip?: ClipName;
  /** Clip for the final leg (e.g. run_slide). */
  finalClip?: ClipName;
  /** Only moves matching this predicate. */
  only?: (m: RunnerMove) => boolean;
  /** Shorten legs so every runner (of all moves) arrives by this time. */
  endBy?: number;
}

/** Emits base-to-base legs for every runner move; returns the latest arrival time. */
export function runLegs(b: TimelineBuilder, ctx: EventContext, t0: number, moves: readonly RunnerMove[], opts: LegOptions): number {
  let end = t0;
  const legDur = opts.endBy === undefined ? opts.legDur : fitLeg(opts.legDur, t0, opts.endBy, moves);
  for (const m of moves) {
    if (opts.only && !opts.only(m)) continue;
    const who = runnerActor(ctx, m.runner);
    let t = t0;
    for (let base = m.from + 1; base <= m.to; base++) {
      const last = base === m.to;
      const clip = last && opts.finalClip ? opts.finalClip : (opts.clip ?? "run");
      b.move(t, who, { base: base as BaseIndex }, legDur, "linear", clip);
      t += legDur;
    }
    end = Math.max(end, t);
  }
  return end;
}

export function legsOf(m: RunnerMove): number {
  return m.to - m.from;
}

/** Leg duration that lets every runner arrive by `end`. */
export function fitLeg(legDur: number, t0: number, end: number, moves: readonly RunnerMove[]): number {
  const maxLegs = Math.max(1, ...moves.map(legsOf));
  return Math.max(0.05, Math.min(legDur, (end - t0) / maxLegs));
}

export function scoreIfRuns(b: TimelineBuilder, ctx: EventContext, t: number): void {
  if (ctx.play.runs > 0) b.score(t, ctx.event.scoreAfter);
}

/** Tag / force play at a base: umpire call with its juice. */
export function tagPlay(b: TimelineBuilder, t: number, base: BaseIndex, out: boolean, dust: number): void {
  b.anim(t, "umpire", out ? "umpire_out" : "umpire_safe");
  b.hitstop(t, JUICE.hitstopMs.tag);
  b.fx(t, "dust", { at: basePos(base), count: dust });
  b.sfx(t, out ? "glove_pop_soft" : "slide");
  b.sfx(t, out ? "ump_out" : "ump_safe");
  b.haptic(t, "light");
}

/** Fielder covering a base on a throw. */
export function coverFor(base: BaseIndex, handledBy: Pos): Pos {
  if (base === 1) return handledBy === "1B" ? "2B" : "1B";
  if (base === 2) return handledBy === "SS" || handledBy === "3B" || handledBy === "LF" ? "2B" : "SS";
  if (base === 3) return handledBy === "3B" ? "SS" : "3B";
  return "C";
}

export function layoutPos(ctx: EventContext, pos: Pos): Vec3 {
  return ctx.layout[pos];
}
