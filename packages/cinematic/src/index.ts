/**
 * @dugout/cinematic — turns engine game events into presentation timelines
 * (DESIGN v3 §16–17). Pure data, deterministic, no DOM / three.js.
 */
export * from "./dsl.js";
export * from "./juice.js";
export * from "./shots.js";
export * from "./rng.js";
export * from "./layout.js";
export * from "./ball.js";
export * from "./meta.js";
export { createEventContext, crackSfx, type EventContext, type EventTimelineBuilder } from "./events/common.js";
export { EVENT_TIMELINE_BUILDERS, buildEventTimeline } from "./events/index.js";
export { buildGameEnd, buildInningTransition, buildSummary, inningLabel, isPlayEvent, summaryText, winnerSide } from "./events/game.js";
export * from "./reel.js";
export * from "./validate.js";
