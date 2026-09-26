import type { GameState, Location, PlayerState, Pos } from "@dugout/protocol";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CardTile, EmptyTile } from "./CardTile.js";
import { defOf } from "../lib/pack.js";
import { t } from "../i18n/index.js";
import { posLabel } from "../lib/format.js";

const ROWS: (Pos | "P1" | "P2" | "P3")[][] = [["LF", "CF", "RF"], ["3B", "SS", "2B"], ["C", "1B", "DH"], ["P1", "P2", "P3"]];

interface Props {
  state: GameState;
  me: PlayerState;
  selected: Location | null;
  onTap: (loc: Location) => void;
  onOpen: (instanceId: string) => void;
  interactive: boolean;
}

function Slot({ slot, state, me, selected, onTap, onOpen, interactive }: Props & { slot: Pos | "P1" | "P2" | "P3" }) {
  const id = me.board.slots[slot];
  const card = id ? state.cards[id] : undefined;
  const def = card ? defOf(card.defId) : undefined;
  const loc: Location = { kind: "slot", slot };
  const isSel = selected?.kind === "slot" && selected.slot === slot;
  const isPitcher = slot.startsWith("P");
  const order = isPitcher ? undefined : me.board.order.indexOf(slot as Pos) + 1;
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `slot:${slot}`, disabled: !interactive });
  const { setNodeRef: dragRef, listeners, attributes, transform, isDragging } = useDraggable({ id: `slot:${slot}`, disabled: !interactive || !card });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 40 } : undefined;
  let badge: string | undefined;
  if (card && card.injuredRounds > 0) badge = `${t("run.injured")}${card.injuredRounds}`;
  else if (card && card.fatigue > 0) badge = `${t("run.tired")}${card.fatigue}`;
  return (
    <div ref={dropRef} className={`relative ${isOver ? "rounded-xl ring-2 ring-[var(--ok)]" : ""}`}>
      <div ref={dragRef} style={style} {...(card && interactive ? { ...listeners, role: attributes.role, tabIndex: attributes.tabIndex } : {})} className={isDragging ? "opacity-70" : ""}>
        {def && card ? (
          <div className="relative">
            {order && <span className="num absolute -left-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-[var(--board)] text-[12px] text-[var(--chalk)] ring-1 ring-white/20">{order}</span>}
            <CardTile def={def} card={card} selected={isSel} badge={badge} onClick={() => onTap(loc)} onLongPress={() => onOpen(card.instanceId)} />
          </div>
        ) : (
          <EmptyTile label={posLabel(slot)} selected={isSel} onClick={() => onTap(loc)} muted={!isPitcher} pitcher={isPitcher} order={order} />
        )}
      </div>
      {isPitcher && card && (
        <label className="absolute -bottom-1.5 right-1 z-20 flex items-center gap-1 rounded-md bg-[var(--board)]/90 px-1.5 py-0.5 text-[9px] text-[var(--ink-2)] ring-1 ring-white/10">
          <input type="checkbox" className="h-3 w-3 accent-[var(--led)]" checked={me.board.forcePitch[slot as "P1"]} readOnly onClick={() => onTap({ kind: "slot", slot })} />
          {t("run.forcePitch")}
        </label>
      )}
    </div>
  );
}

/** The field: grass stripes, a chalk diamond behind the 3×4 slot grid, pitcher slots on the mound strip. */
export function Board(props: Props) {
  return (
    <div className="field relative mx-2 rounded-2xl p-1.5" aria-label={t("run.board")}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-40" aria-hidden>
        <path d="M50 96 L4 50 L50 4 L96 50 Z" fill="none" stroke="var(--chalk)" strokeWidth="0.6" strokeDasharray="2 1.5" />
        <path d="M50 96 L4 50 M50 96 L96 50" stroke="var(--chalk)" strokeWidth="0.8" />
        <ellipse cx="50" cy="58" rx="9" ry="4" fill="var(--dirt)" opacity="0.6" />
      </svg>
      <div className="relative grid grid-cols-3 gap-1.5">
        {ROWS.flat().map((slot) => <Slot key={slot} slot={slot} {...props} />)}
      </div>
    </div>
  );
}
