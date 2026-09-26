import { describe, expect, it } from "vitest";
import {
  ActionSchema,
  BoardSchema,
  CardDefSchema,
  ClientMessageSchema,
  GameStateSchema,
  PackSchema,
  ServerEnvelopeSchema,
  SLOTS,
  SYNERGY_IDS,
  type CardDef,
  type GameState,
} from "../src/index.js";

const hitterRatings = {
  kRate: 60, contactL: 55, contactR: 62, hrRate: 70, xbhRate: 65, bbRate: 50,
  gbTend: 45, pullTend: 60, speed: 40, sbSkill: 45, def: { "1B": 58, LF: 50 }, arm: 48, clutch: 0,
};
const pitcherRatings = {
  kRate: 72, bbRate: 55, hrRate: 60, gbRate: 50, contactVsL: 58, contactVsR: 66, stamina: 70, mental: 52, hold: 50, armAngle: 80,
};

const hitter: CardDef = {
  id: "h-001", name: "김번트", nickname: "홈런 아니면 삼진", team: "seoul-a", age: 27,
  bats: "L", throws: "R", role: "H", pos: "1B", pos2: ["LF"], cost: 2, origin: "COLLEGE", classes: ["SLUGGER"],
  nationality: "KR", hitter: hitterRatings,
};
const pitcher: CardDef = {
  id: "p-001", name: "J. 라미레즈", nickname: "이닝 먹는 하마", team: "busan", age: 29,
  bats: "R", throws: "R", role: "SP", pos: "DH", pos2: [], cost: 4, origin: "FOREIGN", classes: ["FIREBALLER", "INNING_EATER"],
  nationality: "DO", pitcher: pitcherRatings,
};

describe("CardDefSchema", () => {
  it("accepts a valid hitter and pitcher", () => {
    expect(CardDefSchema.parse(hitter)).toEqual(hitter);
    expect(CardDefSchema.parse(pitcher)).toEqual(pitcher);
  });

  it("rejects mismatched role/ratings", () => {
    expect(CardDefSchema.safeParse({ ...hitter, hitter: undefined }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...hitter, pitcher: pitcherRatings }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...pitcher, hitter: hitterRatings }).success).toBe(false);
  });

  it("enforces 5-cost two classes, catcher tag rule, foreign nationality, and tag/role fit", () => {
    expect(CardDefSchema.safeParse({ ...hitter, cost: 5 }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...hitter, cost: 5, classes: ["SLUGGER", "CLUTCH"] }).success).toBe(true);
    expect(CardDefSchema.safeParse({ ...hitter, pos: "C" }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...hitter, classes: ["CATCHER"] }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...pitcher, nationality: "KR" }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...hitter, classes: ["FIREBALLER"] }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...pitcher, classes: ["SLUGGER"] }).success).toBe(false);
    expect(CardDefSchema.safeParse({ ...hitter, hitter: { ...hitterRatings, kRate: 100 } }).success).toBe(false);
  });
});

describe("PackSchema", () => {
  it("round-trips", () => {
    const pack = {
      formatVersion: 1 as const,
      id: "fictional-v1",
      name: "가상 리그 v1",
      kind: "fictional" as const,
      teams: [{ id: "seoul-a", name: "서울 A", color: "#123456" }],
      cards: [hitter, pitcher],
    };
    expect(PackSchema.parse(pack)).toEqual(pack);
    expect(PackSchema.safeParse({ ...pack, id: "Bad Id" }).success).toBe(false);
  });
});

describe("BoardSchema", () => {
  const order = ["CF", "SS", "1B", "DH", "LF", "RF", "3B", "2B", "C"] as const;
  it("accepts a partial board with a full batting order", () => {
    const board = { slots: { SS: "c1", P1: "c2" }, forcePitch: { P1: false, P2: false, P3: true }, order: [...order] };
    expect(BoardSchema.parse(board)).toEqual(board);
  });
  it("rejects duplicate occupancy and bad orders", () => {
    expect(BoardSchema.safeParse({ slots: { SS: "c1", "2B": "c1" }, forcePitch: { P1: false, P2: false, P3: false }, order: [...order] }).success).toBe(false);
    expect(BoardSchema.safeParse({ slots: {}, forcePitch: { P1: false, P2: false, P3: false }, order: [...order.slice(0, 8), "CF"] }).success).toBe(false);
  });
  it("has 12 slots", () => {
    expect(SLOTS).toHaveLength(12);
  });
});

describe("messages", () => {
  it("parses every action type", () => {
    const actions = [
      { type: "JOIN", roomCode: "R7K2QM", playerId: "p1", nickname: "덕아웃" },
      { type: "READY" },
      { type: "BUY", slot: 3 },
      { type: "SELL", cardInstanceId: "c1" },
      { type: "MOVE", from: { kind: "bench", index: 0 }, to: { kind: "slot", slot: "SS" } },
      { type: "REROLL" },
      { type: "BUY_XP" },
      { type: "LOCK_SHOP", locked: true },
      { type: "PICK_AUGMENT", idx: 1 },
      { type: "PICK_CAROUSEL", idx: 7 },
      { type: "PICK_STADIUM", id: "DOME" },
      { type: "SET_TOGGLE", slot: "P2", forcePitch: true },
      { type: "EQUIP", itemId: "BAT", cardInstanceId: "c1" },
      { type: "TRADE", cardInstanceId: "c1", offerIdx: 2 },
      { type: "SKIP_PLAYBACK" },
      { type: "EMOTE", id: 3 },
      { type: "PING" },
      { type: "PICK_CHOICE", idx: 0 },
      { type: "SET_ORDER", order: "AUTO" },
      { type: "SET_ORDER", order: ["CF", "SS", "1B", "DH", "LF", "RF", "3B", "2B", "C"] },
    ];
    for (const a of actions) expect(ActionSchema.parse(a)).toEqual(a);
    expect(actions).toHaveLength(20);
  });

  it("rejects unknown actions and wrong protocol versions", () => {
    expect(ActionSchema.safeParse({ type: "HACK_GOLD", amount: 999 }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ v: 2, seq: 0, action: { type: "PING" } }).success).toBe(false);
    expect(ClientMessageSchema.parse({ v: 1, seq: 0, action: { type: "PING" } }).action.type).toBe("PING");
  });

  it("round-trips server envelopes", () => {
    const env = { v: 1 as const, seq: 9, message: { type: "ERROR" as const, code: "NOT_ENOUGH_GOLD" as const, msg: "골드가 부족합니다" } };
    expect(ServerEnvelopeSchema.parse(env)).toEqual(env);
    expect(ServerEnvelopeSchema.safeParse({ ...env, message: { type: "ERROR", code: "NOPE", msg: "" } }).success).toBe(false);
  });
});

describe("GameStateSchema", () => {
  it("parses a minimal lobby state", () => {
    const state: GameState = {
      version: 0,
      packId: "fictional-v1",
      seed: "12345",
      round: "1-1",
      phase: "LOBBY",
      players: [
        {
          id: "p1", nickname: "나", isBot: false, hp: 100, gold: 0, xp: 0, level: 3, winStreak: 0, loseStreak: 0,
          board: { slots: {}, forcePitch: { P1: false, P2: false, P3: false }, order: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"] },
          bench: [null, null, null, null, null, null], shop: [null, null, null, null, null], shopLocked: false,
          augments: [], stadium: "DOME", itemsUnequipped: [], ready: false, rerollCount: 0, stadiumPicked: false, idleRounds: 0, benchBonus: 0, scoutingActive: false,
        },
      ],
      pool: {},
      cards: {},
      matchups: [],
      log: [],
      roundIndex: 0,
      nextInstanceId: 0,
      createdAt: 0,
    };
    expect(GameStateSchema.parse(state)).toEqual(state);
  });

  it("exposes every synergy id including derived handedness", () => {
    expect(SYNERGY_IDS).toContain("LEFTY_BAT");
    expect(SYNERGY_IDS).toHaveLength(18);
  });
});
