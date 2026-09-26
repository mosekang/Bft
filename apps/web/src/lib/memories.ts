/**
 * The run's memorable plays (§14.1 result screen: 명장면 3개). Each of my
 * matchups contributes its most important highlight when it is played back.
 */
import type { GameState, Matchup } from "@dugout/protocol";
import { eventImportance } from "@dugout/engine";
import { describe } from "./commentary.js";

export interface Memory { key: string; round: string; text: string; score: number; type: string; mine: boolean }

let memories: Memory[] = [];
let seedOf = "";

export function rememberMatch(state: GameState, m: Matchup, homeName: string, awayName: string, me: string): void {
  if (seedOf !== state.seed) { memories = []; seedOf = state.seed; }
  const key = `${state.round}:${m.home}:${m.away}:${m.game ?? 0}`;
  if (memories.some((x) => x.key === key)) return;
  let best = -1, bestScore = -1;
  m.events.forEach((e, i) => {
    if (e.type === "INNING_END" || e.type === "GAME_END" || e.type === "PITCHING_CHANGE") return;
    const s = eventImportance(e) + (e.type === "HR" ? 2 : 0);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  const e = m.events[best];
  if (!e) return;
  const myBatting = (e.half === "T" ? m.away : m.home) === me;
  memories.push({ key, round: state.round, text: describe(e, m, homeName, awayName), score: bestScore + (myBatting ? 3 : 0), type: e.type, mine: myBatting });
}

export function topMemories(seed: string, n = 3): Memory[] {
  if (seed !== seedOf) return [];
  return [...memories].sort((a, b) => b.score - a.score).slice(0, n);
}
