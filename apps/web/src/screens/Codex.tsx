import { useEffect, useState } from "react";
import { AUGMENTS, ITEMS, STADIUMS, SYNERGIES } from "@dugout/engine";
import { STADIUM_IDS, SYNERGY_IDS } from "@dugout/protocol";
import { Button } from "../components/Button.js";
import { CardTile } from "../components/CardTile.js";
import { db } from "../db.js";
import { t } from "../i18n/index.js";
import { pack } from "../lib/pack.js";
import { ACHIEVEMENTS } from "../lib/achievements.js";

type Tab = "cards" | "synergies" | "augments" | "items" | "stadiums" | "achievements";

export function Codex({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("cards");
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  useEffect(() => {
    void db.collection.toArray().then((rows) => setSeen(new Set(rows.map((r) => r.defId)))).catch(() => undefined);
    void db.achievements.toArray().then((rows) => setUnlocked(new Set(rows.map((r) => r.id)))).catch(() => undefined);
  }, []);
  const tabs: [Tab, string][] = [["cards", "카드"], ["synergies", "시너지"], ["augments", "철학"], ["items", "아이템"], ["stadiums", "구장"], ["achievements", "업적"]];
  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between p-3"><h1 className="display text-[24px]">{t("lobby.codex")}</h1><Button variant="ghost" onClick={onClose}>{t("card.close")}</Button></header>
      <div className="flex gap-1 overflow-x-auto px-3 pb-2">{tabs.map(([k, label]) => <button key={k} type="button" onClick={() => setTab(k)} className={`min-h-9 shrink-0 rounded-full px-3 text-sm ${tab === k ? "bg-[var(--ok)] text-[#052e16]" : "bg-white/10 text-[var(--ink-2)]"}`}>{label}</button>)}</div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "cards" && (
          <div>
            <div className="mb-2 text-xs text-[var(--ink-2)]">{seen.size}/{pack.cards.length} 발견</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[...pack.cards].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)).map((c) => (
                <div key={c.id} className="flex flex-col gap-0.5">
                  <CardTile def={c} size="sm" dim={!seen.has(c.id)} />
                  <div className="truncate text-center text-[10px] text-[var(--ink-2)]">{seen.has(c.id) ? c.nickname : "???"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "synergies" && SYNERGY_IDS.map((id) => { const s = SYNERGIES[id]; return <div key={id} className="mb-3 rounded-xl panel p-3"><div className="font-bold">{s.nameKo} <span className="text-xs text-[var(--ink-2)]">{s.mode === "EXACT" ? `정확히 ${s.thresholds[0]}` : s.thresholds.join(" / ")}</span></div><ul className="mt-1 text-sm text-[var(--ink-2)]">{s.descriptionsKo.map((d, i) => <li key={i}>{s.thresholds[i]} — {d}</li>)}{s.overflowDescriptionKo && <li className="text-rose-300">초과 — {s.overflowDescriptionKo}</li>}</ul></div>; })}
        {tab === "augments" && AUGMENTS.map((a) => <div key={a.id} className="mb-2 rounded-xl panel p-3"><div className="font-bold">{a.nameKo} <span className="text-xs text-[var(--ink-2)]">{a.rarity}</span></div><div className="text-sm text-[var(--ink-2)]">{a.descriptionKo}</div></div>)}
        {tab === "items" && ITEMS.map((i) => <div key={i.id} className="mb-2 rounded-xl panel p-3"><div className="font-bold">{i.nameKo} <span className="text-xs text-[var(--ink-2)]">{i.tier === "COMPONENT" ? "부품" : i.tier === "COMBINED" ? `${ITEMS.find((x) => x.id === i.recipe![0])?.nameKo}+${ITEMS.find((x) => x.id === i.recipe![1])?.nameKo}` : "특수"}</span></div><div className="text-sm text-[var(--ink-2)]">{i.descriptionKo}</div></div>)}
        {tab === "stadiums" && STADIUM_IDS.map((id) => <div key={id} className="mb-2 rounded-xl panel p-3"><div className="font-bold">{STADIUMS[id].nameKo}</div><div className="text-sm text-[var(--ink-2)]">{STADIUMS[id].descriptionKo}</div></div>)}
        {tab === "achievements" && ACHIEVEMENTS.map((a) => <div key={a.id} className={`mb-2 rounded-xl p-3 ${unlocked.has(a.id) ? "bg-emerald-900/40" : "panel opacity-70"}`}><div className="font-bold">{unlocked.has(a.id) ? "🏆 " : ""}{a.nameKo}</div><div className="text-sm text-[var(--ink-2)]">{a.descriptionKo}</div></div>)}
      </div>
    </main>
  );
}
