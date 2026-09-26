import type { BoardSynergyId, CardDef, CardInstance, PlayerState } from "@dugout/protocol";
import { BOARD_SYNERGY_IDS } from "@dugout/protocol";
import { STAR_BONUS } from "../config/levels.js";
import { BOARD_SYNERGY_RULES } from "../config/synergies.js";
import type { RunContext } from "./context.js";

/** Instance ids that count toward each board synergy (v3 §18.3). */
export type BoardSynergyMembers = Record<BoardSynergyId, string[]>;

const clamp99 = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

/** Display eye of a hitter card including its star bonus and growth (what the card shows). */
export function displayEye(def: CardDef, card: CardInstance): number {
  return def.hitter ? clamp99(def.hitter.bbRate + STAR_BONUS[card.star] + card.growth) : 0;
}

export const isUtility = (def: CardDef): boolean => def.role === "H" && def.pos2.length >= BOARD_SYNERGY_RULES.utilityMinPos2;
export const isSidearm = (def: CardDef): boolean => def.role !== "H" && !!def.pitcher && def.pitcher.armAngle <= BOARD_SYNERGY_RULES.sidearmMaxArmAngle;
export const isSwitchHitter = (def: CardDef): boolean => def.role === "H" && def.bats === "S";
export const isCatcher = (def: CardDef): boolean => def.classes.includes("CATCHER");

/**
 * Board synergies never live on a card: they are counted from `team`,
 * `pos2`, `armAngle`, `bats` and the batting order of the current board.
 * HOMEGROWN uses the largest same-team group (ties: first team in pack order).
 */
export function boardSynergyMembers(player: PlayerState, cards: Record<string, CardInstance>, ctx: RunContext): BoardSynergyMembers {
  const out = Object.fromEntries(BOARD_SYNERGY_IDS.map((id) => [id, [] as string[]])) as BoardSynergyMembers;
  const onBoard: { card: CardInstance; def: CardDef }[] = [];
  for (const id of Object.values(player.board.slots)) {
    const card = id ? cards[id] : undefined;
    const def = card ? ctx.defs.get(card.defId) : undefined;
    if (card && def) onBoard.push({ card, def });
  }

  const byTeam = new Map<string, string[]>();
  for (const { card, def } of onBoard) byTeam.set(def.team, [...(byTeam.get(def.team) ?? []), card.instanceId]);
  const teamOrder = ctx.pack.teams.map((t) => t.id);
  const rank = (team: string) => { const i = teamOrder.indexOf(team); return i < 0 ? teamOrder.length : i; };
  const biggest = [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length || rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))[0];
  if (biggest) out.HOMEGROWN = biggest[1];

  for (const { card, def } of onBoard) {
    if (isUtility(def)) out.UTILITY.push(card.instanceId);
    if (isSidearm(def)) out.SIDEARM.push(card.instanceId);
    if (isSwitchHitter(def)) out.SWITCH_HITTER.push(card.instanceId);
    if (isCatcher(def)) out.BACKUP_CATCHER.push(card.instanceId);
  }

  for (const slot of player.board.order.slice(0, BOARD_SYNERGY_RULES.leadoffSpots)) {
    const id = player.board.slots[slot];
    const card = id ? cards[id] : undefined;
    const def = card ? ctx.defs.get(card.defId) : undefined;
    if (card && def && def.role === "H" && displayEye(def, card) >= BOARD_SYNERGY_RULES.leadoffMinEye) out.LEADOFF.push(card.instanceId);
  }
  return out;
}
