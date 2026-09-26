import type { Archetype, GameState, PlayerState, StadiumId } from "@dugout/protocol";
import { ARCHETYPES, POS } from "@dugout/protocol";
import { DAMAGE } from "../config/damage.js";
import { ECONOMY } from "../config/economy.js";
import { LEVELS } from "../config/levels.js";
import { createRng } from "../rng.js";
import type { RunContext } from "./context.js";
import { initialPool } from "./shop.js";

export interface PlayerSeed {
  id: string;
  nickname: string;
  isBot: boolean;
  archetype?: Archetype;
}

export interface CreateRunOptions {
  seed: string;
  players: PlayerSeed[];
  /** Fill up to 8 with bots (default true). */
  fillWithBots?: boolean;
  createdAt?: number;
}

export function emptyPlayer(seed: PlayerSeed): PlayerState {
  return {
    id: seed.id, nickname: seed.nickname, isBot: seed.isBot, ...(seed.archetype ? { archetype: seed.archetype } : {}),
    hp: DAMAGE.startHp, gold: ECONOMY.startingGold, xp: 0, level: LEVELS.start, winStreak: 0, loseStreak: 0,
    board: { slots: {}, forcePitch: { P1: false, P2: false, P3: false }, order: [...POS] },
    bench: Array.from({ length: ECONOMY.benchSize }, () => null), shop: [null, null, null, null, null], shopLocked: false,
    augments: [], stadium: "DOME" as StadiumId, itemsUnequipped: [], ready: false, rerollCount: 0, stadiumPicked: false, idleRounds: 0, benchBonus: 0, scoutingActive: false,
  };
}

const BOT_NAMES: Record<Archetype, string> = {
  LONG_BALL: "뻥야구단", SMALL_BALL: "스몰볼단", FOREIGN_RELIANT: "용병천하", PROSPECTS: "유망주팜", DEFENSE_FIRST: "수비제일", ECON: "이자수집가", COPYCAT: "카피캣", REROLL: "리롤중독",
};

/** A new run in the STADIUM phase, pool full, no cards dealt yet. */
export function createRun(ctx: RunContext, opts: CreateRunOptions): GameState {
  const rng = createRng(opts.seed, "run").fork("setup");
  const seeds = [...opts.players];
  if (opts.fillWithBots !== false) {
    const used = new Set(seeds.map((s) => s.archetype).filter(Boolean));
    const free = rng.shuffle(ARCHETYPES.filter((a) => !used.has(a)));
    let i = 0;
    while (seeds.length < 8) {
      const archetype = free[i % free.length] ?? "ECON";
      seeds.push({ id: `bot${i + 1}`, nickname: BOT_NAMES[archetype], isBot: true, archetype });
      i++;
    }
  }
  return {
    version: 0,
    packId: ctx.pack.id,
    seed: opts.seed,
    round: "1-1",
    phase: "STADIUM",
    players: seeds.map(emptyPlayer),
    pool: initialPool(ctx),
    cards: {},
    matchups: [],
    log: [],
    roundIndex: 0,
    nextInstanceId: 1,
    createdAt: opts.createdAt ?? 0,
  };
}
