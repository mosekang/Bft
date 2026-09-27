import { POS, type SynergyId } from "@dugout/protocol";
import { computeEffects } from "@dugout/engine";
import { useMemo, useRef } from "react";
import { Avatar } from "../lib/avatar.js";
import { CardArt } from "../components/CardArt.js";
import { cardOvrWithStar } from "../lib/format.js";
import { topMemories } from "../lib/memories.js";
import { ctx } from "../lib/pack.js";
import { visualTags } from "../scene/synergyFx.js";
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
  // MVP (§14.1): OVR with stars/growth plus 3 per active synergy the card feeds.
  const mvp = useMemo(() => {
    const active = new Set<SynergyId>(computeEffects(me, state.cards, ctx, Number(state.round.split("-")[0])).run.synergies.filter((x) => x.tier > 0 && !x.penalised).map((x) => x.id));
    let best: { id: string; score: number; tags: SynergyId[] } | null = null;
    for (const id of Object.values(me.board.slots)) {
      const c = id ? state.cards[id] : undefined;
      if (!c) continue;
      const def = defOf(c.defId);
      const tags = visualTags(def).filter((x) => active.has(x));
      const score = cardOvrWithStar(def, c) + 3 * tags.length;
      if (!best || score > best.score) best = { id: c.instanceId, score, tags };
    }
    return best;
  }, [me, state]);
  const mvpCard = mvp ? state.cards[mvp.id] : undefined;
  const mvpDef = mvpCard ? defOf(mvpCard.defId) : undefined;
  const memories = topMemories(state.seed);
  const portraitRef = useRef<HTMLDivElement>(null);
  const share = async () => {
    const text = `덕아웃 택틱스 — ${me.placement}위 (${state.roundIndex + 1}라운드, 시드 ${state.seed})`;
    try {
      const blob = await renderShareImage(me.placement ?? 8, state.round, mvpDef?.name ?? "", mvpCard ? `★${mvpCard.star} · OVR ${cardOvrWithStar(mvpDef!, mvpCard)}` : "", memories.map((m) => m.text), portraitRef.current?.querySelector("svg, img") ?? null);
      const file = blob ? new File([blob], "dugout-tactics.png", { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (file) { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); URL.revokeObjectURL(a.href); }
      else if (navigator.share) await navigator.share({ text });
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
      {mvpDef && mvpCard && (
        <div className="panel rise mt-3 flex items-center gap-3 rounded-2xl p-3">
          <div ref={portraitRef} className="shrink-0 rounded-xl bg-gradient-to-b from-[#f7f3e8] to-[#e9e2d0] p-1"><CardArt def={mvpDef} size={72} /></div>
          <div className="min-w-0">
            <div className="led text-[12px] tracking-[0.3em]">MVP</div>
            <div className="display truncate text-[22px]">{mvpDef.name} <span className="text-[var(--gold)]">{"★".repeat(mvpCard.star)}</span></div>
            <div className="text-[12px] text-[var(--ink-2)]">{mvpDef.nickname} · OVR <span className="num text-[var(--gold)]">{cardOvrWithStar(mvpDef, mvpCard)}</span>{mvp && mvp.tags.length > 0 ? ` · 시너지 ${mvp.tags.length}` : ""}</div>
          </div>
        </div>
      )}
      {memories.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] tracking-widest text-[var(--ink-3)]">명장면</div>
          <div className="mt-1 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1" aria-label="명장면">
            {memories.map((m) => (
              <div key={m.key} className={`w-[82%] shrink-0 snap-center rounded-xl p-3 text-[14px] leading-snug ${m.type === "HR" ? "bg-[var(--dirt)]/40 text-[#fde68a] ring-1 ring-[var(--gold)]/40" : "panel"}`}>
                <div className="led text-[11px]">S{m.round}</div>{m.text}
              </div>
            ))}
          </div>
        </div>
      )}
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

/** 1080×1350 share card: placement, MVP portrait and the best plays (§14.1, Web Share API). */
async function renderShareImage(place: number, round: string, mvpName: string, mvpLine: string, plays: string[], svg: Element | null): Promise<Blob | null> {
  const cv = document.createElement("canvas");
  cv.width = 1080; cv.height = 1350;
  const g = cv.getContext("2d");
  if (!g) return null;
  const bg = g.createLinearGradient(0, 0, 0, 1350);
  bg.addColorStop(0, "#0b3d22"); bg.addColorStop(1, "#050a07");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = "#fbbf24"; g.font = "bold 44px 'Bebas Neue', sans-serif"; g.textAlign = "center";
  g.fillText("DUGOUT TACTICS", 540, 110);
  g.fillStyle = "#fff"; g.font = "bold 72px 'Black Han Sans', sans-serif"; g.fillText("덕아웃 택틱스", 540, 200);
  g.font = "bold 260px 'Bebas Neue', sans-serif"; g.fillStyle = "#ffcf3f"; g.fillText(`${place}위`, 540, 470);
  g.font = "36px 'Noto Sans KR', sans-serif"; g.fillStyle = "#cbd5e1"; g.fillText(`시즌 종료 · S${round}`, 540, 530);
  if (svg instanceof HTMLImageElement) g.drawImage(svg, 340, 560, 400, 400);
  else if (svg) {
    const xml = new XMLSerializer().serializeToString(svg).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const img = new Image();
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url; });
    g.drawImage(img, 390, 580, 300, 300);
    URL.revokeObjectURL(url);
  }
  g.fillStyle = "#fff"; g.font = "bold 56px 'Black Han Sans', sans-serif"; g.fillText(`MVP ${mvpName}`, 540, 950);
  g.fillStyle = "#fbbf24"; g.font = "36px 'Noto Sans KR', sans-serif"; g.fillText(mvpLine, 540, 1005);
  g.textAlign = "left"; g.fillStyle = "#e2e8f0"; g.font = "30px 'Noto Sans KR', sans-serif";
  plays.slice(0, 3).forEach((p, i) => g.fillText(`⚾ ${p.length > 34 ? `${p.slice(0, 33)}…` : p}`, 80, 1090 + i * 60));
  return await new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
}
