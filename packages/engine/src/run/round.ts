import type { CardInstance, GameState, Matchup, PlayerState } from "@dugout/protocol";
import { DAMAGE, lossDamage } from "../config/damage.js";
import { ECONOMY } from "../config/economy.js";
import { FATIGUE } from "../config/fatigue.js";
import { SCHEDULE, type RoundSpec } from "../config/schedule.js";
import { STADIUMS } from "../config/stadiums.js";
import type { Rng } from "../rng.js";
import { simulateGame } from "../sim/game.js";
import { resolveTeam } from "../sim/resolve.js";
import type { GameOutput, SimTeam } from "../sim/types.js";
import { alive, currentRound, roundRng, type RunContext } from "./context.js";
import { roundIncome } from "./economy.js";
import { computeEffects, type ComputedEffects } from "./effects.js";
import { allStarDefs, legendTeam, trainingTeam } from "./events.js";
import { randomComponent, threeComponents } from "./items.js";
import { pairPlayers } from "./matchmaking.js";
import { backupCatcherRecovery, specialRewardOptions, tickPerks } from "./specials.js";
import { addXp, returnShopToPool } from "./shop.js";

// ---------------------------------------------------------------------------
// Team building
// ---------------------------------------------------------------------------

function teamFor(state: GameState, p: PlayerState, ctx: RunContext, stage: number): { team: SimTeam; effects: ComputedEffects } {
  const effects = computeEffects(p, state.cards, ctx, stage);
  const team = resolveTeam({ teamId: p.id, name: p.nickname, board: p.board, cards: state.cards, defs: ctx.defs, stadium: p.stadium, effects: effects.team });
  return { team, effects };
}

function ghostTeam(state: GameState, ghostOf: PlayerState, ctx: RunContext, stage: number): SimTeam {
  // Ghost: snapshot board, fatigue 0.
  const cards: Record<string, CardInstance> = {};
  for (const [id, c] of Object.entries(state.cards)) cards[id] = { ...c, fatigue: 0, injuredRounds: 0 };
  const effects = computeEffects(ghostOf, cards, ctx, stage);
  const t = resolveTeam({ teamId: `GHOST:${ghostOf.id}`, name: `${ghostOf.nickname}(고스트)`, board: ghostOf.board, cards, defs: ctx.defs, stadium: ghostOf.stadium, effects: effects.team });
  return t;
}

function allStarTeam(state: GameState, p: PlayerState, ctx: RunContext, rng: Rng): SimTeam {
  const { slots } = allStarDefs(state, p, ctx, rng);
  const cards: Record<string, CardInstance> = {};
  const boardSlots: Record<string, string> = {};
  let i = 0;
  for (const [slot, def] of Object.entries(slots)) {
    if (!def) continue;
    const id = `AS${i++}`;
    cards[id] = { instanceId: id, defId: def.id, star: 1, items: [], fatigue: 0, injuredRounds: 0, growth: 0 };
    boardSlots[slot] = id;
  }
  const fake: PlayerState = { ...p, id: "PVE:ALLSTAR", nickname: "올스타", board: { slots: boardSlots as PlayerState["board"]["slots"], forcePitch: { P1: false, P2: false, P3: false }, order: p.board.order }, augments: [], level: p.level + 1 };
  const effects = computeEffects(fake, cards, ctx, 2);
  return resolveTeam({ teamId: "PVE:ALLSTAR", name: "올스타", board: fake.board, cards, defs: ctx.defs, stadium: p.stadium, effects: effects.team });
}

function namesOf(team: SimTeam): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of team.lineup) out[h.id] = h.name;
  out[team.starter.id] = team.starter.name;
  for (const p of team.bullpen) out[p.id] = p.name;
  return out;
}

// ---------------------------------------------------------------------------
// Playing a round
// ---------------------------------------------------------------------------

interface GameRecord {
  matchup: Matchup;
  output: GameOutput;
  home: SimTeam;
  away: SimTeam;
  homeEffects?: ComputedEffects;
  awayEffects?: ComputedEffects;
}

function play(home: SimTeam, away: SimTeam, seed: string, kind: string, game?: number): { output: GameOutput; matchup: Omit<Matchup, "damage"> } {
  // ABS: if either side has it, framing is off for both.
  if (home.mods.framingDisabled || away.mods.framingDisabled) {
    home = { ...home, mods: { ...home.mods, framingDisabled: true } };
    away = { ...away, mods: { ...away.mods, framingDisabled: true } };
  }
  const output = simulateGame({ home, away, stadium: STADIUMS[home.stadium], seed });
  const matchup: Omit<Matchup, "damage"> = {
    home: home.id, away: away.id, homeStadium: home.stadium, events: output.events, score: output.score, highlights: output.highlights,
    names: { ...namesOf(home), ...namesOf(away) }, kind, winner: output.winner === "home" ? home.id : output.winner === "away" ? away.id : null, ...(game ? { game } : {}),
  };
  return { output, matchup };
}

/**
 * Simulate every game of the current round and apply all consequences
 * (damage, streaks, fatigue, injuries, growth, income, XP, rewards,
 * eliminations). Leaves the state in PLAYBACK (or GAME_OVER).
 */
export function playRound(state: GameState, ctx: RunContext): GameState {
  const round = currentRound(state, ctx);
  const rng = roundRng(state, "match");
  const stage = round.stage;
  const alivePlayers = state.players.filter(alive);
  const records: GameRecord[] = [];
  const seedFor = (i: number, g = 1) => `${state.seed}:${state.roundIndex}:${i}:${g}`;
  const effectsById = new Map<string, ComputedEffects>();
  const teamOf = (p: PlayerState) => {
    const t = teamFor(state, p, ctx, stage);
    effectsById.set(p.id, t.effects);
    return t.team;
  };

  if (round.kind === "PVE_CAMP" || round.kind === "ALL_STAR" || round.kind === "LEGEND_MATCH") {
    alivePlayers.forEach((p, i) => {
      const home = teamOf(p);
      const away = round.kind === "PVE_CAMP" ? trainingTeam(p.stadium) : round.kind === "LEGEND_MATCH" ? legendTeam(p.stadium) : allStarTeam(state, p, ctx, rng.fork(`allstar:${p.id}`));
      const { output, matchup } = play(home, away, seedFor(i), round.kind);
      const lost = output.winner === "away";
      const dmg = lost ? (round.kind === "PVE_CAMP" ? DAMAGE.pve.springCamp : round.kind === "ALL_STAR" ? DAMAGE.pve.allStar : DAMAGE.pve.legend) : 0;
      records.push({ matchup: { ...matchup, damage: { [p.id]: dmg } }, output, home, away });
    });
  } else if (round.kind === "PLAYOFF" && alivePlayers.length === 2) {
    const [a, b] = alivePlayers as [PlayerState, PlayerState];
    const homeFirst = rng.chance(0.5) ? a : b;
    const other = homeFirst === a ? b : a;
    let winsA = 0, winsB = 0, g = 1;
    const damage: Record<string, number> = { [a.id]: 0, [b.id]: 0 };
    while (winsA < 2 && winsB < 2 && g <= 3) {
      const home = g % 2 === 1 ? teamOf(homeFirst) : teamOf(other);
      const away = g % 2 === 1 ? teamOf(other) : teamOf(homeFirst);
      const { output, matchup } = play(home, away, seedFor(0, g), "FINAL", g);
      const winner = matchup.winner;
      if (winner === a.id) winsA++;
      else if (winner === b.id) winsB++;
      if (winner) {
        const loser = winner === a.id ? b.id : a.id;
        damage[loser]! += lossDamage(Math.abs(output.score[0] - output.score[1]), 7);
      }
      records.push({ matchup: { ...matchup, damage: { ...damage } }, output, home, away });
      g++;
    }
    // Series loser takes the summed damage; the winner takes none.
    const seriesWinner = winsA > winsB ? a.id : winsB > winsA ? b.id : null;
    for (const r of records) r.matchup = { ...r.matchup, damage: seriesWinner ? { [seriesWinner === a.id ? b.id : a.id]: damage[seriesWinner === a.id ? b.id : a.id]! } : {} };
    if (seriesWinner) {
      // Guarantee elimination of the series loser: damage at least the loser's hp.
      const loserId = seriesWinner === a.id ? b.id : a.id;
      const loser = state.players.find((p) => p.id === loserId)!;
      const last = records[records.length - 1]!;
      last.matchup = { ...last.matchup, damage: { [loserId]: Math.max(damage[loserId]!, loser.hp) } };
      for (const r of records.slice(0, -1)) r.matchup = { ...r.matchup, damage: {} };
    }
  } else {
    const pairs = pairPlayers(state, rng.fork("pairs"));
    pairs.forEach((pair, i) => {
      const homeP = state.players.find((p) => p.id === pair.home)!;
      const home = teamOf(homeP);
      let away: SimTeam;
      if (pair.ghost) {
        const ghostId = pair.away.replace("GHOST:", "");
        const ghostP = state.players.find((p) => p.id === ghostId);
        away = ghostP ? ghostTeam(state, ghostP, ctx, stage) : trainingTeam(homeP.stadium);
      } else {
        away = teamOf(state.players.find((p) => p.id === pair.away)!);
      }
      const kind = round.kind === "PLAYOFF" ? "PLAYOFF" : pair.ghost ? "GHOST" : "PVP";
      const { output, matchup } = play(home, away, seedFor(i), kind);
      const diff = Math.abs(output.score[0] - output.score[1]);
      const damage: Record<string, number> = {};
      if (output.winner === "home" && !pair.ghost) damage[pair.away] = lossDamage(diff, stage);
      if (output.winner === "away") damage[pair.home] = Math.round(lossDamage(diff, stage) * (pair.ghost ? DAMAGE.ghostMultiplier : 1));
      records.push({ matchup: { ...matchup, damage }, output, home, away });
    });
  }

  let s: GameState = { ...state, matchups: records.map((r) => r.matchup) };
  s = applyResults(s, records, round, ctx, effectsById, rng.fork("settle"));
  return s;
}

// ---------------------------------------------------------------------------
// Consequences
// ---------------------------------------------------------------------------

function applyResults(state: GameState, records: GameRecord[], round: RoundSpec, ctx: RunContext, effectsById: Map<string, ComputedEffects>, rng: Rng): GameState {
  const aliveBefore = state.players.filter(alive);
  const results = new Map<string, "W" | "L" | "D">();
  const damage = new Map<string, number>();
  const saveWin = new Set<string>();
  const homeWins = new Map<string, number>();
  const used = new Map<string, { id: string; outs: number; started: boolean }[]>();
  const rewardItems = new Map<string, string[]>();
  let s = state;

  for (const r of records) {
    for (const side of ["home", "away"] as const) {
      const team = side === "home" ? r.home : r.away;
      if (!state.players.some((p) => p.id === team.id)) continue; // PvE / ghost
      const win = r.output.winner === side;
      const res: "W" | "L" | "D" = r.output.winner === null ? "D" : win ? "W" : "L";
      // Best-of-3: last game decides the recorded result.
      results.set(team.id, res);
      const arr = used.get(team.id) ?? [];
      arr.push(...r.output.pitchersUsed[side].filter((u) => !u.id.startsWith("REPL")));
      used.set(team.id, arr);
      if (win && side === "home") homeWins.set(team.id, (homeWins.get(team.id) ?? 0) + 1);
      if (win) {
        const box = side === "home" ? r.output.home : r.output.away;
        if ([...box.pitching.values()].some((l) => l.decision === "SV")) saveWin.add(team.id);
      }
    }
    for (const [pid, d] of Object.entries(r.matchup.damage)) damage.set(pid, (damage.get(pid) ?? 0) + d);
  }

  // Rewards for PvE rounds.
  for (const r of records) {
    const pid = r.home.id;
    const p = state.players.find((x) => x.id === pid);
    if (!p) continue;
    const won = r.output.winner === "home";
    if (round.kind === "PVE_CAMP" && won) {
      const reward = SCHEDULE.campRewards[round.code];
      if (reward === "ITEM") rewardItems.set(pid, [randomComponent(rng.fork(`camp:${pid}`))]);
      if (reward === "GOLD_3") s = { ...s, players: s.players.map((x) => (x.id === pid ? { ...x, gold: x.gold + 3 } : x)) };
    }
    if (round.kind === "ALL_STAR") {
      if (won) s = { ...s, players: s.players.map((x) => (x.id === pid ? { ...x, choice: { kind: "ITEM", options: threeComponents(rng.fork(`allstar:${pid}`)) } } : x)) };
      else rewardItems.set(pid, [randomComponent(rng.fork(`allstar:${pid}`))]);
    }
    if (round.kind === "LEGEND_MATCH" && won) {
      const options = specialRewardOptions(rng.fork(`legend:${pid}`));
      s = { ...s, players: s.players.map((x) => (x.id === pid ? { ...x, choice: { kind: "ITEM", options } } : x)) };
    }
  }

  // Per-player settle.
  const cards: Record<string, CardInstance> = { ...s.cards };
  const players = s.players.map((p): PlayerState => {
    if (!alive(p)) return p;
    const eff = effectsById.get(p.id)?.run;
    const res = results.get(p.id);
    let winStreak = p.winStreak, loseStreak = p.loseStreak;
    if (res === "W") { winStreak++; loseStreak = 0; }
    if (res === "L") { loseStreak++; winStreak = 0; }
    const hp = Math.max(0, p.hp - (damage.get(p.id) ?? 0));

    // Fatigue: decrement everyone, then set for pitchers who worked.
    const owned = [...Object.values(p.board.slots), ...p.bench].filter((x): x is string => !!x);
    const worked = new Map((used.get(p.id) ?? []).map((u) => [u.id, u]));
    for (const id of owned) {
      const c = cards[id];
      if (!c) continue;
      let fatigue = Math.max(0, c.fatigue - 1);
      let injuredRounds = Math.max(0, c.injuredRounds - 1);
      const u = worked.get(id);
      if (u) {
        const def = ctx.defs.get(c.defId);
        const wasTired = c.fatigue > 0;
        if (u.started && def?.role === "SP") fatigue = Math.max(0, (eff?.starterFatigue.get(id) ?? FATIGUE.starterRounds) + (eff?.teamFatigueAdd ?? 0));
        else if (def?.role === "RP") fatigue = u.outs >= 6 ? (eff?.relieverFatigue.get(id) ?? FATIGUE.relieverRoundsAfterTwoInnings) : Math.max(0, c.fatigue - 1);
        else if (u.started) fatigue = Math.max(0, (eff?.starterFatigue.get(id) ?? FATIGUE.starterRounds) + (eff?.teamFatigueAdd ?? 0));
        if ((eff?.teamFatigueAdd ?? 0) < 0 && fatigue < 1 && u.started) fatigue = 1;
        if (wasTired) {
          const chance = eff?.teamInjuryChance ?? FATIGUE.tiredInjuryChance;
          if (!eff?.injuryImmune.has(id) && rng.fork(`injury:${id}`).chance(chance)) injuredRounds = FATIGUE.injuryRounds;
        }
      }
      const growthAdd = eff?.growthPerRound.get(id) ?? 0;
      const cap = eff?.growthCap.get(id) ?? 20;
      const growth = growthAdd > 0 ? Math.max(c.growth, Math.min(cap, c.growth + growthAdd)) : c.growth;
      if (fatigue !== c.fatigue || injuredRounds !== c.injuredRounds || growth !== c.growth) cards[id] = { ...c, fatigue, injuredRounds, growth };
    }
    // BACKUP_CATCHER: a seeded chance that one tired pitcher recovers a round early.
    if (eff) Object.assign(cards, backupCatcherRecovery(cards, owned, eff, ctx, rng.fork(`backup:${p.id}`)));

    const homeWinGold = (eff?.homeWinGold ?? 0) * (homeWins.get(p.id) ?? 0);
    const income = roundIncome({ ...p, hp, winStreak, loseStreak }, round.code, eff ?? { interestCap: 5, saveWinGold: 0 }, saveWin.has(p.id), homeWinGold);
    const withXp = addXp({ ...tickPerks(p), gold: p.gold + income.total }, ECONOMY.freeXpPerRound);
    const items = rewardItems.get(p.id) ?? [];
    return {
      ...withXp, hp, winStreak, loseStreak, ready: false, itemsUnequipped: [...withXp.itemsUnequipped, ...(items as PlayerState["itemsUnequipped"])],
      ...(res ? { lastResult: res } : {}), lastIncome: income, scoutingActive: (eff?.revealRotation ?? false) || (withXp.perks?.scoutRounds ?? 0) > 0,
      lastOpponent: opponentOf(records, p.id) ?? p.lastOpponent,
    } as PlayerState;
  });
  s = { ...s, players, cards };

  // Eliminations and placements.
  const eliminated = s.players.filter((p) => alive(p) && p.hp <= 0).sort((a, b) => a.hp - b.hp);
  let placement = aliveBefore.length;
  for (const e of eliminated) {
    s = returnShopToPool(s, e);
    s = { ...s, players: s.players.map((p) => (p.id === e.id ? { ...p, eliminatedAt: round.code, placement: placement--, shop: [null, null, null, null, null] } : p)) };
  }
  const survivors = s.players.filter(alive);
  const lastRound = s.roundIndex >= ctx.schedule.length - 1;
  if (survivors.length <= 1 || lastRound) {
    const ranked = [...survivors].sort((a, b) => b.hp - a.hp || b.level - a.level);
    s = { ...s, players: s.players.map((p) => (alive(p) ? { ...p, placement: ranked.indexOf(p) + 1 } : p)), phase: "GAME_OVER" };
    return s;
  }
  return { ...s, phase: "PLAYBACK" };
}

function opponentOf(records: GameRecord[], pid: string): string | undefined {
  for (const r of records) {
    if (r.home.id === pid) return r.away.id;
    if (r.away.id === pid) return r.home.id;
  }
  return undefined;
}
