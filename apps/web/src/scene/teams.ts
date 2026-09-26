/** Club colours per side for crowds, dugouts and uniforms. */
import type { GameState, PlayerState } from "@dugout/protocol";
import { teamLook } from "../lib/appearance.js";
import { defOf } from "../lib/pack.js";

export function clubOf(state: GameState, player: PlayerState | undefined): { colors: [string, string]; short: string } {
  if (!player) return { colors: ["#64748b", "#e2e8f0"], short: "—" };
  const count = new Map<string, number>();
  for (const id of Object.values(player.board.slots)) {
    const c = id ? state.cards[id] : undefined;
    if (c) { const tm = defOf(c.defId).team; count.set(tm, (count.get(tm) ?? 0) + 1); }
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!best) return { colors: ["#16a34a", "#f1f5f9"], short: player.nickname.slice(0, 3) };
  const lk = teamLook(best);
  return { colors: [lk.primary, lk.secondary], short: lk.short };
}

const PVE: Record<string, { colors: [string, string]; short: string }> = {
  "PVE:CAMP": { colors: ["#64748b", "#e2e8f0"], short: "CMP" },
  "PVE:ALLSTAR": { colors: ["#1e3a8a", "#fbbf24"], short: "ALL" },
  "PVE:LEGEND": { colors: ["#111827", "#d4af37"], short: "'88" },
};

/** Colours for a matchup side id (player, PvE boss or ghost). */
export function sideClub(state: GameState, id: string): { colors: [string, string]; short: string; player?: PlayerState } {
  if (id.startsWith("PVE:")) return PVE[id] ?? PVE["PVE:ALLSTAR"]!;
  const pid = id.startsWith("GHOST:") ? id.slice(6) : id;
  const player = state.players.find((p) => p.id === pid);
  return player ? { ...clubOf(state, player), player } : { colors: ["#64748b", "#e2e8f0"], short: "—" };
}
