import type { FieldPos, Hand, HitterRatings, PitcherRatings, Pos, StadiumId, Throws } from "@dugout/protocol";
import type { StadiumDef } from "../config/stadiums.js";

/**
 * Per-hitter multipliers/adds collected from items, synergies and augments.
 * Everything defaults to a no-op (see `defaultHitterMods`). The sim never
 * asks *why* a value is set.
 */
export interface HitterMods {
  hrMult: number;
  kMult: number;
  bbMult: number;
  babipAdd: number;
  infieldHitAdd: number;
  doubleMult: number;
  tripleMult: number;
  /** Extra platoon amplitude when facing the opposite hand (+) / same hand (−). */
  platoonFavorAdd: number;
  platoonAgainstAdd: number;
  /** Rating points added to contact/power with runners in scoring position, and otherwise. */
  rispAdd: number;
  nonRispAdd: number;
  sbSuccessAdd: number;
  advanceAdd: number;
  /** This runner may attempt steals even if the team cannot. */
  stealsEnabled: boolean;
  ignoreCatcherArm: boolean;
  firstPaHrMult: number;
  leadoffBabipAdd: number;
  /** Automatic bunt when contact display ≤ this (SMALL_BALL); 0 = never. */
  buntContactMax: number;
  /** Share of the off-position defence penalty that applies (UTILITY): 1 full, 0.5 halved, 0 none. */
  offPositionPenaltyMult: number;
  /** Platoon multiplier never drops below 1 (SWITCH_HITTER). */
  noPlatoonPenalty: boolean;
}

export interface PitcherMods {
  kMult: number;
  bbMult: number;
  hrMult: number;
  gbAdd: number;
  pitchLimitAdd: number;
  /** Rating points added to suppression ratings in the 9th+ with a lead (CLOSER). */
  lateLeadRatingAdd: number;
  isCloser: boolean;
  /** If > 0 this reliever may start and is pulled after this many outs (OPENER). */
  openerOuts: number;
  /** Strikeout multiplier against same-hand batters (SIDEARM). */
  sameHandKMult: number;
}

export interface TeamMods {
  /** Applied to the *opponent's* BABIP (GOLD_GLOVE, shifts). */
  oppBabipAdd: number;
  oppGroundBabipAdd: number;
  errorMult: number;
  /** Framing etc. on own pitchers' walks. */
  bbMult: number;
  hrMult: number;
  kMult: number;
  doubleMult: number;
  stealsEnabled: boolean;
  buntEnabled: boolean;
  buntSuccess: number;
  buntContactMax: number;
  /** MASTER_MANAGER: closer may enter with a lead up to this. */
  closerLeadMax: number;
  /** ABS augment removes framing on both teams; tracked per game. */
  framingDisabled: boolean;
  /** Tired-pitcher penalty override (CONDITIONING_COACH). */
  tiredPenalty: number;
  /** BABIP add for this team's hitters when it bats as the home team (HOME_ADVANTAGE). */
  homeBabipAdd: number;
  /** RISP contact/power add for this team's hitters at home (CHEER_SQUAD). */
  homeRispAdd: number;
}

export interface SimHitter {
  /** Card instance id, or "REPL:<slot>" for a replacement. */
  id: string;
  name: string;
  bats: Hand;
  /** Effective internals after star/growth/items/synergy/augment adds and fatigue. */
  r: HitterRatings;
  /** Position played this game (DH allowed). */
  pos: Pos;
  /** Effective fielding at `pos` after the §4.3 position-efficiency rule. */
  defEff: number;
  /** Display contact, used for automatic bunts. */
  contactDisplay: number;
  /** Display power 1..99, presentation only (bat-crack strength, HR distance). */
  powerDisplay?: number;
  mods: HitterMods;
  isReplacement: boolean;
}

export interface SimPitcher {
  id: string;
  name: string;
  throws: Throws;
  role: "SP" | "RP";
  r: PitcherRatings;
  /** Board slot this pitcher came from (P1..P3) or null for replacements. */
  slot: "P1" | "P2" | "P3" | null;
  /** Round-level fatigue when the game starts (already reflected in `r`). */
  tired: boolean;
  mods: PitcherMods;
  isReplacement: boolean;
  /** OVR at game time; drives bullpen ordering. */
  ovr: number;
}

export interface SimTeam {
  id: string;
  name: string;
  /** Batting order, 9 hitters. */
  lineup: SimHitter[];
  /** The eight fielders by position (the DH is not here). */
  fielders: Record<FieldPos, SimHitter>;
  starter: SimPitcher;
  /** Relievers in the order the manager will use them. */
  bullpen: SimPitcher[];
  mods: TeamMods;
  stadium: StadiumId;
}

export interface GameInput {
  home: SimTeam;
  away: SimTeam;
  stadium: StadiumDef;
  seed: string;
  /** Defaults: 9 regulation, 12 max. */
  regulationInnings?: number;
  maxInnings?: number;
}

export type Side = "home" | "away";

export interface BattingLine {
  pa: number;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  k: number;
  rbi: number;
  r: number;
  sb: number;
  cs: number;
}

export interface PitchingLine {
  name: string;
  outs: number;
  h: number;
  r: number;
  bb: number;
  k: number;
  hr: number;
  pitches: number;
  decision: "W" | "L" | "SV" | null;
  /** True when this pitcher started the game (round fatigue applies). */
  started: boolean;
}

export interface TeamBox {
  teamId: string;
  runs: number;
  hits: number;
  errors: number;
  /** Runs per inning. */
  lineScore: number[];
  batting: Map<string, BattingLine>;
  pitching: Map<string, PitchingLine>;
}

export interface GameOutput {
  seed: string;
  /** [away, home] */
  score: [number, number];
  winner: Side | null;
  innings: number;
  events: import("@dugout/protocol").GameEvent[];
  highlights: number[];
  home: TeamBox;
  away: TeamBox;
  mvp: { id: string; side: Side; name: string } | null;
  /** Pitchers used per side with outs and pitches; the run loop derives round fatigue from this. */
  pitchersUsed: Record<Side, { id: string; slot: "P1" | "P2" | "P3" | null; outs: number; started: boolean }[]>;
}

export const defaultHitterMods = (): HitterMods => ({
  hrMult: 1, kMult: 1, bbMult: 1, babipAdd: 0, infieldHitAdd: 0, doubleMult: 1, tripleMult: 1,
  platoonFavorAdd: 0, platoonAgainstAdd: 0, rispAdd: 0, nonRispAdd: 0, sbSuccessAdd: 0, advanceAdd: 0,
  stealsEnabled: false, ignoreCatcherArm: false, firstPaHrMult: 1, leadoffBabipAdd: 0, buntContactMax: 0,
  offPositionPenaltyMult: 1, noPlatoonPenalty: false,
});

export const defaultPitcherMods = (): PitcherMods => ({
  kMult: 1, bbMult: 1, hrMult: 1, gbAdd: 0, pitchLimitAdd: 0, lateLeadRatingAdd: 0, isCloser: false, openerOuts: 0, sameHandKMult: 1,
});

export const defaultTeamMods = (): TeamMods => ({
  oppBabipAdd: 0, oppGroundBabipAdd: 0, errorMult: 1, bbMult: 1, hrMult: 1, kMult: 1, doubleMult: 1,
  stealsEnabled: false, buntEnabled: false, buntSuccess: 0.7, buntContactMax: 50, closerLeadMax: 3, framingDisabled: false, tiredPenalty: 0.3,
  homeBabipAdd: 0, homeRispAdd: 0,
});
