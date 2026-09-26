import { POS } from "@dugout/protocol";
import { Button } from "../components/Button.js";
import { CardTile, EmptyTile } from "../components/CardTile.js";
import { t } from "../i18n/index.js";
import { defOf } from "../lib/pack.js";
import { ME, useRun } from "../store/run.js";
import { useSession } from "../store/session.js";

export function Result() {
  const state = useRun((s) => s.state)!;
  const leave = useRun((s) => s.leave);
  const newRun = useRun((s) => s.newRun);
  const abandon = useRun((s) => s.abandon);
  const nickname = useSession((s) => s.settings.nickname);
  const me = state.players.find((p) => p.id === ME)!;
  const daily = useRun((s) => s.daily);
  const ranked = [...state.players].sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
  const slots = [...POS, "P1", "P2", "P3"] as const;
  const share = async () => {
    const text = `덕아웃 택틱스 — ${me.placement}위 (${state.roundIndex + 1}라운드, 시드 ${state.seed})`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* cancelled */
    }
  };
  return (
    <main className="flex h-full flex-col overflow-y-auto p-4">
      <div className="scoreboard pop mt-6 rounded-3xl p-5 text-center">
        <div className="led text-[13px] tracking-[0.4em]">FINAL</div>
        <h1 className="display mt-1 text-[56px] leading-none">{me.placement}<span className="text-[26px]">{t("result.place")}</span></h1>
        <p className="mt-1 text-[13px] text-[var(--ink-2)]">{t("result.title")} · S{state.round} · ♥ {me.hp}</p>
      </div>
      {daily && <p className="text-center text-sm text-emerald-300">{daily.submitted ? `일일 도전 ${daily.submitted.score}점 · ${daily.submitted.rank ?? "-"}위 / ${daily.submitted.total}` : `일일 도전 ${daily.date}`}</p>}
      <div className="panel mt-3 rounded-2xl p-3 text-sm">
        {ranked.map((p) => <div key={p.id} className={`flex justify-between py-0.5 ${p.id === ME ? "text-[var(--ok)] font-bold" : "text-[var(--ink-2)]"}`}><span><span className="num mr-2 text-[15px]">{p.placement}</span>{p.nickname}</span><span className="num text-[13px]">Lv{p.level}</span></div>)}
      </div>
      <div className="mt-4 text-[10px] tracking-widest text-[var(--ink-3)]">{t("result.finalBoard")}</div>
      <div className="mt-1 grid grid-cols-6 gap-1">
        {slots.map((slot) => { const id = me.board.slots[slot]; const c = id ? state.cards[id] : undefined; return c ? <CardTile key={slot} def={defOf(c.defId)} card={c} size="sm" /> : <EmptyTile key={slot} label={slot} size="sm" muted />; })}
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <Button onClick={() => void abandon().then(() => newRun("", nickname))}>{t("result.again")}</Button>
        <Button variant="secondary" onClick={() => void share()}>{t("result.share")}</Button>
        <Button variant="ghost" onClick={() => void abandon().then(leave)}>{t("result.lobby")}</Button>
      </div>
    </main>
  );
}
