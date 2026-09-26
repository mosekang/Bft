import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHETYPES, AUGMENT_IDS, PackSchema, SPECIAL_ITEM_IDS, type AugmentId, type CardDef, type CardInstance, type GameState, type Pack, type Pos, type Slot } from "@dugout/protocol";
import {
  AUGMENT_BY_ID,
  BOARD_SYNERGY_RULES,
  ITEM_BY_ID,
  SPECIAL_REWARD_OPTIONS,
  STADIUMS,
  SYNERGIES,
  advance,
  applyAction,
  backupCatcherRecovery,
  bots,
  computeEffects,
  countSynergies,
  createContext,
  createRng,
  createRun,
  defaultHitterMods,
  defaultPitcherMods,
  defaultTeamMods,
  effectiveDefense,
  equipItem,
  hpGold,
  paProbabilities,
  PIVOT,
  rerollCostFor,
  roundIncome,
  setAssertions,
  specialRewardOptions,
  tickPerks,
  tradeOffersFor,
  youngestOnBoard,
} from "../src/index.js";

const pack: Pack = PackSchema.parse(JSON.parse(readFileSync(resolve(__dirname, "../../packs/fictional-v1.json"), "utf8")));
const ctx = createContext(pack);
setAssertions(true);

const HITTER_SLOTS: Pos[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const hitters = pack.cards.filter((c) => c.role === "H");
const pitchers = pack.cards.filter((c) => c.role !== "H");

/** A PREP-phase run where "me" owns exactly `defs` on the board (hitters in lineup order, pitchers P1..P3). */
function withBoard(defs: CardDef[], opts: { star?: 1 | 2; augments?: AugmentId[]; order?: Pos[] } = {}): GameState {
  let s = createRun(ctx, { seed: "expansion", players: [{ id: "me", nickname: "나", isBot: false }] });
  s = { ...s, phase: "PREP" };
  const cards: Record<string, CardInstance> = {};
  const slots: Partial<Record<Slot, string>> = {};
  let h = 0, p = 0;
  defs.forEach((def, i) => {
    const id = `x${i}`;
    cards[id] = { instanceId: id, defId: def.id, star: opts.star ?? 1, items: [], fatigue: 0, injuredRounds: 0, growth: 0 };
    const slot: Slot = def.role === "H" ? HITTER_SLOTS[h++]! : (["P1", "P2", "P3"] as const)[p++]!;
    slots[slot] = id;
  });
  return {
    ...s, cards,
    players: s.players.map((x) => (x.id === "me" ? { ...x, level: 10, gold: 50, augments: opts.augments ?? [], board: { ...x.board, slots, order: opts.order ?? [...HITTER_SLOTS] } } : x)),
  };
}
const me = (s: GameState) => s.players.find((p) => p.id === "me")!;
const status = (s: GameState, id: string) => computeEffects(me(s), s.cards, ctx, 3).run.synergies.find((x) => x.id === id);
const effects = (s: GameState, stage = 3) => computeEffects(me(s), s.cards, ctx, stage);
const act = (s: GameState, a: Parameters<typeof applyAction>[2]) => {
  const r = applyAction(s, "me", a, ctx);
  if (!r.ok) throw new Error(`${a.type}: ${r.code} ${r.msg}`);
  return r.value;
};

describe("board synergies (v3 §18.3)", () => {
  it("are derived: no pack minimum, BOARD kind, codex text for every tier", () => {
    for (const id of ["HOMEGROWN", "UTILITY", "SIDEARM", "SWITCH_HITTER", "LEADOFF", "BACKUP_CATCHER"] as const) {
      expect(SYNERGIES[id].kind).toBe("BOARD");
      expect(SYNERGIES[id].minPackCards).toBe(0);
      expect(SYNERGIES[id].descriptionsKo).toHaveLength(SYNERGIES[id].thresholds.length);
      expect(SYNERGIES[id].nameKo.length).toBeGreaterThan(0);
    }
  });

  it("HOMEGROWN: 3 / 5 same-team cards give every board card +3 / +6", () => {
    // Origins without flat rating adds, so ratingAdd isolates HOMEGROWN.
    const neutral = (c: CardDef) => c.origin !== "COLLEGE" && c.origin !== "FOREIGN";
    const counts = new Map<string, number>();
    for (const c of pack.cards) if (neutral(c)) counts.set(c.team, (counts.get(c.team) ?? 0) + 1);
    const team = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const byTeam = [...pack.cards.filter((c) => c.team === team && neutral(c) && c.role === "H"), ...pack.cards.filter((c) => c.team === team && neutral(c) && c.role !== "H")];
    expect(byTeam.length).toBeGreaterThanOrEqual(5);
    const other = hitters.find((c) => c.team !== team && neutral(c))!;
    expect(status(withBoard([...byTeam.slice(0, 2), other]), "HOMEGROWN")?.tier ?? 0).toBe(0);
    const s3 = withBoard([...byTeam.slice(0, 3), other]);
    expect(status(s3, "HOMEGROWN")).toMatchObject({ count: 3, tier: 1 });
    expect(effects(s3).team.ratingAdd.get("x3")).toBe(3); // the outsider benefits too
    const s5 = withBoard(byTeam.slice(0, 5));
    expect(status(s5, "HOMEGROWN")).toMatchObject({ count: 5, tier: 2 });
    expect(effects(s5).team.ratingAdd.get("x0")).toBe(6);
  });

  it("UTILITY: 2 / 4 multi-position hitters halve / remove the off-position penalty", () => {
    const util = hitters.filter((c) => c.pos2.length >= BOARD_SYNERGY_RULES.utilityMinPos2);
    expect(util.length).toBeGreaterThanOrEqual(4);
    expect(status(withBoard(util.slice(0, 1)), "UTILITY")?.tier ?? 0).toBe(0);
    expect(effects(withBoard(util.slice(0, 2))).team.hitterMods.get("x0")?.offPositionPenaltyMult).toBe(0.5);
    expect(effects(withBoard(util.slice(0, 4))).team.hitterMods.get("x0")?.offPositionPenaltyMult).toBe(0);
    const def = util[0]!;
    const off = (["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const).find((p) => p !== def.pos && !def.pos2.includes(p))!;
    const full = effectiveDefense(def, def.hitter!, off, 1);
    expect(effectiveDefense(def, def.hitter!, off, 0.5)).toBeGreaterThan(full);
    expect(effectiveDefense(def, def.hitter!, off, 0)).toBeGreaterThan(effectiveDefense(def, def.hitter!, off, 0.5));
    expect(effectiveDefense(def, def.hitter!, def.pos, 0)).toBe(effectiveDefense(def, def.hitter!, def.pos, 1));
  });

  it("SIDEARM: an arm angle ≤ 30 pitcher strikes out more same-hand batters", () => {
    const side = pitchers.find((c) => c.pitcher!.armAngle <= BOARD_SYNERGY_RULES.sidearmMaxArmAngle)!;
    const over = pitchers.find((c) => c.pitcher!.armAngle > BOARD_SYNERGY_RULES.sidearmMaxArmAngle)!;
    expect(status(withBoard([over]), "SIDEARM")).toBeUndefined();
    const s = withBoard([side]);
    expect(status(s, "SIDEARM")).toMatchObject({ count: 1, tier: 1 });
    const mods = { ...defaultPitcherMods(), ...effects(s).team.pitcherMods.get("x0") };
    expect(mods.sameHandKMult).toBeCloseTo(1.2, 9);
    const pa = (batterHand: "L" | "R", pm = mods) => paProbabilities(paCtx({ batterHand, pitcherHand: "R", pitcherMods: pm }));
    expect(pa("R").k).toBeCloseTo(pa("R", defaultPitcherMods()).k * 1.2, 9);
    expect(pa("L").k).toBeCloseTo(pa("L", defaultPitcherMods()).k, 9);
  });

  it("SWITCH_HITTER: 2 switch hitters get BABIP +.010 and a platoon floor of 1", () => {
    const sw = hitters.filter((c) => c.bats === "S");
    expect(sw.length).toBeGreaterThanOrEqual(2);
    expect(status(withBoard(sw.slice(0, 1)), "SWITCH_HITTER")?.tier ?? 0).toBe(0);
    const m = effects(withBoard(sw.slice(0, 2))).team.hitterMods.get("x0")!;
    expect(m.babipAdd).toBeCloseTo(0.01, 9);
    expect(m.noPlatoonPenalty).toBe(true);
    // The floor matters whenever the platoon multiplier would drop below 1.
    const bm = { ...defaultHitterMods(), noPlatoonPenalty: true };
    const same = paProbabilities(paCtx({ batterHand: "R", pitcherHand: "R" }));
    const floored = paProbabilities(paCtx({ batterHand: "R", pitcherHand: "R", batterMods: bm }));
    expect(same.platoonMult).toBeLessThan(1);
    expect(floored.platoonMult).toBe(1);
  });

  it("LEADOFF: counts eye ≥ 70 hitters batting 1st/2nd only", () => {
    const eyeHitters = hitters.filter((c) => c.hitter!.bbRate >= BOARD_SYNERGY_RULES.leadoffMinEye);
    const lowEye = hitters.filter((c) => c.hitter!.bbRate < BOARD_SYNERGY_RULES.leadoffMinEye);
    expect(eyeHitters.length).toBeGreaterThanOrEqual(1);
    const s = withBoard([eyeHitters[0]!, lowEye[0]!, lowEye[1]!]);
    expect(status(s, "LEADOFF")).toMatchObject({ count: 1, tier: 1 });
    const m = effects(s).team.hitterMods.get("x0")!;
    expect(m.bbMult).toBeCloseTo(1.1, 9);
    expect(m.sbSuccessAdd).toBeCloseTo(0.03, 9);
    expect(effects(s).team.hitterMods.get("x1")?.bbMult ?? 1).toBe(1);
    // Batting 3rd: no longer counted.
    const moved = withBoard([eyeHitters[0]!, lowEye[0]!, lowEye[1]!], { order: ["1B", "2B", "C", "3B", "SS", "LF", "CF", "RF", "DH"] });
    expect(status(moved, "LEADOFF")).toBeUndefined();
    // ★★ bonus counts toward display eye.
    const near = lowEye.find((c) => c.hitter!.bbRate + 12 >= BOARD_SYNERGY_RULES.leadoffMinEye);
    if (near) expect(status(withBoard([near], { star: 2 }), "LEADOFF")?.tier).toBe(1);
  });

  it("BACKUP_CATCHER: two catchers double framing; MASTER_CATCHER lets one count twice", () => {
    const cs = hitters.filter((c) => c.classes.includes("CATCHER"));
    const one = withBoard([cs[0]!]);
    const two = withBoard([cs[0]!, cs[1]!]);
    expect(status(one, "BACKUP_CATCHER")?.tier ?? 0).toBe(0);
    expect(effects(one).team.team.bbMult).toBeCloseTo(0.93, 9);
    expect(status(two, "BACKUP_CATCHER")).toMatchObject({ count: 2, tier: 1 });
    expect(effects(two).team.team.bbMult).toBeCloseTo(1 - 0.07 * 2, 9);
    expect(effects(two).run.fatigueRecoverChance).toBeCloseTo(0.3, 9);
    const master = withBoard([cs[0]!], { augments: ["MASTER_CATCHER"] });
    expect(status(master, "BACKUP_CATCHER")?.tier).toBe(1);
    expect(effects(master).team.team.bbMult).toBeCloseTo(1 - 0.07 * 2 * 1.5, 9);
    const abs = withBoard([cs[0]!, cs[1]!], { augments: ["ABS"] });
    expect(effects(abs).team.team.bbMult ?? 1).toBe(1);
  });

  it("BACKUP_CATCHER recovery is seeded, hits ~30 % and only touches tired pitchers", () => {
    const sp = pitchers.find((c) => c.role === "SP")!;
    const cards: Record<string, CardInstance> = { a: { instanceId: "a", defId: sp.id, star: 1, items: [], fatigue: 2, injuredRounds: 0, growth: 0 }, b: { instanceId: "b", defId: hitters[0]!.id, star: 1, items: [], fatigue: 0, injuredRounds: 0, growth: 0 } };
    const eff = { fatigueRecoverChance: 0.3, fatigueRecover: 1 };
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      const out = backupCatcherRecovery(cards, ["a", "b"], eff, ctx, createRng(`bc${i}`));
      expect(out).toEqual(backupCatcherRecovery(cards, ["a", "b"], eff, ctx, createRng(`bc${i}`)));
      if (out["a"]!.fatigue === 1) hits++;
      expect(out["b"]).toBe(cards["b"]);
    }
    expect(hits / 2000).toBeGreaterThan(0.26);
    expect(hits / 2000).toBeLessThan(0.34);
    expect(backupCatcherRecovery(cards, ["a"], { fatigueRecoverChance: 0, fatigueRecover: 1 }, ctx, createRng("x"))).toBe(cards);
  });
});

describe("special items (v3 §18.3)", () => {
  const give = (s: GameState, items: GameState["players"][number]["itemsUnequipped"]) => ({ ...s, players: s.players.map((p) => (p.id === "me" ? { ...p, itemsUnequipped: items } : p)) });
  const choose = (s: GameState, item: (typeof SPECIAL_ITEM_IDS)[number]) => act({ ...s, players: s.players.map((p) => (p.id === "me" ? { ...p, choice: { kind: "ITEM" as const, options: [item] } } : p)) }, { type: "PICK_CHOICE", idx: 0 });

  it("every special has codex text; new ones declare how they are used", () => {
    for (const id of SPECIAL_ITEM_IDS) expect(ITEM_BY_ID.get(id)?.descriptionKo.length).toBeGreaterThan(0);
    for (const id of ["SCOUT_REPORT", "SUPPLEMENT", "CHEER_SONG", "AGENT"] as const) expect(ITEM_BY_ID.get(id)?.use).toBe("INSTANT");
    expect(ITEM_BY_ID.get("CONTRACT_EXTENSION")?.use).toBe("EQUIP");
    expect(ITEM_BY_ID.get("TRAINING_CAMP")?.use).toBe("CONSUME_ON_EQUIP");
  });

  it("legend reward offers distinct specials, deterministically", () => {
    const a = specialRewardOptions(createRng("legend"));
    expect(a).toHaveLength(SPECIAL_REWARD_OPTIONS);
    expect(new Set(a).size).toBe(a.length);
    expect(specialRewardOptions(createRng("legend"))).toEqual(a);
  });

  it("SUPPLEMENT clears pitcher fatigue on pick and never enters the inventory", () => {
    const sp = pitchers.find((c) => c.role === "SP")!;
    let s = withBoard([sp, hitters[0]!]);
    s = { ...s, cards: { ...s.cards, x0: { ...s.cards["x0"]!, fatigue: 2 } } };
    s = choose(s, "SUPPLEMENT");
    expect(s.cards["x0"]!.fatigue).toBe(0);
    expect(me(s).itemsUnequipped).toEqual([]);
    expect(me(s).choice).toBeUndefined();
  });

  it("AGENT: five free rerolls, then the normal price", () => {
    let s = choose(withBoard([hitters[0]!]), "AGENT");
    expect(me(s).perks?.freeRerolls).toBe(5);
    for (let i = 0; i < 5; i++) s = act(s, { type: "REROLL" });
    expect(me(s).gold).toBe(50);
    expect(me(s).perks?.freeRerolls).toBe(0);
    s = act(s, { type: "REROLL" });
    expect(me(s).gold).toBe(48);
  });

  it("CHEER_SONG: +4 RISP for hitters for three game rounds", () => {
    let s = choose(withBoard([hitters[0]!]), "CHEER_SONG");
    expect(effects(s).team.hitterMods.get("x0")?.rispAdd).toBe(4);
    let p = me(s);
    for (let i = 0; i < 3; i++) p = tickPerks(p);
    s = { ...s, players: s.players.map((x) => (x.id === "me" ? p : x)) };
    expect(effects(s).team.hitterMods.get("x0")?.rispAdd ?? 0).toBe(0);
  });

  it("SCOUT_REPORT reveals the next opponent's board for one round", () => {
    const s = choose(withBoard([hitters[0]!]), "SCOUT_REPORT");
    expect(effects(s).run.revealOpponentBoard).toBe(true);
    expect(me(s).scoutingActive).toBe(true);
    const after = { ...s, players: s.players.map((x) => (x.id === "me" ? tickPerks(x) : x)) };
    expect(effects(after).run.revealOpponentBoard).toBe(false);
  });

  it("TRAINING_CAMP is consumed through EQUIP for +6 permanent growth", () => {
    const s = act(give(withBoard([hitters[0]!]), ["TRAINING_CAMP"]), { type: "EQUIP", itemId: "TRAINING_CAMP", cardInstanceId: "x0" });
    expect(s.cards["x0"]!.growth).toBe(6);
    expect(s.cards["x0"]!.items).toEqual([]);
    expect(me(s).itemsUnequipped).toEqual([]);
  });

  it("CONTRACT_EXTENSION is held like an item: +3 all ratings and injury immunity", () => {
    const s = act(give(withBoard([hitters[0]!]), ["CONTRACT_EXTENSION"]), { type: "EQUIP", itemId: "CONTRACT_EXTENSION", cardInstanceId: "x0" });
    expect(s.cards["x0"]!.items).toEqual(["CONTRACT_EXTENSION"]);
    expect(effects(s).team.ratingAdd.get("x0")).toBe(3);
    expect(effects(s).run.injuryImmune.has("x0")).toBe(true);
  });

  it("v2 inventory specials still cannot be equipped", () => {
    const r = equipItem(give(withBoard([hitters[0]!]), ["CALL_UP"]), "me", "CALL_UP", "x0", ctx);
    expect(r).toMatchObject({ ok: false, code: "INVALID_ITEM" });
  });
});

describe("new manager philosophies (v3 §18.3)", () => {
  it("are registered with rarity and codex text", () => {
    const fresh: AugmentId[] = ["DATA_BASEBALL", "VETERAN_PREFERENCE", "REBUILDING", "HOME_ADVANTAGE", "CHEER_SQUAD", "ROOKIE_RACE", "TRADE_MASTER", "MASTER_CATCHER"];
    for (const id of fresh) expect(AUGMENT_IDS).toContain(id);
    expect(fresh.map((id) => AUGMENT_BY_ID.get(id)!.rarity)).toEqual(["GOLD", "SILVER", "SILVER", "GOLD", "SILVER", "GOLD", "GOLD", "PRISM"]);
  });

  it("DATA_BASEBALL: internals revealed, first reroll each round costs 1 less", () => {
    const s = withBoard([hitters[0]!], { augments: ["DATA_BASEBALL"] });
    const eff = effects(s).run;
    expect(eff.revealInternals).toBe(true);
    expect(rerollCostFor(me(s), eff)).toBe(1);
    expect(rerollCostFor({ ...me(s), rerollCount: 1 }, eff)).toBe(2);
    const after = act(s, { type: "REROLL" });
    expect(me(after).gold).toBe(49);
  });

  it("VETERAN_PREFERENCE: veterans +6 and no S7 penalty", () => {
    const vets = hitters.filter((c) => c.origin === "VETERAN").slice(0, 2);
    const s = withBoard(vets, { augments: ["VETERAN_PREFERENCE"] });
    expect(effects(s).team.ratingAdd.get("x0")).toBe(6);
    expect(effects(s, 7).team.internalAdd.get("x0")?.speed ?? 0).toBe(0);
    expect(effects(withBoard(vets), 7).team.internalAdd.get("x0")?.speed).toBe(-10);
  });

  it("REBUILDING: +2 gold per round at hp ≥ 60 and prospect growth +1", () => {
    const pros = hitters.filter((c) => c.origin === "HS_PROSPECT").slice(0, 2);
    const s = withBoard(pros, { augments: ["REBUILDING"] });
    const eff = effects(s).run;
    expect(hpGold(60, eff)).toBe(2);
    expect(hpGold(59, eff)).toBe(0);
    expect(roundIncome({ ...me(s), hp: 80, gold: 0 }, "2-2", eff, false).bonus).toBe(2);
    expect(eff.growthPerRound.get("x0")).toBe((effects(withBoard(pros)).run.growthPerRound.get("x0") ?? 0) + 1);
  });

  it("HOME_ADVANTAGE: +.012 BABIP only when batting at home", () => {
    const s = withBoard([hitters[0]!], { augments: ["HOME_ADVANTAGE"] });
    const team = { ...defaultTeamMods(), ...effects(s).team.team };
    expect(team.homeBabipAdd).toBeCloseTo(0.012, 9);
    const home = paProbabilities(paCtx({ battingTeam: team, battingHome: true }));
    const away = paProbabilities(paCtx({ battingTeam: team, battingHome: false }));
    expect(home.babipAdd - away.babipAdd).toBeCloseTo(0.012, 9);
  });

  it("CHEER_SQUAD: +1 gold per home win and a home RISP bump", () => {
    const s = withBoard([hitters[0]!], { augments: ["CHEER_SQUAD"] });
    const e = effects(s);
    expect(e.run.homeWinGold).toBe(1);
    expect(roundIncome({ ...me(s), gold: 0 }, "2-2", e.run, false, e.run.homeWinGold * 1).bonus).toBe(1);
    const team = { ...defaultTeamMods(), ...e.team.team };
    const b = { ...avgH, kRate: 40 };
    const homeRisp = paProbabilities(paCtx({ batter: b, battingTeam: team, battingHome: true, risp: true }));
    const awayRisp = paProbabilities(paCtx({ batter: b, battingTeam: team, battingHome: false, risp: true }));
    expect(homeRisp.k).toBeLessThan(awayRisp.k);
  });

  it("ROOKIE_RACE: the youngest card on the board gets +10", () => {
    const pick = [...hitters].sort((a, b) => a.age - b.age);
    const s = withBoard([pick[pick.length - 1]!, pick[0]!], { augments: ["ROOKIE_RACE"] });
    expect(youngestOnBoard([{ card: s.cards["x0"]!, def: pick[pick.length - 1]! }, { card: s.cards["x1"]!, def: pick[0]! }])).toBe("x1");
    expect(effects(s).team.ratingAdd.get("x1")).toBe(10);
    expect(effects(s).team.ratingAdd.get("x0") ?? 0).toBe(0);
  });

  it("TRADE_MASTER: five offers and two swaps at the deadline", () => {
    const s = withBoard([hitters[0]!], { augments: ["TRADE_MASTER"] });
    expect(effects(s).run.tradeSwaps).toBe(2);
    expect(tradeOffersFor(s, "me", "x0", ctx)).toHaveLength(5);
    expect(tradeOffersFor(withBoard([hitters[0]!]), "me", "x0", ctx)).toHaveLength(3);
  });
});

describe("determinism with the expansion", () => {
  it("bot runs seeded with every new augment and perk replay identically", () => {
    const fresh: AugmentId[] = ["DATA_BASEBALL", "VETERAN_PREFERENCE", "REBUILDING", "HOME_ADVANTAGE", "CHEER_SQUAD", "ROOKIE_RACE", "TRADE_MASTER", "MASTER_CATCHER"];
    const run = () => {
      let s = createRun(ctx, { seed: "expansion-det", players: ARCHETYPES.map((a, i) => ({ id: `b${i}`, nickname: a, isBot: true, archetype: a })), fillWithBots: false });
      s = { ...s, players: s.players.map((p, i) => ({ ...p, augments: [fresh[i]!], perks: { freeRerolls: 2, cheerRounds: 2, scoutRounds: 1 } })) };
      for (let g = 0; g < 400 && s.phase !== "GAME_OVER"; g++) s = advance(s, ctx, bots);
      return s;
    };
    const a = run();
    expect(a.phase).toBe("GAME_OVER");
    expect(run()).toEqual(a);
  });
});

const h = PIVOT.hitter, p0 = PIVOT.pitcher;
const avgH = { kRate: h, contactL: h, contactR: h, hrRate: h, xbhRate: h, bbRate: h, gbTend: h, pullTend: 55, speed: h, sbSkill: h, def: {}, arm: 55, clutch: 0 };
const avgP = { kRate: p0, bbRate: p0, hrRate: p0, gbRate: p0, contactVsL: p0, contactVsR: p0, stamina: 55, mental: p0, hold: 55, armAngle: 55 };
function paCtx(over: Partial<Parameters<typeof paProbabilities>[0]> = {}): Parameters<typeof paProbabilities>[0] {
  return {
    batter: avgH, batterHand: "R", batterMods: defaultHitterMods(), pitcher: avgP, pitcherHand: "R", pitcherMods: defaultPitcherMods(),
    battingTeam: defaultTeamMods(), fieldingTeam: defaultTeamMods(), stadium: STADIUMS.DOME, fatigueSteps: 0, risp: false, meltdownPenalty: 0,
    closerActive: false, isFirstPa: false, isLeadoff: false, extraInning: false, ...over,
  };
}
