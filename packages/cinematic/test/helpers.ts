/** Synthetic events and games for cinematic tests (no engine dependency). */
import type { EventType, GameEvent, Matchup, PlayMeta, RunnerMove } from "@dugout/protocol";
import { createRng, deriveRunnerMoves, highlightImportance, isPlayEvent } from "../src/index.js";

export function syntheticEvent(type: EventType, opts: { withMeta?: boolean; runners?: [boolean, boolean, boolean]; outs?: number; runs?: number; meta?: Partial<PlayMeta> & Record<string, unknown> } = {}): GameEvent {
  const runners = opts.runners ?? (["SB", "CS", "DP", "FC", "SH"].includes(type) ? [true, false, false] : type === "SF" ? [false, false, true] : [true, true, false]);
  const runs = opts.runs ?? (type === "HR" ? 1 + runners.filter(Boolean).length : type === "SF" ? 1 : ["1B", "2B", "3B"].includes(type) && runners[1] ? 1 : 0);
  const e: GameEvent = {
    inning: 7,
    half: "T",
    type,
    batter: "c12",
    pitcher: "c40",
    outs: opts.outs ?? 1,
    runners,
    scoreBefore: [2, 3],
    scoreAfter: [2 + runs, 3],
    meta: { batterName: "Kim", pitcherName: "Park", ...(type === "SB" || type === "CS" ? { runner: "c7" } : {}) },
  };
  if (opts.withMeta) {
    const moves: RunnerMove[] = deriveRunnerMoves(e).map((m) => (m.runner.startsWith("base:") ? { ...m, runner: `r${m.from}` } : m));
    const swing = type === "K" ? "looking" : type === "SH" ? "bunt" : ["BB", "HBP", "SB", "CS", "PITCHING_CHANGE", "INNING_END", "GAME_END"].includes(type) ? "none" : "contact";
    const meta: PlayMeta = {
      bbType: ["GO", "DP", "FC", "E", "SH"].includes(type) ? "GB" : type === "PO" ? "PU" : type === "LO" ? "LD" : "FB",
      direction: "pull",
      fielderSlot: ["GO", "DP", "FC", "E"].includes(type) ? "SS" : type === "PO" ? "2B" : type === "LO" ? "3B" : "CF",
      runnerMoves: moves,
      pitchCount: 5,
      swing,
      leverage: 4,
      isHighlight: true,
      batterHand: "L",
      pitcherHand: "R",
      power: 82,
    };
    e.meta = { ...e.meta, ...meta, ...opts.meta };
  } else if (opts.meta) {
    e.meta = { ...e.meta, ...opts.meta };
  }
  return e;
}

const WEIGHTS: [EventType, number][] = [
  ["K", 0.21],
  ["GO", 0.2],
  ["FO", 0.14],
  ["LO", 0.05],
  ["PO", 0.05],
  ["1B", 0.15],
  ["2B", 0.05],
  ["BB", 0.09],
  ["HR", 0.03],
  ["E", 0.03],
];

function pickType(r: number): EventType {
  let acc = 0;
  for (const [t, w] of WEIGHTS) {
    acc += w;
    if (r < acc) return t;
  }
  return "GO";
}

/** A 9-inning synthetic game with `highlightCount` highlights chosen by importance. */
export function syntheticGame(seed: number, highlightCount = 7, withMeta = false): Matchup {
  const rng = createRng(seed);
  const events: GameEvent[] = [];
  const score: [number, number] = [0, 0];
  for (let inning = 1; inning <= 9; inning++) {
    for (const half of ["T", "B"] as const) {
      if (inning === 6 && half === "T") {
        events.push({ inning, half, type: "PITCHING_CHANGE", batter: "a1", pitcher: "h-p2", outs: 0, runners: [false, false, false], scoreBefore: [...score], scoreAfter: [...score], meta: { toName: "Reliever" } });
      }
      const side = half === "T" ? 0 : 1;
      let outs = 0;
      let bases: [boolean, boolean, boolean] = [false, false, false];
      let batterNo = 0;
      while (outs < 3) {
        const type = pickType(rng.next());
        const before: [number, number] = [...score];
        const runners: [boolean, boolean, boolean] = [...bases];
        let runs = 0;
        const [b1, b2, b3] = bases;
        if (["K", "GO", "FO", "LO", "PO"].includes(type)) outs++;
        else if (type === "HR") {
          runs = 1 + bases.filter(Boolean).length;
          bases = [false, false, false];
        } else if (type === "1B") {
          runs = b3 ? 1 : 0;
          bases = [true, b1, b2];
        } else if (type === "2B") {
          runs = (b2 ? 1 : 0) + (b3 ? 1 : 0);
          bases = [false, true, b1];
        } else {
          runs = b1 && b2 && b3 ? 1 : 0;
          bases = [true, b1 || bases[1], (b1 && b2) || b3];
        }
        score[side] += runs;
        const e: GameEvent = {
          inning,
          half,
          type,
          batter: `${half === "T" ? "a" : "h"}${(batterNo++ % 9) + 1}`,
          pitcher: half === "T" ? "h-p1" : "a-p1",
          outs: ["K", "GO", "FO", "LO", "PO"].includes(type) ? outs - 1 : outs,
          runners,
          scoreBefore: before,
          scoreAfter: [...score],
          meta: { batterName: "B", pitcherName: "P" },
        };
        if (withMeta) {
          const meta: PlayMeta = {
            runnerMoves: deriveRunnerMoves(e),
            pitchCount: 3 + (batterNo % 4),
            swing: type === "K" ? (batterNo % 2 ? "miss" : "looking") : type === "BB" ? "none" : "contact",
            leverage: (inning >= 7 ? 2 : 1) * (Math.abs(before[0] - before[1]) <= 2 ? 2 : 1),
            isHighlight: false,
            batterHand: batterNo % 3 === 0 ? "L" : "R",
            pitcherHand: "R",
            power: 40 + ((batterNo * 7) % 55),
          };
          e.meta = { ...e.meta, ...meta };
        }
        events.push(e);
      }
      events.push({ inning, half, type: "INNING_END", batter: "", pitcher: "p", outs: 3, runners: [false, false, false], scoreBefore: [...score], scoreAfter: [...score] });
    }
  }
  events.push({ inning: 9, half: "B", type: "GAME_END", batter: "", pitcher: "", outs: 3, runners: [false, false, false], scoreBefore: [...score], scoreAfter: [...score], meta: { draw: score[0] === score[1] } });
  // Engine-like pick (§6.5): top (count - 2) by importance + first scoring play + last out.
  const plays = events.map((e, i) => ({ e, i })).filter(({ e }) => isPlayEvent(e));
  const set = new Set(
    [...plays]
      .sort((a, b) => highlightImportance(b.e, b.i, 1) - highlightImportance(a.e, a.i, 1) || a.i - b.i)
      .slice(0, Math.max(0, highlightCount - 2))
      .map((p) => p.i),
  );
  const firstScore = plays.find(({ e }) => e.scoreAfter[0] + e.scoreAfter[1] > e.scoreBefore[0] + e.scoreBefore[1]);
  const lastOut = [...plays].reverse().find(({ e }) => ["K", "GO", "FO", "LO", "PO"].includes(e.type));
  for (const p of [firstScore, lastOut, ...plays]) {
    if (set.size >= highlightCount) break;
    if (p) set.add(p.i);
  }
  const highlights = [...set].sort((a, b) => a - b);
  if (withMeta) for (const i of highlights) events[i]!.meta = { ...events[i]!.meta, isHighlight: true };
  return {
    home: "HOME",
    away: "AWAY",
    homeStadium: "DOME",
    events,
    score: [...score],
    damage: {},
    highlights,
    kind: "PVP",
    winner: score[0] === score[1] ? null : score[0] > score[1] ? "AWAY" : "HOME",
  };
}

/** Replaces the highlights with a typical mix (≈ 2.2 s average): HR 2B 1B 1B K GO FO. */
export function withTypicalHighlights(m: Matchup): Matchup {
  const wish: EventType[] = ["HR", "2B", "1B", "1B", "K", "GO", "FO"];
  const used = new Set<number>();
  for (const type of wish) {
    const i = m.events.findIndex((e, j) => e.type === type && !used.has(j));
    // Fall back to any unused plate appearance when the game lacks this type.
    const j = i >= 0 ? i : m.events.findIndex((e, k) => isPlayEvent(e) && !used.has(k) && e.type !== "HR");
    if (j >= 0) used.add(j);
  }
  // Keep meta.isHighlight (preferred by the reel) in sync when present.
  const events = m.events.map((e, i) => (e.meta && "isHighlight" in e.meta ? { ...e, meta: { ...e.meta, isHighlight: used.has(i) } } : e));
  return { ...m, events, highlights: [...used].sort((a, b) => a - b) };
}
