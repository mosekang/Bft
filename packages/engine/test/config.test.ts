import { describe, expect, it } from "vitest";
import { COSTS, ITEM_IDS, AUGMENT_IDS, COMBINED_ITEM_IDS, COMPONENT_ITEM_IDS, SYNERGY_IDS } from "@dugout/protocol";
import {
  AUGMENTS,
  AUGMENT_RARITY_ODDS,
  BOARD,
  DAMAGE,
  ECONOMY,
  ITEMS,
  LEAGUE,
  LEVELS,
  PACK_CARD_COUNT,
  PACK_COMPOSITION,
  POOL_COPIES,
  SHOP_ODDS,
  STADIUMS,
  SYNERGIES,
  ARCHETYPE_DEFS,
  baseIncome,
  buildSchedule,
  combineItems,
  interest,
  lossDamage,
  sellValue,
  streakBonus,
  synergyTier,
  xpToNext,
} from "../src/index.js";

describe("economy (§4.2)", () => {
  it("base income by round", () => {
    expect(baseIncome("1-1")).toBe(2);
    expect(baseIncome("1-2")).toBe(2);
    expect(baseIncome("1-3")).toBe(3);
    expect(baseIncome("2-1")).toBe(5);
    expect(baseIncome("7-2")).toBe(5);
  });
  it("interest floors at 10 per gold and caps at 5", () => {
    expect(interest(9)).toBe(0);
    expect(interest(10)).toBe(1);
    expect(interest(49)).toBe(4);
    expect(interest(80)).toBe(5);
    expect(interest(80, 7)).toBe(7);
  });
  it("streak bonus tiers", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(streakBonus)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it("sell value has no 1-cost exception", () => {
    expect(sellValue(1, 1)).toBe(1);
    expect(sellValue(1, 2)).toBe(3);
    expect(sellValue(1, 3)).toBe(9);
    expect(sellValue(4, 2)).toBe(12);
    expect(sellValue(5, 3)).toBe(45);
  });
  it("constants match the spec", () => {
    expect(ECONOMY.rerollCost).toBe(2);
    expect(ECONOMY.xpCost).toBe(4);
    expect(ECONOMY.freeXpPerRound).toBe(2);
    expect(ECONOMY.maxItemsPerCard).toBe(3);
    expect(ECONOMY.benchSize).toBe(6);
  });
});

describe("levels and board (§4.3)", () => {
  it("xp curve", () => {
    expect([3, 4, 5, 6, 7, 8, 9].map(xpToNext)).toEqual([4, 8, 16, 24, 32, 40, 56]);
    expect(xpToNext(10)).toBe(Number.POSITIVE_INFINITY);
  });
  it("max level leaves two replacement slots", () => {
    expect(BOARD.totalSlots - LEVELS.max).toBe(2);
    expect(BOARD.hitterSlots + BOARD.pitcherSlots).toBe(BOARD.totalSlots);
  });
});

describe("shop (§4.4)", () => {
  it("odds rows exist for levels 3..10 and sum to 100", () => {
    for (let lv = 3; lv <= 10; lv++) {
      const row = SHOP_ODDS[lv]!;
      expect(COSTS.reduce((a, c) => a + row[c], 0)).toBe(100);
    }
    expect(SHOP_ODDS[7]).toEqual({ 1: 19, 2: 30, 3: 35, 4: 15, 5: 1 });
  });
  it("pool copies and pack composition", () => {
    expect(POOL_COPIES).toEqual({ 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 });
    const total = COSTS.reduce((a, c) => a + PACK_COMPOSITION[c].hitters + PACK_COMPOSITION[c].sp + PACK_COMPOSITION[c].rp, 0);
    expect(total).toBe(PACK_CARD_COUNT);
    expect(PACK_CARD_COUNT).toBe(59);
  });
});

describe("damage (§4.6)", () => {
  it("stage base plus capped run diff", () => {
    expect(lossDamage(1, 2)).toBe(3);
    expect(lossDamage(12, 4)).toBe(5 + 8);
    expect(lossDamage(0, 6)).toBe(9);
  });
  it("doubles in the postseason", () => {
    expect(lossDamage(3, 7)).toBe((12 + 3) * 2);
  });
  it("pve and draw values", () => {
    expect(DAMAGE.pve).toEqual({ springCamp: 3, allStar: 3, legend: 6 });
    expect(DAMAGE.draw).toBe(0);
  });
});

describe("schedule (§4.1)", () => {
  const s = buildSchedule();
  it("is 26 rounds with the documented shape", () => {
    expect(s).toHaveLength(26);
    expect(s.slice(0, 3).every((r) => r.kind === "PVE_CAMP")).toBe(true);
    expect(s.find((r) => r.code === "2-4")!.kind).toBe("ALL_STAR");
    expect(s.find((r) => r.code === "3-4")!.kind).toBe("RAIN_OUT");
    expect(s.find((r) => r.code === "4-4")!.kind).toBe("TRADE_DEADLINE");
    expect(s.find((r) => r.code === "5-4")!.kind).toBe("LEGEND_MATCH");
    expect(s.find((r) => r.code === "6-4")!.kind).toBe("PVP");
    expect(s.filter((r) => r.kind === "FA_MARKET").map((r) => r.code)).toEqual(["2-1", "3-1", "4-1", "5-1", "6-1"]);
  });
  it("augment picks at 2-1, 3-2, 5-1", () => {
    expect(s.filter((r) => r.augmentPick).map((r) => r.code)).toEqual(["2-1", "3-2", "5-1"]);
  });
  it("no-game rounds are rain-out and trade deadline only", () => {
    expect(s.filter((r) => !r.hasGame).map((r) => r.code)).toEqual(["3-4", "4-4"]);
  });
});

describe("synergies (§7)", () => {
  it("defines every synergy id with ascending thresholds and matching tiers", () => {
    for (const id of SYNERGY_IDS) {
      const def = SYNERGIES[id];
      expect(def.id).toBe(id);
      expect(def.tiers).toHaveLength(def.thresholds.length);
      expect(def.descriptionsKo).toHaveLength(def.thresholds.length);
      for (let i = 1; i < def.thresholds.length; i++) expect(def.thresholds[i]!).toBeGreaterThan(def.thresholds[i - 1]!);
    }
  });
  it("AT_LEAST tiers", () => {
    const gg = SYNERGIES.GOLD_GLOVE;
    expect([0, 1, 2, 3, 4, 6, 9].map((n) => synergyTier(gg, n).tier)).toEqual([0, 0, 1, 1, 2, 3, 3]);
  });
  it("FOREIGN is exact-2 with an overflow penalty", () => {
    const f = SYNERGIES.FOREIGN;
    expect(synergyTier(f, 1)).toEqual({ tier: 0, penalised: false });
    expect(synergyTier(f, 2)).toEqual({ tier: 1, penalised: false });
    expect(synergyTier(f, 3)).toEqual({ tier: 0, penalised: true });
    expect(f.overflow).toEqual({ ratingAdd: -15, teamBbMult: 1.1 });
  });
});

describe("items (§8)", () => {
  it("has 6 components, 21 combos and 4 specials, all ids covered", () => {
    expect(ITEMS.filter((i) => i.tier === "COMPONENT")).toHaveLength(6);
    expect(ITEMS.filter((i) => i.tier === "COMBINED")).toHaveLength(21);
    expect(ITEMS.filter((i) => i.tier === "SPECIAL")).toHaveLength(4);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEM_IDS.length);
  });
  it("every pair of components combines into a distinct item, order-insensitive", () => {
    const seen = new Set<string>();
    for (let a = 0; a < COMPONENT_ITEM_IDS.length; a++) {
      for (let b = a; b < COMPONENT_ITEM_IDS.length; b++) {
        const x = combineItems(COMPONENT_ITEM_IDS[a]!, COMPONENT_ITEM_IDS[b]!);
        expect(x).toBeDefined();
        expect(combineItems(COMPONENT_ITEM_IDS[b]!, COMPONENT_ITEM_IDS[a]!)).toBe(x);
        seen.add(x!);
      }
    }
    expect(seen.size).toBe(COMBINED_ITEM_IDS.length);
  });
});

describe("augments (§9) and bots (§11)", () => {
  it("16 augments, rarity odds sum to 100", () => {
    expect(AUGMENTS).toHaveLength(AUGMENT_IDS.length);
    expect(Object.values(AUGMENT_RARITY_ODDS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(AUGMENTS.filter((a) => a.rarity === "PRISM")).toHaveLength(5);
  });
  it("8 archetypes", () => {
    expect(Object.keys(ARCHETYPE_DEFS)).toHaveLength(8);
    expect(ARCHETYPE_DEFS.REROLL.fixedLevel).toBe(7);
  });
});

describe("league and stadiums (§6)", () => {
  it("batted-ball mix sums to 1 and stadium table is complete", () => {
    expect(Object.values(LEAGUE.battedBall).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(Object.keys(STADIUMS)).toHaveLength(5);
    expect(STADIUMS.HITTER_FRIENDLY.hrMult).toBe(1.2);
    expect(STADIUMS.DOME.weatherProof).toBe(true);
  });
});
