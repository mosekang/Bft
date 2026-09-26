import type { FieldPos, GameEvent, PlayMeta, RunnerMove, BbType, SwingKind } from "@dugout/protocol";
import { GAME, RATING_PIVOT } from "../config/league.js";
import { PITCHING } from "../config/fatigue.js";
import { createRng, type Rng } from "../rng.js";
import { advanceOnHit, forceAdvance, stealSecond, type Bases } from "./baserunning.js";
import { chooseBattedBall, chooseDirection, chooseHitType, doublePlayProbability, errorProbability, fielderFor, hitProbability, sacFlyProbability } from "./battedBall.js";
import { effectiveHand, paProbabilities } from "./probability.js";
import type { BattingLine, GameInput, GameOutput, PitchingLine, Side, SimHitter, SimPitcher, SimTeam, TeamBox } from "./types.js";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PitcherUse {
  p: SimPitcher;
  line: PitchingLine;
  runsPrevInning: number;
  runsThisInning: number;
  enteredInning: number;
  /** Lead (for the pitching team) when this pitcher entered. */
  leadOnEntry: number;
  isStarter: boolean;
}

interface SideState {
  side: Side;
  team: SimTeam;
  batterIdx: number;
  current: PitcherUse;
  used: PitcherUse[];
  nextReliever: number;
  emergencyCount: number;
  runsByInning: number[];
  batting: Map<string, BattingLine>;
  pitching: Map<string, PitchingLine>;
  /** Pitcher on the mound when this side allowed the other side's go-ahead run. */
  goAheadAllowedBy: PitcherUse | null;
  /** Plate appearances per hitter, for first-PA effects. */
  paCount: Map<string, number>;
}

const newBattingLine = (): BattingLine => ({ pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, bb: 0, k: 0, rbi: 0, r: 0, sb: 0, cs: 0 });
const newPitchingLine = (started: boolean, name: string): PitchingLine => ({ name, outs: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0, pitches: 0, decision: null, started });

function makeUse(p: SimPitcher, inning: number, lead: number, isStarter: boolean): PitcherUse {
  return { p, line: newPitchingLine(isStarter, p.name), runsPrevInning: 0, runsThisInning: 0, enteredInning: inning, leadOnEntry: lead, isStarter };
}

function pitchLimit(u: PitcherUse): number {
  return PITCHING.limitBase + u.p.r.stamina * PITCHING.limitPerStamina + u.p.mods.pitchLimitAdd;
}

function fatigueSteps(u: PitcherUse): number {
  const over = u.line.pitches - pitchLimit(u);
  return over > 0 ? Math.floor(over / PITCHING.decayStep) : 0;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export function simulateGame(input: GameInput): GameOutput {
  const rng = createRng(input.seed, "game");
  // Presentation-only stream: never feeds back into outcomes (swing looks etc.).
  const fx = createRng(input.seed, "presentation");
  const regulation = input.regulationInnings ?? GAME.regulationInnings;
  const maxInnings = input.maxInnings ?? GAME.maxInnings;
  const events: GameEvent[] = [];
  const score: [number, number] = [0, 0]; // [away, home]

  const mkSide = (side: Side, team: SimTeam): SideState => {
    const st: SideState = {
      side, team, batterIdx: 0, current: makeUse(team.starter, 1, 0, true), used: [], nextReliever: 0, emergencyCount: 0,
      runsByInning: [], batting: new Map(), pitching: new Map(), goAheadAllowedBy: null, paCount: new Map(),
    };
    st.used.push(st.current);
    for (const h of team.lineup) st.batting.set(h.id, newBattingLine());
    st.pitching.set(team.starter.id, st.current.line);
    return st;
  };
  const away = mkSide("away", input.away);
  const home = mkSide("home", input.home);
  const idx = (s: Side) => (s === "away" ? 0 : 1);
  const lead = (pitching: SideState) => score[idx(pitching.side)] - score[idx(pitching.side === "home" ? "away" : "home")];

  let inning = 1;
  let gameOver = false;
  let winner: Side | null = null;

  // --- pitching changes -------------------------------------------------------
  const changePitcher = (def: SideState, to: SimPitcher, half: "T" | "B", reason: string, off: SideState) => {
    const from = def.current;
    const next = makeUse(to, inning, lead(def), false);
    def.current = next;
    def.used.push(next);
    def.pitching.set(to.id, next.line);
    events.push({
      inning, half, type: "PITCHING_CHANGE", batter: off.team.lineup[off.batterIdx]!.id, pitcher: to.id, outs: 0, runners: [false, false, false],
      scoreBefore: [...score], scoreAfter: [...score], meta: { from: from.p.id, fromName: from.p.name, toName: to.name, reason, team: def.team.id },
    });
  };

  const emergencyPitcher = (def: SideState): SimPitcher => {
    def.emergencyCount++;
    const base = def.team.bullpen.find((p) => p.isReplacement) ?? def.team.starter;
    return { ...base, id: `REPL:BP${def.emergencyCount}`, name: base.isReplacement ? base.name : "대체투수", role: "RP", isReplacement: true, slot: null, tired: false, mods: { ...base.mods, isCloser: false, openerOuts: 0 } };
  };

  const pickReliever = (def: SideState, preferCloser: boolean): SimPitcher => {
    const pen = def.team.bullpen.filter((p) => !p.isReplacement);
    const unused = (p: SimPitcher) => !def.used.some((u) => u.p.id === p.id);
    if (preferCloser) {
      const closer = pen.find((p) => p.mods.isCloser && unused(p));
      if (closer) return closer;
    }
    const lateGame = inning >= 8;
    const candidates = pen.filter((p) => unused(p) && (lateGame || !p.mods.isCloser));
    const fallback = pen.filter(unused);
    const next = candidates[0] ?? fallback[0];
    return next ?? emergencyPitcher(def);
  };

  const closerSituation = (def: SideState) => {
    const l = lead(def);
    return inning >= regulation && l >= PITCHING.manager.closerLeadMin && l <= def.team.mods.closerLeadMax;
  };

  const maybeChange = (def: SideState, off: SideState, half: "T" | "B", outsInInning: number) => {
    const u = def.current;
    const hasPen = def.team.bullpen.some((p) => !p.isReplacement && !def.used.some((x) => x.p.id === p.id));
    let reason: string | null = null;
    if (u.isStarter) {
      const T = pitchLimit(u);
      if (u.p.mods.openerOuts > 0 && u.line.outs >= u.p.mods.openerOuts) reason = "OPENER";
      else if (u.line.pitches > T + PITCHING.manager.starterPullOverLimit) reason = "PITCH_COUNT";
      else if (inning >= 5 && u.line.r >= PITCHING.manager.starterPullRunsFrom5th) reason = "RUNS";
      else if (inning >= 8 && lead(def) <= PITCHING.manager.starterPullLeadFrom8th && hasPen && outsInInning === 0) reason = "LATE_CLOSE";
    } else if (!u.p.isReplacement) {
      if (u.line.outs >= PITCHING.manager.relieverMaxOuts && outsInInning === 0) reason = "RELIEVER_INNINGS";
      else if (u.line.pitches > PITCHING.manager.relieverMaxPitches) reason = "RELIEVER_PITCHES";
    }
    const wantCloser = closerSituation(def) && outsInInning === 0 && !u.p.mods.isCloser && def.team.bullpen.some((p) => p.mods.isCloser && !def.used.some((x) => x.p.id === p.id));
    if (!reason && wantCloser && (u.isStarter ? lead(def) <= def.team.mods.closerLeadMax : true)) reason = "CLOSER";
    if (!reason) return;
    changePitcher(def, pickReliever(def, closerSituation(def)), half, reason, off);
  };

  // --- one half inning ---------------------------------------------------------
  const playHalf = (off: SideState, def: SideState, half: "T" | "B") => {
    let outs = 0;
    let bases: Bases = [null, null, null];
    const runsBefore = score[idx(off.side)];
    const def0 = def.current;
    def0.runsThisInning = 0;
    const meltdown = def0.runsPrevInning >= PITCHING.mental.meltdownRuns ? (100 - def0.p.r.mental) * PITCHING.mental.meltdownPerPoint : 0;

    const scoredNow: string[] = [];
    const scoreRuns = (runners: SimHitter[], batter: SimHitter | null, rbi: boolean, u: PitcherUse) => {
      for (const r of runners) {
        scoredNow.push(r.id);
        const wasLeading = score[idx(off.side)] > score[idx(def.side)];
        score[idx(off.side)]++;
        off.batting.get(r.id)!.r++;
        u.line.r++;
        u.runsThisInning++;
        if (batter && rbi) off.batting.get(batter.id)!.rbi++;
        if (!wasLeading && score[idx(off.side)] > score[idx(def.side)]) def.goAheadAllowedBy = u;
      }
    };

    while (outs < 3) {
      if (gameOver) return;
      maybeChange(def, off, half, outs);
      const u = def.current;
      const batter = off.team.lineup[off.batterIdx]!;
      const pitcher = u.p;
      const catcher = def.team.fielders.C;
      const scoreBefore: [number, number] = [...score];
      const runnersBefore: [boolean, boolean, boolean] = [!!bases[0], !!bases[1], !!bases[2]];
      const pa = off.batting.get(batter.id)!;
      const paNo = (off.paCount.get(batter.id) ?? 0) + 1;
      off.paCount.set(batter.id, paNo);
      let basesBefore: Bases = [bases[0], bases[1], bases[2]];
      let scoredIds: string[] = [];
      let pitchesForMeta = 0;
      const emit = (type: GameEvent["type"], meta: Record<string, unknown>, outsBefore = outs) => {
        const play = playMeta(type, meta, basesBefore, bases, scoredIds, batter, pitcher, scoreBefore, inning, pitchesForMeta, fx, outs - outsBefore);
        events.push({ inning, half, type, batter: batter.id, pitcher: pitcher.id, outs: outsBefore, runners: [...runnersBefore], scoreBefore, scoreAfter: [...score], meta: { batterName: batter.name, pitcherName: pitcher.name, ...meta, ...play } });
      };

      // Stolen base attempt before the plate appearance.
      if (bases[0] && !bases[1]) {
        const runner = bases[0];
        const st = stealSecond(rng, runner, off.team.mods.stealsEnabled, catcher.r.arm, pitcher.r.hold);
        if (st.attempt) {
          const line = off.batting.get(runner.id)!;
          if (st.success) {
            bases = [null, runner, bases[2]];
            line.sb++;
            emit("SB", { runner: runner.id, runnerName: runner.name });
          } else {
            bases = [null, null, bases[2]];
            line.cs++;
            outs++;
            emit("CS", { runner: runner.id, runnerName: runner.name }, outs - 1);
            if (outs >= 3) break;
          }
          runnersBefore[0] = !!bases[0];
          runnersBefore[1] = !!bases[1];
          basesBefore = [bases[0], bases[1], bases[2]];
        }
      }
      scoredNow.length = 0;
      scoredIds = scoredNow;

      const risp = !!bases[1] || !!bases[2];
      const probs = paProbabilities({
        batter: batter.r, batterHand: batter.bats, batterMods: batter.mods, pitcher: pitcher.r, pitcherHand: pitcher.throws, pitcherMods: pitcher.mods,
        battingTeam: off.team.mods, fieldingTeam: def.team.mods, stadium: input.stadium, fatigueSteps: fatigueSteps(u), risp, meltdownPenalty: meltdown,
        closerActive: pitcher.mods.isCloser && closerSituation(def), isFirstPa: paNo === 1, isLeadoff: off.batterIdx === 0, extraInning: inning > regulation,
      });

      pa.pa++;
      let pitches = PITCHING.pitchesPerPa.base + rng.int(0, PITCHING.pitchesPerPa.randomMax);
      pitchesForMeta = pitches;

      // Automatic bunt (SMALL_BALL): runner on first only, fewer than two outs, weak contact.
      const buntMax = Math.max(off.team.mods.buntEnabled ? off.team.mods.buntContactMax : 0, batter.mods.buntContactMax);
      if (buntMax > 0 && bases[0] && !bases[1] && !bases[2] && outs < 2 && batter.contactDisplay <= buntMax) {
        outs++;
        if (rng.chance(off.team.mods.buntSuccess)) {
          const adv = forceAdvance(bases, null, false);
          bases = adv.bases;
          emit("SH", { success: true }, outs - 1);
        } else {
          emit("SH", { success: false }, outs - 1);
        }
        u.line.pitches += pitches;
        u.line.outs++;
        off.batterIdx = (off.batterIdx + 1) % 9;
        continue;
      }

      const roll = rng.next();
      if (roll < probs.bb) {
        pitches += PITCHING.pitchesPerPa.walk;
        pitchesForMeta = pitches;
        pa.bb++;
        u.line.bb++;
        const adv = forceAdvance(bases, batter, true);
        bases = adv.bases;
        scoreRuns(adv.scored, batter, true, u);
        emit("BB", { runs: adv.scored.length });
      } else if (roll < probs.bb + probs.k) {
        pitches += PITCHING.pitchesPerPa.strikeout;
        pitchesForMeta = pitches;
        pa.ab++;
        pa.k++;
        u.line.k++;
        outs++;
        u.line.outs++;
        emit("K", { basesLoaded: runnersBefore.every(Boolean), endsInning: outs === 3 }, outs - 1);
      } else if (roll < probs.bb + probs.k + probs.hr) {
        pa.ab++;
        pa.h++;
        pa.hr++;
        u.line.h++;
        u.line.hr++;
        const adv = advanceOnHit(rng, bases, batter, "HR", RATING_PIVOT, outs);
        bases = adv.bases;
        scoreRuns(adv.scored, batter, true, u);
        emit("HR", { runs: adv.scored.length });
      } else {
        // Ball in play.
        pa.ab++;
        const hand = effectiveHand(batter.bats, pitcher.throws);
        const type = chooseBattedBall(rng, probs.gbShare);
        const dir = chooseDirection(rng, batter.r.pullTend);
        const f = fielderFor(rng, type, dir, hand);
        const fielder = def.team.fielders[f.pos];
        const meta: Record<string, unknown> = { battedBall: type, direction: dir, fielder: f.pos };
        const pHit = hitProbability({ type, babipAdd: probs.babipAdd, platoonMult: probs.platoonMult, stadium: input.stadium, fielder, batter, fieldingTeam: def.team.mods });
        if (rng.chance(pHit)) {
          const hit = chooseHitType(rng, type, batter, batter.mods, input.stadium, off.team.mods);
          pa.h++;
          u.line.h++;
          if (hit === "2B") pa.doubles++;
          if (hit === "3B") pa.triples++;
          const outsBefore = outs;
          const adv = advanceOnHit(rng, bases, batter, hit, fielder.r.arm, outs);
          bases = adv.bases;
          outs += adv.outs;
          u.line.outs += adv.outs;
          scoreRuns(adv.scored, batter, true, u);
          emit(hit, { ...meta, runs: adv.scored.length, thrownOut: adv.outs }, outsBefore);
        } else if (rng.chance(errorProbability(type, fielder, input.stadium, def.team.mods))) {
          const adv = forceAdvance(bases, batter, false);
          bases = adv.bases;
          scoreRuns(adv.scored, batter, false, u);
          pa.ab--; // reached on error is still an AB in real baseball; keep AB but no hit
          pa.ab++;
          emit("E", { ...meta, runs: adv.scored.length });
        } else if (type === "GROUND") {
          const outsBefore = outs;
          const infieldDefAvg = (def.team.fielders["1B"].defEff + def.team.fielders["2B"].defEff + def.team.fielders.SS.defEff + def.team.fielders["3B"].defEff) / 4;
          if (bases[0] && outs < 2 && rng.chance(doublePlayProbability(batter, infieldDefAvg))) {
            outs += 2;
            u.line.outs += 2;
            const scored: SimHitter[] = [];
            const next: Bases = [null, null, null];
            if (bases[2] && outs < 3) scored.push(bases[2]);
            if (bases[1]) next[2] = bases[1];
            bases = next;
            scoreRuns(scored, batter, false, u);
            emit("DP", { ...meta, runs: scored.length }, outsBefore);
          } else if (bases[0] && rng.chance(0.25) && outs < 2) {
            // Fielder's choice: lead runner out, batter safe.
            outs++;
            u.line.outs++;
            const next: Bases = [batter, bases[1] && !bases[2] ? null : bases[1], bases[2]];
            if (bases[1] && !bases[2]) next[2] = bases[1];
            bases = next;
            emit("FC", meta, outsBefore);
          } else {
            outs++;
            u.line.outs++;
            const scored: SimHitter[] = [];
            const next: Bases = [null, null, null];
            if (outs < 3) {
              if (bases[2] && rng.chance(0.5)) scored.push(bases[2]);
              else if (bases[2]) next[2] = bases[2];
              if (bases[1]) next[bases[0] || rng.chance(0.4) ? 2 : 1] = bases[1] as SimHitter;
              if (bases[0]) next[1] = bases[0];
            }
            bases = next;
            scoreRuns(scored, batter, true, u);
            emit("GO", { ...meta, runs: scored.length }, outsBefore);
          }
        } else if (type === "POPUP") {
          outs++;
          u.line.outs++;
          emit("PO", meta, outs - 1);
        } else {
          const outsBefore = outs;
          outs++;
          u.line.outs++;
          const scored: SimHitter[] = [];
          if (outs < 3 && !f.infield && bases[2] && rng.chance(sacFlyProbability(bases[2], fielder.r.arm))) {
            scored.push(bases[2]);
            bases = [bases[0], bases[1], null];
            pa.ab--;
            scoreRuns(scored, batter, true, u);
            emit("SF", { ...meta, runs: 1 }, outsBefore);
          } else {
            if (outs < 3 && type === "FLY" && !f.infield && bases[1] && !bases[2] && rng.chance(0.3)) bases = [bases[0], null, bases[1]];
            emit(type === "LINE" ? "LO" : "FO", meta, outsBefore);
          }
        }
      }

      u.line.pitches += pitches;
      off.batterIdx = (off.batterIdx + 1) % 9;

      // Walk-off: home takes the lead in the bottom of the 9th or later.
      if (half === "B" && inning >= regulation && score[1] > score[0]) {
        gameOver = true;
        winner = "home";
      }
    }

    off.runsByInning.push(score[idx(off.side)] - runsBefore);
    events.push({ inning, half, type: "INNING_END", batter: "", pitcher: def.current.p.id, outs: 3, runners: [false, false, false], scoreBefore: [...score], scoreAfter: [...score] });
    const u = def.current;
    u.runsPrevInning = u.runsThisInning;
    u.runsThisInning = 0;
  };

  // --- innings ------------------------------------------------------------------
  while (!gameOver) {
    playHalf(away, home, "T");
    if (gameOver) break;
    const homeLeadsAfterTop = score[1] > score[0];
    if (!(inning >= regulation && homeLeadsAfterTop)) playHalf(home, away, "B");
    if (gameOver) break;
    if (inning >= regulation && score[0] !== score[1]) {
      gameOver = true;
      winner = score[1] > score[0] ? "home" : "away";
      break;
    }
    if (inning >= maxInnings) {
      gameOver = true;
      winner = null; // draw
      break;
    }
    inning++;
  }
  // Pad line scores so both have `inning` entries.
  while (away.runsByInning.length < inning) away.runsByInning.push(0);
  while (home.runsByInning.length < inning) home.runsByInning.push(0);

  events.push({ inning, half: "B", type: "GAME_END", batter: "", pitcher: "", outs: 3, runners: [false, false, false], scoreBefore: [...score], scoreAfter: [...score], meta: { winner: winner ? (winner === "home" ? input.home.id : input.away.id) : null, draw: winner === null } });

  // --- decisions -----------------------------------------------------------------
  if (winner) {
    const w = winner === "home" ? home : away;
    const l = winner === "home" ? away : home;
    const losing = l.goAheadAllowedBy ?? l.used[l.used.length - 1]!;
    losing.line.decision = "L";
    // Winning pitcher: the one on the mound for the winner right after the losing pitcher allowed the go-ahead run.
    const goAheadIdx = Math.max(0, w.used.findIndex((u) => u.enteredInning >= losing.enteredInning));
    const winningUse = w.used[goAheadIdx] ?? w.used[0]!;
    winningUse.line.decision = "W";
    const last = w.used[w.used.length - 1]!;
    if (last !== winningUse && last.leadOnEntry >= 1 && last.leadOnEntry <= 3) last.line.decision = "SV";
  }

  const box = (s: SideState): TeamBox => ({
    teamId: s.team.id,
    runs: score[idx(s.side)],
    hits: [...s.batting.values()].reduce((a, b) => a + b.h, 0),
    errors: events.filter((e) => e.type === "E" && (e.half === "T") === (s.side === "home")).length,
    lineScore: s.runsByInning,
    batting: s.batting,
    pitching: s.pitching,
  });

  const output: GameOutput = {
    seed: input.seed,
    score,
    winner,
    innings: inning,
    events,
    highlights: markHighlights(events, pickHighlights(events)),
    home: box(home),
    away: box(away),
    mvp: pickMvp(home, away, winner),
    pitchersUsed: {
      home: home.used.map((u) => ({ id: u.p.id, slot: u.p.slot, outs: u.line.outs, started: u.isStarter })),
      away: away.used.map((u) => ({ id: u.p.id, slot: u.p.slot, outs: u.line.outs, started: u.isStarter })),
    },
  };
  return output;
}


// ---------------------------------------------------------------------------
// Presentation meta (§16.1)
// ---------------------------------------------------------------------------

const BB_OF: Record<string, BbType> = { GROUND: "GB", LINE: "LD", FLY: "FB", POPUP: "PU" };
const BATTER_RUNS_OUT = new Set(["GO", "DP", "SH"]);

/** Leverage before the play: (inning ≥ 7 ? 2 : 1) × (|diff| ≤ 2 ? 2 : 1). */
export function leverageOf(inning: number, score: readonly [number, number]): number {
  const w = GAME.importance;
  return (inning >= w.lateInning ? w.lateInningWeight : 1) * (Math.abs(score[0] - score[1]) <= w.closeMargin ? w.closeWeight : 1);
}

const BATTER_OUT = new Set(["K", "FO", "LO", "PO", "SF", "GO", "DP", "SH"]);
/** Plays where the trailing (forced) runner is the one put out. */
const FORCE_PLAYS = new Set(["DP", "FC", "GO", "SH"]);

/**
 * Diff base occupancy before/after a play into runner moves (0 = batter at
 * home, 4 = scored). Runners who vanish beyond the outs recorded on the play
 * were stranded by the third out and are omitted.
 */
export function runnerMovesOf(type: string, before: Bases, after: Bases, scored: readonly string[], batterId: string | null, outsOnPlay = 0): RunnerMove[] {
  const whereAfter = (id: string): 1 | 2 | 3 | 4 | null => {
    for (let b = 0; b < 3; b++) if (after[b]?.id === id) return (b + 1) as 1 | 2 | 3;
    return scored.includes(id) ? 4 : null;
  };
  const batterOut = batterId !== null && BATTER_OUT.has(type) && whereAfter(batterId) === null;
  let runnerOuts = Math.max(0, outsOnPlay - (batterOut ? 1 : 0));
  const vanished: { id: string; from: 1 | 2 | 3 }[] = [];
  const moves: RunnerMove[] = [];
  for (let b = 2; b >= 0; b--) {
    const r = before[b];
    if (!r) continue;
    const from = (b + 1) as 1 | 2 | 3;
    const to = whereAfter(r.id);
    if (to === null) vanished.push({ id: r.id, from });
    else if (to !== from) moves.push({ runner: r.id, from, to });
  }
  // Forced plays retire the trailing runner first; hits/steals the lead runner.
  if (FORCE_PLAYS.has(type)) vanished.reverse();
  for (const v of vanished) {
    if (runnerOuts <= 0) break;
    runnerOuts--;
    moves.push({ runner: v.id, from: v.from, to: Math.min(v.from + 1, 4) as 2 | 3 | 4, out: true });
  }
  if (batterId) {
    const to = whereAfter(batterId);
    if (to !== null) moves.push({ runner: batterId, from: 0, to });
    else if (batterOut && BATTER_RUNS_OUT.has(type)) moves.push({ runner: batterId, from: 0, to: 1, out: true });
  }
  return moves;
}

function playMeta(
  type: GameEvent["type"], meta: Record<string, unknown>, before: Bases, after: Bases, scored: readonly string[],
  batter: SimHitter, pitcher: SimPitcher, scoreBefore: readonly [number, number], inning: number, pitches: number, fx: Rng, outsOnPlay: number,
): PlayMeta {
  const isSteal = type === "SB" || type === "CS";
  const swing: SwingKind = type === "K" ? (fx.chance(0.27) ? "looking" : "miss") : type === "SH" ? "bunt" : type === "BB" || isSteal ? "none" : "contact";
  const bb = BB_OF[String(meta["battedBall"] ?? "")];
  const play: PlayMeta = {
    runnerMoves: runnerMovesOf(type, before, after, scored, isSteal ? null : batter.id, outsOnPlay),
    pitchCount: isSteal ? 1 : pitches,
    swing,
    leverage: leverageOf(inning, scoreBefore),
    isHighlight: false,
    batterHand: effectiveHand(batter.bats, pitcher.throws),
    pitcherHand: pitcher.throws,
    power: batter.powerDisplay ?? batter.contactDisplay,
  };
  if (bb) play.bbType = bb;
  else if (type === "HR") play.bbType = "FB";
  if (meta["direction"] === "PULL" || meta["direction"] === "pull") play.direction = "pull";
  else if (meta["direction"] === "OPPO" || meta["direction"] === "oppo") play.direction = "oppo";
  else if (meta["direction"] !== undefined) play.direction = "center";
  else if (type === "HR") play.direction = fx.pick(["pull", "pull", "center", "oppo"] as const);
  if (typeof meta["fielder"] === "string") play.fielderSlot = meta["fielder"] as FieldPos;
  return play;
}

function markHighlights(events: GameEvent[], idx: number[]): number[] {
  for (const i of idx) {
    const e = events[i];
    if (e?.meta) e.meta["isHighlight"] = true;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Highlights and MVP
// ---------------------------------------------------------------------------

/** §6.5 importance score. */
export function eventImportance(e: GameEvent): number {
  const w = GAME.importance;
  const runs = e.scoreAfter[0] + e.scoreAfter[1] - e.scoreBefore[0] - e.scoreBefore[1];
  const margin = Math.abs(e.scoreAfter[0] - e.scoreAfter[1]);
  let s = Math.abs(runs) * w.runsWeight + (e.inning >= w.lateInning ? w.lateInningWeight : 1) * (margin <= w.closeMargin ? w.closeWeight : 1);
  if (e.type === "HR") s += w.homeRun;
  if (e.type === "SB") s += w.stolenBase;
  if (e.type === "DP") s += w.doublePlay;
  if (e.type === "E") s += w.error;
  if (e.type === "K" && e.meta?.["basesLoaded"] && e.meta?.["endsInning"]) s += w.basesLoadedInningEndingK;
  return s;
}

const PLAY_TYPES = new Set(["BB", "K", "HR", "1B", "2B", "3B", "GO", "FO", "LO", "PO", "DP", "SF", "SH", "E", "FC", "SB", "CS"]);

export function pickHighlights(events: GameEvent[]): number[] {
  const plays = events.map((e, i) => ({ e, i })).filter(({ e }) => PLAY_TYPES.has(e.type));
  const ranked = [...plays].sort((a, b) => eventImportance(b.e) - eventImportance(a.e) || a.i - b.i).slice(0, GAME.highlightCount).map((p) => p.i);
  const firstScore = plays.find(({ e }) => e.scoreAfter[0] + e.scoreAfter[1] > e.scoreBefore[0] + e.scoreBefore[1]);
  const lastOut = [...plays].reverse().find(({ e }) => ["K", "GO", "FO", "LO", "PO", "DP", "CS", "FC", "SH"].includes(e.type));
  const set = new Set(ranked);
  if (firstScore) set.add(firstScore.i);
  if (lastOut) set.add(lastOut.i);
  return [...set].sort((a, b) => a - b);
}

function pickMvp(home: SideState, away: SideState, winner: Side | null): GameOutput["mvp"] {
  const sides = winner === "home" ? [home] : winner === "away" ? [away] : [home, away];
  let best: { id: string; side: Side; name: string; score: number } | null = null;
  for (const s of sides) {
    for (const h of s.team.lineup) {
      const b = s.batting.get(h.id)!;
      const sc = b.h + 2 * b.hr + b.rbi + b.r + 0.5 * b.sb + 0.5 * b.bb - 0.3 * b.k;
      if (!best || sc > best.score) best = { id: h.id, side: s.side, name: h.name, score: sc };
    }
    for (const u of s.used) {
      const l = u.line;
      const sc = (l.outs / 3) * 1.2 + 0.5 * l.k - 1.5 * l.r + (l.decision === "W" ? 1 : 0);
      if (!best || sc > best.score) best = { id: u.p.id, side: s.side, name: u.p.name, score: sc };
    }
  }
  return best ? { id: best.id, side: best.side, name: best.name } : null;
}

/** Outs recorded by each fielder position for the box score are not tracked; helper kept for callers. */
export const FIELD_POSITIONS: readonly FieldPos[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
