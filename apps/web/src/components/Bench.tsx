import type { GameState, Location, PlayerState } from "@dugout/protocol";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { benchOf } from "@dugout/engine";
import { CardTile, EmptyTile } from "./CardTile.js";
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
    <div ref={dropRef} className={isOver ? "rounded-lg ring-2 ring-emerald-300" : ""}>
      <div ref={dragRef} style={style} {...(card && interactive ? { ...listeners, role: attributes.role, tabIndex: attributes.tabIndex } : {})} className={isDragging ? "opacity-70" : ""}>
        {def && card ? (
          <CardTile def={def} card={card} size="sm" selected={isSel} onClick={() => onTap({ kind: "bench", index })} onLongPress={() => onOpen(card.instanceId)} />
        ) : (
          <EmptyTile label="" size="sm" selected={isSel} onClick={() => onTap({ kind: "bench", index })} />
        )}
      </div>
    </div>
  );
}

export function Bench(props: Props) {
  const n = benchOf(props.me).length;
  return (
    <div className="px-2" aria-label={t("run.bench")}>
      <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n }, (_, i) => <BenchSlot key={i} index={i} {...props} />)}
      </div>
    </div>
  );
}
