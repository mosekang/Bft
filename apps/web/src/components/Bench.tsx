import type { GameState, Location, PlayerState } from "@dugout/protocol";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { benchOf } from "@dugout/engine";
import { CardTile } from "./CardTile.js";
import { defOf } from "../lib/pack.js";
import { t } from "../i18n/index.js";

interface Props {
  state: GameState;
  me: PlayerState;
  selected: Location | null;
  onTap: (loc: Location) => void;
  onOpen: (instanceId: string) => void;
  interactive: boolean;
}

function BenchSlot({ index, state, me, selected, onTap, onOpen, interactive }: Props & { index: number }) {
  const id = benchOf(me)[index];
  const card = id ? state.cards[id] : undefined;
  const def = card ? defOf(card.defId) : undefined;
  const isSel = selected?.kind === "bench" && selected.index === index;
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `bench:${index}`, disabled: !interactive });
  const { setNodeRef: dragRef, listeners, attributes, transform, isDragging } = useDraggable({ id: `bench:${index}`, disabled: !interactive || !card });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 40 } : undefined;
  return (
    <div ref={dropRef} data-bench-index={index} className={isOver ? "rounded-xl ring-2 ring-[var(--ok)]" : ""}>
      <div ref={dragRef} style={style} {...(card && interactive ? { ...listeners, role: attributes.role, tabIndex: attributes.tabIndex } : {})} className={isDragging ? "opacity-70" : ""}>
        {def && card ? (
          <CardTile def={def} card={card} size="sm" selected={isSel} onClick={() => onTap({ kind: "bench", index })} onLongPress={() => onOpen(card.instanceId)} />
        ) : (
          <button type="button" onClick={() => onTap({ kind: "bench", index })} className={`h-[56px] w-full rounded-lg border border-white/10 bg-black/30 ${isSel ? "plate--hot" : ""}`} aria-label={`${t("run.bench")} ${index + 1}`} />
        )}
      </div>
    </div>
  );
}

/** The dugout bench. */
export function Bench(props: Props) {
  const n = benchOf(props.me).length;
  return (
    <div className="dugout mx-2 rounded-xl px-2 pb-1.5 pt-1" aria-label={t("run.bench")}>
      <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--ink-3)]"><span>{t("run.bench")}</span><span>{t("run.inventory")} {props.me.itemsUnequipped.length}</span></div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n }, (_, i) => <BenchSlot key={i} index={i} {...props} />)}
      </div>
    </div>
  );
}
