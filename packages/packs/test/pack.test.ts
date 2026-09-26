import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cardOvr } from "@dugout/engine";
import type { Pack } from "@dugout/protocol";
import { generatePack, validatePack } from "../src/index.js";

const generated = generatePack({ seed: "fictional-v1" });

describe("generatePack", () => {
  it("is deterministic", () => {
    expect(generatePack({ seed: "fictional-v1" })).toEqual(generated);
  });

  it("changes with the seed", () => {
    const other = generatePack({ seed: "other" });
    expect(other.cards.map((c) => c.name)).not.toEqual(generated.cards.map((c) => c.name));
  });

  it("passes the validator", () => {
    const report = validatePack(generated);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("produces the §5.3 composition", () => {
    expect(generated.cards).toHaveLength(59);
    expect(generated.cards.filter((c) => c.role === "H")).toHaveLength(41);
    expect(generated.cards.filter((c) => c.cost === 5 && c.classes.length !== 2)).toHaveLength(0);
    expect(new Set(generated.cards.map((c) => c.name)).size).toBe(59);
    for (const c of generated.cards) {
      const [lo, hi] = ({ 1: [45, 55], 2: [52, 62], 3: [60, 70], 4: [68, 78], 5: [78, 88] } as const)[c.cost];
      expect(cardOvr(c)).toBeGreaterThanOrEqual(lo);
      expect(cardOvr(c)).toBeLessThanOrEqual(hi);
      expect(c.nickname.length).toBeGreaterThan(0);
    }
  });

  it("other seeds also validate (generator robustness)", () => {
    for (const seed of ["a", "b", "c", "2026-09-26", "kbo"]) {
      const report = validatePack(generatePack({ seed }));
      expect(report.errors, seed).toEqual([]);
    }
  });
});

describe("validatePack", () => {
  const clone = (): Pack => structuredClone(generated);

  it("rejects non-packs", () => {
    expect(validatePack({ nope: true }).ok).toBe(false);
  });

  it("catches a missing card", () => {
    const p = clone();
    p.cards.pop();
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("card count"))).toBe(true);
  });

  it("catches duplicate names and broken OVR", () => {
    const p = clone();
    p.cards[1]!.name = p.cards[0]!.name;
    const h = p.cards.find((c) => c.role === "H" && c.cost === 1)!;
    h.hitter = { ...h.hitter!, kRate: 99, contactL: 99, contactR: 99, hrRate: 99, xbhRate: 99, bbRate: 99 };
    const r = validatePack(p);
    expect(r.errors.some((e) => e.startsWith("duplicate name"))).toBe(true);
    expect(r.errors.some((e) => e.includes("OVR"))).toBe(true);
  });

  it("catches a tier without a catcher option", () => {
    const p = clone();
    for (const c of p.cards.filter((c) => c.role === "H" && c.cost === 5)) {
      c.pos2 = c.pos2.filter((x) => x !== "C");
      delete c.hitter!.def.C;
    }
    const r = validatePack(p);
    expect(r.errors.some((e) => e.includes("cost 5: no hitter who can play C"))).toBe(true);
  });
});

describe("committed fictional-v1.json", () => {
  it("is exactly what the generator produces for seed fictional-v1", () => {
    const file = resolve(__dirname, "..", "fictional-v1.json");
    const committed = JSON.parse(readFileSync(file, "utf8")) as Pack;
    expect(committed).toEqual(generated);
    expect(validatePack(committed).ok).toBe(true);
  });
});
