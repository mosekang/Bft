import type { AugmentId, Archetype, GameState, StadiumId, SynergyId } from "@dugout/protocol";
import { ARCHETYPES } from "@dugout/protocol";
import { bots } from "./bots/index.js";
import { cardOvr } from "./ratings.js";
import { advance } from "./run/actions.js";
import { alive, createContext, type RunContext } from "./run/context.js";
import { activeSynergies, countSynergies } from "./run/synergies.js";
import { createRun } from "./run/state.js";
import type { Pack } from "@dugout/protocol";

export interface ArenaOptions {
  games: number;
  seed: string;
  pack: Pack;
  onProgress?: (done: number) => void;
}

export interface Metric {
  key: string;
  value: number | string;
  target: string;
  ok: boolean;
  suspects?: string[];
}

export interface ArenaReport {
  games: number;
  seed: string;
  metrics: Metric[];
  archetypePlacement: Record<string, number>;
  augmentPlacement: Record<string, { picks: number; avg: number }>;
  stadiumPlacement: Record<string, { picks: number; avg: number }>;
  topSynergyCombos: { combo: string; share: number }[];
  synergyShareInWinners: Record<string, number>;
  ok: boolean;
}

interface Acc {
  rounds: number[];
  strongWins: number;
  strongTotal: number;
  draws: number;
  games: number;
  runs: number;
  teamGames: number;
  archPlace: Map<Archetype, number[]>;
  augPlace: Map<AugmentId, number[]>;
  stadPlace: Map<StadiumId, number[]>;
  winnerCombos: Map<string, number>;
  winnerSynergies: Map<SynergyId, number>;
  fiveCostTwoStar: number;
  earlyOuts: number;
  players: number;
  replAtS6: number[];
}

function boardOvr(state: GameState, id: string, ctx: RunContext): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) return 0;
  let sum = 0;
  for (const cid of Object.values(p.board.slots)) {
    const c = cid ? state.cards[cid] : undefined;
    const def = c ? ctx.defs.get(c.defId) : undefined;
    if (def && c) sum += cardOvr(def) + (c.star - 1) * 12 + c.growth;
  }
  const empties = 12 - Object.values(p.board.slots).filter(Boolean).length;
  return sum + empties * 38;
}

/** Play one full run with 8 bots (one per archetype) and collect statistics. */
export function playBotRun(seed: string, ctx: RunContext, acc: Acc): GameState {
  const players = ARCHETYPES.map((a, i) => ({ id: `bot${i + 1}`, nickname: a, isBot: true, archetype: a }));
  let s = createRun(ctx, { seed, players, fillWithBots: false });
  let s6Checked = false;
  const afterRound = (s: GameState, before: GameState) => {
    {
      const stage = Number(s.round.split("-")[0]);
      for (const m of s.matchups) {
        if (m.kind !== "PVP" && m.kind !== "PLAYOFF" && m.kind !== "FINAL") continue;
        acc.games++;
        acc.runs += m.score[0] + m.score[1];
        acc.teamGames += 2;
        if (m.winner === null) acc.draws++;
        else {
          const hOvr = boardOvr(before, m.home, ctx);
          const aOvr = boardOvr(before, m.away, ctx);
          // "Strong vs weak": board totals differ by at least 10 % (≈ 5 OVR per slot).
          if (Math.abs(hOvr - aOvr) >= 0.1 * Math.min(hOvr, aOvr)) {
            acc.strongTotal++;
            if ((hOvr > aOvr) === (m.winner === m.home)) acc.strongWins++;
          }
        }
      }
      if (stage === 6 && !s6Checked) {
        s6Checked = true;
        for (const p of s.players) if (alive(p)) acc.replAtS6.push(12 - Object.values(p.board.slots).filter(Boolean).length);
      }
    }
  };
  for (let guard = 0; guard < 400 && s.phase !== "GAME_OVER"; guard++) {
    const before = s;
    s = advance(s, ctx, bots, { afterRound });
    if (s === before && s.phase !== "GAME_OVER") break; // stuck: humans required (should not happen)
  }
  // Final bookkeeping.
  acc.rounds.push(s.roundIndex + 1);
  acc.players += s.players.length;
  for (const p of s.players) {
    const place = p.placement ?? 8;
    if (p.archetype) acc.archPlace.set(p.archetype, [...(acc.archPlace.get(p.archetype) ?? []), place]);
    for (const a of p.augments) acc.augPlace.set(a, [...(acc.augPlace.get(a) ?? []), place]);
    acc.stadPlace.set(p.stadium, [...(acc.stadPlace.get(p.stadium) ?? []), place]);
    if (p.eliminatedAt && Number(p.eliminatedAt.split("-")[0]) < 3) acc.earlyOuts++;
    for (const cid of Object.values(p.board.slots)) {
      const c = cid ? s.cards[cid] : undefined;
      const def = c ? ctx.defs.get(c.defId) : undefined;
      if (c && def && def.cost === 5 && c.star >= 2) acc.fiveCostTwoStar++;
    }
    if (place === 1) {
      const active = activeSynergies(countSynergies(p, s.cards, ctx)).filter((x) => x.tier > 0);
      const combo = active.map((x) => `${x.id}${x.tier}`).sort().slice(0, 4).join("+") || "none";
      acc.winnerCombos.set(combo, (acc.winnerCombos.get(combo) ?? 0) + 1);
      for (const x of active) acc.winnerSynergies.set(x.id, (acc.winnerSynergies.get(x.id) ?? 0) + 1);
    }
  }
  return s;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function botArena(opts: ArenaOptions): ArenaReport {
  const ctx = createContext(opts.pack);
  const acc: Acc = { rounds: [], strongWins: 0, strongTotal: 0, draws: 0, games: 0, runs: 0, teamGames: 0, archPlace: new Map(), augPlace: new Map(), stadPlace: new Map(), winnerCombos: new Map(), winnerSynergies: new Map(), fiveCostTwoStar: 0, earlyOuts: 0, players: 0, replAtS6: [] };
  for (let i = 0; i < opts.games; i++) {
    playBotRun(`${opts.seed}:${i}`, ctx, acc);
    opts.onProgress?.(i + 1);
  }
  const n = opts.games;
  const metrics: Metric[] = [];
  const push = (key: string, value: number, target: string, ok: boolean, fmt = (v: number) => v.toFixed(2), suspects: string[] = []) => metrics.push({ key, value: fmt(value), target, ok, ...(ok ? {} : { suspects }) });

  const rounds = avg(acc.rounds);
  push("avgRounds", rounds, "26 ± 4", rounds >= 22 && rounds <= 30, undefined, ["DAMAGE.stageBase", "DAMAGE.runDiffCap"]);
  const strong = acc.strongTotal ? acc.strongWins / acc.strongTotal : 0;
  push("strongTeamWinRate", strong, "0.65~0.75", strong >= 0.65 && strong <= 0.75, (v) => v.toFixed(3), ["PIVOT", "RATING_K", "REPLACEMENT.rating"]);
  const draws = acc.games ? acc.draws / acc.games : 0;
  push("drawRate", draws, "0.03~0.07", draws >= 0.03 && draws <= 0.07, (v) => v.toFixed(3), ["GAME.extraInnings", "GAME.maxInnings"]);
  const rpg = acc.teamGames ? acc.runs / acc.teamGames : 0;
  push("runsPerTeamGame", rpg, "4.4~5.2", rpg >= 4.4 && rpg <= 5.2, undefined, ["PIVOT.hitter", "LEAGUE.babip", "RATING_K"]);

  const combos = [...acc.winnerCombos.entries()].sort((a, b) => b[1] - a[1]);
  const top5 = combos.slice(0, 5).reduce((a, [, c]) => a + c, 0) / Math.max(1, n);
  push("top5WinnerComboShare", top5, "< 0.60", top5 < 0.6, (v) => v.toFixed(3), ["SYNERGIES tiers", "bot archetype tag preferences"]);
  const synergyShare: Record<string, number> = {};
  let minShare = 1;
  let minId = "";
  for (const id of Object.keys(acc.winnerSynergies.size ? Object.fromEntries(acc.winnerSynergies) : {})) {
    const share = (acc.winnerSynergies.get(id as SynergyId) ?? 0) / Math.max(1, n);
    synergyShare[id] = Number(share.toFixed(3));
    if (share < minShare) { minShare = share; minId = id; }
  }
  const allIds: SynergyId[] = ["HS_PROSPECT", "COLLEGE", "FOREIGN", "VETERAN", "MILITARY_DONE", "JOURNEYMAN", "LEFTY_BAT", "RIGHTY_BAT", "SLUGGER", "CONTACT_HITTER", "SPEEDSTER", "GOLD_GLOVE", "CATCHER", "FIREBALLER", "FINESSE", "INNING_EATER", "CLOSER", "CLUTCH"];
  for (const id of allIds) if (!(id in synergyShare)) { synergyShare[id] = 0; if (0 < minShare) { minShare = 0; minId = id; } }
  push("minSynergyShareInWinners", minShare, ">= 0.03", minShare >= 0.03, (v) => `${v.toFixed(3)} (${minId})`, [`SYNERGIES.${minId}`, "pack tag counts"]);

  const archetypePlacement: Record<string, number> = {};
  for (const [a, xs] of acc.archPlace) archetypePlacement[a] = Number(avg(xs).toFixed(2));
  const archVals = Object.values(archetypePlacement);
  const archSpread = archVals.length ? Math.max(...archVals) - Math.min(...archVals) : 0;
  push("archetypePlacementSpread", archSpread, "<= 1.5", archSpread <= 1.5, undefined, ["bots level pace", "bots reserve gold", "archetype preferred tags"]);

  const augmentPlacement: Record<string, { picks: number; avg: number }> = {};
  let augOk = true;
  const augBad: string[] = [];
  for (const [a, xs] of acc.augPlace) {
    const m = avg(xs);
    augmentPlacement[a] = { picks: xs.length, avg: Number(m.toFixed(2)) };
    if (xs.length >= 20 && (m < 3 || m > 6)) { augOk = false; augBad.push(a); }
  }
  push("augmentPlacementInRange", augOk ? 1 : 0, "all in 3.0~6.0", augOk, (v) => (v ? "yes" : `no: ${augBad.join(",")}`), augBad.map((a) => `AUGMENTS.${a}`));

  const stadiumPlacement: Record<string, { picks: number; avg: number }> = {};
  const stadVals: number[] = [];
  for (const [st, xs] of acc.stadPlace) { stadiumPlacement[st] = { picks: xs.length, avg: Number(avg(xs).toFixed(2)) }; if (xs.length >= 20) stadVals.push(avg(xs)); }
  const stadSpread = stadVals.length ? Math.max(...stadVals) - Math.min(...stadVals) : 0;
  push("stadiumPlacementSpread", stadSpread, "<= 1.0 (±0.5)", stadSpread <= 1.0, undefined, ["STADIUMS park factors"]);

  const fiveStar = acc.fiveCostTwoStar / Math.max(1, n);
  push("fiveCostTwoStarPerRun", fiveStar, "0.3~0.8", fiveStar >= 0.3 && fiveStar <= 0.8, undefined, ["SHOP_ODDS level 9-10", "POOL_COPIES[5]"]);
  const early = acc.earlyOuts / Math.max(1, acc.players);
  push("eliminatedBeforeS3", early, "< 0.05", early < 0.05, (v) => v.toFixed(3), ["DAMAGE.stageBase[2]", "DAMAGE.pve"]);
  const repl = avg(acc.replAtS6);
  push("replacementSlotsAtS6", repl, "2.5~4.0", repl >= 2.5 && repl <= 4.0, undefined, ["LEVELS.xpToNext", "bots level pace"]);

  return {
    games: n, seed: opts.seed, metrics, archetypePlacement, augmentPlacement, stadiumPlacement,
    topSynergyCombos: combos.slice(0, 5).map(([combo, c]) => ({ combo, share: Number((c / n).toFixed(3)) })),
    synergyShareInWinners: synergyShare, ok: metrics.every((m) => m.ok),
  };
}
