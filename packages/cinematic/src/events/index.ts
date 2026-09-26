/**
 * One timeline builder per engine event type. The Record is exhaustive over
 * `EventType`, so adding an event type to the protocol fails typecheck here
 * until it gets a builder.
 */
import type { EventType, GameEvent } from "@dugout/protocol";
import type { Timeline } from "../dsl.js";
import { buildSteal } from "./bases.js";
import { createEventContext, type EventTimelineBuilder } from "./common.js";
import { buildFlyOut, buildLineOut, buildPopOut, buildSacFly } from "./flies.js";
import { buildGameEnd, buildInningEnd, buildPitchingChange } from "./game.js";
import { buildDoublePlay, buildError, buildFieldersChoice, buildGroundOut, buildSacrificeBunt } from "./grounders.js";
import { buildDouble, buildHomeRun, buildSingle, buildTriple } from "./hits.js";
import { buildHitByPitch, buildStrikeout, buildWalk } from "./plate.js";

export const EVENT_TIMELINE_BUILDERS: Record<EventType, EventTimelineBuilder> = {
  BB: buildWalk,
  HBP: buildHitByPitch,
  K: buildStrikeout,
  HR: buildHomeRun,
  "1B": buildSingle,
  "2B": buildDouble,
  "3B": buildTriple,
  GO: buildGroundOut,
  FO: buildFlyOut,
  LO: buildLineOut,
  PO: buildPopOut,
  DP: buildDoublePlay,
  SF: buildSacFly,
  SH: buildSacrificeBunt,
  E: buildError,
  FC: buildFieldersChoice,
  SB: buildSteal,
  CS: buildSteal,
  PITCHING_CHANGE: buildPitchingChange,
  INNING_END: buildInningEnd,
  GAME_END: (ctx) => buildGameEnd(ctx),
};

/** Builds the 1× timeline for one event. `seed` + `index` fix all jitter. */
export function buildEventTimeline(event: GameEvent, index = 0, seed = 0): Timeline {
  return EVENT_TIMELINE_BUILDERS[event.type](createEventContext(event, index, seed));
}
