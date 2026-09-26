import { describe, expect, it } from "vitest";
import type { CardDef } from "@dugout/protocol";
import { OVR_WEIGHTS, baseNickname, cardOvr, createRng, hitterDisplay, nicknameAtStar, pitcherDisplay } from "../src/index.js";

const flat = (v: number) => ({ kRate: v, contactL: v, contactR: v, hrRate: v, xbhRate: v, bbRate: v, gbTend: 55, pullTend: 55, speed: v, sbSkill: v, def: { SS: v }, arm: v, clutch: 0 });
const flatP = (v: number) => ({ kRate: v, bbRate: v, hrRate: v, gbRate: v, contactVsL: v, contactVsR: v, stamina: v, mental: v, hold: 55, armAngle: 60 });

describe("display and OVR (§5.1, §5.2)", () => {
  it("weights sum to 1", () => {
    for (const w of Object.values(OVR_WEIGHTS)) expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it("flat internals give flat display and OVR", () => {
    const d = hitterDisplay(flat(70), "SS");
    expect(d).toEqual({ contact: 70, power: 70, eye: 70, speed: 70, defense: 70 });
    expect(pitcherDisplay(flatP(60))).toEqual({ stuff: 60, control: 60, movement: 60, stamina: 60, mental: 60 });
  });
  it("DH-only hitters count defense as 40 in OVR", () => {
    const dh: CardDef = { id: "x", name: "x", nickname: "x", team: "t", age: 30, bats: "R", throws: "R", role: "H", pos: "DH", pos2: [], cost: 3, origin: "COLLEGE", classes: ["SLUGGER"], hitter: { ...flat(80), def: {} } };
    const d = hitterDisplay(dh.hitter!, "DH");
    expect(d.defense).toBe(Math.round(0.7 * 40 + 0.3 * 80));
    expect(cardOvr(dh)).toBeLessThan(80);
  });
  it("RP weights stuff more than SP", () => {
    const p = flatP(60);
    const sp: CardDef = { id: "sp", name: "a", nickname: "n", team: "t", age: 28, bats: "R", throws: "R", role: "SP", pos: "DH", pos2: [], cost: 2, origin: "COLLEGE", classes: ["FINESSE"], pitcher: { ...p, kRate: 90, contactVsL: 90, contactVsR: 90 } };
    const rp: CardDef = { ...sp, id: "rp", role: "RP" };
    expect(cardOvr(rp)).toBeGreaterThan(cardOvr(sp));
  });
});

describe("nicknames (§5.7)", () => {
  const rng = createRng("nick");
  const slugger: CardDef = { id: "s", name: "s", nickname: "", team: "t", age: 27, bats: "L", throws: "R", role: "H", pos: "1B", pos2: [], cost: 3, origin: "COLLEGE", classes: ["SLUGGER"], hitter: { ...flat(50), hrRate: 90, xbhRate: 85, def: { "1B": 50 } } };
  it("picks the highest-priority matching rule", () => {
    expect(["홈런 아니면 삼진", "풀스윙 머신"]).toContain(baseNickname(slugger, rng));
  });
  it("evolves with stars", () => {
    const named = { ...slugger, nickname: "홈런 아니면 삼진" };
    expect(nicknameAtStar(named, 1, rng)).toBe("홈런 아니면 삼진");
    expect(nicknameAtStar(named, 2, rng)).toBe("주전 홈런 아니면 삼진");
    expect(["홈런 공장장", "담장 너머의 사나이"]).toContain(nicknameAtStar(named, 3, rng));
  });
  it("falls back to the generic pool", () => {
    const plain: CardDef = { ...slugger, id: "p", origin: "COLLEGE", classes: ["CLUTCH"], hitter: flat(55) };
    expect(baseNickname(plain, rng).length).toBeGreaterThan(0);
  });
});
