import type { BallparkId, CardId, TeamId } from "./common.js";
import type { Board } from "./board.js";
import type { Modifier } from "./modifiers.js";
import type { PlayerCard, PlayerTemplate } from "./player.js";
import type { Cost } from "./player.js";

// ---------------------------------------------------------------------------
// Inputs: everything the game simulator needs, fully resolved
// ---------------------------------------------------------------------------

/** A board with every slot resolved to a concrete template (replacements included). */
export interface ResolvedTeam {
  readonly teamId: TeamId;
  readonly name: string;
  readonly board: Board;
  readonly cards: ReadonlyMap<CardId, PlayerCard>;
  readonly templates: ReadonlyMap<CardId, PlayerTemplate>;
  /** Replacement players keyed by the slot index they fill ("L3" / "P1"). */
  readonly replacements: ReadonlyMap<string, PlayerTemplate>;
  /** Team-wide modifiers already collected from synergies, items, philosophies. */
  readonly modifiers: readonly Modifier[];
}

export interface GameConfig {
  readonly home: ResolvedTeam;
  readonly away: ResolvedTeam;
  readonly ballparkId: BallparkId;
  /** Stage number 1..7; some effects scale with it. */
  readonly stage: number;
  /** Deterministic seed for this game only. */
  readonly seed: string;
  /** 9 by default; postseason may use 9 as well; kept for future short mode. */
  readonly innings: number;
  readonly designatedHitter: boolean;
}

// ---------------------------------------------------------------------------
// Plate appearance
// ---------------------------------------------------------------------------

/**
 * Terminal outcome of a plate appearance after fielding is resolved.
 * The Log5 step first picks a *category* (BB/K/HR/BIP); a ball in play is
 * then turned into one of the hit / out outcomes by the fielding step.
 */
export type PaOutcome =
  | "BB" // walk
  | "HBP" // hit by pitch
  | "K" // strikeout
  | "HR" // home run
  | "1B"
  | "2B"
  | "3B"
  | "GO" // ground out
  | "FO" // fly out
  | "LO" // line out
  | "PO" // pop out
  | "DP" // double play
  | "SF" // sacrifice fly
  | "SH" // sacrifice bunt
  | "E" // reached on error
  | "FC"; // fielder's choice

export type BattedBallType = "GROUND" | "LINE" | "FLY" | "POPUP";
export type BattedBallDirection = "LEFT" | "CENTER" | "RIGHT";

/** Base occupancy: index 0 = first base. */
export type Bases = readonly [CardId | "REPL" | null, CardId | "REPL" | null, CardId | "REPL" | null];

export interface GameSituation {
  readonly inning: number;
  readonly half: "TOP" | "BOTTOM";
  readonly outs: 0 | 1 | 2;
  readonly bases: Bases;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly pitchCount: number;
}

/** Log5 output before fielding: probabilities of each category summing to 1. */
export interface PaProbabilities {
  readonly walk: number;
  readonly hitByPitch: number;
  readonly strikeout: number;
  readonly homeRun: number;
  readonly ballInPlay: number;
}

// ---------------------------------------------------------------------------
// Play-by-play events (consumed by the UI commentary layer)
// ---------------------------------------------------------------------------

export type PlayEvent =
  | {
      readonly type: "PA";
      readonly situation: GameSituation;
      readonly batter: CardId | "REPL";
      readonly pitcher: CardId | "REPL";
      readonly outcome: PaOutcome;
      readonly battedBall?: { readonly type: BattedBallType; readonly direction: BattedBallDirection };
      readonly runsScored: number;
      readonly rbi: number;
    }
  | { readonly type: "STOLEN_BASE"; readonly runner: CardId | "REPL"; readonly success: boolean; readonly base: 2 | 3 }
  | { readonly type: "PITCHING_CHANGE"; readonly team: TeamId; readonly from: CardId | "REPL"; readonly to: CardId | "REPL"; readonly reason: "PITCH_COUNT" | "FATIGUE" | "CLOSER" | "BLOWOUT" | "INJURY" }
  | { readonly type: "INNING_END"; readonly inning: number; readonly half: "TOP" | "BOTTOM" }
  | { readonly type: "GAME_END"; readonly winner: TeamId; readonly homeScore: number; readonly awayScore: number };

/** A play worth showing during the 15–20 s highlight reel. */
export interface Highlight {
  readonly eventIndex: number;
  /** Change in win probability caused by the play, for ranking. */
  readonly leverage: number;
  readonly caption: string;
}

// ---------------------------------------------------------------------------
// Box score
// ---------------------------------------------------------------------------

export interface BattingLine {
  readonly pa: number;
  readonly ab: number;
  readonly h: number;
  readonly doubles: number;
  readonly triples: number;
  readonly hr: number;
  readonly bb: number;
  readonly k: number;
  readonly rbi: number;
  readonly r: number;
  readonly sb: number;
  readonly cs: number;
}

export interface PitchingLine {
  /** Outs recorded; innings pitched = outs / 3. */
  readonly outs: number;
  readonly h: number;
  readonly r: number;
  readonly er: number;
  readonly bb: number;
  readonly k: number;
  readonly hr: number;
  readonly pitches: number;
  readonly decision?: "W" | "L" | "SV" | "HLD";
}

export interface TeamBoxScore {
  readonly teamId: TeamId;
  readonly runs: number;
  readonly hits: number;
  readonly errors: number;
  readonly lineScore: readonly number[];
  readonly batting: ReadonlyMap<CardId | "REPL", BattingLine>;
  readonly pitching: ReadonlyMap<CardId | "REPL", PitchingLine>;
}

export interface GameResult {
  readonly seed: string;
  readonly winner: TeamId;
  readonly home: TeamBoxScore;
  readonly away: TeamBoxScore;
  readonly innings: number;
  readonly events: readonly PlayEvent[];
  readonly highlights: readonly Highlight[];
  readonly mvp: CardId | "REPL";
  /** Pitchers who started (rotation slot consumed) — the run loop applies fatigue to them. */
  readonly startersUsed: readonly CardId[];
}

/** Handy summary for the pool / codex. */
export interface CostBucket {
  readonly cost: Cost;
  readonly copiesPerTemplate: number;
}
