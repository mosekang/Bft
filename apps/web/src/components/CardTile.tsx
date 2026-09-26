import type { CardDef, CardInstance } from "@dugout/protocol";
import { cardOvrWithStar, shortName } from "../lib/format.js";
import { teamColor } from "../lib/pack.js";
import { t } from "../i18n/index.js";
import { Avatar } from "../lib/avatar.js";

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

/** Baseball-card tile: team-colour band, silhouette with jersey number, name plate, cost frame (§14.2: no portraits). */
export function CardTile({ def, card, size = "md", selected, dim, badge, onClick, onLongPress }: Props) {
  const color = teamColor(def.team);
  const h = size === "sm" ? "h-[56px]" : "h-[68px]";
  const number = (parseInt(def.id.replace(/\D/g, "").slice(-2) || "7", 10) % 99) + 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(); }}
      onPointerDown={() => { if (onLongPress) timer = setTimeout(onLongPress, 450); }}
      onPointerUp={() => { if (timer) clearTimeout(timer); }}
      onPointerLeave={() => { if (timer) clearTimeout(timer); }}
      className={`bcard cost-${def.cost} ${h} w-full text-left ${selected ? "bcard--sel" : ""} ${dim ? "bcard--dim" : ""} ${card && card.star === 3 ? "bcard--star3" : ""} ${card && card.star > 1 ? "sparkle" : ""}`}
      aria-label={`${def.name} ${def.cost}${t("card.cost")}${card ? ` ★${card.star}` : ""}`}
    >
      <div className="bcard__band" style={{ background: color }}>
        <span>{def.role === "H" ? def.pos : def.role}</span>
        <span className="num text-[11px] opacity-90">#{number}</span>
      </div>
      <div className="absolute inset-x-0 top-[15px] flex justify-center" style={{ height: "calc(100% - 31px)" }}>
        <Avatar def={def} size={size === "sm" ? 40 : 52} className="h-full w-auto" />
      </div>
      <div className="bcard__ovr">{cardOvrWithStar(def, card)}</div>
      {card && card.star > 1 && <div className="bcard__stars">{"★".repeat(card.star)}</div>}
      {card && card.items.length > 0 && <div className="bcard__items">{card.items.map((_, i) => <i key={i} className="bcard__item" />)}</div>}
      {badge && <span className="bcard__badge">{badge}</span>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#e9e2d0] via-[#e9e2d0] to-transparent pt-1">
        <div className="bcard__name">{shortName(def)}</div>
      </div>
    </button>
  );
}

export function EmptyTile({ label, selected, onClick, size = "md", muted, pitcher, order }: { label: string; selected?: boolean; onClick?: () => void; size?: "sm" | "md"; muted?: boolean; pitcher?: boolean; order?: number }) {
  const h = size === "sm" ? "h-[56px]" : "h-[68px]";
  return (
    <button type="button" onClick={onClick} className={`plate relative flex ${h} w-full flex-col items-center justify-center text-[11px] ${pitcher ? "plate--pitcher" : ""} ${muted ? "text-[var(--ink-3)]" : "text-[var(--ink-2)]"} ${selected ? "plate--hot" : ""}`}>
      {order && <span className="num absolute left-1.5 top-0.5 text-[12px] text-[var(--chalk)] opacity-70">{order}</span>}
      <span className="display text-[13px] opacity-90">{label}</span>
      {muted && <span className="text-[9px] opacity-60">{t("run.replacement")}</span>}
    </button>
  );
}
