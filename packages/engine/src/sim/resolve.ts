import type { Board, CardDef, CardInstance, FieldPos, HitterRatings, PitcherRatings, Pos, StadiumId } from "@dugout/protocol";
import { FIELD_POS } from "@dugout/protocol";
import { BOARD, REPLACEMENT } from "../config/board.js";
import { STAR_BONUS } from "../config/levels.js";
import { hitterDisplay, pitcherDisplay, pitcherOvr } from "../ratings.js";
import { defaultHitterMods, defaultPitcherMods, defaultTeamMods, type HitterMods, type PitcherMods, type SimHitter, type SimPitcher, type SimTeam, type TeamMods } from "./types.js";

/**
 * Effects computed outside the simulator (items, synergies, augments — Phase 2).
 * Resolve merges them on top of the defaults; missing entries are no-ops.
 */
export interface TeamEffects {
  team: Partial<TeamMods>;
  hitterMods: Map<string, Partial<HitterMods>>;
  pitcherMods: Map<string, Partial<PitcherMods>>;
  /** Flat add to every internal rating of a card (COLLEGE +5, FOREIGN +10, star-independent). */
  ratingAdd: Map<string, number>;
  /** Adds to specific internal ratings (items: power → hrRate/xbhRate, …). */
  internalAdd: Map<string, Partial<Record<keyof HitterRatings | keyof PitcherRatings, number>>>;
}

export const emptyEffects = (): TeamEffects => ({ team: {}, hitterMods: new Map(), pitcherMods: new Map(), ratingAdd: new Map(), internalAdd: new Map() });

export interface ResolveInput {
  teamId: string;
  name: string;
  board: Board;
  cards: Record<string, CardInstance>;
  defs: ReadonlyMap<string, CardDef>;
  stadium: StadiumId;
  effects?: TeamEffects;
}

const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)));

function starAdd(card: CardInstance): number {
  return STAR_BONUS[card.star] + card.growth;
}

function boostHitter(r: HitterRatings, add: number, internal: Partial<Record<string, number>>, mult = 1): HitterRatings {
  const f = (k: keyof HitterRatings, v: number) => clamp((v + add + (internal[k] ?? 0)) * mult);
  const def: Partial<Record<Pos, number>> = {};
  for (const [k, v] of Object.entries(r.def) as [Pos, number][]) def[k] = clamp((v + add + (internal["def"] ?? 0)) * mult);
  return {
    kRate: f("kRate", r.kRate), contactL: f("contactL", r.contactL), contactR: f("contactR", r.contactR), hrRate: f("hrRate", r.hrRate), xbhRate: f("xbhRate", r.xbhRate),
    bbRate: f("bbRate", r.bbRate), gbTend: r.gbTend, pullTend: r.pullTend, speed: f("speed", r.speed), sbSkill: f("sbSkill", r.sbSkill), def, arm: f("arm", r.arm), clutch: r.clutch,
  };
}

function boostPitcher(r: PitcherRatings, add: number, internal: Partial<Record<string, number>>, mult = 1): PitcherRatings {
  const f = (k: keyof PitcherRatings, v: number) => clamp((v + add + (internal[k] ?? 0)) * mult);
  return {
    kRate: f("kRate", r.kRate), bbRate: f("bbRate", r.bbRate), hrRate: f("hrRate", r.hrRate), gbRate: f("gbRate", r.gbRate), contactVsL: f("contactVsL", r.contactVsL), contactVsR: f("contactVsR", r.contactVsR),
    stamina: f("stamina", r.stamina), mental: f("mental", r.mental), hold: r.hold, armAngle: r.armAngle,
  };
}

/** Replacement-level hitter for a slot (§5.4). */
export function replacementHitter(pos: Pos, index: number): SimHitter {
  const v = REPLACEMENT.rating;
  const def: Partial<Record<Pos, number>> = {};
  for (const p of FIELD_POS) def[p] = v;
  const r: HitterRatings = { kRate: v, contactL: v, contactR: v, hrRate: v, xbhRate: v, bbRate: v, gbTend: 55, pullTend: 55, speed: v, sbSkill: v, def, arm: v, clutch: 0 };
  return {
    id: `REPL:${pos}`, name: `${REPLACEMENT.surnames[index % REPLACEMENT.surnames.length]}${REPLACEMENT.suffix}`, bats: "R", r, pos, defEff: v,
    contactDisplay: v, mods: defaultHitterMods(), isReplacement: true,
  };
}

/** Replacement-level pitcher (§5.4): no fatigue, SP/RP dual. */
export function replacementPitcher(role: "SP" | "RP", index: number, id = `REPL:${role}`): SimPitcher {
  const v = REPLACEMENT.rating;
  const r: PitcherRatings = { kRate: v, bbRate: v, hrRate: v, gbRate: v, contactVsL: v, contactVsR: v, stamina: REPLACEMENT.pitcherStamina, mental: v, hold: 55, armAngle: 60 };
  return {
    id, name: `${REPLACEMENT.surnames[index % REPLACEMENT.surnames.length]}${REPLACEMENT.suffix}`, throws: "R", role, r, slot: null, tired: false,
    mods: defaultPitcherMods(), isReplacement: true, ovr: pitcherOvr(pitcherDisplay(r), role),
  };
}

/**
 * §4.3 position efficiency. `penaltyMult` scales the off-position loss
 * (UTILITY: 0.5 halves it, 0 removes it); the primary position is unaffected.
 */
export function effectiveDefense(def: CardDef, r: HitterRatings, pos: Pos, penaltyMult = 1): number {
  if (pos === "DH") return BOARD.dhOnlyDefenseForOvr;
  const primary = def.pos === "DH" ? BOARD.defaultDef : (r.def[def.pos] ?? BOARD.defaultDef);
  const eff = (e: number) => 1 - (1 - e) * penaltyMult;
  if (def.pos === pos) return (r.def[pos] ?? primary) * BOARD.positionEfficiency.primary;
  if (def.pos2.includes(pos)) return (r.def[pos] ?? primary) * eff(BOARD.positionEfficiency.secondary);
  return primary * eff(BOARD.positionEfficiency.other);
}

/** Turn a player's board into a simulator team, filling holes with replacements. */
export function resolveTeam(input: ResolveInput): SimTeam {
  const effects = input.effects ?? emptyEffects();
  const mods: TeamMods = { ...defaultTeamMods(), ...effects.team };
  const tiredMult = 1 - mods.tiredPenalty;
  let replIdx = 0;

  const hitterAt = (pos: Pos): SimHitter => {
    const instanceId = input.board.slots[pos];
    const card = instanceId ? input.cards[instanceId] : undefined;
    const def = card ? input.defs.get(card.defId) : undefined;
    if (!card || !def || def.role !== "H" || !def.hitter) return replacementHitter(pos, replIdx++);
    const r = boostHitter(def.hitter, starAdd(card) + (effects.ratingAdd.get(card.instanceId) ?? 0), effects.internalAdd.get(card.instanceId) ?? {});
    const display = hitterDisplay(r, def.pos);
    const mods: HitterMods = { ...defaultHitterMods(), ...(effects.hitterMods.get(card.instanceId) ?? {}) };
    return {
      id: card.instanceId, name: def.name, bats: def.bats, r, pos, defEff: effectiveDefense(def, r, pos, mods.offPositionPenaltyMult), contactDisplay: display.contact, powerDisplay: display.power,
      mods, isReplacement: false,
    };
  };

  const lineup = input.board.order.map(hitterAt);
  const fielders = {} as Record<FieldPos, SimHitter>;
  for (const h of lineup) if (h.pos !== "DH") fielders[h.pos as FieldPos] = h;
  for (const p of FIELD_POS) if (!fielders[p]) fielders[p] = replacementHitter(p, replIdx++);

  interface Slotted { p: SimPitcher; card: CardInstance; def: CardDef; slot: "P1" | "P2" | "P3" }
  const slotted: Slotted[] = [];
  for (const slot of ["P1", "P2", "P3"] as const) {
    const instanceId = input.board.slots[slot];
    const card = instanceId ? input.cards[instanceId] : undefined;
    const def = card ? input.defs.get(card.defId) : undefined;
    if (!card || !def || def.role === "H" || !def.pitcher) continue;
    if (card.injuredRounds > 0) continue;
    const tired = card.fatigue > 0;
    const r = boostPitcher(def.pitcher, starAdd(card) + (effects.ratingAdd.get(card.instanceId) ?? 0), effects.internalAdd.get(card.instanceId) ?? {}, tired ? tiredMult : 1);
    const pm: PitcherMods = { ...defaultPitcherMods(), ...(effects.pitcherMods.get(card.instanceId) ?? {}) };
    slotted.push({ card, def, slot, p: { id: card.instanceId, name: def.name, throws: def.throws, role: def.role, r, slot, tired, mods: pm, isReplacement: false, ovr: pitcherOvr(pitcherDisplay(r), def.role) } });
  }

  // Starter: first fresh SP in slot order; else force-pitch SP with least fatigue; else opener; else replacement.
  let starter: SimPitcher | undefined = slotted.find((s) => s.def.role === "SP" && s.card.fatigue === 0)?.p;
  if (!starter) {
    const forced = slotted.filter((s) => s.def.role === "SP" && input.board.forcePitch[s.slot]).sort((a, b) => a.card.fatigue - b.card.fatigue);
    starter = forced[0]?.p;
  }
  if (!starter) starter = slotted.find((s) => s.def.role === "RP" && s.p.mods.openerOuts > 0 && s.slot === "P1")?.p;
  if (!starter) starter = replacementPitcher("SP", replIdx++);

  const bullpen = slotted.filter((s) => s.def.role === "RP" && s.p.id !== starter!.id).map((s) => s.p).sort((a, b) => b.ovr - a.ovr);
  bullpen.push(replacementPitcher("RP", replIdx++, "REPL:RP"));

  return { id: input.teamId, name: input.name, lineup, fielders, starter, bullpen, mods, stadium: input.stadium };
}
