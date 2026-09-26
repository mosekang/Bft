import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  COSTS,
  ECONOMY,
  LEAGUE_BASELINE,
  MAX_LEVEL,
  POOL_COPIES,
  SHOP_ODDS,
  STARTING_LEVEL,
  TEMPLATES_PER_COST,
  XP_TO_NEXT_LEVEL,
  buildSchedule,
  lossDamage,
  sellValue,
  FAN_HEARTS,
  STAGE_LAYOUT,
} from "../src/index.js";

describe("shop odds", () => {
  it("has a row for every level up to MAX_LEVEL", () => {
    expect(SHOP_ODDS.length).toBe(MAX_LEVEL + 1);
  });

  it("every row sums to 100", () => {
    for (const row of SHOP_ODDS) {
      const total = COSTS.reduce((acc, c) => acc + row[c], 0);
      expect(total).toBe(100);
    }
  });

  it("higher levels never lower the odds of 5-costs", () => {
    for (let lv = STARTING_LEVEL; lv < MAX_LEVEL; lv++) {
      expect(SHOP_ODDS[lv + 1]![5]).toBeGreaterThanOrEqual(SHOP_ODDS[lv]![5]);
    }
  });
});

describe("levels", () => {
  it("xp curve is increasing and ends at infinity", () => {
    for (let lv = STARTING_LEVEL; lv < MAX_LEVEL; lv++) {
      expect(XP_TO_NEXT_LEVEL[lv + 1]!).toBeGreaterThan(XP_TO_NEXT_LEVEL[lv]!);
    }
    expect(XP_TO_NEXT_LEVEL[MAX_LEVEL]).toBe(Number.POSITIVE_INFINITY);
  });

  it("max level leaves at least one replacement player on the board (§1 hook)", () => {
    expect(BOARD_SIZE - MAX_LEVEL).toBeGreaterThanOrEqual(1);
    expect(BOARD_SIZE - MAX_LEVEL).toBeLessThanOrEqual(2);
  });
});

describe("pool", () => {
  it("defines copies and template counts for every cost", () => {
    for (const c of COSTS) {
      expect(POOL_COPIES[c]).toBeGreaterThan(0);
      expect(TEMPLATES_PER_COST[c]).toBeGreaterThan(0);
    }
  });

  it("rarer cards have fewer copies", () => {
    expect(POOL_COPIES[1]).toBeGreaterThan(POOL_COPIES[3]);
    expect(POOL_COPIES[3]).toBeGreaterThan(POOL_COPIES[5]);
  });

  it("three-star requires 9 copies, which the pool can supply", () => {
    for (const c of COSTS) {
      expect(POOL_COPIES[c]).toBeGreaterThanOrEqual(ECONOMY.copiesPerStar ** 2);
    }
  });
});

describe("sellValue", () => {
  it("refunds the cost of a 1-star card", () => {
    expect(sellValue(1, 1)).toBe(1);
    expect(sellValue(4, 1)).toBe(4);
  });
  it("refunds combined copies minus one for upgraded cards above 1-cost", () => {
    expect(sellValue(1, 2)).toBe(3);
    expect(sellValue(2, 2)).toBe(5);
    expect(sellValue(3, 3)).toBe(26);
  });
});

describe("lossDamage", () => {
  it("scales with run differential and stage, within bounds", () => {
    expect(lossDamage(1, 1)).toBe(FAN_HEARTS.minDamage);
    expect(lossDamage(1, 4)).toBe(1 + FAN_HEARTS.stageBonus[4]);
    expect(lossDamage(40, 6)).toBe(FAN_HEARTS.maxDamage);
  });
  it("applies the postseason multiplier", () => {
    expect(lossDamage(3, 7, FAN_HEARTS.postseasonMultiplier)).toBe(
      (3 + FAN_HEARTS.stageBonus[7]) * FAN_HEARTS.postseasonMultiplier,
    );
  });
  it("clamps stages beyond the table to the last bonus", () => {
    expect(lossDamage(3, 99)).toBe(3 + FAN_HEARTS.stageBonus[FAN_HEARTS.stageBonus.length - 1]!);
  });
});

describe("buildSchedule", () => {
  const schedule = buildSchedule();

  it("is 26 ± 4 rounds long", () => {
    expect(schedule.length).toBeGreaterThanOrEqual(22);
    expect(schedule.length).toBeLessThanOrEqual(30);
  });

  it("indexes rounds contiguously and codes them stage-round", () => {
    schedule.forEach((r, i) => {
      expect(r.index).toBe(i);
      expect(r.code).toBe(`${r.stage}-${r.roundInStage}`);
    });
  });

  it("starts with three PvE spring-camp rounds", () => {
    expect(schedule.slice(0, 3).map((r) => r.kind)).toEqual(["PVE", "PVE", "PVE"]);
  });

  it("puts an FA market at the start of every regular stage and an event at the end", () => {
    for (let s = 2; s <= 6; s++) {
      const rounds = schedule.filter((r) => r.stage === s);
      expect(rounds).toHaveLength(4);
      expect(rounds[0]!.kind).toBe("FA_MARKET");
      expect(["PVP"]).toContain(rounds[1]!.kind);
      expect(["PVP"]).toContain(rounds[2]!.kind);
      expect(rounds[3]!.kind).not.toBe("PVP");
    }
  });

  it("schedules exactly three philosophy picks at the documented rounds", () => {
    const picks = schedule.filter((r) => r.philosophyPick).map((r) => r.code);
    expect(picks).toEqual([...STAGE_LAYOUT.philosophyPicks]);
  });

  it("doubles damage in the postseason only", () => {
    for (const r of schedule) {
      expect(r.damageMultiplier).toBe(r.stage === 7 ? 2 : 1);
    }
    expect(schedule.at(-1)!.kind).toBe("FINAL_SERIES");
  });
});

describe("league baseline", () => {
  it("batted-ball and hit mixes are proper distributions", () => {
    const bb = Object.values(LEAGUE_BASELINE.battedBallMix).reduce((a, b) => a + b, 0);
    const hits = Object.values(LEAGUE_BASELINE.hitMix).reduce((a, b) => a + b, 0);
    expect(bb).toBeCloseTo(1, 6);
    expect(hits).toBeCloseTo(1, 6);
  });

  it("three-true-outcome rates leave most PAs in play", () => {
    const tto = LEAGUE_BASELINE.walkRate + LEAGUE_BASELINE.strikeoutRate + LEAGUE_BASELINE.homeRunRate + LEAGUE_BASELINE.hitByPitchRate;
    expect(tto).toBeLessThan(0.4);
  });
});
