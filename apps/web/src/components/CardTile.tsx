import type { CardDef, CardInstance } from "@dugout/protocol";
import { COST_COLORS, cardOvrWithStar, shortName, stars } from "../lib/format.js";
import { teamColor } from "../lib/pack.js";
import { t } from "../i18n/index.js";

interface Props {
  def: CardDef;
  card?: CardInstance;
  size?: "sm" | "md";
  selected?: boolean;
  dim?: boolean;
  badge?: string;
  onClick?: () => void;
  onLongPress?: () => void;
}

/** Silhouette + number + team colour card (§14.2: no portraits). */
export function CardTile({ def, card, size = "md", selected, dim, badge, onClick, onLongPress }: Props) {
  const color = teamColor(def.team);
  const cls = COST_COLORS[def.cost] ?? COST_COLORS[1]!;
  const h = size === "sm" ? "h-[68px]" : "h-[88px]";
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(); }}
      onPointerDown={() => { if (onLongPress) timer = setTimeout(onLongPress, 450); }}
      onPointerUp={() => { if (timer) clearTimeout(timer); }}
      onPointerLeave={() => { if (timer) clearTimeout(timer); }}
      key={card ? `${card.instanceId}:${card.star}` : def.id}
      className={`relative flex ${h} w-full flex-col justify-between overflow-hidden rounded-lg border-2 bg-slate-900 p-1 text-left ${cls} ${selected ? "ring-2 ring-white" : ""} ${dim ? "opacity-50" : ""} ${card && card.star > 1 ? "sparkle" : ""}`}
      aria-label={`${def.name} ${def.cost}${t("card.cost")} ${card ? stars(card.star) : ""}`}
    >
      <div className="flex items-start justify-between text-[11px] leading-none">
        <span className="font-bold" style={{ color }}>{def.role === "H" ? def.pos : def.role}</span>
        <span className="rounded bg-slate-800 px-1 font-mono text-[10px] text-slate-300">{cardOvrWithStar(def, card)}</span>
      </div>
      <svg viewBox="0 0 40 40" className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 opacity-30" aria-hidden>
        <circle cx="20" cy="12" r="7" fill={color} />
        <path d="M6 38c1-10 7-15 14-15s13 5 14 15z" fill={color} />
      </svg>
      <div className="relative z-10 flex items-end justify-between">
        <span className="truncate text-[12px] font-semibold text-slate-100">{shortName(def)}</span>
        {card && card.star > 1 && <span className="text-[11px] text-amber-300">{stars(card.star)}</span>}
      </div>
      {card && card.items.length > 0 && (
        <div className="absolute right-1 top-4 flex flex-col gap-0.5">{card.items.map((it, i) => <span key={i} className="h-2 w-2 rounded-sm bg-sky-300" />)}</div>
      )}
      {badge && <span className="absolute left-1 bottom-5 rounded bg-rose-600 px-1 text-[10px] text-white">{badge}</span>}
    </button>
  );
}

export function EmptyTile({ label, selected, onClick, size = "md", muted }: { label: string; selected?: boolean; onClick?: () => void; size?: "sm" | "md"; muted?: boolean }) {
  const h = size === "sm" ? "h-[68px]" : "h-[88px]";
  return (
    <button type="button" onClick={onClick} className={`flex ${h} w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 text-[11px] ${muted ? "text-slate-600" : "text-slate-500"} ${selected ? "ring-2 ring-white" : ""}`}>
      <span>{label}</span>
    </button>
  );
}
