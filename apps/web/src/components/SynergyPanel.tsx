import { useState } from "react";
import { SYNERGIES, type SynergyStatus } from "@dugout/engine";
import { t } from "../i18n/index.js";

/** Synergy chips strip with a tap-to-explain popover (§7.3). */
export function SynergyPanel({ statuses }: { statuses: SynergyStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...statuses].sort((a, b) => b.tier - a.tier || b.count - a.count);
  const active = sorted.find((s) => s.id === open);
  return (
    <div className="relative px-3" aria-label={t("run.synergies")}>
      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {sorted.length === 0 && <span className="chip tier-0">{t("run.synergies")} —</span>}
        {sorted.map((s) => {
          const def = SYNERGIES[s.id];
          const next = def.thresholds.find((th) => th > s.count);
          const cls = s.penalised ? "tier-x" : `tier-${Math.min(3, s.tier)}`;
          return (
            <button key={s.id} type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className={`chip shrink-0 ${cls} ${open === s.id ? "ring-1 ring-white/40" : ""}`}>
              <span className="display text-[12px]">{def.nameKo}</span>
              <span className="num text-[12px]">{s.count}{next ? `/${next}` : ""}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <div className="panel absolute left-3 right-3 top-full z-30 mt-1 rounded-xl p-3 text-[12px] text-[var(--ink)] shadow-2xl rise">
          <div className="display text-[15px]">{SYNERGIES[active.id].nameKo} <span className="num text-[var(--ink-3)]">{SYNERGIES[active.id].mode === "EXACT" ? `정확히 ${SYNERGIES[active.id].thresholds[0]}` : SYNERGIES[active.id].thresholds.join(" / ")}</span></div>
          <ul className="mt-1 space-y-0.5">
            {SYNERGIES[active.id].descriptionsKo.map((d, i) => <li key={i} className={i + 1 === active.tier ? "text-[var(--ok)]" : "text-[var(--ink-2)]"}><span className="num mr-1">{SYNERGIES[active.id].thresholds[i]}</span>{d}</li>)}
            {SYNERGIES[active.id].overflowDescriptionKo && <li className={active.penalised ? "text-[var(--bad)]" : "text-[var(--ink-3)]"}>초과 — {SYNERGIES[active.id].overflowDescriptionKo}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
