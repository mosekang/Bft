import type { GameState } from "@dugout/protocol";
import { POS } from "@dugout/protocol";
import { activeSynergies, computeEffects, SYNERGIES } from "@dugout/engine";
import { Button } from "../components/Button.js";
import { CardTile, EmptyTile } from "../components/CardTile.js";
import { ctx, defOf } from "../lib/pack.js";
import { STADIUMS } from "@dugout/engine";
import { t } from "../i18n/index.js";

export function OpponentPeek({ state, playerId, onClose }: { state: GameState; playerId: string; onClose: () => void }) {
  const p = state.players.find((x) => x.id === playerId)!;
  const stage = Number(state.round.split("-")[0]);
  const syn = activeSynergies(computeEffects(p, state.cards, ctx, stage).run.synergies);
  const slots = [...POS, "P1", "P2", "P3"] as const;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full rounded-t-2xl panel p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <div className="text-lg font-bold">{p.nickname} <span className="text-sm font-normal text-[var(--ink-2)]">Lv{p.level} · {t("run.fans")} {p.hp} · {STADIUMS[p.stadium].nameKo}</span></div>
          <Button variant="ghost" onClick={onClose}>{t("card.close")}</Button>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">{syn.map((s) => <span key={s.id} className={`rounded px-1.5 py-0.5 text-[11px] ${s.penalised ? "bg-rose-900 text-rose-200" : "bg-white/10 text-slate-200"}`}>{SYNERGIES[s.id].nameKo} {s.count}</span>)}</div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {slots.map((slot) => {
            const id = p.board.slots[slot];
            const c = id ? state.cards[id] : undefined;
            return c ? <CardTile key={slot} def={defOf(c.defId)} card={c} size="sm" badge={slot.startsWith("P") && c.fatigue > 0 ? t("run.tired") : undefined} /> : <EmptyTile key={slot} label={slot} size="sm" muted />;
          })}
        </div>
      </div>
    </div>
  );
}
