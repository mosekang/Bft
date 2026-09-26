import type { CardDef, CardInstance, ItemId } from "@dugout/protocol";
import { ITEM_BY_ID, STAR_BONUS, nicknameAtStar, createRng } from "@dugout/engine";
import { Button } from "./Button.js";
import { displayBars, handLabel, stars, tagLabels } from "../lib/format.js";
import { ovrOf, teamName } from "../lib/pack.js";
import { t } from "../i18n/index.js";

interface Props {
  def: CardDef;
  card?: CardInstance;
  inventory?: ItemId[];
  sellValue?: number;
  onSell?: () => void;
  onEquip?: (item: ItemId) => void;
  onBuy?: () => void;
  onClose: () => void;
  showInternals?: boolean;
}

export function CardSheet({ def, card, inventory = [], sellValue, onSell, onEquip, onBuy, onClose, showInternals }: Props) {
  const bars = displayBars(def);
  const bonus = card ? STAR_BONUS[card.star] + card.growth : 0;
  const nick = card ? nicknameAtStar(def, card.star, createRng(def.id)) : def.nickname;
  const internals = def.role === "H" ? def.hitter : def.pitcher;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={def.name}>
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-slate-900 p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-bold">{def.name} {card && card.star > 1 && <span className="text-amber-300">{stars(card.star)}</span>}</div>
            <div className="text-sm text-slate-400">“{nick}”</div>
            <div className="mt-1 text-xs text-slate-400">{def.cost}{t("card.cost")} · {t(`role.${def.role}`)} {def.role === "H" ? `${t(`pos.${def.pos}`)}${def.pos2.length ? ` (${def.pos2.map((p) => t(`pos.${p}`)).join(", ")})` : ""}` : ""} · {handLabel(def)} · {def.age}{t("card.age")} · {teamName(def.team)}</div>
          </div>
          <div className="text-right"><div className="font-mono text-2xl font-bold">{ovrOf(def) + bonus}</div><div className="text-[10px] text-slate-500">OVR</div></div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">{tagLabels(def).map((x) => <span key={x} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200">{x}</span>)}</div>
        <div className="mt-3 space-y-1.5">
          {bars.map((b) => (
            <div key={b.key} className="flex items-center gap-2 text-xs">
              <span className="w-14 text-slate-400">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800"><div className="h-full bg-sky-400" style={{ width: `${Math.min(99, b.value + bonus)}%` }} /></div>
              <span className="w-8 text-right font-mono">{Math.min(99, b.value + bonus)}</span>
            </div>
          ))}
        </div>
        {showInternals && internals && (
          <details className="mt-2 text-xs text-slate-400"><summary>{t("card.internals")}</summary>
            <div className="mt-1 grid grid-cols-3 gap-x-2 font-mono">{Object.entries(internals).map(([k, v]) => <span key={k}>{k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}</span>)}</div>
          </details>
        )}
        {card && (
          <div className="mt-3">
            <div className="text-xs text-slate-400">{t("run.items")} ({card.items.length}/3)</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {card.items.map((it, i) => <span key={i} className="rounded bg-sky-900 px-1.5 py-0.5 text-[11px] text-sky-100" title={ITEM_BY_ID.get(it)?.descriptionKo}>{ITEM_BY_ID.get(it)?.nameKo ?? it}</span>)}
              {card.items.length === 0 && <span className="text-[11px] text-slate-600">—</span>}
            </div>
            {inventory.length > 0 && onEquip && (
              <div className="mt-2 flex flex-wrap gap-1">
                {inventory.map((it, i) => <button key={`${it}${i}`} type="button" onClick={() => onEquip(it)} className="min-h-9 rounded-lg border border-sky-700 px-2 text-[12px] text-sky-200">{t("card.equip")}: {ITEM_BY_ID.get(it)?.nameKo ?? it}</button>)}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          {onBuy && <Button className="flex-1" onClick={onBuy}>{def.cost}G 구매</Button>}
          {onSell && <Button variant="danger" className="flex-1" onClick={onSell}>{t("run.sell")} +{sellValue}G</Button>}
          <Button variant="secondary" onClick={onClose}>{t("card.close")}</Button>
        </div>
      </div>
    </div>
  );
}
