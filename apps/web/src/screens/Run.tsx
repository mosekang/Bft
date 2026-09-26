import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { Location, PlayerState, Slot } from "@dugout/protocol";
import { computeEffects, rerollCost as rerollCostOf, xpCost as xpCostOf, sellValue, ownedIds } from "@dugout/engine";
import { useMemo, useState } from "react";
import { Bench } from "../components/Bench.js";
import { Board } from "../components/Board.js";
import { Button } from "../components/Button.js";
import { CardSheet } from "../components/CardSheet.js";
import { OpponentsBar } from "../components/OpponentsBar.js";
import { Shop } from "../components/Shop.js";
import { SynergyPanel } from "../components/SynergyPanel.js";
import { TopBar } from "../components/TopBar.js";
import { t } from "../i18n/index.js";
import { ctx, defOf } from "../lib/pack.js";
import { ME, useRun } from "../store/run.js";
import { useUi } from "../store/ui.js";
import { AugmentOverlay, CarouselOverlay, ChoiceOverlay, EventOverlay } from "./Overlays.js";
import { OpponentPeek } from "./OpponentPeek.js";
import { OrderSheet } from "./OrderSheet.js";
import { useSession } from "../store/session.js";

function parseLoc(id: string): Location {
  const [kind, v] = id.split(":") as ["slot" | "bench", string];
  return kind === "slot" ? { kind: "slot", slot: v as Slot } : { kind: "bench", index: Number(v) };
}

export function Run() {
  const state = useRun((s) => s.state)!;
  const dispatch = useRun((s) => s.dispatch);
  const busy = useRun((s) => s.busy);
  const room = useRun((s) => s.room);
  const { selected, select, sheetCard, sheetShop, openCard, openShop } = useUi();
  const [peek, setPeek] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const coachmarks = useSession((s) => s.settings.coachmarks);
  const updateSettings = useSession((s) => s.update);
  const [coach, setCoach] = useState(0);
  const me = state.players.find((p) => p.id === ME) as PlayerState;
  const stage = Number(state.round.split("-")[0]);
  const effects = useMemo(() => computeEffects(me, state.cards, ctx, stage), [me, state.cards, stage]);
  const interactive = state.phase === "PREP" && !me.ready && !busy;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }));

  const onTap = (loc: Location) => {
    if (!interactive && !(state.phase === "EVENT" || state.phase === "AUGMENT" || state.phase === "CAROUSEL")) return;
    // Force-pitch toggle when tapping an occupied pitcher slot twice.
    if (selected && selected.kind === "slot" && loc.kind === "slot" && selected.slot === loc.slot) {
      if (loc.slot.startsWith("P") && me.board.slots[loc.slot]) void dispatch({ type: "SET_TOGGLE", slot: loc.slot as "P1", forcePitch: !me.board.forcePitch[loc.slot as "P1"] });
      select(null);
      return;
    }
    const occupied = loc.kind === "slot" ? !!me.board.slots[loc.slot] : !!me.bench[loc.index];
    if (!selected) {
      if (occupied) select(loc);
      return;
    }
    void dispatch({ type: "MOVE", from: selected, to: loc });
    select(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.over.id === e.active.id) return;
    void dispatch({ type: "MOVE", from: parseLoc(String(e.active.id)), to: parseLoc(String(e.over.id)) });
    select(null);
  };
  const sheetInstance = sheetCard ? state.cards[sheetCard] : undefined;
  const sheetDef = sheetInstance ? defOf(sheetInstance.defId) : sheetShop !== null && me.shop[sheetShop] ? defOf(me.shop[sheetShop]!) : undefined;
  const autoSort = () => void dispatch({ type: "SET_ORDER", order: "AUTO" });
  const coachTexts = [t("onboard.shop"), t("onboard.board"), t("onboard.game")];
  const showCoach = coachmarks && state.round === "1-1" && state.phase === "PREP" && !me.ready && coach < 3;

  return (
    <div className="flex h-full flex-col">
      <TopBar state={state} me={me} endsAt={room?.phaseEndsAt} />
      <OpponentsBar state={state} onPick={setPeek} />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1">
          <SynergyPanel statuses={effects.run.synergies} />
          <div className="flex min-w-0 flex-1 flex-col justify-between overflow-y-auto py-1">
            <Board state={state} me={me} selected={selected} onTap={onTap} onOpen={openCard} interactive={interactive} />
            <div className="mt-1 flex items-center justify-between px-2 text-[11px] text-slate-500">
              <span>{t("run.bench")} · {t("run.inventory")}: {me.itemsUnequipped.length}</span>
              <span className="flex gap-3">
                <button type="button" className="text-slate-400 underline" onClick={() => setOrderOpen(true)}>타순 편집</button>
                <button type="button" className="text-slate-400 underline" onClick={autoSort} disabled={!interactive}>{t("run.autoSort")}</button>
              </span>
            </div>
            <Bench state={state} me={me} selected={selected} onTap={onTap} onOpen={openCard} interactive={interactive} />
          </div>
        </div>
      </DndContext>
      <div className="border-t border-slate-800 pt-2">
        <Shop
          me={me}
          rerollCost={rerollCostOf(effects.run)}
          xpCost={xpCostOf(effects.run)}
          disabled={!interactive}
          onBuy={(slot) => void dispatch({ type: "BUY", slot })}
          onInfo={openShop}
          onReroll={() => void dispatch({ type: "REROLL" })}
          onXp={() => void dispatch({ type: "BUY_XP" })}
          onLock={() => void dispatch({ type: "LOCK_SHOP", locked: !me.shopLocked })}
        />
        <div className="px-2 pb-[max(env(safe-area-inset-bottom),8px)]">
          <Button className="w-full" disabled={!interactive} onClick={() => void dispatch({ type: "READY" })}>{busy ? "…" : t("run.ready")}</Button>
        </div>
      </div>

      {sheetDef && (
        <CardSheet
          def={sheetDef}
          card={sheetInstance}
          inventory={sheetInstance ? me.itemsUnequipped.filter((i) => !["RELOCATION", "FA_CONTRACT", "CALL_UP", "NUMBER_SUCCESSION"].includes(i)) : []}
          sellValue={sheetInstance ? sellValue(sheetDef.cost, sheetInstance.star) : undefined}
          onSell={sheetInstance && interactive ? () => { void dispatch({ type: "SELL", cardInstanceId: sheetInstance.instanceId }); openCard(null); } : undefined}
          onEquip={sheetInstance && interactive ? (item) => void dispatch({ type: "EQUIP", itemId: item, cardInstanceId: sheetInstance.instanceId }) : undefined}
          onBuy={sheetShop !== null && interactive && me.gold >= sheetDef.cost ? () => { void dispatch({ type: "BUY", slot: sheetShop }); openShop(null); } : undefined}
          onClose={() => { openCard(null); openShop(null); }}
          showInternals={effects.run.revealInternals}
        />
      )}
      {peek && <OpponentPeek state={state} playerId={peek} onClose={() => setPeek(null)} />}
      {state.phase === "AUGMENT" && <AugmentOverlay me={me} />}
      {state.phase === "CAROUSEL" && <CarouselOverlay state={state} />}
      {state.phase === "EVENT" && !me.ready && <EventOverlay state={state} me={me} />}
      {me.choice && me.choice.kind !== "TRADE" && <ChoiceOverlay me={me} />}
      {orderOpen && <OrderSheet state={state} me={me} interactive={interactive} onClose={() => setOrderOpen(false)} />}
      {showCoach && (
        <div className="fixed inset-x-0 bottom-[200px] z-20 px-4">
          <div className="rounded-2xl border border-emerald-500/60 bg-slate-900/95 p-3 text-sm text-emerald-100 shadow-xl">
            <div className="text-[11px] text-emerald-400">{coach + 1}/3</div>
            <div>{coachTexts[coach]}</div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="text-xs text-slate-400 underline" onClick={() => void updateSettings({ coachmarks: false })}>다시 보지 않기</button>
              <button type="button" className="min-h-9 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-slate-950" onClick={() => setCoach(coach + 1)}>{coach === 2 ? "시작" : "다음"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
