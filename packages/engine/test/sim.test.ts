import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PackSchema, type Pack } from "@dugout/protocol";
import {
  LEAGUE,
  PIVOT,
  STADIUMS,
  createRng,
  defsById,
  effectiveHand,
  paProbabilities,
  platoonMultiplier,
  resolveTeam,
  sampleRoster,
  simulateGame,
  defaultHitterMods,
  defaultPitcherMods,
  defaultTeamMods,
  type SimTeam,
  type GameOutput,
} from "../src/index.js";

const pack: Pack = PackSchema.parse(JSON.parse(readFileSync(resolve(__dirname, "../../packs/fictional-v1.json"), "utf8")));
const defs = defsById(pack);

function teamFromPack(seed: string, level: number, id: string): SimTeam {
  const roster = sampleRoster(pack, createRng(seed, "roster"), level, { prefix: id });
  return resolveTeam({ teamId: id, name: id, board: roster.board, cards: roster.cards, defs, stadium: "DOME" });
}

function runMany(n: number, seed: string, level = 7): { outs: GameOutput[]; runsPerTeam: number; draws: number; k: number; bb: number; hr: number; pa: number } {
  const outs: GameOutput[] = [];
  let runs = 0, draws = 0, k = 0, bb = 0, hr = 0, pa = 0;
  for (let i = 0; i < n; i++) {
    const home = teamFromPack(`${seed}-h${i}`, level, "H");
    const away = teamFromPack(`${seed}-a${i}`, level, "A");
    const g = simulateGame({ home, away, stadium: STADIUMS.DOME, seed: `${seed}-${i}` });
    outs.push(g);
    runs += g.score[0] + g.score[1];
    if (g.winner === null) draws++;
    for (const s of [g.home, g.away]) for (const b of s.batting.values()) { k += b.k; bb += b.bb; hr += b.hr; pa += b.pa; }
  }
  return { outs, runsPerTeam: runs / (2 * n), draws: draws / n, k: k / pa, bb: bb / pa, hr: hr / pa, pa };
}

describe("probability model (§6.2)", () => {
  const h = PIVOT.hitter, p0 = PIVOT.pitcher;
  const avgH = { kRate: h, contactL: h, contactR: h, hrRate: h, xbhRate: h, bbRate: h, gbTend: h, pullTend: 55, speed: h, sbSkill: h, def: {}, arm: 55, clutch: 0 };
  const avgP = { kRate: p0, bbRate: p0, hrRate: p0, gbRate: p0, contactVsL: p0, contactVsR: p0, stamina: 55, mental: p0, hold: 55, armAngle: 55 };
  const ctx = (over: Partial<Parameters<typeof paProbabilities>[0]> = {}) => paProbabilities({
    batter: avgH, batterHand: "R", batterMods: defaultHitterMods(), pitcher: avgP, pitcherHand: "R", pitcherMods: defaultPitcherMods(),
    battingTeam: defaultTeamMods(), fieldingTeam: defaultTeamMods(), stadium: STADIUMS.DOME, fatigueSteps: 0, risp: false, meltdownPenalty: 0,
    closerActive: false, isFirstPa: false, isLeadoff: false, extraInning: false, ...over,
  });

  it("average vs average with no platoon effect reproduces the league baseline", () => {
    const p = ctx({ pitcher: { ...avgP, armAngle: 55 }, batterHand: "L" }); // opposite hand: platoon > 1 for HR
    expect(p.k).toBeCloseTo(LEAGUE.kRate, 6);
    expect(p.bb).toBeCloseTo(LEAGUE.bbRate, 6);
    const same = ctx();
    expect(same.hr).toBeCloseTo(LEAGUE.hrRate * (1 - 0.08), 6);
    expect(p.hr).toBeCloseTo(LEAGUE.hrRate * (1 + 0.08), 6);
    expect(p.bb + p.k + p.hr + p.bip).toBeCloseTo(1, 9);
  });

  it("is monotonic in the obvious directions", () => {
    expect(ctx({ batter: { ...avgH, hrRate: 90 } }).hr).toBeGreaterThan(ctx().hr);
    expect(ctx({ pitcher: { ...avgP, hrRate: 90 } }).hr).toBeLessThan(ctx().hr);
    expect(ctx({ batter: { ...avgH, kRate: 90 } }).k).toBeLessThan(ctx().k);
    expect(ctx({ pitcher: { ...avgP, kRate: 90 } }).k).toBeGreaterThan(ctx().k);
    expect(ctx({ pitcher: { ...avgP, bbRate: 90 } }).bb).toBeLessThan(ctx().bb);
    expect(ctx({ fatigueSteps: 2 }).bb).toBeGreaterThan(ctx().bb);
    expect(ctx({ extraInning: true }).hr).toBeLessThan(ctx().hr);
  });

  it("clamps and widens the platoon split for sidearmers", () => {
    expect(ctx({ batter: { ...avgH, hrRate: 99 }, pitcher: { ...avgP, hrRate: 1 } }).hr).toBeLessThanOrEqual(LEAGUE.probMax);
    expect(platoonMultiplier("L", "R", 20, defaultHitterMods())).toBeGreaterThan(platoonMultiplier("L", "R", 80, defaultHitterMods()));
    expect(effectiveHand("S", "L")).toBe("R");
    expect(effectiveHand("S", "R")).toBe("L");
  });
});

describe("simulateGame", () => {
  it("is deterministic for the same seed and teams", () => {
    const home = teamFromPack("det-h", 8, "H");
    const away = teamFromPack("det-a", 8, "A");
    const a = simulateGame({ home, away, stadium: STADIUMS.HITTER_FRIENDLY, seed: "same" });
    const b = simulateGame({ home, away, stadium: STADIUMS.HITTER_FRIENDLY, seed: "same" });
    expect(a).toEqual(b);
    const c = simulateGame({ home, away, stadium: STADIUMS.HITTER_FRIENDLY, seed: "other" });
    expect(c.events).not.toEqual(a.events);
  });

  it("produces a consistent box score and event log", () => {
    const g = simulateGame({ home: teamFromPack("box-h", 9, "H"), away: teamFromPack("box-a", 9, "A"), stadium: STADIUMS.DOME, seed: "box" });
    expect(g.events.at(-1)!.type).toBe("GAME_END");
    expect(g.innings).toBeGreaterThanOrEqual(9);
    expect(g.innings).toBeLessThanOrEqual(12);
    const homeRuns = [...g.home.batting.values()].reduce((a, b) => a + b.r, 0);
    const awayRuns = [...g.away.batting.values()].reduce((a, b) => a + b.r, 0);
    expect([awayRuns, homeRuns]).toEqual(g.score);
    expect(g.home.lineScore.reduce((a, b) => a + b, 0)).toBe(g.score[1]);
    expect(g.away.lineScore.reduce((a, b) => a + b, 0)).toBe(g.score[0]);
    const homePitchOuts = [...g.home.pitching.values()].reduce((a, b) => a + b.outs, 0);
    expect(homePitchOuts % 3 === 0 || g.winner === "away").toBe(true);
    if (g.winner) {
      const allLines = [...g.home.pitching.values(), ...g.away.pitching.values()];
      expect(allLines.filter((l) => l.decision === "W")).toHaveLength(1);
      expect(allLines.filter((l) => l.decision === "L")).toHaveLength(1);
    }
    expect(g.highlights.length).toBeGreaterThan(0);
    expect(g.highlights.length).toBeLessThanOrEqual(7);
    expect(g.mvp).not.toBeNull();
  });

  it("stays within the event budget in regulation games", () => {
    const r = runMany(200, "budget");
    const regulation = r.outs.filter((g) => g.innings === 9);
    const over = regulation.filter((g) => g.events.length > 120);
    expect(over.length / Math.max(1, regulation.length)).toBeLessThan(0.05);
  });

  it("keeps random level-7 rosters in a sane scoring band (the 4.4–5.2 target is measured on real bot boards by bot-arena)", () => {
    const r = runMany(3000, "stats");
    expect(r.runsPerTeam).toBeGreaterThanOrEqual(3.0);
    expect(r.runsPerTeam).toBeLessThanOrEqual(5.5);
    // §15.1 targets 3–7 % draws; with 12 innings the sim lands at ~1.5 % (KBO-realistic). See ADR-0002 #6.
    expect(r.draws).toBeGreaterThanOrEqual(0.005);
    expect(r.draws).toBeLessThanOrEqual(0.08);
    expect(r.k).toBeGreaterThan(LEAGUE.kRate * 0.8);
    expect(r.k).toBeLessThan(LEAGUE.kRate * 1.35);
    expect(r.bb).toBeGreaterThan(LEAGUE.bbRate * 0.7);
    expect(r.bb).toBeLessThan(LEAGUE.bbRate * 1.3);
    expect(r.hr).toBeGreaterThan(LEAGUE.hrRate * 0.6);
    expect(r.hr).toBeLessThan(LEAGUE.hrRate * 1.4);
  });

  it("better teams win more often", () => {
    let strongWins = 0, decided = 0;
    for (let i = 0; i < 400; i++) {
      const strong = teamFromPack(`strong${i}`, 10, "S");
      const weak = teamFromPack(`weak${i}`, 4, "W");
      const g = simulateGame({ home: i % 2 ? strong : weak, away: i % 2 ? weak : strong, stadium: STADIUMS.DOME, seed: `sw${i}` });
      if (g.winner === null) continue;
      decided++;
      if ((g.winner === "home") === (i % 2 === 1)) strongWins++;
    }
    expect(strongWins / decided).toBeGreaterThan(0.6);
  });

  it("simulates a game well under the 30 ms budget", () => {
    const home = teamFromPack("bench-h", 8, "H");
    const away = teamFromPack("bench-a", 8, "A");
    for (let i = 0; i < 20; i++) simulateGame({ home, away, stadium: STADIUMS.DOME, seed: `warm${i}` });
    const t0 = performance.now();
    const n = 300;
    for (let i = 0; i < n; i++) simulateGame({ home, away, stadium: STADIUMS.DOME, seed: `bench${i}` });
    const perGame = (performance.now() - t0) / n;
    expect(perGame).toBeLessThan(30);
  });
});

describe("resolveTeam", () => {
  it("fills empty slots with replacements and applies position efficiency", () => {
    const roster = sampleRoster(pack, createRng("r1"), 4, { prefix: "x" });
    const team = resolveTeam({ teamId: "t", name: "t", board: roster.board, cards: roster.cards, defs, stadium: "DOME" });
    expect(team.lineup).toHaveLength(9);
    const repl = team.lineup.filter((h) => h.isReplacement);
    expect(repl.length).toBeGreaterThan(0);
    for (const h of repl) expect(h.r.kRate).toBe(38);
    expect(team.bullpen.at(-1)!.isReplacement).toBe(true);
  });

  it("uses the first fresh SP and skips tired ones unless forced", () => {
    const roster = sampleRoster(pack, createRng("r2"), 10, { prefix: "y" });
    const p1 = roster.board.slots.P1!;
    const tiredCards = { ...roster.cards, [p1]: { ...roster.cards[p1]!, fatigue: 2 } };
    const fresh = resolveTeam({ teamId: "t", name: "t", board: roster.board, cards: roster.cards, defs, stadium: "DOME" });
    const rested = resolveTeam({ teamId: "t", name: "t", board: roster.board, cards: tiredCards, defs, stadium: "DOME" });
    if (defs.get(roster.cards[p1]!.defId)!.role === "SP") {
      expect(fresh.starter.id).toBe(p1);
      expect(rested.starter.id).not.toBe(p1);
      const forced = resolveTeam({ teamId: "t", name: "t", board: { ...roster.board, forcePitch: { P1: true, P2: false, P3: false } }, cards: { ...tiredCards, [roster.board.slots.P2 ?? "none"]: { ...(roster.cards[roster.board.slots.P2 ?? ""] ?? roster.cards[p1]!), fatigue: 1 }, [roster.board.slots.P3 ?? "none2"]: { ...(roster.cards[roster.board.slots.P3 ?? ""] ?? roster.cards[p1]!), fatigue: 1 } }, defs, stadium: "DOME" });
      expect(forced.starter.tired || forced.starter.isReplacement).toBe(true);
    }
  });
});
