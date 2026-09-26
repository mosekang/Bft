import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHETYPES, PackSchema, type GameState, type Pack } from "@dugout/protocol";
import {
  ECONOMY,
  POOL_COPIES,
  advance,
  applyAction,
  bots,
  createContext,
  createRun,
  equipItem,
  grantCard,
  ownedIds,
  setAssertions,
  sellValue,
  playBotRun,
  computeEffects,
  countSynergies,
  hashSeed,
} from "../src/index.js";

const pack: Pack = PackSchema.parse(JSON.parse(readFileSync(resolve(__dirname, "../../packs/fictional-v1.json"), "utf8")));
const ctx = createContext(pack);
setAssertions(true);

const humanRun = (seed: string) => createRun(ctx, { seed, players: [{ id: "me", nickname: "나", isBot: false }] });
const step = (s: GameState) => advance(s, ctx, bots);
const act = (s: GameState, a: Parameters<typeof applyAction>[2], who = "me") => {
  const r = applyAction(s, who, a, ctx);
  if (!r.ok) throw new Error(`${a.type}: ${r.code} ${r.msg}`);
  return r.value;
};
const poolTotal = (s: GameState) => Object.values(s.pool).reduce((a, b) => a + b, 0);
const ownedCopies = (s: GameState) => {
  let n = 0;
  for (const p of s.players) { for (const id of ownedIds(p)) n += 3 ** (s.cards[id]!.star - 1); for (const x of p.shop) if (x) n++; }
  if (s.carousel) n += s.carousel.taken.filter((t) => t === null).length;
  return n;
};

describe("run setup", () => {
  it("creates 8 players with distinct archetypes and a full pool", () => {
    const s = humanRun("setup");
    expect(s.players).toHaveLength(8);
    expect(new Set(s.players.filter((p) => p.isBot).map((p) => p.archetype)).size).toBe(7);
    expect(poolTotal(s)).toBe(pack.cards.reduce((a, c) => a + POOL_COPIES[c.cost], 0));
    expect(s.phase).toBe("STADIUM");
  });

  it("waits for the human's stadium pick, then deals shops in PREP", () => {
    let s = step(humanRun("stadium"));
    expect(s.phase).toBe("STADIUM");
    s = step(act(s, { type: "PICK_STADIUM", id: "SEA_BREEZE" }));
    expect(s.phase).toBe("PREP");
    expect(s.round).toBe("1-1");
    const me = s.players.find((p) => p.id === "me")!;
    expect(me.shop.filter(Boolean)).toHaveLength(5);
    expect(me.gold).toBe(0);
    expect(applyAction(s, "me", { type: "BUY", slot: 0 }, ctx)).toMatchObject({ ok: false, code: "NOT_ENOUGH_GOLD" });
  });
});

describe("shop, economy and merging", () => {
  const start = () => step(act(step(humanRun("shop")), { type: "PICK_STADIUM", id: "DOME" }));

  it("pays income and free XP after a round", () => {
    let s = start();
    s = step(act(s, { type: "READY" }));
    expect(s.phase).toBe("PLAYBACK");
    s = step(act(s, { type: "SKIP_PLAYBACK" }));
    expect(s.phase).toBe("SETTLE");
    const me = s.players.find((p) => p.id === "me")!;
    expect(me.lastIncome?.base).toBe(2);
    expect(me.gold).toBeGreaterThanOrEqual(2);
    expect(me.xp).toBe(2);
    s = step(act(s, { type: "READY" }));
    expect(s.round).toBe("1-2");
    expect(s.phase).toBe("PREP");
  });

  it("buying, selling and rerolling conserve the pool", () => {
    let s = start();
    s = { ...s, players: s.players.map((p) => (p.id === "me" ? { ...p, gold: 30 } : p)) };
    const before = poolTotal(s) + ownedCopies(s);
    const me = () => s.players.find((p) => p.id === "me")!;
    const slot = me().shop.findIndex(Boolean);
    const defId = me().shop[slot]!;
    const cost = ctx.defs.get(defId)!.cost;
    s = act(s, { type: "BUY", slot });
    expect(me().gold).toBe(30 - cost);
    expect(poolTotal(s) + ownedCopies(s)).toBe(before);
    const id = ownedIds(me())[0]!;
    s = act(s, { type: "SELL", cardInstanceId: id });
    expect(me().gold).toBe(30);
    expect(poolTotal(s) + ownedCopies(s)).toBe(before);
    s = act(s, { type: "REROLL" });
    expect(me().gold).toBe(30 - ECONOMY.rerollCost);
    expect(poolTotal(s) + ownedCopies(s)).toBe(before);
    expect(me().rerollCount).toBe(1);
  });

  it("three copies merge into ★★ and nine into ★★★, refunding cost×3 / ×9 on sale", () => {
    let s = start();
    const def = pack.cards.find((c) => c.cost === 2)!;
    const poolBefore = s.pool[def.id]!;
    for (let i = 0; i < 3; i++) s = grantCard(s, "me", def.id, ctx).state;
    let me = s.players.find((p) => p.id === "me")!;
    expect(ownedIds(me)).toHaveLength(1);
    expect(s.cards[ownedIds(me)[0]!]!.star).toBe(2);
    for (let i = 0; i < 6; i++) s = grantCard(s, "me", def.id, ctx).state;
    me = s.players.find((p) => p.id === "me")!;
    expect(ownedIds(me)).toHaveLength(1);
    expect(s.cards[ownedIds(me)[0]!]!.star).toBe(3);
    expect(sellValue(2, 3)).toBe(18);
    const gold = me.gold;
    s = act(s, { type: "SELL", cardInstanceId: ownedIds(me)[0]! });
    expect(s.players.find((p) => p.id === "me")!.gold).toBe(gold + 18);
    expect(s.pool[def.id]).toBe(poolBefore);
  });

  it("enforces the level cap and role/slot fit on moves", () => {
    let s = start();
    const hitters = pack.cards.filter((c) => c.role === "H").slice(0, 4);
    const sp = pack.cards.find((c) => c.role === "SP")!;
    for (const h of hitters) s = grantCard(s, "me", h.id, ctx).state;
    s = grantCard(s, "me", sp.id, ctx).state;
    const me = () => s.players.find((p) => p.id === "me")!;
    const bench = me().bench;
    expect(applyAction(s, "me", { type: "MOVE", from: { kind: "bench", index: 0 }, to: { kind: "slot", slot: "P1" } }, ctx)).toMatchObject({ ok: false, code: "INVALID_SLOT" });
    s = act(s, { type: "MOVE", from: { kind: "bench", index: 0 }, to: { kind: "slot", slot: hitters[0]!.pos } });
    s = act(s, { type: "MOVE", from: { kind: "bench", index: 1 }, to: { kind: "slot", slot: hitters[1]!.pos === hitters[0]!.pos ? "DH" : hitters[1]!.pos } });
    s = act(s, { type: "MOVE", from: { kind: "bench", index: 4 }, to: { kind: "slot", slot: "P1" } });
    expect(Object.values(me().board.slots).filter(Boolean)).toHaveLength(3);
    const r = applyAction(s, "me", { type: "MOVE", from: { kind: "bench", index: 2 }, to: { kind: "slot", slot: "1B" } }, ctx);
    expect(r).toMatchObject({ ok: false, code: "LEVEL_CAP" });
    expect(bench.length).toBe(ECONOMY.benchSize);
  });

  it("buys XP and levels up on the §4.3 curve", () => {
    let s = start();
    s = { ...s, players: s.players.map((p) => (p.id === "me" ? { ...p, gold: 8 } : p)) };
    s = act(s, { type: "BUY_XP" });
    expect(s.players.find((p) => p.id === "me")!.level).toBe(4); // 4 xp needed for 3→4
    expect(s.players.find((p) => p.id === "me")!.xp).toBe(0);
    s = act(s, { type: "BUY_XP" });
    expect(s.players.find((p) => p.id === "me")!.level).toBe(4);
    expect(s.players.find((p) => p.id === "me")!.xp).toBe(4);
    expect(applyAction(s, "me", { type: "BUY_XP" }, ctx)).toMatchObject({ ok: false, code: "NOT_ENOUGH_GOLD" });
  });
});

describe("batting order (§4.3)", () => {
  it("accepts a permutation or AUTO and rejects duplicates", () => {
    let s = step(act(step(humanRun("order")), { type: "PICK_STADIUM", id: "DOME" }));
    const order = ["DH", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    s = act(s, { type: "SET_ORDER", order: [...order] });
    expect(s.players.find((p) => p.id === "me")!.board.order).toEqual([...order]);
    expect(applyAction(s, "me", { type: "SET_ORDER", order: ["DH", "DH", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] }, ctx)).toMatchObject({ ok: false, code: "INVALID_SLOT" });
    const hitters = pack.cards.filter((c) => c.role === "H").slice(0, 2);
    for (const h of hitters) s = grantCard(s, "me", h.id, ctx).state;
    s = act(s, { type: "MOVE", from: { kind: "bench", index: 0 }, to: { kind: "slot", slot: hitters[0]!.pos } });
    s = act(s, { type: "SET_ORDER", order: "AUTO" });
    expect(s.players.find((p) => p.id === "me")!.board.order[0]).toBe(hitters[0]!.pos);
  });
});

describe("items and synergies", () => {
  it("two components on one card combine, and synergies count the board only", () => {
    let s = step(act(step(humanRun("items")), { type: "PICK_STADIUM", id: "DOME" }));
    const sluggers = pack.cards.filter((c) => c.classes.includes("SLUGGER") && c.role === "H").slice(0, 2);
    for (const c of sluggers) s = grantCard(s, "me", c.id, ctx).state;
    const me = () => s.players.find((p) => p.id === "me")!;
    const ids = ownedIds(me());
    s = { ...s, players: s.players.map((p) => (p.id === "me" ? { ...p, itemsUnequipped: ["BAT", "SPIKES"] } : p)) };
    let r = equipItem(s, "me", "BAT", ids[0]!, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) s = r.value;
    r = equipItem(s, "me", "SPIKES", ids[0]!, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) s = r.value;
    expect(s.cards[ids[0]!]!.items).toEqual(["POWER_SPEED"]);
    expect(countSynergies(me(), s.cards, ctx).find((x) => x.id === "SLUGGER")).toBeUndefined();
    s = act(s, { type: "MOVE", from: { kind: "bench", index: 0 }, to: { kind: "slot", slot: sluggers[0]!.pos } });
    s = act(s, { type: "MOVE", from: { kind: "bench", index: 1 }, to: { kind: "slot", slot: sluggers[1]!.pos === sluggers[0]!.pos ? "DH" : sluggers[1]!.pos } });
    const slug = countSynergies(me(), s.cards, ctx).find((x) => x.id === "SLUGGER")!;
    expect(slug.count).toBe(2);
    expect(slug.tier).toBe(1);
    const eff = computeEffects(me(), s.cards, ctx, 2);
    expect(eff.team.hitterMods.get(ids[0]!)?.hrMult).toBeCloseTo(1.15 * 1, 6);
    expect(eff.team.internalAdd.get(ids[0]!)?.hrRate).toBe(12);
  });
});

describe("full bot runs", () => {
  it("are deterministic and finish with 8 distinct placements", () => {
    const acc = () => ({ rounds: [] as number[], strongWins: 0, strongTotal: 0, draws: 0, games: 0, runs: 0, teamGames: 0, archPlace: new Map(), augPlace: new Map(), stadPlace: new Map(), winnerCombos: new Map(), winnerSynergies: new Map(), fiveCostTwoStar: 0, earlyOuts: 0, players: 0, replAtS6: [] as number[] });
    const a = playBotRun("golden", ctx, acc() as never);
    const b = playBotRun("golden", ctx, acc() as never);
    expect(a).toEqual(b);
    expect(a.phase).toBe("GAME_OVER");
    expect([...a.players.map((p) => p.placement)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.roundIndex).toBeGreaterThanOrEqual(15);
    const c = playBotRun("other", ctx, acc() as never);
    expect(c.players.map((p) => p.placement)).not.toEqual(a.players.map((p) => p.placement));
  });

  it("golden snapshot: seed 12345 final placements and pool hash stay fixed", () => {
    const acc = { rounds: [] as number[], strongWins: 0, strongTotal: 0, draws: 0, games: 0, runs: 0, teamGames: 0, archPlace: new Map(), augPlace: new Map(), stadPlace: new Map(), winnerCombos: new Map(), winnerSynergies: new Map(), fiveCostTwoStar: 0, earlyOuts: 0, players: 0, replAtS6: [] as number[] };
    const s = playBotRun("12345", ctx, acc as never);
    const summary = s.players.map((p) => `${p.archetype}:${p.placement}:${p.level}`).join("|");
    const hash = hashSeed(summary + JSON.stringify(s.pool)).join("-");
    // Update these two lines deliberately when the engine changes (§15.2).
    expect(summary).toMatchSnapshot();
    expect(hash).toMatchSnapshot();
    expect(ARCHETYPES.every((a) => s.players.some((p) => p.archetype === a))).toBe(true);
  });
});

describe("ghost boards (§12.6)", () => {
  it("overlays a snapshot on a bot with fresh ids and no fatigue", async () => {
    const { applyGhosts } = await import("../src/run/ghosts.js");
    let s = step(act(step(humanRun("ghost")), { type: "PICK_STADIUM", id: "DOME" }));
    const bot = s.players.find((p) => p.isBot)!;
    const def = pack.cards.find((c) => c.role === "H" && c.pos === "SS")!;
    const ghost = { slots: { SS: "x1" } as const, cards: { x1: { instanceId: "x1", defId: def.id, star: 2 as const, items: [], fatigue: 2, injuredRounds: 0, growth: 3 } }, nickname: "유령" };
    s = applyGhosts(s, [ghost], ctx);
    const b = s.players.find((p) => p.id === bot.id)!;
    const id = b.board.slots.SS!;
    expect(id.startsWith(`g:${bot.id}:`)).toBe(true);
    expect(s.cards[id]).toMatchObject({ defId: def.id, star: 2, fatigue: 0, growth: 3 });
    expect(b.nickname).toBe("유령(고스트)");
    expect(b.bench.every((x) => x === null)).toBe(true);
    // The overlaid board plays a normal round without invariant violations.
    s = step(act(s, { type: "READY" }));
    expect(s.phase).toBe("PLAYBACK");
  });
});
