import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PackSchema, type Pack, type PlayMeta } from "@dugout/protocol";
import { STADIUMS, createRng, defsById, resolveTeam, sampleRoster, simulateGame, type SimTeam } from "../src/index.js";

const pack: Pack = PackSchema.parse(JSON.parse(readFileSync(resolve(__dirname, "../../packs/fictional-v1.json"), "utf8")));
const defs = defsById(pack);
const team = (seed: string, id: string): SimTeam => {
  const roster = sampleRoster(pack, createRng(seed, "roster"), 8, { prefix: id });
  return resolveTeam({ teamId: id, name: id, board: roster.board, cards: roster.cards, defs, stadium: "DOME" });
};
const PLAYS = new Set(["BB", "K", "HR", "1B", "2B", "3B", "GO", "FO", "LO", "PO", "DP", "SF", "SH", "E", "FC", "SB", "CS"]);

describe("presentation meta (§16.1)", () => {
  const games = Array.from({ length: 60 }, (_, i) => simulateGame({ home: team(`mh${i}`, "H"), away: team(`ma${i}`, "A"), stadium: STADIUMS.HITTER_FRIENDLY, seed: `meta${i}` }));

  it("every play event carries PlayMeta", () => {
    for (const g of games) {
      for (const e of g.events) {
        if (!PLAYS.has(e.type)) continue;
        const m = e.meta as unknown as PlayMeta;
        expect(Array.isArray(m.runnerMoves)).toBe(true);
        expect(m.pitchCount).toBeGreaterThanOrEqual(1);
        expect([1, 2, 4]).toContain(m.leverage);
        expect(["L", "R"]).toContain(m.batterHand);
        expect(m.power).toBeGreaterThanOrEqual(1);
        if (["1B", "2B", "3B", "GO", "FO", "LO", "PO", "DP", "SF", "E", "FC"].includes(e.type)) {
          expect(["GB", "LD", "FB", "PU"]).toContain(m.bbType);
          expect(m.fielderSlot).toBeTruthy();
          expect(m.direction).toBeTruthy();
        }
        if (e.type === "K") expect(["miss", "looking"]).toContain(m.swing);
        if (e.type === "HR") expect(m.swing).toBe("contact");
      }
    }
  });

  it("runner moves agree with runs scored and base occupancy", () => {
    for (const g of games) {
      for (const e of g.events) {
        if (!PLAYS.has(e.type)) continue;
        const m = e.meta as unknown as PlayMeta;
        const runs = e.scoreAfter[0] + e.scoreAfter[1] - e.scoreBefore[0] - e.scoreBefore[1];
        expect(m.runnerMoves.filter((r) => r.to === 4 && !r.out).length).toBe(runs);
        for (const r of m.runnerMoves) {
          expect(r.to).toBeGreaterThan(r.from);
          if (r.from > 0) expect(e.runners[r.from - 1]).toBe(true);
        }
        if (e.type === "HR") expect(m.runnerMoves.some((r) => r.from === 0 && r.to === 4)).toBe(true);
        if (e.type === "DP") expect(m.runnerMoves.filter((r) => r.out).length).toBe(2);
      }
    }
  });

  it("highlights are flagged on their events", () => {
    for (const g of games) {
      for (const i of g.highlights) expect(g.events[i]!.meta?.["isHighlight"]).toBe(true);
      const flagged = g.events.filter((e) => e.meta?.["isHighlight"]).length;
      expect(flagged).toBe(g.highlights.length);
    }
  });
});
