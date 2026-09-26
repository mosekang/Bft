import type { CardDef, GameState, PlayerState, Pos } from "@dugout/protocol";
import { FIELD_POS } from "@dugout/protocol";
import { SCHEDULE } from "../config/schedule.js";
import { cardOvr } from "../ratings.js";
import type { Rng } from "../rng.js";
import { defaultHitterMods, defaultPitcherMods, defaultTeamMods, type SimHitter, type SimPitcher, type SimTeam } from "../sim/types.js";
import { pitcherDisplay, pitcherOvr } from "../ratings.js";
import type { RunContext } from "./context.js";

const NAMES_H = ["훈련생 A", "훈련생 B", "훈련생 C", "훈련생 D", "훈련생 E", "훈련생 F", "훈련생 G", "훈련생 H", "훈련생 I"];
const LEGEND_H = ["88 리드오프", "88 2번", "88 3번", "88 4번", "88 5번", "88 6번", "88 7번", "88 8번", "88 9번"];

/** A synthetic team where every internal rating equals `rating` (training team, legend boss). */
export function syntheticTeam(id: string, name: string, rating: number, stadium: SimTeam["stadium"], legend = false): SimTeam {
  const pos: Pos[] = ["CF", "SS", "1B", "DH", "LF", "RF", "3B", "2B", "C"];
  const hitters: SimHitter[] = pos.map((p, i) => {
    const def: Partial<Record<Pos, number>> = {};
    for (const fp of FIELD_POS) def[fp] = rating;
    return {
      id: `${id}:H${i}`, name: (legend ? LEGEND_H : NAMES_H)[i]!, bats: i % 3 === 0 ? "L" : "R", pos: p, defEff: rating, contactDisplay: rating, isReplacement: false, mods: defaultHitterMods(),
      r: { kRate: rating, contactL: rating, contactR: rating, hrRate: rating, xbhRate: rating, bbRate: rating, gbTend: 55, pullTend: 55, speed: rating, sbSkill: rating, def, arm: rating, clutch: 0 },
    };
  });
  const fielders = {} as SimTeam["fielders"];
  for (const h of hitters) if (h.pos !== "DH") fielders[h.pos as keyof SimTeam["fielders"]] = h;
  const mk = (role: "SP" | "RP", n: number): SimPitcher => {
    const r = { kRate: rating, bbRate: rating, hrRate: rating, gbRate: rating, contactVsL: rating, contactVsR: rating, stamina: role === "SP" ? rating : 40, mental: rating, hold: 55, armAngle: 60 };
    return { id: `${id}:${role}${n}`, name: legend ? `88 ${role === "SP" ? "에이스" : "소방수"}` : `훈련 ${role} ${n}`, throws: n % 2 ? "L" : "R", role, r, slot: null, tired: false, mods: defaultPitcherMods(), isReplacement: false, ovr: pitcherOvr(pitcherDisplay(r), role) };
  };
  return { id, name, lineup: hitters, fielders, starter: mk("SP", 1), bullpen: [mk("RP", 1), mk("RP", 2)], mods: defaultTeamMods(), stadium };
}

export function trainingTeam(stadium: SimTeam["stadium"]): SimTeam {
  return syntheticTeam("PVE:CAMP", "훈련팀", SCHEDULE.pveOvr.camp, stadium);
}

export function legendTeam(stadium: SimTeam["stadium"]): SimTeam {
  return syntheticTeam("PVE:LEGEND", "88년 그 팀", SCHEDULE.pveOvr.legend, stadium, true);
}

/**
 * All-star opponent (§10.2): top-OVR cards still in the pool, `level + 1`
 * of them, built as a pseudo roster. Returns defs by slot for resolution.
 */
export function allStarDefs(state: GameState, player: PlayerState, ctx: RunContext, rng: Rng): { slots: Partial<Record<string, CardDef>> } {
  const n = Math.min(12, player.level + 1);
  const avail = ctx.pack.cards.filter((c) => (state.pool[c.id] ?? 0) > 0).sort((a, b) => cardOvr(b) - cardOvr(a));
  const slots: Partial<Record<string, CardDef>> = {};
  let used = 0;
  const wantP = Math.min(3, Math.max(1, Math.round(n / 4)));
  const sps = avail.filter((c) => c.role === "SP");
  const rps = avail.filter((c) => c.role === "RP");
  const pSlots = ["P1", "P2", "P3"] as const;
  for (let i = 0; i < wantP; i++) {
    const def = i < 2 ? sps.shift() : (rng.chance(0.5) ? rps.shift() : sps.shift());
    if (def) { slots[pSlots[i]!] = def; used++; }
  }
  const order: Pos[] = ["CF", "SS", "C", "2B", "3B", "RF", "LF", "1B", "DH"];
  const hitters = avail.filter((c) => c.role === "H");
  for (const pos of order) {
    if (used >= n) break;
    const idx = hitters.findIndex((c) => c.pos === pos || c.pos2.includes(pos) || pos === "DH");
    if (idx < 0) continue;
    slots[pos] = hitters.splice(idx, 1)[0]!;
    used++;
  }
  return { slots };
}

/** `count` (§10.2: 3; TRADE_MASTER: 5) same-cost alternatives from the pool for a trade. */
export function tradeOffers(state: GameState, defId: string, ctx: RunContext, rng: Rng, count: number = SCHEDULE.tradeOptions): string[] {
  const def = ctx.defs.get(defId);
  if (!def) return [];
  const candidates = ctx.pack.cards.filter((c) => c.cost === def.cost && c.id !== def.id && (state.pool[c.id] ?? 0) > 0);
  return rng.shuffle(candidates).slice(0, count).map((c) => c.id);
}
