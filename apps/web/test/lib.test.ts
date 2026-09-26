import { describe, expect, it } from "vitest";
import type { Matchup } from "@dugout/protocol";
import { describe as describeEvent, reel } from "../src/lib/commentary.js";
import { ACHIEVEMENTS } from "../src/lib/achievements.js";
import { t } from "../src/i18n/index.js";

const ev = (over: Partial<Matchup["events"][number]> = {}): Matchup["events"][number] => ({ inning: 3, half: "B", type: "HR", batter: "b1", pitcher: "p1", outs: 1, runners: [false, false, false], scoreBefore: [0, 0], scoreAfter: [0, 1], meta: { runs: 1 }, ...over });
const matchup = (events: Matchup["events"], highlights: number[]): Matchup => ({ home: "me", away: "bot1", homeStadium: "DOME", events, score: [0, 1], damage: {}, highlights, names: { b1: "김번트", p1: "라미레즈" }, kind: "PVP", winner: "me" });

describe("commentary (§14.6)", () => {
  it("substitutes names, inning and score and is stable for the same event", () => {
    const m = matchup([ev()], [0]);
    const a = describeEvent(m.events[0]!, m, "홈", "원정");
    expect(a).toContain("3회말");
    expect(a).toContain("김번트");
    expect(describeEvent(m.events[0]!, m, "홈", "원정")).toBe(a);
  });
  it("builds a reel with the game end and gap summaries", () => {
    const events = [ev({ inning: 1, type: "K", scoreAfter: [0, 0] }), ...Array.from({ length: 10 }, (_, i) => ev({ inning: 2 + Math.floor(i / 3), type: "GO", scoreAfter: [0, 0] })), ev({ inning: 8 }), ev({ inning: 9, type: "GAME_END", meta: { draw: false } })];
    const lines = reel(matchup(events, [0, 11]), "홈", "원정");
    expect(lines.at(-1)!.key).toBe("end");
    expect(lines.some((l) => l.text.includes("잠잠한"))).toBe(true);
  });
});

describe("achievements and i18n", () => {
  it("defines 15 achievements with unique ids", () => {
    expect(ACHIEVEMENTS).toHaveLength(15);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(15);
  });
  it("returns the key for unknown strings so gaps are visible", () => {
    expect(t("run.gold")).toBe("골드");
    expect(t("nope.key")).toBe("nope.key");
  });
});
