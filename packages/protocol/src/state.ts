import { z } from "zod";
import {
  ArchetypeSchema,
  AugmentIdSchema,
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
});
export type Matchup = z.infer<typeof MatchupSchema>;

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
});
export type GameState = z.infer<typeof GameStateSchema>;
