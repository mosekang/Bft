import type { CardDef, CardInstance, ItemId } from "@dugout/protocol";
import { ITEM_BY_ID, STAR_BONUS, nicknameAtStar, createRng } from "@dugout/engine";
import { Button } from "./Button.js";
import { Avatar } from "../lib/avatar.js";
import { Suspense, lazy } from "react";
import { currentQuality } from "../scene/quality.js";

const FigurePreview = lazy(() => import("../scene/FigurePreview.js"));
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
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label={def.name}>
      <div className="panel rise max-h-[82vh] w-full overflow-y-auto rounded-t-3xl p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-start justify-between gap-3">
          <div className="shrink-0 rounded-2xl bg-gradient-to-b from-[#f7f3e8] to-[#e9e2d0] p-1 shadow-lg"><Avatar def={def} size={88} /></div>
          {currentQuality() && currentQuality() !== "low" && <div className="w-[88px] shrink-0"><Suspense fallback={null}><FigurePreview def={def} {...(card ? { card } : {})} height={96} /></Suspense></div>}
          <div className="min-w-0 flex-1">
            <div className="display text-[22px] leading-tight">{def.name} {card && card.star > 1 && <span className="text-[var(--gold)]">{stars(card.star)}</span>}</div>
            <div className="text-sm text-[var(--ink-2)]">“{nick}”</div>
            <div className="mt-1 text-xs text-[var(--ink-3)]">{def.cost}{t("card.cost")} · {t(`role.${def.role}`)} {def.role === "H" ? `${t(`pos.${def.pos}`)}${def.pos2.length ? ` (${def.pos2.map((p) => t(`pos.${p}`)).join(", ")})` : ""}` : ""} · {handLabel(def)} · {def.age}{t("card.age")} · {teamName(def.team)}</div>
          </div>
          <div className="text-right"><div className="led text-[34px] leading-none">{ovrOf(def) + bonus}</div><div className="text-[10px] tracking-widest text-[var(--ink-3)]">OVR</div></div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">{tagLabels(def).map((x) => <span key={x} className="chip tier-2">{x}</span>)}</div>
        <div className="mt-3 space-y-1.5">
          {bars.map((b) => (
            <div key={b.key} className="flex items-center gap-2 text-xs">
              <span className="w-14 text-[var(--ink-2)]">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#a3e635]" style={{ width: `${Math.min(99, b.value + bonus)}%` }} /></div>
              <span className="num w-8 text-right text-[14px]">{Math.min(99, b.value + bonus)}</span>
            </div>
          ))}
        </div>
        {showInternals && internals && (
          <details className="mt-2 text-xs text-[var(--ink-3)]"><summary>{t("card.internals")}</summary>
            <div className="mt-1 grid grid-cols-3 gap-x-2 font-mono">{Object.entries(internals).map(([k, v]) => <span key={k}>{k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}</span>)}</div>
          </details>
        )}
        {card && (
          <div className="mt-3">
            <div className="text-xs text-[var(--ink-3)]">{t("run.items")} ({card.items.length}/3)</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {card.items.map((it, i) => <span key={i} className="chip" style={{ borderColor: "#0ea5e9", color: "#bae6fd" }} title={ITEM_BY_ID.get(it)?.descriptionKo}>{ITEM_BY_ID.get(it)?.nameKo ?? it}</span>)}
              {card.items.length === 0 && <span className="text-[11px] text-[var(--ink-3)]">—</span>}
            </div>
            {inventory.length > 0 && onEquip && (
              <div className="mt-2 flex flex-wrap gap-1">
                {inventory.map((it, i) => <button key={`${it}${i}`} type="button" onClick={() => onEquip(it)} className="btn btn-secondary !min-h-9 text-[12px]">{t("card.equip")}: {ITEM_BY_ID.get(it)?.nameKo ?? it}</button>)}
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
