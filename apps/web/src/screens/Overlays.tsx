import type { GameState, PlayerState, StadiumId } from "@dugout/protocol";
import { SPECIAL_ITEM_IDS } from "@dugout/protocol";
import { AUGMENT_BY_ID, ITEM_BY_ID, STADIUMS, currentWave, tradeOffersFor, ownedIds } from "@dugout/engine";
import { useState } from "react";
import { Button } from "../components/Button.js";
import { CardTile } from "../components/CardTile.js";
import { t } from "../i18n/index.js";
import { defOf, ctx } from "../lib/pack.js";
import { ME, useRun } from "../store/run.js";

const RARITY: Record<string, string> = { SILVER: "border-slate-300 text-slate-200", GOLD: "border-amber-400 text-amber-200", PRISM: "border-fuchsia-400 text-fuchsia-200" };

export function AugmentOverlay({ me }: { me: PlayerState }) {
  const dispatch = useRun((s) => s.dispatch);
  const busy = useRun((s) => s.busy);
  if (!me.augmentOffer) return null;
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[var(--night)]/95 p-4">
      <h2 className="display mt-6 text-[28px]">{t("augment.title")}</h2>
      <p className="text-sm text-[var(--ink-2)]">{t("augment.sub")}</p>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        {me.augmentOffer.map((id, idx) => {
          const a = AUGMENT_BY_ID.get(id)!;
          return (
            <button key={id} type="button" disabled={busy} onClick={() => void dispatch({ type: "PICK_AUGMENT", idx })} className={`flex flex-1 flex-col justify-center panel rise rounded-2xl border-2 p-4 text-left active:bg-white/10 ${RARITY[a.rarity]}`}>
              <div className="text-[11px] uppercase tracking-wide opacity-70">{a.rarity}</div>
              <div className="display text-[22px]">{a.nameKo}</div>
              <div className="mt-1 text-sm text-[var(--ink-2)]">{a.descriptionKo}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CarouselOverlay({ state }: { state: GameState }) {
  const dispatch = useRun((s) => s.dispatch);
  const busy = useRun((s) => s.busy);
  const c = state.carousel;
  if (!c) return null;
  const myTurn = currentWave(c).includes(ME);
  const waveNames = currentWave(c).map((id) => state.players.find((p) => p.id === id)?.nickname ?? id);
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[var(--night)]/95 p-4">
      <h2 className="display mt-6 text-[28px]">{t("carousel.title")}</h2>
      <p className="text-sm text-[var(--ink-2)]">{t("carousel.sub")}</p>
      <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${myTurn ? "bg-emerald-900/60 text-emerald-100 ring-1 ring-emerald-400/50" : "bg-slate-800 text-[var(--ink-2)]"}`}>{myTurn ? t("carousel.yourTurn") : `${t("carousel.wait")} (${waveNames.join(", ")})`}</div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {c.cards.map((card, idx) => {
          const def = defOf(card.defId);
          const taken = c.taken[idx];
          return (
            <div key={idx} className="flex flex-col gap-1">
              <CardTile def={def} dim={!!taken || !myTurn} onClick={() => myTurn && !taken && void dispatch({ type: "PICK_CAROUSEL", idx })} />
              <div className="text-center text-[10px] text-[var(--ink-2)]">{taken ? `${t("carousel.taken")} · ${state.players.find((p) => p.id === taken)?.nickname ?? ""}` : card.item ? ITEM_BY_ID.get(card.item)?.nameKo : def.cost + "코"}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-auto text-xs text-[var(--ink-3)]">{busy ? "…" : `순서: ${c.order.map((id) => state.players.find((p) => p.id === id)?.nickname ?? id).join(" → ")}`}</div>
    </div>
  );
}

export function ChoiceOverlay({ me }: { me: PlayerState }) {
  const dispatch = useRun((s) => s.dispatch);
  const busy = useRun((s) => s.busy);
  const ch = me.choice;
  if (!ch || ch.kind === "TRADE") return null;
  const title = ch.kind === "CARD" ? t("choice.card") : ch.kind === "STADIUM" ? t("stadium.title") : ch.options.every((o) => (SPECIAL_ITEM_IDS as readonly string[]).includes(o)) ? t("choice.special") : t("choice.item");
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[var(--night)]/95 p-4">
      <h2 className="display mt-6 text-[28px]">{title}</h2>
      <div className="mt-4 flex flex-col gap-3">
        {ch.options.map((opt, idx) => (
          <button key={`${opt}${idx}`} type="button" disabled={busy} onClick={() => void dispatch({ type: "PICK_CHOICE", idx })} className="flex items-center gap-3 panel rise rounded-2xl p-4 text-left active:bg-white/10">
            {ch.kind === "STADIUM" ? (
              <div><div className="display text-[19px]">{STADIUMS[opt as StadiumId].nameKo}</div><div className="text-sm text-[var(--ink-2)]">{STADIUMS[opt as StadiumId].descriptionKo}</div></div>
            ) : ch.kind === "CARD" ? (
              <><div className="w-20"><CardTile def={defOf(opt)} /></div><div><div className="font-bold">{defOf(opt).name} ★★</div><div className="text-sm text-[var(--ink-2)]">{defOf(opt).nickname}</div></div></>
            ) : (
              <div><div className="font-bold">{ITEM_BY_ID.get(opt as never)?.nameKo ?? opt}</div><div className="text-sm text-[var(--ink-2)]">{ITEM_BY_ID.get(opt as never)?.descriptionKo}</div></div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EventOverlay({ state, me }: { state: GameState; me: PlayerState }) {
  const dispatch = useRun((s) => s.dispatch);
  const busy = useRun((s) => s.busy);
  const [picked, setPicked] = useState<string | null>(null);
  const isTrade = (me.tradesLeft ?? 0) >= 0 && state.round.endsWith("-4") && state.round.startsWith("4");
  if (!isTrade) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-[var(--night)]/95 p-4">
        <h2 className="display mt-6 text-[28px]">{t("event.rain.title")}</h2>
        <p className="mt-2 text-[var(--ink-2)]">{t("event.rain.body")}</p>
        <Button className="mt-auto" disabled={busy} onClick={() => void dispatch({ type: "READY" })}>{t("run.readyEvent")}</Button>
      </div>
    );
  }
  const owned = ownedIds(me);
  const offers = picked ? tradeOffersFor(state, ME, picked, ctx) : [];
  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-[var(--night)]/95 p-4">
      <h2 className="display mt-6 text-[28px]">{t("event.trade.title")}</h2>
      <p className="text-sm text-[var(--ink-2)]">{t("event.trade.body")} {t("event.trade.left")}: {me.tradesLeft ?? 0}</p>
      <div className="mt-3 text-sm text-[var(--ink-2)]">{t("event.trade.pick")}</div>
      <div className="mt-1 grid grid-cols-5 gap-1">
        {owned.map((id) => { const c = state.cards[id]!; return <CardTile key={id} def={defOf(c.defId)} card={c} size="sm" selected={picked === id} onClick={() => setPicked(id)} />; })}
      </div>
      {picked && (me.tradesLeft ?? 0) > 0 && (
        <>
          <div className="mt-3 text-sm text-[var(--ink-2)]">{t("event.trade.offers")}</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {offers.map((defId, offerIdx) => (
              <div key={defId} className="flex flex-col gap-1">
                <CardTile def={defOf(defId)} onClick={() => { void dispatch({ type: "TRADE", cardInstanceId: picked, offerIdx }); setPicked(null); }} />
                <div className="text-center text-[11px] text-[var(--ink-2)]">{defOf(defId).nickname}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <Button className="mt-auto" disabled={busy} onClick={() => void dispatch({ type: "READY" })}>{t("run.readyEvent")}</Button>
    </div>
  );
}
