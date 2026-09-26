import { z } from "zod";
import { AugmentIdSchema, ItemIdSchema, PhaseSchema, PitcherSlotSchema, SlotSchema, StadiumIdSchema } from "./enums.js";

export const PROTOCOL_VERSION = 1;

/** A board slot or a bench index: the two places a card can live. */
export const LocationSchema = z.union([
  z.object({ kind: z.literal("slot"), slot: SlotSchema }),
  z.object({ kind: z.literal("bench"), index: z.number().int().min(0).max(7) }),
]);
export type Location = z.infer<typeof LocationSchema>;

/** Client -> server actions (§12.3). Also the entries of `GameState.log`. */
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("JOIN"), roomCode: z.string().length(6), playerId: z.string().min(1), nickname: z.string().min(2).max(10) }),
  z.object({ type: z.literal("READY") }),
  z.object({ type: z.literal("BUY"), slot: z.number().int().min(0).max(4) }),
  z.object({ type: z.literal("SELL"), cardInstanceId: z.string().min(1) }),
  z.object({ type: z.literal("MOVE"), from: LocationSchema, to: LocationSchema }),
  z.object({ type: z.literal("REROLL") }),
  z.object({ type: z.literal("BUY_XP") }),
  z.object({ type: z.literal("LOCK_SHOP"), locked: z.boolean() }),
  z.object({ type: z.literal("PICK_AUGMENT"), idx: z.number().int().min(0).max(2) }),
  z.object({ type: z.literal("PICK_CAROUSEL"), idx: z.number().int().min(0).max(7) }),
  z.object({ type: z.literal("PICK_STADIUM"), id: StadiumIdSchema }),
  z.object({ type: z.literal("SET_TOGGLE"), slot: PitcherSlotSchema, forcePitch: z.boolean() }),
  z.object({ type: z.literal("EQUIP"), itemId: ItemIdSchema, cardInstanceId: z.string().min(1) }),
  z.object({ type: z.literal("TRADE"), cardInstanceId: z.string().min(1), offerIdx: z.number().int().min(0).max(2) }),
  z.object({ type: z.literal("SKIP_PLAYBACK") }),
  /** Resolve a pending `PlayerState.choice` (item reward, franchise card, special item). */
  z.object({ type: z.literal("PICK_CHOICE"), idx: z.number().int().min(0).max(7) }),
  /** Batting order: a permutation of the nine hitter slots, or "AUTO" for OVR order (§4.3). */
  z.object({ type: z.literal("SET_ORDER"), order: z.union([z.array(z.enum(["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"])).length(9), z.literal("AUTO")]) }),
  z.object({ type: z.literal("EMOTE"), id: z.number().int().min(0).max(7) }),
  z.object({ type: z.literal("PING") }),
]);
export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];

/** Envelope every client message travels in. */
export const ClientMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  seq: z.number().int().min(0),
  action: ActionSchema,
});
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ERROR_CODES = [
  "BAD_PHASE",
  "NOT_ENOUGH_GOLD",
  "BENCH_FULL",
  "LEVEL_CAP",
  "INVALID_SLOT",
  "INVALID_CARD",
  "INVALID_ITEM",
  "ROOM_FULL",
  "ROOM_NOT_FOUND",
  "RATE_LIMITED",
  "BAD_MESSAGE",
  "NOT_YOUR_TURN",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** RFC 6902 JSON Patch operation (subset). */
export const PatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace"]),
  path: z.string(),
  value: z.unknown().optional(),
});

export const RoomPlayerSchema = z.object({
  id: z.string().min(1),
  nickname: z.string().min(1),
  ready: z.boolean(),
  isHost: z.boolean(),
  connected: z.boolean(),
});

/** Server -> client messages (§12.3). `state` is typed as unknown here to avoid a schema cycle; validate with GameStateSchema. */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ROOM_STATE"),
    roomCode: z.string().length(6),
    players: z.array(RoomPlayerSchema),
    packId: z.string(),
    fillWithBots: z.boolean(),
  }),
  z.object({ type: z.literal("SNAPSHOT"), state: z.unknown(), version: z.number().int().min(0) }),
  z.object({ type: z.literal("PATCH"), ops: z.array(PatchOpSchema), version: z.number().int().min(0) }),
  z.object({ type: z.literal("PHASE"), phase: PhaseSchema, endsAt: z.number().optional(), round: z.string() }),
  z.object({ type: z.literal("RESULT"), matchups: z.array(z.unknown()) }),
  z.object({
    type: z.literal("CAROUSEL"),
    cards: z.array(z.object({ defId: z.string(), item: ItemIdSchema.optional() })),
    order: z.array(z.string()),
    waveEndsAt: z.number(),
  }),
  z.object({ type: z.literal("AUGMENT_OFFER"), options: z.array(AugmentIdSchema).length(3) }),
  z.object({ type: z.literal("ELIMINATED"), playerId: z.string(), placement: z.number().int().min(1).max(8) }),
  z.object({ type: z.literal("GAME_OVER"), placements: z.array(z.object({ playerId: z.string(), placement: z.number().int().min(1).max(8) })) }),
  z.object({ type: z.literal("ERROR"), code: ErrorCodeSchema, msg: z.string() }),
  z.object({ type: z.literal("PONG") }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const ServerEnvelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  seq: z.number().int().min(0),
  message: ServerMessageSchema,
});
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;
