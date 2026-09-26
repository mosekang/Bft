/**
 * Game-flow timelines: pitching change, inning transition, game end and the
 * reel's summary cards (§16.3, §16.6).
 */
import { FIELD_COORDS, type GameEvent } from "@dugout/protocol";
import { TimelineBuilder, type Side, type Timeline } from "../dsl.js";
import { JUICE } from "../juice.js";
import { budget, finish, type EventContext } from "./common.js";

const FLOW = JUICE.flow;

export const inningLabel = (inning: number, half: "T" | "B"): string => `INNING ${inning}${half}`;

export function nextHalf(inning: number, half: "T" | "B"): { inning: number; half: "T" | "B" } {
  return half === "T" ? { inning, half: "B" } : { inning: inning + 1, half: "T" };
}

/** 0.4 s scoreboard card for a new half-inning (used by the reel). */
export function buildInningTransition(inning: number, half: "T" | "B", id: string, eventRange?: [number, number]): Timeline {
  const b = new TimelineBuilder();
  b.cam(0, "CAM_BOARD");
  b.board(0, inningLabel(inning, half), true);
  return b.build({ id, type: "INNING", duration: budget("INNING"), ...(eventRange ? { eventRange } : {}) });
}

/** INNING_END event: announces the next half-inning. */
export function buildInningEnd(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const next = nextHalf(ctx.event.inning, ctx.event.half);
  b.cam(0, "CAM_BOARD");
  b.board(0, inningLabel(next.inning, next.half), true);
  return finish(b, ctx, budget("INNING_END"));
}

export function buildPitchingChange(ctx: EventContext): Timeline {
  const b = new TimelineBuilder();
  const pc = FLOW.pitchingChange;
  b.caption(0, ctx.index);
  b.cam(0, "CAM_FIELD", { follow: "pitcher", ease: JUICE.camera.ease });
  b.board(0, "PITCHING CHANGE");
  b.move(pc.walkAt, "pitcher", [...FIELD_COORDS.P], pc.walkDur, "inOutCubic", "walk_to_slot");
  b.anim(pc.walkAt + pc.walkDur, "pitcher", "idle_pitcher", { loop: true });
  return finish(b, ctx, budget("PITCHING_CHANGE"));
}

/** Winner side from the final score (null = draw). */
export function winnerSide(e: GameEvent): Side | null {
  if (e.meta?.["draw"] === true) return null;
  const [away, home] = e.scoreAfter;
  return away === home ? null : away > home ? "away" : "home";
}

export function buildGameEnd(ctx: EventContext, winner: Side | null = winnerSide(ctx.event)): Timeline {
  const b = new TimelineBuilder();
  const g = FLOW.gameEnd;
  b.caption(0, ctx.index);
  b.score(0, ctx.event.scoreAfter);
  if (winner === null) {
    b.cam(0, "CAM_BOARD");
    b.board(0, "DRAW", true);
    b.anim(g.celebrateAt, { dugout: "home" }, "dugout_sad", { loop: true });
    b.anim(g.celebrateAt, { dugout: "away" }, "dugout_sad", { loop: true });
    b.sfx(g.celebrateAt, "crowd_ambience");
    return finish(b, ctx, budget("GAME_END"));
  }
  const loser: Side = winner === "home" ? "away" : "home";
  b.cam(0, "CAM_FIELD", { ease: JUICE.camera.ease });
  b.board(0, "FINAL", true);
  b.anim(g.celebrateAt, { dugout: winner }, "celebrate", { loop: true });
  b.anim(g.celebrateAt, { dugout: loser }, "dugout_sad", { loop: true });
  b.fx(g.celebrateAt, "crowdWave", { at: "crowd" });
  b.sfx(g.celebrateAt, "fanfare");
  b.haptic(g.celebrateAt, "medium");
  b.cam(g.crowdAt, "CAM_CROWD", { ease: JUICE.camera.ease });
  return finish(b, ctx, budget("GAME_END"));
}

const NON_PLAY = new Set(["INNING_END", "GAME_END", "PITCHING_CHANGE"]);
export const isPlayEvent = (e: GameEvent): boolean => !NON_PLAY.has(e.type);

/** Scoreboard text for a skipped span, e.g. "INN 3-5 NO RUNS" or "INN 4 AWAY 1 HOME 0". */
export function summaryText(events: readonly GameEvent[]): string {
  const plays = events.filter(isPlayEvent);
  const span = plays.length > 0 ? plays : events;
  const first = span[0];
  const last = span[span.length - 1];
  if (!first || !last) return "NO PLAYS";
  const inn = first.inning === last.inning ? `INN ${first.inning}` : `INN ${first.inning}-${last.inning}`;
  const away = last.scoreAfter[0] - first.scoreBefore[0];
  const home = last.scoreAfter[1] - first.scoreBefore[1];
  return away === 0 && home === 0 ? `${inn} NO RUNS` : `${inn} AWAY ${away} HOME ${home}`;
}

/** 0.6 s summary card for events [from, to] (inclusive). */
export function buildSummary(events: readonly GameEvent[], from: number, to: number): Timeline {
  const span = events.slice(from, to + 1);
  const b = new TimelineBuilder();
  b.cam(0, "CAM_BOARD");
  b.board(0, summaryText(span));
  const first = span[0];
  const last = span[span.length - 1];
  if (first && last && (last.scoreAfter[0] !== first.scoreBefore[0] || last.scoreAfter[1] !== first.scoreBefore[1])) {
    b.score(FLOW.summary.scoreAt, last.scoreAfter);
  }
  return b.build({ id: `sum${from}-${to}`, type: "SUMMARY", duration: budget("SUMMARY"), eventRange: [from, to] });
}
