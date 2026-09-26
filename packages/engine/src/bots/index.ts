import type { Action, CardDef, GameState, Location, PlayerState, Pos, StadiumId, SynergyId } from "@dugout/protocol";
import { POS } from "@dugout/protocol";
import { AUGMENT_BY_ID } from "../config/augments.js";
import { ARCHETYPE_DEFS, BOT_SHOP_SCORE, type ArchetypeDef } from "../config/bots.js";
import { ECONOMY } from "../config/economy.js";
import { LEVELS, xpToNext } from "../config/levels.js";
import { cardOvr, hitterDisplay } from "../ratings.js";
import { boardCount } from "../run/board.js";
import { benchOf, ownedIds } from "../run/cards.js";
import { alive, currentRound, roundRng, type RunContext } from "../run/context.js";
import { rerollCost, xpCost } from "../run/economy.js";
import { computeEffects } from "../run/effects.js";
import { applyAction, tradeOffersFor, type BotController } from "../run/actions.js";
import { tagsOf } from "../run/synergies.js";
import { isComponent } from "../run/items.js";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const P = (s: GameState, id: string) => s.players.find((x) => x.id === id)!;
const act = (s: GameState, id: string, a: Action, ctx: RunContext): GameState => {
  const r = applyAction(s, id, a, ctx);
  return r.ok ? r.value : s;
};

function archetypeOf(p: PlayerState, state: GameState, ctx: RunContext): ArchetypeDef {
  const base = ARCHETYPE_DEFS[p.archetype ?? "ECON"];
  if (base.id !== "COPYCAT") return base;
  // Copy the highest-hp human's tags; fall back to LONG_BALL.
  const human = [...state.players].filter((x) => alive(x) && !x.isBot).sort((a, b) => b.hp - a.hp)[0];
  if (!human) return { ...ARCHETYPE_DEFS.LONG_BALL, id: "COPYCAT" };
  return { ...base, preferredTags: topTags(human, state, ctx) };
}

function topTags(p: PlayerState, state: GameState, ctx: RunContext): SynergyId[] {
  const counts = boardTagCounts(p, state, ctx);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
}

/** How well a card fits the archetype's plan and the current board. */
function tagFit(def: CardDef, arch: ArchetypeDef, boardTags: Map<SynergyId, number>): number {
  let fit = 0;
  for (const t of tagsOf(def)) {
    if (arch.preferredTags.includes(t)) fit += 1;
    const n = boardTags.get(t) ?? 0;
    if (n > 0) fit += Math.min(0.6, n * 0.2);
    if (t === "FOREIGN" && n >= 2) fit -= 2; // quota
  }
  return fit;
}

function boardTagCounts(p: PlayerState, state: GameState, ctx: RunContext): Map<SynergyId, number> {
  const counts = new Map<SynergyId, number>();
  for (const id of Object.values(p.board.slots)) {
    const c = id ? state.cards[id] : undefined;
    const def = c ? ctx.defs.get(c.defId) : undefined;
    if (!def) continue;
    for (const t of tagsOf(def)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

function starProgress(p: PlayerState, state: GameState, defId: string): number {
  const owned = ownedIds(p).map((id) => state.cards[id]!).filter((c) => c.defId === defId);
  const ones = owned.filter((c) => c.star === 1).length;
  const twos = owned.filter((c) => c.star === 2).length;
  if (twos > 0 && ones === 2) return 3;
  if (ones === 2) return 2;
  if (ones === 1 || twos > 0) return 1;
  return 0;
}

function shopScore(def: CardDef, p: PlayerState, state: GameState, ctx: RunContext, arch: ArchetypeDef): number {
  const boardTags = boardTagCounts(p, state, ctx);
  const w = BOT_SHOP_SCORE;
  const progress = starProgress(p, state, def.id);
  let score = cardOvr(def) * w.ovr + tagFit(def, arch, boardTags) * w.tagFit + progress * w.starProgress - def.cost * w.costPenalty;
  if (arch.id === "REROLL" && def.cost > 2) score -= 20;
  if (def.cost === 5 && progress >= 1 && p.level >= LEVELS.max - 1) score += 12;
  return score;
}

// ---------------------------------------------------------------------------
// Level pace
// ---------------------------------------------------------------------------

function targetLevel(arch: ArchetypeDef, stage: number, roundInStage: number): number {
  if (arch.levelPace === "FIXED") return Math.max(arch.fixedLevel ?? 6, stage >= 6 ? 8 : stage >= 5 ? 7 : 0);
  const standard: Record<number, number> = { 1: 3, 2: 4, 3: 5, 4: 7, 5: 8, 6: 10, 7: 10 };
  let t = (standard[stage] ?? 10) + (roundInStage >= 3 && stage >= 3 && stage <= 5 ? 1 : 0);
  if (arch.levelPace === "FAST" && stage >= 3) t += 1;
  if (arch.levelPace === "SLOW") t -= 1;
  if (arch.id === "ECON" && stage >= 4) t += 1;
  return Math.max(LEVELS.start, Math.min(LEVELS.max, t));
}

function reserve(arch: ArchetypeDef, p: PlayerState): number {
  if (arch.reserveGold !== null) return arch.reserveGold;
  // Keep the next interest breakpoint (max 50).
  return Math.min(50, Math.floor(p.gold / 10) * 10);
}

// ---------------------------------------------------------------------------
// Board arrangement (greedy, §11.2-5)
// ---------------------------------------------------------------------------

const SCARCE: Pos[] = ["C", "SS", "CF", "2B", "3B", "RF", "LF", "1B", "DH"];

/** Rebuild the board from all owned cards; returns MOVE-equivalent final layout. */
export function arrangeBoard(state: GameState, playerId: string, ctx: RunContext): GameState {
  const p = P(state, playerId);
  const owned = ownedIds(p).map((id) => ({ id, card: state.cards[id]!, def: ctx.defs.get(state.cards[id]!.defId)! })).filter((x) => x.card && x.def);
  const value = (x: (typeof owned)[number]) => cardOvr(x.def) + (x.card.star - 1) * 12 + x.card.growth + x.card.items.length * 3;
  const hitters = owned.filter((x) => x.def.role === "H").sort((a, b) => value(b) - value(a));
  const pitchers = owned.filter((x) => x.def.role !== "H").sort((a, b) => value(b) - value(a));
  const capacity = p.level;
  // Pitchers: up to 3, prefer SP fresh; RP in P3 when available.
  const wantP = Math.min(capacity >= 9 ? 3 : capacity >= 5 ? 2 : 1, pitchers.length);
  const sps = pitchers.filter((x) => x.def.role === "SP" && x.card.injuredRounds === 0);
  const rps = pitchers.filter((x) => x.def.role === "RP" && x.card.injuredRounds === 0);
  const chosenP: typeof pitchers = [];
  while (chosenP.length < wantP && (sps.length || rps.length)) {
    if (chosenP.length < 2 && sps.length) chosenP.push(sps.shift()!);
    else if (rps.length) chosenP.push(rps.shift()!);
    else if (sps.length) chosenP.push(sps.shift()!);
    else break;
  }
  const slots: Partial<Record<string, string>> = {};
  (["P1", "P2", "P3"] as const).forEach((slot, i) => { if (chosenP[i]) slots[slot] = chosenP[i]!.id; });
  // Hitters: scarce positions first with the best eligible card; then fill anything.
  const budget = capacity - chosenP.length;
  const remaining = [...hitters];
  const placed: { pos: Pos; id: string }[] = [];
  for (const pos of SCARCE) {
    if (placed.length >= budget) break;
    let idx = remaining.findIndex((x) => x.def.pos === pos);
    if (idx < 0) idx = remaining.findIndex((x) => x.def.pos2.includes(pos));
    if (idx < 0 && pos === "DH" && remaining.length > 0) idx = 0;
    if (idx < 0) continue;
    const x = remaining.splice(idx, 1)[0];
    if (!x) continue;
    placed.push({ pos, id: x.id });
  }
  // Leftover capacity: put best remaining hitters in any empty position.
  for (const pos of POS) {
    if (placed.length >= budget || remaining.length === 0) break;
    if (placed.some((pl) => pl.pos === pos)) continue;
    placed.push({ pos, id: remaining.shift()!.id });
  }
  for (const pl of placed) slots[pl.pos] = pl.id;
  const onBoard = new Set(Object.values(slots));
  const bench = benchOf(p).map(() => null as string | null);
  let bi = 0;
  for (const x of owned) if (!onBoard.has(x.id) && bi < bench.length) bench[bi++] = x.id;
  // Batting order: OBP proxies 1-2, power 3-4, then OVR.
  const hitterAt = (pos: Pos) => {
    const id = slots[pos];
    const x = id ? owned.find((o) => o.id === id) : undefined;
    return x && x.def.hitter ? { pos, d: hitterDisplay(x.def.hitter, x.def.pos), ovr: cardOvr(x.def) } : { pos, d: null, ovr: -1 };
  };
  const all = POS.map(hitterAt);
  const withCards = all.filter((x) => x.d).sort((a, b) => b.ovr - a.ovr);
  const empties = all.filter((x) => !x.d).map((x) => x.pos);
  const byObp = [...withCards].sort((a, b) => b.d!.eye + b.d!.contact - (a.d!.eye + a.d!.contact));
  const order: Pos[] = [];
  const take = (arr: typeof withCards, n: number) => { for (const x of arr) { if (order.length >= n) break; if (!order.includes(x.pos)) order.push(x.pos); } };
  take(byObp, 2);
  take([...withCards].sort((a, b) => b.d!.power - a.d!.power), 4);
  take(withCards, 9);
  for (const e of empties) if (!order.includes(e)) order.push(e);
  const next: PlayerState = { ...p, board: { ...p.board, slots: slots as PlayerState["board"]["slots"], order }, bench };
  if (boardCount(next) > capacity) return state; // safety
  return { ...state, players: state.players.map((x) => (x.id === playerId ? next : x)) };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function equipAll(state: GameState, playerId: string, ctx: RunContext): GameState {
  let s = state;
  for (let guard = 0; guard < 12; guard++) {
    const p = P(s, playerId);
    const item = p.itemsUnequipped.find((i) => isComponent(i) || !["RELOCATION", "FA_CONTRACT", "CALL_UP", "NUMBER_SUCCESSION"].includes(i));
    if (!item) break;
    const boardIds = Object.values(p.board.slots).filter((x): x is string => !!x);
    const forPitcher = item === "ROSIN" || item === "ICING";
    const candidates = boardIds.map((id) => ({ id, card: s.cards[id]!, def: ctx.defs.get(s.cards[id]!.defId)! })).filter((x) => x.card.items.length < ECONOMY.maxItemsPerCard && (item === "SCOUTING" || (forPitcher ? x.def.role !== "H" : x.def.role === "H") || boardIds.length < 3));
    const best = candidates.sort((a, b) => cardOvr(b.def) + b.card.star * 10 + (b.card.items.some(isComponent) ? 5 : 0) - (cardOvr(a.def) + a.card.star * 10 + (a.card.items.some(isComponent) ? 5 : 0)))[0];
    if (!best) break;
    const before = s;
    s = act(s, playerId, { type: "EQUIP", itemId: item, cardInstanceId: best.id }, ctx);
    if (s === before) break;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export const bots: BotController = {
  pickStadium(state, playerId, ctx) {
    const p = P(state, playerId);
    const arch = archetypeOf(p, state, ctx);
    const rng = roundRng(state, `bot:stadium:${playerId}`);
    const id: StadiumId = arch.preferredStadium ?? rng.pick(["HITTER_FRIENDLY", "PITCHER_FRIENDLY", "ARTIFICIAL_TURF", "SEA_BREEZE", "DOME"] as const);
    void ctx;
    return act(state, playerId, { type: "PICK_STADIUM", id }, ctx);
  },

  pickAugment(state, playerId, ctx) {
    const p = P(state, playerId);
    if (!p.augmentOffer) return state;
    const arch = archetypeOf(p, state, ctx);
    const pref: Record<string, string[]> = {
      LONG_BALL: ["LONG_BALL", "CLEANUP_CARRY", "BIG_SPENDER"], SMALL_BALL: ["SMALL_BALL", "ABS", "MONEYBALL"], FOREIGN_RELIANT: ["FOREIGN_FARMING", "BIG_SPENDER", "DYNASTY"],
      PROSPECTS: ["PLAYER_DEVELOPMENT", "FARM_SYSTEM", "REROLL_HOUSE"], DEFENSE_FIRST: ["ABS", "MASTER_MANAGER", "OPENER"], ECON: ["STINGY_BALL", "BIG_SPENDER", "DYNASTY"],
      COPYCAT: ["SABERMETRICS", "FRANCHISE", "DYNASTY"], REROLL: ["REROLL_HOUSE", "FARM_SYSTEM", "MONEYBALL"],
    };
    const wants = pref[arch.id] ?? [];
    const rank = (id: string) => (wants.includes(id) ? 100 - wants.indexOf(id) : 0) + (AUGMENT_BY_ID.get(id as never)?.rarity === "PRISM" ? 3 : AUGMENT_BY_ID.get(id as never)?.rarity === "GOLD" ? 2 : 1);
    let best = 0;
    p.augmentOffer.forEach((id, i) => { if (rank(id) > rank(p.augmentOffer![best]!)) best = i; });
    return act(state, playerId, { type: "PICK_AUGMENT", idx: best }, ctx);
  },

  pickCarousel(state, playerId, ctx) {
    const p = P(state, playerId);
    const c = state.carousel;
    if (!c) return state;
    const arch = archetypeOf(p, state, ctx);
    let bestIdx = -1, bestScore = -Infinity;
    c.cards.forEach((card, i) => {
      if (c.taken[i]) return;
      const def = ctx.defs.get(card.defId);
      if (!def) return;
      const sc = shopScore(def, p, state, ctx, arch) + (card.item ? 5 : 0);
      if (sc > bestScore) { bestScore = sc; bestIdx = i; }
    });
    if (bestIdx < 0) return state;
    return act(state, playerId, { type: "PICK_CAROUSEL", idx: bestIdx }, ctx);
  },

  resolveChoice(state, playerId, ctx) {
    const p = P(state, playerId);
    if (!p.choice) return state;
    if (p.choice.kind === "CARD") {
      let best = 0;
      p.choice.options.forEach((id, i) => { if (cardOvr(ctx.defs.get(id)!) > cardOvr(ctx.defs.get(p.choice!.options[best]!)!)) best = i; });
      return act(state, playerId, { type: "PICK_CHOICE", idx: best }, ctx);
    }
    if (p.choice.kind === "ITEM") {
      const prefer = ["NUMBER_SUCCESSION", "FA_CONTRACT", "CALL_UP", "RELOCATION", "BAT", "GLOVE", "ROSIN", "SPIKES", "ICING", "SCOUTING"];
      let best = 0;
      p.choice.options.forEach((id, i) => { if (prefer.indexOf(id) >= 0 && prefer.indexOf(id) < (prefer.indexOf(p.choice!.options[best]!) < 0 ? 99 : prefer.indexOf(p.choice!.options[best]!))) best = i; });
      return act(state, playerId, { type: "PICK_CHOICE", idx: best }, ctx);
    }
    return state;
  },

  trade(state, playerId, ctx) {
    let s = state;
    for (let guard = 0; guard < 2; guard++) {
      const p = P(s, playerId);
      if ((p.tradesLeft ?? 0) <= 0) break;
      const arch = archetypeOf(p, s, ctx);
      const boardIds = Object.values(p.board.slots).filter((x): x is string => !!x);
      const worst = boardIds.map((id) => ({ id, def: ctx.defs.get(s.cards[id]!.defId)!, card: s.cards[id]! })).filter((x) => x.card.star === 1).sort((a, b) => cardOvr(a.def) - cardOvr(b.def))[0];
      if (!worst) break;
      const offers = tradeOffersFor(s, playerId, worst.id, ctx);
      let best = -1, bestScore = shopScore(worst.def, p, s, ctx, arch);
      offers.forEach((id, i) => { const sc = shopScore(ctx.defs.get(id)!, p, s, ctx, arch); if (sc > bestScore + 3) { bestScore = sc; best = i; } });
      if (best < 0) break;
      const before = s;
      s = act(s, playerId, { type: "TRADE", cardInstanceId: worst.id, offerIdx: best }, ctx);
      if (s === before) break;
    }
    return act(s, playerId, { type: "READY" }, ctx);
  },

  prep(state, playerId, ctx) {
    let s = state;
    const round = currentRound(s, ctx);
    const arch = archetypeOf(P(s, playerId), s, ctx);
    const rng = roundRng(s, `bot:prep:${playerId}`);
    const rerollProb = { NONE: 0, LOW: 0.25, MID: 0.5, HIGH: 0.8, VERY_HIGH: 0.95 }[arch.rerollTendency];

    const buyMerges = () => {
      for (let slot = 0; slot < ECONOMY.shopSize; slot++) {
        const p = P(s, playerId);
        const defId = p.shop[slot];
        if (!defId) continue;
        const def = ctx.defs.get(defId)!;
        if (starProgress(p, s, defId) >= 2 && p.gold >= def.cost) s = act(s, playerId, { type: "BUY", slot }, ctx);
      }
    };
    const levelUp = () => {
      for (let i = 0; i < 6; i++) {
        const p = P(s, playerId);
        const eff = computeEffects(p, s.cards, ctx, round.stage).run;
        const target = targetLevel(arch, round.stage, round.roundInStage);
        const rich = p.gold >= reserve(arch, p) + 24 && round.stage >= 3;
        if ((p.level >= target && !rich) || p.level >= LEVELS.max) break;
        const keep = arch.id === "ECON" ? Math.min(reserve(arch, p), 50) : Math.max(0, reserve(arch, p) - 20);
        if (p.gold - xpCost(eff) < keep && p.gold < xpCost(eff) + 4) break;
        if (p.gold < xpCost(eff)) break;
        const before = s;
        s = act(s, playerId, { type: "BUY_XP" }, ctx);
        if (s === before) break;
        if (P(s, playerId).xp === 0 && P(s, playerId).level >= target) break;
        void xpToNext;
      }
    };
    const shopPass = () => {
      for (let i = 0; i < 5; i++) {
        const p = P(s, playerId);
        const scored = p.shop.map((defId, slot) => ({ defId, slot, score: defId ? shopScore(ctx.defs.get(defId)!, p, s, ctx, arch) : -Infinity })).filter((x) => x.defId).sort((a, b) => b.score - a.score);
        const pick = scored.find((x) => {
          const def = ctx.defs.get(x.defId!)!;
          const keep = arch.id === "ECON" && round.stage < 4 ? reserve(arch, p) : Math.max(0, reserve(arch, p) - 20);
          return p.gold >= def.cost && (p.gold - def.cost >= keep || x.score > 45 || round.stage <= 2);
        });
        if (!pick) break;
        // Bench full: sell the least valuable bench card if the new one is better.
        const pp = P(s, playerId);
        if (pp.bench.every((b) => b !== null)) {
          const worst = pp.bench.filter((b): b is string => !!b).map((id) => ({ id, score: shopScore(ctx.defs.get(s.cards[id]!.defId)!, pp, s, ctx, arch) + (s.cards[id]!.star - 1) * 30 })).sort((a, b) => a.score - b.score)[0];
          if (!worst || worst.score + 5 >= pick.score) break;
          s = act(s, playerId, { type: "SELL", cardInstanceId: worst.id }, ctx);
        }
        const before = s;
        s = act(s, playerId, { type: "BUY", slot: pick.slot }, ctx);
        if (s === before) break;
      }
    };

    buyMerges();
    levelUp();
    shopPass();
    for (let r = 0; r < 20; r++) {
      const p = P(s, playerId);
      const eff = computeEffects(p, s.cards, ctx, round.stage).run;
      const cost = rerollCost(eff);
      if (r >= 12 && !(round.stage >= 6 && p.level >= LEVELS.max - 1)) break;
      const line = arch.id === "REROLL" ? 10 : arch.id === "PROSPECTS" ? 30 : arch.id === "ECON" ? 50 : reserve(arch, p);
      const lateGame = round.stage >= 6 && p.level >= LEVELS.max - 1;
      const prob = lateGame ? Math.max(rerollProb, 0.9) : rerollProb;
      const floor = lateGame ? Math.min(line, 10) : line;
      if (p.gold - cost < floor || !rng.chance(prob)) break;
      const before = s;
      s = act(s, playerId, { type: "REROLL" }, ctx);
      if (s === before) break;
      buyMerges();
      shopPass();
    }
    s = arrangeBoard(s, playerId, ctx);
    s = equipAll(s, playerId, ctx);
    // Sell bench overflow of low-value duplicates when bench is full and gold is low.
    const p = P(s, playerId);
    if (p.bench.every((b) => b !== null) && p.gold < 4) {
      const worst = p.bench.filter((b): b is string => !!b).map((id) => ({ id, v: cardOvr(ctx.defs.get(s.cards[id]!.defId)!) + s.cards[id]!.star * 20 })).sort((a, b) => a.v - b.v)[0];
      if (worst) s = act(s, playerId, { type: "SELL", cardInstanceId: worst.id }, ctx);
    }
    return s;
  },
};

export type { Location };
