import type { GameState, PlayerState, Pos } from "@dugout/protocol";
import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { defOf } from "../lib/pack.js";
import { useRun } from "../store/run.js";

/** Batting order editor (§4.3): move a slot up/down; replacement slots stay in the order too. */
export function OrderSheet({ state, me, interactive, onClose }: { state: GameState; me: PlayerState; interactive: boolean; onClose: () => void }) {
  const dispatch = useRun((s) => s.dispatch);
  const order = me.board.order;
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order] as Pos[];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void dispatch({ type: "SET_ORDER", order: next });
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl panel p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><div className="text-lg font-bold">타순</div><div className="flex gap-2"><Button variant="secondary" disabled={!interactive} onClick={() => void dispatch({ type: "SET_ORDER", order: "AUTO" })}>{t("run.autoSort")}</Button><Button variant="ghost" onClick={onClose}>{t("card.close")}</Button></div></div>
        <ol className="mt-2 space-y-1">
          {order.map((pos, i) => {
            const id = me.board.slots[pos];
            const card = id ? state.cards[id] : undefined;
            const def = card ? defOf(card.defId) : undefined;
            return (
              <li key={pos} className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1 text-sm">
                <span className="w-5 font-mono text-[var(--ink-2)]">{i + 1}</span>
                <span className="w-8 text-xs text-[var(--ink-2)]">{pos}</span>
                <span className="flex-1 truncate">{def ? def.name : `${t("run.replacement")}선수`}</span>
                <button type="button" disabled={!interactive || i === 0} className="min-h-9 min-w-9 rounded bg-slate-700 disabled:opacity-30" onClick={() => move(i, -1)} aria-label="위로">▲</button>
                <button type="button" disabled={!interactive || i === order.length - 1} className="min-h-9 min-w-9 rounded bg-slate-700 disabled:opacity-30" onClick={() => move(i, 1)} aria-label="아래로">▼</button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
