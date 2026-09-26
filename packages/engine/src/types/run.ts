import type { BallparkId, CardId, ItemId, PhilosophyId, TeamId, TemplateId } from "./common.js";
import type { Bench, Board } from "./board.js";
import type { GameResult } from "./game.js";
import type { PlayerCard, Cost } from "./player.js";
import type { RngState } from "../rng.js";

// ---------------------------------------------------------------------------
// Stages and rounds
// ---------------------------------------------------------------------------

export type StageKind = "SPRING_CAMP" | "REGULAR_SEASON" | "POSTSEASON";

export type RoundKind =
  | "PVE" // training team (spring camp)
  | "PVP" // vs another team
  | "FA_MARKET" // carousel, then PvP
  | "ALL_STAR" // event: item
  | "RAIN_OUT" // event: gold only, fatigue heals
  | "TRADE_DEADLINE" // event: swap a bench card
  | "LEGEND_MATCH" // event: PvE boss
  | "PLAYOFF" // postseason PvP, double damage
  | "FINAL_SERIES"; // best-of-3

export interface RoundSpec {
  /** 0-based global index. */
  readonly index: number;
  readonly stage: number;
  /** 1-based position inside the stage. */
  readonly roundInStage: number;
  /** Display code, e.g. "2-3". */
  readonly code: string;
  readonly kind: RoundKind;
  /** A philosophy pick happens *before* this round's shop phase. */
  readonly philosophyPick: boolean;
  readonly damageMultiplier: number;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export const AI_ARCHETYPES = [
  "LONG_BALL", // 뻥야구팀
  "SMALL_BALL", // 스몰볼팀
  "FOREIGN_RELIANT", // 용병의존팀
  "PROSPECTS", // 유망주팀
  "DEFENSE_FIRST", // 수비의팀
  "REROLL", // 리롤팀
  "ECON", // 이자 챙기는 팀
] as const;
export type AiArchetype = (typeof AI_ARCHETYPES)[number];

export interface StreakState {
  readonly kind: "WIN" | "LOSS" | "NONE";
  readonly length: number;
}

export interface TeamState {
  readonly id: TeamId;
  readonly name: string;
  readonly isHuman: boolean;
  readonly archetype: AiArchetype | null;
  readonly gold: number;
  readonly xp: number;
  /** = number of real (non-replacement) cards allowed on the board. */
  readonly level: number;
  /** "팬심": 100 at start, eliminated at 0. */
  readonly fanHearts: number;
  readonly streak: StreakState;
  readonly board: Board;
  readonly bench: Bench;
  readonly cards: ReadonlyMap<CardId, PlayerCard>;
  /** Unequipped items in the inventory. */
  readonly items: readonly ItemId[];
  readonly philosophies: readonly PhilosophyId[];
  readonly ballparkId: BallparkId;
  readonly shop: readonly (TemplateId | null)[];
  readonly shopLocked: boolean;
  readonly eliminatedAtRound: number | null;
  /** Reveals opponent rotations this round (SCOUTING_REPORT). */
  readonly scoutingActive: boolean;
}

// ---------------------------------------------------------------------------
// Shared pool
// ---------------------------------------------------------------------------

/** Remaining copies per template; cards bought by anyone are removed. */
export type CardPool = ReadonlyMap<TemplateId, number>;

export interface PoolConfig {
  /** Copies of each template that exist per cost. */
  readonly copiesPerTemplate: Readonly<Record<Cost, number>>;
  /** Shop odds per level: index = level, values = % for cost 1..5 summing to 100. */
  readonly shopOdds: ReadonlyArray<Readonly<Record<Cost, number>>>;
}

// ---------------------------------------------------------------------------
// Whole run
// ---------------------------------------------------------------------------

export type RunPhase =
  | "BALLPARK_SELECT"
  | "PHILOSOPHY_PICK"
  | "FA_MARKET"
  | "PLANNING" // shop / board editing
  | "GAME" // simulation + highlights
  | "EVENT" // non-combat round resolution
  | "RUN_OVER";

export interface Matchup {
  readonly home: TeamId;
  /** null => PvE opponent generated for this round. */
  readonly away: TeamId | null;
}

export interface RoundRecord {
  readonly round: RoundSpec;
  readonly matchups: readonly Matchup[];
  readonly results: readonly GameResult[];
  /** Fan-heart damage taken per team this round. */
  readonly damage: Readonly<Record<string, number>>;
}

export interface RunState {
  readonly seed: string;
  readonly version: string;
  readonly phase: RunPhase;
  readonly roundIndex: number;
  readonly schedule: readonly RoundSpec[];
  readonly teams: readonly TeamState[];
  readonly pool: CardPool;
  readonly history: readonly RoundRecord[];
  /** Serialized RNG streams so a save can resume mid-round. */
  readonly rng: Readonly<Record<"shop" | "game" | "ai" | "events", RngState>>;
  /** Philosophy choices currently offered to the human (3), if any. */
  readonly pendingPhilosophies: readonly PhilosophyId[] | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
