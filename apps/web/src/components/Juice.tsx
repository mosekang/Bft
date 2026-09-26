/**
 * HUD game-feel helpers (DESIGN §17.1–17.2): coin bursts, the watcher that
 * turns state changes (level up, star merge, synergy tier up, gold income)
 * into sound + haptics + a short banner.
 */
import type { GameState, PlayerState } from "@dugout/protocol";
import type { SynergyStatus } from "@dugout/engine";
import { useEffect, useRef, useState } from "react";
import { juice } from "../audio/index.js";

/** Gold coins flying out of an anchor (5–15 by amount). */
export function CoinBurst({ amount, id }: { amount: number; id: number }) {
  const n = Math.max(5, Math.min(15, amount * 2));
  return (
    <span key={id} className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (id % 7);
        const r = 22 + ((i * 37 + id) % 18);
        return <i key={i} className="coin coin-fly" style={{ ["--dx" as string]: `${Math.cos(a) * r}px`, ["--dy" as string]: `${Math.sin(a) * r - 18}px`, animationDelay: `${i * 18}ms` }} />;
      })}
    </span>
  );
}

export interface JuiceBanner { id: number; text: string; tone: "gold" | "ok" | "info" }

const starSum = (state: GameState, me: PlayerState): { stars: number; cards: number } => {
  const ids = [...Object.values(me.board.slots), ...me.bench].filter((x): x is string => !!x);
  return { stars: ids.reduce((s, id) => s + (state.cards[id]?.star === 3 ? 9 : state.cards[id]?.star === 2 ? 3 : 1), 0), cards: ids.length };
};

/** Watches my player between renders and fires juice for level-ups, merges and synergy tiers. */
export function useJuiceWatcher(state: GameState, me: PlayerState, synergies: SynergyStatus[]): JuiceBanner | null {
  const prev = useRef<{ level: number; stars: number; cards: number; tiers: Map<string, number>; round: string } | null>(null);
  const [banner, setBanner] = useState<JuiceBanner | null>(null);
  useEffect(() => {
    const s = starSum(state, me);
    const tiers = new Map(synergies.map((x) => [x.id, x.tier]));
    const p = prev.current;
    prev.current = { level: me.level, stars: s.stars, cards: s.cards, tiers, round: state.round };
    if (!p || p.round !== state.round) return;
    const show = (text: string, tone: JuiceBanner["tone"]) => setBanner({ id: Date.now(), text, tone });
    if (me.level > p.level) { juice("levelUp"); show(`레벨 업! Lv ${me.level}`, "ok"); return; }
    // A merge folds three cards into one star-up card: card count drops while star weight is kept.
    if (s.cards < p.cards && s.stars >= p.stars - 0) { juice("merge"); show("★ 합성!", "gold"); }
    let best = 0;
    for (const [id, tier] of tiers) if (tier > (p.tiers.get(id) ?? 0)) best = Math.max(best, tier);
    if (best > 0) juice("synergyUp", Math.min(3, best));
  }, [state, me, synergies]);
  useEffect(() => { if (!banner) return; const id = window.setTimeout(() => setBanner(null), 1100); return () => window.clearTimeout(id); }, [banner]);
  return banner;
}
