import type { PlayerState } from "@dugout/protocol";
import { CardTile } from "./CardTile.js";
import { defOf } from "../lib/pack.js";
import { t } from "../i18n/index.js";

interface Props {
  me: PlayerState;
  rerollCost: number;
  xpCost: number;
  onBuy: (slot: number) => void;
  onInfo: (slot: number) => void;
  onReroll: () => void;
  onXp: () => void;
  onLock: () => void;
  disabled: boolean;
  /** Bumps on every reroll so the new cards flip in with a 40 ms stagger. */
  rerollNonce?: number;
  /** FA_CONTRACT: the next purchase costs 0 gold. */
  freeBuy?: boolean;
}

/** Scouting tray: five cards with ticket-style prices and chunky dugout buttons. */
export function Shop({ me, rerollCost, xpCost, onBuy, onInfo, onReroll, onXp, onLock, disabled, rerollNonce = 0, freeBuy = false }: Props) {
  return (
    <div className="tray flex gap-2 px-2 pb-1 pt-1.5" aria-label={t("run.shop")}>
      <div className="flex w-[64px] shrink-0 flex-col gap-1">
        <button type="button" className="btn btn-secondary !min-h-0 h-[44px] !px-0 flex-col !gap-0 text-[12px] leading-none" disabled={disabled || me.gold < rerollCost} onClick={onReroll}>
          <span>{t("run.reroll")}</span><span className="led text-[14px]">{rerollCost === 0 ? "FREE" : `${rerollCost}G`}</span>
        </button>
        <button type="button" className="btn btn-secondary !min-h-0 h-[44px] !px-0 flex-col !gap-0 text-[12px] leading-none" disabled={disabled || me.gold < xpCost || me.level >= 10} onClick={onXp}>
          <span>{t("run.buyXp")}</span><span className="led text-[14px]">{xpCost}G</span>
        </button>
        <button type="button" className={`btn !min-h-0 h-[22px] !px-0 text-[11px] ${me.shopLocked ? "btn-gold" : "btn-ghost"}`} disabled={disabled} onClick={onLock}><span key={String(me.shopLocked)} className="lock-spin inline-block">{me.shopLocked ? "🔒" : "🔓"}</span>&nbsp;{me.shopLocked ? t("run.unlock") : t("run.lock")}</button>
      </div>
      <div className="grid flex-1 grid-cols-5 gap-1.5">
        {me.shop.map((defId, i) => {
          if (!defId) return <div key={i} className="h-[94px] rounded-lg border border-dashed border-white/10 bg-black/30" />;
          const def = defOf(defId);
          const canBuy = !disabled && (freeBuy || me.gold >= def.cost);
          return (
            <div key={`${defId}-${i}-${rerollNonce}`} className="flip-in flex h-[94px] flex-col gap-1" style={{ animationDelay: `${i * 40}ms` }}>
              <CardTile def={def} dim={!canBuy} onClick={() => onBuy(i)} onLongPress={() => onInfo(i)} />
              <button type="button" onClick={() => onInfo(i)} className="led rounded-md bg-black/50 text-center text-[13px] leading-[18px] ring-1 ring-white/10">{freeBuy ? "FREE" : `${def.cost}G`}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
