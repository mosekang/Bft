/**
 * Reads `GameEvent.meta` as `PlayMeta` (§16.1) and degrades gracefully for
 * events from older engines: legacy keys (battedBall/direction/fielder) are
 * mapped, missing fields get defaults, runner moves are derived from
 * `runners` and the score change.
 */
import { BB_TYPES, HIT_DIRECTIONS, POS, SWING_KINDS } from "@dugout/protocol";
import type { BbType, EventType, GameEvent, HitDirection, Pos, RunnerMove, SwingKind } from "@dugout/protocol";
import type { Rng } from "./rng.js";

export interface ResolvedPlay {
  /** True when the event carried the v3 PlayMeta fields. */
  hasMeta: boolean;
  bbType: BbType;
  direction: HitDirection;
  fielderSlot: Pos;
  runnerMoves: RunnerMove[];
  pitchCount: number;
  swing: SwingKind;
  leverage: number;
  isHighlight: boolean | undefined;
  batterHand: "L" | "R";
  pitcherHand: "L" | "R";
  power: number;
  /** Runs scored on the play. */
  runs: number;
  basesLoaded: boolean;
  endsInning: boolean;
  anyRunners: boolean;
}

export const DEFAULT_POWER = 60;
export const DEFAULT_PITCH_COUNT = 4;
/** Cumulative pull / center thresholds for a seeded direction when meta has none. */
export const FALLBACK_DIRECTION = { pullBelow: 0.45, centerBelow: 0.8 };

/** Runner id for "whoever stood on base n before the play" when meta lacks ids. */
export const baseRunnerId = (base: 1 | 2 | 3): string => `base:${base}`;

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const hand = (v: unknown): "L" | "R" | undefined => (v === "L" || v === "R" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const LEGACY_BB: Record<string, BbType> = { GROUND: "GB", LINE: "LD", FLY: "FB", POPUP: "PU" };

const TYPE_BB: Partial<Record<EventType, BbType>> = {
  "1B": "LD",
  "2B": "LD",
  "3B": "FB",
  HR: "FB",
  GO: "GB",
  DP: "GB",
  FC: "GB",
  E: "GB",
  SH: "GB",
  FO: "FB",
  SF: "FB",
  LO: "LD",
  PO: "PU",
};

export function runsOn(e: GameEvent): number {
  return Math.max(0, e.scoreAfter[0] + e.scoreAfter[1] - e.scoreBefore[0] - e.scoreBefore[1]);
}

/** Default fielder for a batted ball when the event names none. */
export function defaultFielder(bb: BbType, dir: HitDirection, batterHand: "L" | "R"): Pos {
  const pullLeft = batterHand === "R";
  if (bb === "GB") return dir === "center" ? "SS" : (dir === "pull") === pullLeft ? "3B" : "2B";
  if (bb === "PU") return dir === "center" ? "2B" : (dir === "pull") === pullLeft ? "3B" : "1B";
  return dir === "center" ? "CF" : (dir === "pull") === pullLeft ? "LF" : "RF";
}

function defaultSwing(type: EventType): SwingKind {
  if (type === "K") return "miss";
  if (type === "SH") return "bunt";
  if (["BB", "HBP", "SB", "CS", "PITCHING_CHANGE", "INNING_END", "GAME_END"].includes(type)) return "none";
  return "contact";
}

function isRunnerMove(v: unknown): v is RunnerMove {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m["runner"] === "string" && [0, 1, 2, 3].includes(m["from"] as number) && [1, 2, 3, 4].includes(m["to"] as number);
}

/** Derives runner moves from `runners`, type and score change (older engines). */
export function deriveRunnerMoves(e: GameEvent): RunnerMove[] {
  const runs = runsOn(e);
  const on = e.runners;
  const meta = e.meta ?? {};
  const id = (b: 1 | 2 | 3): string => baseRunnerId(b);
  const occupied = ([3, 2, 1] as const).filter((b) => on[b - 1]);
  const moves: RunnerMove[] = [];
  const advanceAll = (batterTo: 1 | 2 | 3 | 4, basesAhead: number): void => {
    let scored = 0;
    for (const b of occupied) {
      const to = Math.min(4, b + basesAhead) as 1 | 2 | 3 | 4;
      if (to === 4) scored++;
      moves.push({ runner: id(b), from: b, to });
    }
    // Extra runs (e.g. runner scoring from first on a double): push lead runners home.
    for (const m of moves) {
      if (scored >= runs) break;
      if (m.to !== 4) {
        m.to = 4;
        scored++;
      }
    }
    moves.push({ runner: e.batter, from: 0, to: batterTo });
  };
  const forced = (): void => {
    const f1 = on[0];
    const f2 = f1 && on[1];
    const f3 = f2 && on[2];
    if (f3) moves.push({ runner: id(3), from: 3, to: 4 });
    if (f2) moves.push({ runner: id(2), from: 2, to: 3 });
    if (f1) moves.push({ runner: id(1), from: 1, to: 2 });
    let scored = f3 ? 1 : 0;
    for (const b of occupied) {
      if (scored >= runs) break;
      const existing = moves.find((m) => m.runner === id(b));
      if (existing && existing.to !== 4) {
        existing.to = 4;
        scored++;
      } else if (!existing) {
        moves.push({ runner: id(b), from: b, to: 4 });
        scored++;
      }
    }
    moves.push({ runner: e.batter, from: 0, to: 1 });
  };
  const stealer = typeof meta["runner"] === "string" ? meta["runner"] : id(on[0] ? 1 : 2);
  const stealFrom: 1 | 2 = on[0] || !on[1] ? 1 : 2;
  switch (e.type) {
    case "HR":
      advanceAll(4, 4);
      break;
    case "3B":
      advanceAll(3, 3);
      break;
    case "2B":
      advanceAll(2, 2);
      break;
    case "1B":
      advanceAll(1, 1);
      break;
    case "BB":
    case "HBP":
    case "E":
      forced();
      break;
    case "SF":
      if (on[2]) moves.push({ runner: id(3), from: 3, to: 4 });
      break;
    case "GO":
      if (on[2] && runs > 0) moves.push({ runner: id(3), from: 3, to: 4 });
      if (e.outs < 2 && on[1]) moves.push({ runner: id(2), from: 2, to: 3 });
      if (e.outs < 2 && on[0]) moves.push({ runner: id(1), from: 1, to: 2 });
      moves.push({ runner: e.batter, from: 0, to: 1, out: true });
      break;
    case "DP":
      if (on[2] && runs > 0) moves.push({ runner: id(3), from: 3, to: 4 });
      if (on[1]) moves.push({ runner: id(2), from: 2, to: 3 });
      moves.push({ runner: id(1), from: 1, to: 2, out: true });
      moves.push({ runner: e.batter, from: 0, to: 1, out: true });
      break;
    case "FC":
      if (on[1] && !on[2]) moves.push({ runner: id(2), from: 2, to: 3 });
      if (on[0]) moves.push({ runner: id(1), from: 1, to: 2, out: true });
      moves.push({ runner: e.batter, from: 0, to: 1 });
      break;
    case "SH":
      if (meta["success"] !== false && on[0]) moves.push({ runner: id(1), from: 1, to: 2 });
      moves.push({ runner: e.batter, from: 0, to: 1, out: true });
      break;
    case "SB":
      moves.push({ runner: stealer, from: stealFrom, to: stealFrom === 1 ? 2 : 3 });
      break;
    case "CS":
      moves.push({ runner: stealer, from: stealFrom, to: stealFrom === 1 ? 2 : 3, out: true });
      break;
    default:
      break;
  }
  return moves;
}

/** Resolves PlayMeta for an event, filling gaps deterministically. */
export function resolvePlay(e: GameEvent, rng: Rng): ResolvedPlay {
  const m = e.meta ?? {};
  const hasMeta = Array.isArray(m["runnerMoves"]) && typeof m["swing"] === "string";
  const batterHand = hand(m["batterHand"]) ?? "R";
  const legacyBb = typeof m["battedBall"] === "string" ? LEGACY_BB[m["battedBall"]] : undefined;
  const bbType: BbType = isOneOf(BB_TYPES, m["bbType"]) ? m["bbType"] : (legacyBb ?? TYPE_BB[e.type] ?? "LD");
  const rawDir = typeof m["direction"] === "string" ? m["direction"].toLowerCase() : undefined;
  const pick = rng.next();
  const direction: HitDirection = isOneOf(HIT_DIRECTIONS, rawDir) ? rawDir : pick < FALLBACK_DIRECTION.pullBelow ? "pull" : pick < FALLBACK_DIRECTION.centerBelow ? "center" : "oppo";
  const fielderRaw = m["fielderSlot"] ?? m["fielder"];
  const fielderSlot: Pos = isOneOf(POS, fielderRaw) && fielderRaw !== "DH" ? fielderRaw : defaultFielder(bbType, direction, batterHand);
  const moves = Array.isArray(m["runnerMoves"]) ? m["runnerMoves"].filter(isRunnerMove) : undefined;
  const lead = Math.abs(e.scoreBefore[0] - e.scoreBefore[1]);
  const leverage = num(m["leverage"]) ?? (e.inning >= 7 ? 2 : 1) * (lead <= 2 ? 2 : 1);
  const isHighlight = typeof m["isHighlight"] === "boolean" ? m["isHighlight"] : undefined;
  return {
    hasMeta,
    bbType,
    direction,
    fielderSlot,
    runnerMoves: moves ?? deriveRunnerMoves(e),
    pitchCount: num(m["pitchCount"]) ?? DEFAULT_PITCH_COUNT,
    swing: isOneOf(SWING_KINDS, m["swing"]) ? m["swing"] : defaultSwing(e.type),
    leverage,
    isHighlight,
    batterHand,
    pitcherHand: hand(m["pitcherHand"]) ?? "R",
    power: num(m["power"]) ?? DEFAULT_POWER,
    runs: runsOn(e),
    basesLoaded: m["basesLoaded"] === true || e.runners.every(Boolean),
    endsInning: m["endsInning"] === true || (e.type === "K" && e.outs === 2),
    anyRunners: e.runners.some(Boolean),
  };
}
