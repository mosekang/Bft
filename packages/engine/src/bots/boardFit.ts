import type { Archetype, BoardSynergyId, CardDef, GameState, PlayerState } from "@dugout/protocol";
import { BOT_BOARD_SYNERGY_FIT, BOT_BOARD_SYNERGY_PREFS } from "../config/bots.js";
import { BOARD_SYNERGY_RULES } from "../config/synergies.js";
import { boardSynergyMembers, isCatcher, isSidearm, isSwitchHitter, isUtility } from "../run/boardSynergies.js";
import type { RunContext } from "../run/context.js";

/** Board synergies (v3 §18.3) this card would feed if it joined `p`'s board. */
export function boardSynergiesOf(def: CardDef, p: PlayerState, state: GameState, ctx: RunContext): BoardSynergyId[] {
  const members = boardSynergyMembers(p, state.cards, ctx);
  const out: BoardSynergyId[] = [];
  const homegrownTeam = members.HOMEGROWN.length >= 2 ? ctx.defs.get(state.cards[members.HOMEGROWN[0]!]?.defId ?? "")?.team : undefined;
  if (homegrownTeam && def.team === homegrownTeam) out.push("HOMEGROWN");
  if (isUtility(def)) out.push("UTILITY");
  if (isSidearm(def)) out.push("SIDEARM");
  if (isSwitchHitter(def)) out.push("SWITCH_HITTER");
  if (def.role === "H" && def.hitter && def.hitter.bbRate >= BOARD_SYNERGY_RULES.leadoffMinEye) out.push("LEADOFF");
  if (isCatcher(def) && members.BACKUP_CATCHER.length >= 1) out.push("BACKUP_CATCHER");
  return out;
}

/** Extra tag fit (same units as preferred tags) for board synergies. */
export function boardSynergyFit(def: CardDef, p: PlayerState, state: GameState, ctx: RunContext, archetype: Archetype): number {
  const prefs = BOT_BOARD_SYNERGY_PREFS[archetype] ?? [];
  let fit = 0;
  for (const id of boardSynergiesOf(def, p, state, ctx)) fit += BOT_BOARD_SYNERGY_FIT[id] + (prefs.includes(id) ? 1 : 0);
  return fit;
}
