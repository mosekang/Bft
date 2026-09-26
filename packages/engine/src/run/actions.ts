import type { Action, GameState, ItemId, PlayerState } from "@dugout/protocol";
import { ECONOMY, sellValue } from "../config/economy.js";
import { LEVELS } from "../config/levels.js";
import { alive, currentRound, err, getPlayer, ok, roundRng, type Result, type RunContext } from "./context.js";
import { applyAugmentPick, grantChosenCard, offerAugments } from "./augments.js";
import { autoOrder, moveCard, pruneBoard } from "./board.js";
import { autoMerge, grantCard, ownedIds, sellCard } from "./cards.js";
import { advanceWave, buildCarousel, carouselDone, currentWave } from "./carousel.js";
import { rerollCost, xpCost } from "./economy.js";
import { computeEffects } from "./effects.js";
import { tradeOffers } from "./events.js";
import { equipItem, giveItems } from "./items.js";
import { playRound } from "./round.js";
import { addXp, rollShop } from "./shop.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const set = (state: GameState, id: string, patch: Partial<PlayerState>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
const setAll = (state: GameState, fn: (p: PlayerState) => Partial<PlayerState>): GameState => ({ ...state, players: state.players.map((p) => ({ ...p, ...fn(p) })) });
const stageOf = (state: GameState, ctx: RunContext) => currentRound(state, ctx).stage;
const runEffects = (state: GameState, p: PlayerState, ctx: RunContext) => computeEffects(p, state.cards, ctx, stageOf(state, ctx)).run;
const humansAlive = (state: GameState) => state.players.filter((p) => alive(p) && !p.isBot);

/** Deal a fresh shop to a player (respecting lock). */
function dealShop(state: GameState, p: PlayerState, ctx: RunContext, label: string): GameState {
  if (p.shopLocked) return state;
  const rng = roundRng(state, `shop:${p.id}:${label}`);
  const { state: s, shop } = rollShop(state, p, rng, ctx);
  return set(s, p.id, { shop });
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

/** Enter the round at `state.roundIndex`: augment → carousel → event/prep. */
export function startRound(state: GameState, ctx: RunContext): GameState {
  const round = currentRound(state, ctx);
  let s: GameState = { ...state, round: round.code, matchups: [], carousel: undefined };
  s = setAll(s, (p) => ({ ready: false, rerollCount: 0, augmentOffer: undefined, tradesLeft: undefined }));
  if (round.augmentPick) {
    const rng = roundRng(s, "augment");
    s = setAll(s, (p) => (alive(p) ? { augmentOffer: offerAugments(p, rng.fork(p.id)) } : {}));
    return { ...s, phase: "AUGMENT" };
  }
  return afterAugments(s, ctx);
}

function afterAugments(state: GameState, ctx: RunContext): GameState {
  const round = currentRound(state, ctx);
  if (round.kind === "FA_MARKET") return { ...buildCarousel(state, round.stage, roundRng(state, "carousel"), ctx), phase: "CAROUSEL" };
  return afterCarousel(state, ctx);
}

function afterCarousel(state: GameState, ctx: RunContext): GameState {
  const round = currentRound(state, ctx);
  let s: GameState = { ...state, carousel: undefined };
  if (round.kind === "RAIN_OUT") {
    const rng = roundRng(s, "rain");
    s = setAll(s, (p) => {
      if (!alive(p)) return {};
      const dome = p.stadium === "DOME";
      return dome ? giveItems({ ...p, ready: false }, [rng.fork(p.id).pick(["BAT", "SPIKES", "GLOVE", "ROSIN", "ICING", "SCOUTING"] as const)]) : { gold: p.gold + 3, ready: false };
    });
    const cards = { ...s.cards };
    for (const p of s.players) if (alive(p)) for (const id of ownedIds(p)) if (cards[id]) cards[id] = { ...cards[id]!, fatigue: p.stadium === "DOME" ? cards[id]!.fatigue : 0, injuredRounds: Math.max(0, cards[id]!.injuredRounds - 1) };
    return { ...s, cards, phase: "EVENT" };
  }
  if (round.kind === "TRADE_DEADLINE") {
    s = setAll(s, (p) => (alive(p) ? { tradesLeft: runEffects(s, p, ctx).tradeSwaps, ready: false } : {}));
    return { ...s, phase: "EVENT" };
  }
  return enterPrep(s, ctx);
}

function enterPrep(state: GameState, ctx: RunContext): GameState {
  let s = state;
  for (const p of s.players) if (alive(p)) s = dealShop(s, s.players.find((x) => x.id === p.id)!, ctx, "deal");
  return { ...s, phase: "PREP" };
}

/** No-game rounds (rain-out, trade deadline) settle income only. */
function settleNoGame(state: GameState, ctx: RunContext): GameState {
  const round = currentRound(state, ctx);
  const s = setAll(state, (p) => {
    if (!alive(p)) return {};
    const eff = runEffects(state, p, ctx);
    const base = round.kind === "RAIN_OUT" ? 0 : 5; // rain-out already paid +3 flat (§10.2)
    const interest = Math.min(eff.interestCap, Math.floor(p.gold / ECONOMY.interestPer));
    const income = { base, interest, streak: 0, saveBonus: 0, total: base + interest };
    return { ...addXp({ ...p, gold: p.gold + income.total }, ECONOMY.freeXpPerRound), lastIncome: income, ready: false, tradesLeft: undefined, choice: undefined };
  });
  return nextRound(s, ctx);
}

export function nextRound(state: GameState, ctx: RunContext): GameState {
  if (state.roundIndex + 1 >= ctx.schedule.length) return { ...state, phase: "GAME_OVER" };
  return startRound({ ...state, roundIndex: state.roundIndex + 1, version: state.version + 1 }, ctx);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Development-time invariant checks (enabled by tests and the debug CLI). */
let assertionsEnabled = false;
export function setAssertions(on: boolean): void {
  assertionsEnabled = on;
}
export function assertInvariants(state: GameState, where: string): void {
  for (const p of state.players) {
    for (const id of ownedIds(p)) if (!state.cards[id]) throw new Error(`invariant: dangling card ${id} owned by ${p.id} after ${where} (phase ${state.phase}, round ${state.round})`);
    const seen = new Set<string>();
    for (const id of ownedIds(p)) { if (seen.has(id)) throw new Error(`invariant: card ${id} owned twice by ${p.id} after ${where}`); seen.add(id); }
    if (p.gold < 0) throw new Error(`invariant: negative gold for ${p.id} after ${where}`);
  }
  for (const [id, n] of Object.entries(state.pool)) if (n < 0) throw new Error(`invariant: pool negative for ${id} after ${where}`);
}

/** Validate and apply one action for one player (§12.3, §13). Never throws on bad input. */
export function applyAction(state: GameState, playerId: string, action: Action, ctx: RunContext): Result<GameState> {
  const r = applyActionInner(state, playerId, action, ctx);
  if (assertionsEnabled && r.ok) assertInvariants(r.value, `${playerId}:${action.type}`);
  return r;
}

function applyActionInner(state: GameState, playerId: string, action: Action, ctx: RunContext): Result<GameState> {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return err("INVALID_CARD", "unknown player");
  if (!alive(p) && action.type !== "PING" && action.type !== "EMOTE" && action.type !== "SKIP_PLAYBACK" && action.type !== "READY") return err("BAD_PHASE", "eliminated");
  const phase = state.phase;
  const logged = (s: GameState): Result<GameState> => ok({ ...s, version: s.version + 1, log: [...s.log, action] });

  switch (action.type) {
    case "PING":
    case "EMOTE":
    case "JOIN":
      return ok(state);

    case "PICK_STADIUM": {
      if (phase !== "STADIUM") return err("BAD_PHASE", "not choosing stadiums");
      if (p.stadiumPicked) return err("BAD_PHASE", "already picked");
      return logged(set(state, playerId, { stadium: action.id, stadiumPicked: true }));
    }

    case "PICK_AUGMENT": {
      if (phase !== "AUGMENT" || !p.augmentOffer) return err("BAD_PHASE", "no augment offer");
      const id = p.augmentOffer[action.idx];
      if (!id) return err("INVALID_SLOT", "bad augment index");
      return logged(applyAugmentPick(state, playerId, id, ctx, roundRng(state, `augpick:${playerId}`)));
    }

    case "PICK_CAROUSEL": {
      if (phase !== "CAROUSEL" || !state.carousel) return err("BAD_PHASE", "no carousel");
      const c = state.carousel;
      if (!currentWave(c).includes(playerId)) return err("NOT_YOUR_TURN", "wait for your wave");
      const card = c.cards[action.idx];
      if (!card || c.taken[action.idx]) return err("INVALID_SLOT", "card already taken");
      let s: GameState = { ...state, carousel: { ...c, taken: c.taken.map((t, i) => (i === action.idx ? playerId : t)) } };
      // Bench full → auto-sell the cheapest bench card (§10.1).
      s = makeBenchRoom(s, playerId, ctx);
      const eff = runEffects(s, s.players.find((x) => x.id === playerId)!, ctx);
      const g = grantCard(s, playerId, card.defId, ctx, { fromPool: false, copiesPerStar: eff.copiesPerStar });
      s = g.ok ? g.state : s;
      if (card.item) s = set(s, playerId, giveItems(s.players.find((x) => x.id === playerId)!, [card.item]));
      s = { ...s, carousel: advanceWave(s.carousel!) };
      return logged(s);
    }

    case "PICK_CHOICE": {
      if (!p.choice) return err("BAD_PHASE", "nothing to choose");
      const choice = p.choice;
      const eff = runEffects(state, p, ctx);
      if (choice.kind === "ITEM") {
        const item = choice.options[action.idx];
        if (!item) return err("INVALID_SLOT", "bad option");
        return logged(set(state, playerId, { itemsUnequipped: [...p.itemsUnequipped, item], choice: undefined }));
      }
      if (choice.kind === "CARD") {
        const defId = choice.options[action.idx];
        if (!defId) return err("INVALID_SLOT", "bad option");
        return logged(grantChosenCard(makeBenchRoom(state, playerId, ctx), playerId, defId, choice.star, ctx, eff.copiesPerStar));
      }
      return err("BAD_PHASE", "use TRADE");
    }

    case "TRADE": {
      if (phase !== "EVENT" || currentRound(state, ctx).kind !== "TRADE_DEADLINE") return err("BAD_PHASE", "not the trade deadline");
      if ((p.tradesLeft ?? 0) <= 0) return err("BAD_PHASE", "no trades left");
      const card = state.cards[action.cardInstanceId];
      if (!card || !ownedIds(p).includes(action.cardInstanceId)) return err("INVALID_CARD", "card not owned");
      const offers = tradeOffersFor(state, playerId, action.cardInstanceId, ctx);
      const target = offers[action.offerIdx];
      if (!target) return err("INVALID_SLOT", "bad offer index");
      // Swap: the old card's copies return to the pool; the new one arrives at the same star.
      const slotEntry = Object.entries(p.board.slots).find(([, id]) => id === action.cardInstanceId);
      const benchIdx = p.bench.indexOf(action.cardInstanceId);
      let s = sellCard(state, playerId, action.cardInstanceId, ctx, runEffects(state, p, ctx).copiesPerStar);
      // Undo the gold refund: a trade is not a sale.
      const def = ctx.defs.get(card.defId)!;
      s = set(s, playerId, { gold: s.players.find((x) => x.id === playerId)!.gold - sellValue(def.cost, card.star) });
      const g = grantCard(s, playerId, target, ctx, { star: card.star, fromPool: true, copiesPerStar: runEffects(s, s.players.find((x) => x.id === playerId)!, ctx).copiesPerStar });
      if (!g.ok) return err("INVALID_CARD", "pool has no copies of that card");
      s = g.state;
      // Put it back where the old card was.
      if (g.instanceId && s.cards[g.instanceId]) {
        const np = s.players.find((x) => x.id === playerId)!;
        const bench = np.bench.map((b) => (b === g.instanceId ? null : b));
        if (slotEntry) s = set(s, playerId, { bench, board: { ...np.board, slots: { ...np.board.slots, [slotEntry[0]]: g.instanceId } } });
        else if (benchIdx >= 0 && bench[benchIdx] === null) { bench[benchIdx] = g.instanceId; s = set(s, playerId, { bench }); }
      }
      s = set(s, playerId, { tradesLeft: (p.tradesLeft ?? 1) - 1 });
      return logged(s);
    }

    case "BUY": {
      if (phase !== "PREP") return err("BAD_PHASE", "shop is closed");
      const defId = p.shop[action.slot];
      if (!defId) return err("INVALID_SLOT", "empty shop slot");
      const def = ctx.defs.get(defId);
      if (!def) return err("INVALID_CARD", "unknown card");
      if (p.gold < def.cost) return err("NOT_ENOUGH_GOLD", "not enough gold");
      const eff = runEffects(state, p, ctx);
      const g = grantCard(state, playerId, defId, ctx, { fromPool: false, copiesPerStar: eff.copiesPerStar });
      if (!g.ok) return err("BENCH_FULL", "bench is full");
      let s = g.state;
      const np = s.players.find((x) => x.id === playerId)!;
      s = set(s, playerId, { gold: np.gold - def.cost, shop: np.shop.map((x, i) => (i === action.slot ? null : x)) });
      s = set(s, playerId, addXp(s.players.find((x) => x.id === playerId)!, 0));
      return logged(s);
    }

    case "SELL": {
      if (phase !== "PREP" && phase !== "EVENT") return err("BAD_PHASE", "cannot sell now");
      if (!ownedIds(p).includes(action.cardInstanceId)) return err("INVALID_CARD", "card not owned");
      return logged(sellCard(state, playerId, action.cardInstanceId, ctx, runEffects(state, p, ctx).copiesPerStar));
    }

    case "MOVE": {
      if (phase !== "PREP" && phase !== "EVENT" && phase !== "CAROUSEL" && phase !== "AUGMENT") return err("BAD_PHASE", "cannot move now");
      const r = moveCard(p, state.cards, ctx, action.from, action.to);
      if (!r.ok) return r;
      return logged(set(state, playerId, r.value));
    }

    case "REROLL": {
      if (phase !== "PREP") return err("BAD_PHASE", "shop is closed");
      const cost = rerollCost(runEffects(state, p, ctx));
      if (p.gold < cost) return err("NOT_ENOUGH_GOLD", "not enough gold");
      let s = set(state, playerId, { gold: p.gold - cost, shopLocked: false, rerollCount: p.rerollCount + 1 });
      s = dealShop(s, s.players.find((x) => x.id === playerId)!, ctx, `reroll${p.rerollCount + 1}`);
      return logged(s);
    }

    case "BUY_XP": {
      if (phase !== "PREP") return err("BAD_PHASE", "shop is closed");
      if (p.level >= LEVELS.max) return err("LEVEL_CAP", "max level");
      const cost = xpCost(runEffects(state, p, ctx));
      if (p.gold < cost) return err("NOT_ENOUGH_GOLD", "not enough gold");
      return logged(set(state, playerId, addXp({ ...p, gold: p.gold - cost }, ECONOMY.xpPerPurchase)));
    }

    case "LOCK_SHOP":
      if (phase !== "PREP") return err("BAD_PHASE", "shop is closed");
      return logged(set(state, playerId, { shopLocked: action.locked }));

    case "SET_TOGGLE":
      return logged(set(state, playerId, { board: { ...p.board, forcePitch: { ...p.board.forcePitch, [action.slot]: action.forcePitch } } }));

    case "SET_ORDER": {
      if (phase !== "PREP" && phase !== "EVENT" && phase !== "AUGMENT" && phase !== "CAROUSEL") return err("BAD_PHASE", "cannot reorder now");
      if (action.order === "AUTO") return logged(set(state, playerId, autoOrder(p, state.cards, ctx)));
      if (new Set(action.order).size !== 9) return err("INVALID_SLOT", "order must list every hitter slot once");
      return logged(set(state, playerId, { board: { ...p.board, order: action.order } }));
    }

    case "EQUIP": {
      if (phase !== "PREP" && phase !== "EVENT") return err("BAD_PHASE", "cannot equip now");
      const r = equipItem(state, playerId, action.itemId, action.cardInstanceId, ctx);
      if (!r.ok) return r;
      let s = r.value;
      s = autoMerge(s, playerId, ctx, runEffects(s, s.players.find((x) => x.id === playerId)!, ctx).copiesPerStar).state;
      return logged(s);
    }

    case "SKIP_PLAYBACK":
      if (phase !== "PLAYBACK") return err("BAD_PHASE", "nothing to skip");
      return logged(set(state, playerId, { ready: true }));

    case "READY": {
      if (phase === "STADIUM" || phase === "CAROUSEL" || phase === "GAME_OVER") return err("BAD_PHASE", "nothing to confirm");
      let s = state;
      // A pending choice is auto-resolved with the first option (§12.4 timeout rule).
      if (p.choice && p.choice.kind !== "TRADE") {
        const r = applyAction(s, playerId, { type: "PICK_CHOICE", idx: 0 }, ctx);
        if (r.ok) s = r.value;
      }
      if (phase === "AUGMENT" && p.augmentOffer) {
        const r = applyAction(s, playerId, { type: "PICK_AUGMENT", idx: 0 }, ctx);
        if (r.ok) s = r.value;
      }
      return logged(set(s, playerId, { ready: true, choice: undefined }));
    }
  }
}

/** Free a bench slot by selling the cheapest bench card if needed (§10.1 carousel rule). */
function makeBenchRoom(state: GameState, playerId: string, ctx: RunContext): GameState {
  const p = state.players.find((x) => x.id === playerId)!;
  if (p.bench.some((b) => b === null) || p.bench.length < ECONOMY.benchSize + p.benchBonus) return state;
  const cheapest = p.bench.filter((b): b is string => !!b).map((id) => ({ id, value: sellValue(ctx.defs.get(state.cards[id]!.defId)!.cost, state.cards[id]!.star) })).sort((a, b) => a.value - b.value)[0];
  return cheapest ? sellCard(state, playerId, cheapest.id, ctx) : state;
}

/** Trade offers for a card are deterministic per round/player/card, so the UI can preview them. */
export function tradeOffersFor(state: GameState, playerId: string, instanceId: string, ctx: RunContext): string[] {
  const card = state.cards[instanceId];
  if (!card) return [];
  return tradeOffers(state, card.defId, ctx, roundRng(state, `trade:${playerId}:${instanceId}`));
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/** How bots make decisions; implemented in ../bots. Kept abstract to avoid a cycle. */
export interface BotController {
  pickStadium(state: GameState, playerId: string, ctx: RunContext): GameState;
  pickAugment(state: GameState, playerId: string, ctx: RunContext): GameState;
  pickCarousel(state: GameState, playerId: string, ctx: RunContext): GameState;
  resolveChoice(state: GameState, playerId: string, ctx: RunContext): GameState;
  trade(state: GameState, playerId: string, ctx: RunContext): GameState;
  prep(state: GameState, playerId: string, ctx: RunContext): GameState;
}

/**
 * Run bots and phase transitions until a human decision is required or the
 * run is over. Idempotent when nothing can progress.
 */
export interface AdvanceHooks {
  /** Called right after a round's games were simulated and settled (state.matchups holds the results). */
  afterRound?: (state: GameState, before: GameState) => void;
}

export function advance(state: GameState, ctx: RunContext, bots: BotController, hooks: AdvanceHooks = {}): GameState {
  let s = state;
  for (let guard = 0; guard < 200; guard++) {
    const humans = humansAlive(s);
    switch (s.phase) {
      case "LOBBY":
        return s;
      case "STADIUM": {
        for (const p of s.players) if (p.isBot && !p.stadiumPicked) s = bots.pickStadium(s, p.id, ctx);
        if (s.players.every((p) => p.stadiumPicked)) { s = startRound(s, ctx); continue; }
        return s;
      }
      case "AUGMENT": {
        for (const p of s.players) if (alive(p) && p.isBot) {
          if (p.augmentOffer) s = bots.pickAugment(s, p.id, ctx);
          if (s.players.find((x) => x.id === p.id)!.choice) s = bots.resolveChoice(s, p.id, ctx);
        }
        if (s.players.filter(alive).every((p) => !p.augmentOffer)) { s = afterAugments(s, ctx); continue; }
        return s;
      }
      case "CAROUSEL": {
        if (assertionsEnabled) assertInvariants(s, "carousel-enter");
        if (!s.carousel) { s = afterCarousel(s, ctx); continue; }
        let progressed = true;
        while (progressed && !carouselDone(s.carousel!)) {
          progressed = false;
          const wave = currentWave(s.carousel!);
          for (const id of wave) {
            const p = s.players.find((x) => x.id === id)!;
            if (p.isBot) { s = bots.pickCarousel(s, id, ctx); progressed = true; }
          }
          s = { ...s, carousel: advanceWave(s.carousel!) };
          if (currentWave(s.carousel!).some((id) => !s.players.find((x) => x.id === id)!.isBot)) break;
        }
        if (carouselDone(s.carousel!)) { s = afterCarousel(s, ctx); continue; }
        return s;
      }
      case "EVENT": {
        for (const p of s.players) if (alive(p) && p.isBot && !p.ready) s = bots.trade(s, p.id, ctx);
        if (s.players.filter(alive).every((p) => p.ready || p.isBot)) { s = settleNoGame(s, ctx); continue; }
        return s;
      }
      case "PREP": {
        for (const p of s.players) if (alive(p) && p.isBot && !p.ready) {
          s = bots.prep(s, p.id, ctx);
          if (s.players.find((x) => x.id === p.id)!.choice) s = bots.resolveChoice(s, p.id, ctx);
          s = set(s, p.id, { ready: true });
        }
        if (s.players.filter(alive).every((p) => p.ready)) {
          s = { ...s, players: s.players.map((p) => pruneBoard(p, s.cards)) };
          const before = s;
          s = playRound(s, ctx);
          if (assertionsEnabled) assertInvariants(s, "playRound");
          hooks.afterRound?.(s, before);
          continue;
        }
        return s;
      }
      case "PLAYBACK": {
        for (const p of s.players) if (alive(p) && p.isBot && p.choice) s = bots.resolveChoice(s, p.id, ctx);
        if (humans.length === 0 || humans.every((p) => p.ready)) { s = { ...setAll(s, () => ({ ready: false })), phase: "SETTLE" }; continue; }
        return s;
      }
      case "SETTLE": {
        if (humans.length === 0 || humans.every((p) => p.ready)) { s = nextRound(s, ctx); continue; }
        return s;
      }
      case "GAME_OVER":
        return s;
    }
  }
  return s;
}

/** Convenience for UIs: the human's view of whether they must act now. */
export function waitingOn(state: GameState, playerId: string): "STADIUM" | "AUGMENT" | "CAROUSEL" | "EVENT" | "PREP" | "PLAYBACK" | "SETTLE" | "CHOICE" | "NONE" {
  const p = getPlayer(state, playerId);
  if (p.choice) return "CHOICE";
  switch (state.phase) {
    case "STADIUM": return p.stadiumPicked ? "NONE" : "STADIUM";
    case "AUGMENT": return p.augmentOffer ? "AUGMENT" : "NONE";
    case "CAROUSEL": return state.carousel && currentWave(state.carousel).includes(playerId) ? "CAROUSEL" : "NONE";
    case "EVENT": return p.ready ? "NONE" : "EVENT";
    case "PREP": return p.ready ? "NONE" : "PREP";
    case "PLAYBACK": return p.ready ? "NONE" : "PLAYBACK";
    case "SETTLE": return p.ready ? "NONE" : "SETTLE";
    default: return "NONE";
  }
}

export type { ItemId };
