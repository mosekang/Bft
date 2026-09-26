import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { ME, useRun } from "../store/run.js";

export function Settle() {
  const state = useRun((s) => s.state)!;
  const dispatch = useRun((s) => s.dispatch);
  const me = state.players.find((p) => p.id === ME)!;
  const inc = me.lastIncome;
  const standings = [...state.players].sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.hp - a.hp);
  return (
    <main className="flex h-full flex-col p-4">
      <h2 className="mt-4 text-xl font-bold">S{state.round} {t("phase.SETTLE")}</h2>
      {inc && (
        <div className="mt-3 rounded-2xl bg-slate-900 p-4 text-sm">
          <div className="flex justify-between"><span>{t("settle.base")}</span><span className="font-mono">+{inc.base}</span></div>
          <div className="flex justify-between"><span>{t("settle.interest")}</span><span className="font-mono">+{inc.interest}</span></div>
          <div className="flex justify-between"><span>{t("settle.streak")}</span><span className="font-mono">+{inc.streak}</span></div>
          {inc.saveBonus > 0 && <div className="flex justify-between"><span>{t("settle.save")}</span><span className="font-mono">+{inc.saveBonus}</span></div>}
          <div className="mt-2 flex justify-between border-t border-slate-800 pt-2 font-bold"><span>{t("settle.income")}</span><span className="font-mono text-amber-300">+{inc.total} → {me.gold}G</span></div>
        </div>
      )}
      <div className="mt-4 flex-1 overflow-y-auto rounded-2xl bg-slate-900 p-3 text-sm">
        {standings.map((p, i) => (
          <div key={p.id} className={`flex items-center justify-between py-1 ${p.id === ME ? "text-emerald-300" : p.eliminatedAt ? "text-slate-600" : "text-slate-200"}`}>
            <span className="font-mono">{i + 1}.</span><span className="flex-1 px-2 truncate">{p.nickname}</span><span className="font-mono">Lv{p.level}</span><span className="w-12 text-right font-mono">{p.eliminatedAt ? "OUT" : p.hp}</span>
          </div>
        ))}
      </div>
      <Button className="mt-3" onClick={() => void dispatch({ type: "READY" })}>{t("settle.next")}</Button>
    </main>
  );
}
