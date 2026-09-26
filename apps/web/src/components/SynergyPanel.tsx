import { useState } from "react";
import { SYNERGIES, type SynergyStatus } from "@dugout/engine";
import { t } from "../i18n/index.js";

const TIER_COLORS = ["text-slate-500 border-slate-700", "text-amber-600 border-amber-700", "text-slate-200 border-slate-300", "text-yellow-300 border-yellow-400"];

export function SynergyPanel({ statuses }: { statuses: SynergyStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...statuses].sort((a, b) => b.tier - a.tier || b.count - a.count);
  return (
    <aside className="flex w-[72px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-800 px-1 py-1" aria-label={t("run.synergies")}>
      {sorted.length === 0 && <span className="px-1 text-[10px] text-slate-600">{t("run.synergies")}</span>}
      {sorted.map((s) => {
        const def = SYNERGIES[s.id];
        const next = def.thresholds.find((th) => th > s.count);
        const cls = s.penalised ? "text-rose-400 border-rose-500" : TIER_COLORS[Math.min(3, s.tier)]!;
        return (
          <div key={s.id} className="relative">
            <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className={`flex w-full flex-col items-center rounded border px-0.5 py-1 text-[10px] leading-tight ${cls}`}>
              <span className="w-full truncate text-center">{def.nameKo}</span>
              <span className="font-mono">{s.count}{next ? `/${next}` : ""}</span>
            </button>
            {open === s.id && (
              <div className="absolute left-full top-0 z-30 ml-1 w-56 rounded-lg border border-slate-700 bg-slate-900 p-2 text-[12px] text-slate-200 shadow-xl">
                <div className="font-bold">{def.nameKo} <span className="font-normal text-slate-400">{def.mode === "EXACT" ? `정확히 ${def.thresholds[0]}` : def.thresholds.join(" / ")}</span></div>
                <ul className="mt-1 space-y-0.5">
                  {def.descriptionsKo.map((d, i) => <li key={i} className={i + 1 === s.tier ? "text-emerald-300" : "text-slate-400"}>{def.thresholds[i]} — {d}</li>)}
                  {def.overflowDescriptionKo && <li className={s.penalised ? "text-rose-300" : "text-slate-500"}>초과 — {def.overflowDescriptionKo}</li>}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
