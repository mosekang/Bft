import { z } from "zod";
import {
  ArchetypeSchema,
  AugmentIdSchema,
  ComponentItemIdSchema,
  EventTypeSchema,
  ItemIdSchema,
  PhaseSchema,
  PitcherSlotSchema,
  POS,
  SlotSchema,
  StadiumIdSchema,
} from "./enums.js";
import { CardInstanceSchema } from "./card.js";
import { ActionSchema } from "./messages.js";

/** Round code "S-R", e.g. "2-3". */
export const RoundCodeSchema = z.string().regex(/^[1-7]-[1-9]$/);
export type RoundCode = z.infer<typeof RoundCodeSchema>;

/**
 * Board (§4.3, §13). `slots` maps a slot to a card instance id; missing slots
 * are filled by replacement players at sim time. `order` is the batting order:
 * the nine hitter slots in the order the user arranged them.
 */
export const BoardSchema = z
  .object({
    slots: z.partialRecord(SlotSchema, z.string().min(1)),
    /** "Pitch even when tired" toggle per pitcher slot (§6.4). */
    forcePitch: z.record(PitcherSlotSchema, z.boolean()),
    /** Batting order: a permutation of the 9 hitter slots. */
    order: z.array(z.enum(POS)).length(9),
  })
  .superRefine((board, ctx) => {
    if (new Set(board.order).size !== 9) {
      ctx.addIssue({ code: "custom", message: "order must be a permutation of the 9 hitter slots", path: ["order"] });
    }
    const ids = Object.values(board.slots);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "a card instance cannot occupy two slots", path: ["slots"] });
    }
  });
export type Board = z.infer<typeof BoardSchema>;

export const PlayerChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ITEM"), options: z.array(ItemIdSchema).min(1).max(8) }),
  z.object({ kind: z.literal("CARD"), options: z.array(z.string().min(1)).min(1).max(8), star: z.union([z.literal(1), z.literal(2)]) }),
  z.object({ kind: z.literal("TRADE"), cardInstanceId: z.string().min(1), options: z.array(z.string().min(1)).length(3) }),
]);
export type PlayerChoice = z.infer<typeof PlayerChoiceSchema>;

export const PlayerStateSchema = z.object({
  id: z.string().min(1),
  nickname: z.string().min(1).max(10),
  isBot: z.boolean(),
  archetype: ArchetypeSchema.optional(),
  /** 팬심 0..100. */
  hp: z.number().int().min(0).max(100),
  gold: z.number().int().min(0),
  xp: z.number().int().min(0),
  level: z.number().int().min(3).max(10),
  winStreak: z.number().int().min(0),
  loseStreak: z.number().int().min(0),
  board: BoardSchema,
  bench: z.array(z.string().min(1).nullable()),
  /** Card def ids currently offered. */
  shop: z.array(z.string().min(1).nullable()).length(5),
  shopLocked: z.boolean(),
  augments: z.array(AugmentIdSchema).max(3),
  stadium: StadiumIdSchema,
  itemsUnequipped: z.array(ItemIdSchema),
  lastOpponent: z.string().optional(),
  eliminatedAt: RoundCodeSchema.optional(),
  placement: z.number().int().min(1).max(8).optional(),
  /** Three augments offered this round (AUGMENT phase), until picked. */
  augmentOffer: z.array(AugmentIdSchema).length(3).optional(),
  /** A pending pick: reward item, franchise card, special item, or trade offers. */
  choice: PlayerChoiceSchema.optional(),
  /** Trade-deadline swaps remaining during the 4-4 event. */
  tradesLeft: z.number().int().min(0).optional(),
  /** Whether this player has finished the current phase (READY). */
  ready: z.boolean(),
  /** Rerolls this round; seeds the shop stream deterministically. */
  rerollCount: z.number().int().min(0),
  /** Ordinal of the human's stadium pick etc. — true once picked. */
  stadiumPicked: z.boolean(),
  /** Rounds the player has taken no action (bot takeover after 2). */
  idleRounds: z.number().int().min(0),
  /** Extra bench capacity granted by CALL_UP. */
  benchBonus: z.number().int().min(0),
  /** Scouting: rotations of opponents revealed for the current round. */
  scoutingActive: z.boolean(),
  /** Round-end bookkeeping: result of the last game for streak/damage display. */
  lastResult: z.enum(["W", "L", "D"]).optional(),
  /** Income credited at the last settle, for the SETTLE animation. */
  lastIncome: z.object({ base: z.number(), interest: z.number(), streak: z.number(), saveBonus: z.number(), total: z.number() }).optional(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

export const GameEventSchema = z.object({
  inning: z.number().int().min(1),
  half: z.enum(["T", "B"]),
  type: EventTypeSchema,
  /** Card instance id, or "REPL:<slot>" for a replacement player. */
  batter: z.string(),
  pitcher: z.string(),
  outs: z.number().int().min(0).max(3),
  runners: z.tuple([z.boolean(), z.boolean(), z.boolean()]),
  /** [away, home] */
  scoreBefore: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  scoreAfter: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type GameEvent = z.infer<typeof GameEventSchema>;

export const MatchupSchema = z.object({
  home: z.string().min(1),
  /** Player id, or a PvE/ghost opponent id such as "PVE:ALLSTAR". */
  away: z.string().min(1),
  homeStadium: StadiumIdSchema,
  events: z.array(GameEventSchema),
  /** [away, home] */
  score: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  /** Fan-heart damage per player id. */
  damage: z.record(z.string(), z.number().int().min(0)),
  /** Indices into `events`. */
  highlights: z.array(z.number().int().min(0)),
  /** Display names for card instance / replacement ids in `events`. */
  names: z.record(z.string(), z.string()).optional(),
  /** "PVP" | "PVE_CAMP" | "ALL_STAR" | "LEGEND" | "GHOST" | "PLAYOFF" */
  kind: z.string(),
  /** Winner player id, or null for a draw. */
  winner: z.string().nullable(),
  /** For a best-of-3 final, the game number 1..3. */
  game: z.number().int().min(1).optional(),
});
export type Matchup = z.infer<typeof MatchupSchema>;

export const CarouselStateSchema = z.object({
  cards: z.array(z.object({ defId: z.string().min(1), item: ComponentItemIdSchema.optional() })),
  /** Player id that took each card, or null. */
  taken: z.array(z.string().nullable()),
  /** Pick order (player ids), lowest hp first. */
  order: z.array(z.string()),
  /** Index into `order` of the first player of the current wave. */
  waveStart: z.number().int().min(0),
  waveSize: z.number().int().min(1),
});
export type CarouselState = z.infer<typeof CarouselStateSchema>;

export const GameStateSchema = z.object({
  /** Monotonic state version for PATCH ordering. */
  version: z.number().int().min(0),
  packId: z.string().min(1),
  seed: z.string().min(1),
  round: RoundCodeSchema,
  phase: PhaseSchema,
  /** Epoch ms; only set in real-time rooms. */
  phaseEndsAt: z.number().optional(),
  players: z.array(PlayerStateSchema).min(1).max(8),
  /** defId -> copies remaining in the shared pool. */
  pool: z.record(z.string(), z.number().int().min(0)),
  cards: z.record(z.string(), CardInstanceSchema),
  matchups: z.array(MatchupSchema),
  log: z.array(ActionSchema),
  /** 0-based index into the schedule. */
  roundIndex: z.number().int().min(0),
  /** Counter for deterministic card instance ids. */
  nextInstanceId: z.number().int().min(0),
  carousel: CarouselStateSchema.optional(),
  /** Eliminated players' final boards serve as ghosts; kept in `players`. */
  createdAt: z.number().int().min(0),
});
export type GameState = z.infer<typeof GameStateSchema>;
