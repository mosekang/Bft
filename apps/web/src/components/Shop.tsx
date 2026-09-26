import type { PlayerState } from "@dugout/protocol";
import { CardTile } from "./CardTile.js";
import { Button } from "./Button.js";
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
}

export function Shop({ me, rerollCost, xpCost, onBuy, onInfo, onReroll, onXp, onLock, disabled }: Props) {
  return (
    <div className="flex gap-2 px-2 pb-2" aria-label={t("run.shop")}>
      <div className="flex w-[64px] shrink-0 flex-col gap-1">
        <Button variant="secondary" className="!px-0 text-[12px]" disabled={disabled || me.gold < rerollCost} onClick={onReroll}>{t("run.reroll")}<br /><span className="font-mono text-amber-300">{rerollCost}G</span></Button>
        <Button variant="secondary" className="!px-0 text-[12px]" disabled={disabled || me.gold < xpCost || me.level >= 10} onClick={onXp}>{t("run.buyXp")}<br /><span className="font-mono text-amber-300">{xpCost}G</span></Button>
        <Button variant={me.shopLocked ? "primary" : "ghost"} className="!px-0 text-[12px]" disabled={disabled} onClick={onLock}>{me.shopLocked ? t("run.unlock") : t("run.lock")}</Button>
      </div>
      <div className="grid flex-1 grid-cols-5 gap-1">
        {me.shop.map((defId, i) => {
          if (!defId) return <div key={i} className="h-[108px] rounded-lg border border-slate-800 bg-slate-950" />;
          const def = defOf(defId);
          const canBuy = !disabled && me.gold >= def.cost;
          return (
            <div key={i} className="flex h-[108px] flex-col gap-0.5">
              <CardTile def={def} dim={!canBuy} onClick={() => onBuy(i)} onLongPress={() => onInfo(i)} />
              <button type="button" onClick={() => onInfo(i)} className="rounded bg-slate-800 py-0.5 text-center font-mono text-[11px] text-amber-300">{def.cost}G</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
