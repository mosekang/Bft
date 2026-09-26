/**
 * Highlight reel builder (DESIGN v3 §16.6): highlight plays, summary cards
 * for the gaps between them, inning transitions, adjacent pitching changes
 * and the game-end timeline, fitted to the reel time budget.
 */
import type { GameEvent, Matchup } from "@dugout/protocol";
import { round3, scaleTimeline, type Side, type Timeline } from "./dsl.js";
import { createEventContext } from "./events/common.js";
import { buildGameEnd, buildInningTransition, buildSummary, isPlayEvent } from "./events/game.js";
import { buildEventTimeline } from "./events/index.js";
import { isBigStrikeout } from "./events/plate.js";
import { JUICE } from "./juice.js";
import { hashString } from "./rng.js";

export interface ReelOptions {
  speed?: 1 | 2;
  seed?: number;
  /** Korean-Series best-of-3 mode: ≈12 s, at most 4 highlights. */
  compact?: boolean;
}

export interface Reel {
  timelines: Timeline[];
  /** Total seconds at the reel's speed. */
  duration: number;
  speed: 1 | 2;
  seed: number;
  compact: boolean;
  /** Event indices shown as full highlight timelines. */
  highlights: number[];
  /** Start offset (seconds) of each timeline. */
  starts: number[];
  /**
   * For every event index, the timeline that shows it (its highlight,
   * summary or card), or else the next timeline after it.
   */
  eventIndexToTimeline: number[];
}

export function matchupSeed(m: Matchup): number {
  return hashString(`${m.home}|${m.away}|${m.score[0]}-${m.score[1]}|${m.events.length}|${m.game ?? 0}`);
}

/** Ranking score used when there are more highlight candidates than slots. */
export function highlightImportance(e: GameEvent, index: number, seed: number): number {
  const w = JUICE.reel.importance;
  const ctx = createEventContext(e, index, seed);
  return ctx.play.runs * w.perRun + (w.type[e.type] ?? 0) + ctx.play.leverage * w.perLeverage + (isBigStrikeout(ctx) ? w.bigStrikeout : 0);
}

/** Highlight indices: `meta.isHighlight` flags when present, else `matchup.highlights`. */
export function selectHighlights(m: Matchup, max: number, seed: number): number[] {
  const valid = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < m.events.length && isPlayEvent(m.events[i]!);
  const flagged = m.events.flatMap((e, i) => (e.meta?.["isHighlight"] === true ? [i] : []));
  const base = [...new Set((flagged.length > 0 ? flagged : m.highlights).filter(valid))].sort((a, b) => a - b);
  if (base.length <= max) return base;
  return rank(m, base, seed).slice(0, max).sort((a, b) => a - b);
}

function rank(m: Matchup, indices: readonly number[], seed: number): number[] {
  const score = (i: number): number => highlightImportance(m.events[i]!, i, seed);
  return [...indices].sort((a, b) => score(b) - score(a) || a - b);
}

interface Plan {
  highlights: number[];
  pitchingChanges: boolean;
  transitions: boolean;
  /** Gap start indices whose summary card is dropped. */
  dropped: Set<number>;
}

interface Gap {
  from: number;
  runs: number;
}

interface Assembled {
  timelines: Timeline[];
  map: number[];
  gaps: Gap[];
  hasPitchingChange: boolean;
  hasTransition: boolean;
}

const halfKey = (e: GameEvent): string => `${e.inning}${e.half}`;

function winnerSideOf(m: Matchup): Side | null {
  if (m.winner === null) return null;
  return m.winner === m.home ? "home" : m.winner === m.away ? "away" : null;
}

function assemble(m: Matchup, plan: Plan, seed: number): Assembled {
  const events = m.events;
  const map = new Array<number>(events.length).fill(-1);
  const timelines: Timeline[] = [];
  const gaps: Gap[] = [];
  let hasPitchingChange = false;
  let hasTransition = false;
  const push = (tl: Timeline, from: number, to: number): void => {
    timelines.push(tl);
    for (let i = from; i <= to; i++) if (i >= 0 && i < map.length && map[i] === -1) map[i] = timelines.length - 1;
  };
  let gameEnd = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.type === "GAME_END") {
      gameEnd = i;
      break;
    }
  }
  const end = gameEnd >= 0 ? gameEnd : events.length;
  let prev = -1;
  let lastHalf: string | null = null;

  const gapCard = (from: number, to: number): void => {
    const span = events.slice(from, to + 1);
    const plays = span.filter(isPlayEvent);
    if (plays.length === 0) return;
    const first = span[0]!;
    const last = span[span.length - 1]!;
    gaps.push({ from, runs: last.scoreAfter[0] + last.scoreAfter[1] - first.scoreBefore[0] - first.scoreBefore[1] });
    if (plan.dropped.has(from)) return;
    push(buildSummary(events, from, to), from, to);
    lastHalf = halfKey(plays[plays.length - 1]!);
  };

  for (const h of plan.highlights) {
    const e = events[h]!;
    gapCard(prev + 1, h - 1);
    if (plan.transitions && lastHalf !== null && lastHalf !== halfKey(e)) {
      push(buildInningTransition(e.inning, e.half, `inn${h}-${halfKey(e)}`, [prev + 1, h - 1]), prev + 1, h - 1);
      hasTransition = true;
    }
    const pc = h - 1 > prev ? events[h - 1] : undefined;
    if (plan.pitchingChanges && pc?.type === "PITCHING_CHANGE") {
      push(buildEventTimeline(pc, h - 1, seed), h - 1, h - 1);
      hasPitchingChange = true;
    }
    push(buildEventTimeline(e, h, seed), h, h);
    lastHalf = halfKey(e);
    prev = h;
  }
  gapCard(prev + 1, end - 1);

  const endEvent: GameEvent = events[gameEnd] ?? {
    inning: events[events.length - 1]?.inning ?? 1,
    half: "B",
    type: "GAME_END",
    batter: "",
    pitcher: "",
    outs: 3,
    runners: [false, false, false],
    scoreBefore: [m.score[0], m.score[1]],
    scoreAfter: [m.score[0], m.score[1]],
  };
  const endIndex = gameEnd >= 0 ? gameEnd : events.length;
  push(buildGameEnd(createEventContext(endEvent, endIndex, seed), winnerSideOf(m)), endIndex, endIndex);

  // Unshown events point at the next timeline shown after them.
  let next = timelines.length - 1;
  for (let i = map.length - 1; i >= 0; i--) {
    if (map[i] === -1) map[i] = next;
    else next = map[i]!;
  }
  return { timelines, map, gaps, hasPitchingChange, hasTransition };
}

const total = (tls: readonly Timeline[]): number => round3(tls.reduce((a, t) => a + t.duration, 0));

/** Removes one optional card (or highlight) from the plan; false when nothing is left to cut. */
function shrink(m: Matchup, plan: Plan, a: Assembled, overMax: boolean, seed: number): boolean {
  if (plan.pitchingChanges && a.hasPitchingChange) return ((plan.pitchingChanges = false), true);
  const kept = a.gaps.filter((g) => !plan.dropped.has(g.from));
  const quiet = kept.find((g) => g.runs === 0);
  if (quiet) return (plan.dropped.add(quiet.from), true);
  if (plan.transitions && a.hasTransition) return ((plan.transitions = false), true);
  const scoring = kept[0];
  if (scoring) return (plan.dropped.add(scoring.from), true);
  if (!overMax || plan.highlights.length <= 1) return false;
  const worst = rank(m, plan.highlights, seed).at(-1);
  plan.highlights = plan.highlights.filter((i) => i !== worst);
  plan.dropped.clear();
  return true;
}

export function buildReel(matchup: Matchup, opts: ReelOptions = {}): Reel {
  const speed = opts.speed ?? 1;
  const compact = opts.compact ?? false;
  const seed = (opts.seed ?? matchupSeed(matchup)) >>> 0;
  const budget = compact ? JUICE.reel.compact : JUICE.reel.normal;
  const plan: Plan = {
    highlights: selectHighlights(matchup, budget.maxHighlights, seed),
    pitchingChanges: true,
    transitions: true,
    dropped: new Set(),
  };
  let a = assemble(matchup, plan, seed);
  for (let guard = 0; guard < matchup.events.length + 32; guard++) {
    const t = total(a.timelines);
    if (t <= budget.target) break;
    if (!shrink(matchup, plan, a, t > budget.max, seed)) break;
    a = assemble(matchup, plan, seed);
  }
  const timelines = a.timelines.map((tl) => scaleTimeline(tl, speed));
  const starts: number[] = [];
  let acc = 0;
  for (const tl of timelines) {
    starts.push(round3(acc));
    acc += tl.duration;
  }
  return {
    timelines,
    duration: total(timelines),
    speed,
    seed,
    compact,
    highlights: [...plan.highlights],
    starts,
    eventIndexToTimeline: a.map,
  };
}
