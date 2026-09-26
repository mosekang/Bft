import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { Location, PlayerState, Slot } from "@dugout/protocol";
import { computeEffects, rerollCost as rerollCostOf, xpCost as xpCostOf, sellValue, ownedIds } from "@dugout/engine";
import { useMemo, useState } from "react";
import { Bench } from "../components/Bench.js";
import { Suspense, lazy, useEffect } from "react";
import { Board } from "../components/Board.js";
import { haptic } from "../audio/index.js";
import { initialQuality, qualityForced, tierFromFps, type Quality } from "../scene/quality.js";
const BoardStage = lazy(() => import("../scene/BoardStage.js"));
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

  const qualitySetting = useSession((s) => s.settings.quality);
  const [quality, setQuality] = useState<Quality>(() => initialQuality(qualitySetting));
  useEffect(() => { setQuality(initialQuality(qualitySetting)); }, [qualitySetting]);
  const onFps = qualitySetting === "auto" && !qualityForced() ? (fps: number) => setQuality((q) => tierFromFps(fps, q)) : undefined;
  const [holo, setHolo] = useState<string | null>(null);
  useEffect(() => { if (!holo) return; const id = window.setTimeout(() => setHolo(null), 3000); return () => window.clearTimeout(id); }, [holo]);
  const buzz = (_ms: number) => haptic("light");
  const onTap = (loc: Location) => {
    if (!interactive && !(state.phase === "EVENT" || state.phase === "AUGMENT" || state.phase === "CAROUSEL")) return;
    buzz(10);
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
    const from = parseLoc(String(e.active.id));
    let to: Location | null = e.over && e.over.id !== e.active.id ? parseLoc(String(e.over.id)) : null;
    if (!to) {
      // Dropped over the 3D board: hit-test the pointer against the slot labels.
      const rect = e.active.rect.current.translated;
      if (rect) {
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        let best: { slot: Slot; d: number } | null = null;
        document.querySelectorAll<HTMLElement>("[aria-label='" + t("run.board") + "'] [data-slot]").forEach((el) => {
          const r = el.getBoundingClientRect();
          const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
          if (d < 56 && (!best || d < best.d)) best = { slot: el.dataset.slot as Slot, d };
        });
        if (best) to = { kind: "slot", slot: (best as { slot: Slot }).slot };
      }
    }
    if (!to) return;
    buzz(12);
    void dispatch({ type: "MOVE", from, to });
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
      <OpponentsBar state={state} onPick={(id) => { if (quality !== "low" && holo !== id) setHolo(id); else { setHolo(null); setPeek(id); } }} />
      <SynergyPanel statuses={effects.run.synergies} />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 flex-col gap-1 pb-1">
          <div className="min-h-[300px] flex-1">
            <Suspense fallback={<div className="field mx-2 h-full min-h-[300px] animate-pulse rounded-2xl" />}>
              {quality === "low" ? (
                <div className="h-full overflow-y-auto"><Board state={state} me={me} selected={selected} onTap={onTap} onOpen={openCard} interactive={interactive} /></div>
              ) : (
                <BoardStage state={state} me={me} selected={selected} onTap={onTap} onOpen={openCard} interactive={interactive} quality={quality} {...(onFps ? { onFps } : {})}
                  hologram={holo ? state.players.find((p) => p.id === holo) ?? null : null}
                  onMove={(from, to) => { void dispatch({ type: "MOVE", from, to }); select(null); }} />
              )}
            </Suspense>
          </div>
          <div className="flex items-center justify-end gap-3 px-3 text-[10px] leading-none text-[var(--ink-3)]">
            <button type="button" className="underline" onClick={() => setOrderOpen(true)}>타순 편집</button>
            <button type="button" className="underline" onClick={autoSort} disabled={!interactive}>{t("run.autoSort")}</button>
          </div>
          <Bench state={state} me={me} selected={selected} onTap={onTap} onOpen={openCard} interactive={interactive} />
        </div>
      </DndContext>
      <div>
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
        <div className="tray px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1 !border-t-0">
          <Button className="w-full !min-h-[46px] display text-[18px]" disabled={!interactive} onClick={() => void dispatch({ type: "READY" })}>{busy ? "…" : `⚾ ${t("run.ready")}`}</Button>
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
          <div className="panel rise rounded-2xl p-3 text-sm text-[var(--ink)] shadow-xl ring-1 ring-[var(--ok)]/50">
            <div className="led text-[12px]">COACH {coach + 1}/3</div>
            <div>{coachTexts[coach]}</div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="text-xs text-[var(--ink-3)] underline" onClick={() => void updateSettings({ coachmarks: false })}>다시 보지 않기</button>
              <button type="button" className="btn btn-primary !min-h-9 text-xs" onClick={() => setCoach(coach + 1)}>{coach === 2 ? "시작" : "다음"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
