import type { GameState, Location, PlayerState, Pos } from "@dugout/protocol";
import { POS } from "@dugout/protocol";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CardTile, EmptyTile } from "./CardTile.js";
import { defOf } from "../lib/pack.js";
import { t } from "../i18n/index.js";
import { posLabel } from "../lib/format.js";

const ROWS: (Pos | "P1" | "P2" | "P3")[][] = [["C", "1B", "2B"], ["3B", "SS", "LF"], ["CF", "RF", "DH"], ["P1", "P2", "P3"]];

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
  const order = slot.startsWith("P") ? null : me.board.order.indexOf(slot as Pos) + 1;
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `slot:${slot}`, disabled: !interactive });
  const { setNodeRef: dragRef, listeners, attributes, transform, isDragging } = useDraggable({ id: `slot:${slot}`, disabled: !interactive || !card });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 40 } : undefined;
  let badge: string | undefined;
  if (card && card.injuredRounds > 0) badge = `${t("run.injured")}${card.injuredRounds}`;
  else if (card && card.fatigue > 0) badge = `${t("run.tired")}${card.fatigue}`;
  return (
    <div ref={dropRef} className={`relative ${isOver ? "rounded-lg ring-2 ring-emerald-300" : ""}`}>
      {order !== null && <span className="absolute left-1 top-1 z-20 rounded bg-slate-950/80 px-1 font-mono text-[10px] text-slate-300">{order}</span>}
      <div ref={dragRef} style={style} {...(card && interactive ? { ...listeners, role: attributes.role, tabIndex: attributes.tabIndex } : {})} className={isDragging ? "opacity-70" : ""}>
        {def && card ? (
          <CardTile def={def} card={card} selected={isSel} badge={badge} onClick={() => onTap(loc)} onLongPress={() => onOpen(card.instanceId)} />
        ) : (
          <EmptyTile label={`${posLabel(slot)}${slot.startsWith("P") ? "" : ` · ${t("run.replacement")}`}`} selected={isSel} onClick={() => onTap(loc)} muted={!slot.startsWith("P")} />
        )}
      </div>
      {slot.startsWith("P") && card && (
        <label className="absolute -bottom-1 right-1 z-20 flex items-center gap-0.5 rounded bg-slate-950/80 px-1 text-[9px] text-slate-300">
          <input type="checkbox" className="h-3 w-3" checked={me.board.forcePitch[slot as "P1"]} readOnly onClick={() => onTap({ kind: "slot", slot })} />
          {t("run.forcePitch")}
        </label>
      )}
    </div>
  );
}

export function Board(props: Props) {
  void POS;
  return (
    <div className="grid grid-cols-3 gap-1.5 px-2" aria-label={t("run.board")}>
      {ROWS.flat().map((slot) => <Slot key={slot} slot={slot} {...props} />)}
    </div>
  );
}
