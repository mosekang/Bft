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
      <div className="mt-4"><div className="led text-[13px] tracking-[0.3em]">ROUND {state.round}</div><h2 className="display text-[28px]">{t("phase.SETTLE")}</h2></div>
      {inc && (
        <div className="scoreboard rise mt-3 rounded-2xl p-4 text-sm">
          <div className="flex justify-between text-[var(--ink-2)]"><span>{t("settle.base")}</span><span className="led text-[16px]">+{inc.base}</span></div>
          <div className="flex justify-between text-[var(--ink-2)]"><span>{t("settle.interest")}</span><span className="led text-[16px]">+{inc.interest}</span></div>
          <div className="flex justify-between text-[var(--ink-2)]"><span>{t("settle.streak")}</span><span className="led text-[16px]">+{inc.streak}</span></div>
          {inc.saveBonus > 0 && <div className="flex justify-between text-[var(--ink-2)]"><span>{t("settle.save")}</span><span className="led text-[16px]">+{inc.saveBonus}</span></div>}
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2"><span className="display text-[16px]">{t("settle.income")}</span><span className="flex items-center gap-2"><i className="coin" /><span className="led text-[24px]">+{inc.total}</span><span className="text-[var(--ink-3)]">→ {me.gold}G</span></span></div>
        </div>
      )}
      <div className="panel mt-3 flex-1 overflow-y-auto rounded-2xl p-3 text-sm">
        <div className="mb-1 text-[10px] tracking-widest text-[var(--ink-3)]">STANDINGS</div>
        {standings.map((p, i) => (
          <div key={p.id} className={`flex items-center justify-between py-1 ${p.id === ME ? "text-[var(--ok)]" : p.eliminatedAt ? "text-[var(--ink-3)]" : "text-[var(--ink)]"}`}>
            <span className="num w-6 text-[15px]">{i + 1}</span><span className="flex-1 truncate px-2">{p.nickname}</span><span className="num text-[13px] text-[var(--ink-3)]">Lv{p.level}</span><span className="num w-12 text-right text-[15px]">{p.eliminatedAt ? "OUT" : `♥${p.hp}`}</span>
          </div>
        ))}
      </div>
      <Button className="mt-3 !min-h-[50px] display text-[18px]" onClick={() => void dispatch({ type: "READY" })}>{t("settle.next")} ▶</Button>
    </main>
  );
}
