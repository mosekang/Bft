import type { GameState, PlayerState } from "@dugout/protocol";
import { useEffect, useRef, useState } from "react";
import { isMuted, setMuted, juice } from "../audio/index.js";
import { CoinBurst } from "./Juice.js";
import { EmoteBubble, EmotePicker } from "./Emotes.js";
import { t } from "../i18n/index.js";
import { LEVELS, xpToNext } from "@dugout/engine";

export function Countdown({ endsAt }: { endsAt: number | undefined }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  if (!endsAt) return null;
  const s = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className={`led text-[18px] ${s <= 5 ? "text-[var(--bad)]" : ""}`} aria-label={t("room.timer")}>{s}</span>;
}

/** Scoreboard-style HUD (§14.1-4 top bar). */
export function TopBar({ state, me, endsAt, onEmote }: { state: GameState; me: PlayerState; endsAt?: number | undefined; onEmote?: (id: number) => void }) {
  const xpNeed = xpToNext(me.level);
  const [muted, setMutedState] = useState(isMuted());
  const [burst, setBurst] = useState<{ id: number; amount: number } | null>(null);
  const [hit, setHit] = useState(0);
  const prev = useRef({ gold: me.gold, hp: me.hp });
  useEffect(() => {
    const p = prev.current;
    if (me.gold > p.gold) setBurst({ id: Date.now(), amount: me.gold - p.gold });
    if (me.hp < p.hp) setHit(Date.now());
    prev.current = { gold: me.gold, hp: me.hp };
  }, [me.gold, me.hp]);
  const hpClass = me.hp > 50 ? "" : me.hp > 25 ? "hp--mid" : "hp--low";
  return (
    <header className="scoreboard mx-2 mt-1 flex h-[52px] items-center gap-3 rounded-xl px-3">
      <div className="flex flex-col leading-none">
        <span className="text-[9px] uppercase tracking-widest text-[var(--ink-3)]">{t("run.round")}</span>
        <span className="led text-[22px]">S{state.round}</span>
      </div>
      <Countdown endsAt={endsAt} />
      <div className="relative flex items-center gap-1.5" aria-label={t("run.gold")}>
        {burst && <CoinBurst id={burst.id} amount={burst.amount} />}
        <i className="coin" />
        <span className="led text-[22px]">{me.gold}</span>
      </div>
      <div key={hit} className={`flex min-w-0 flex-1 flex-col gap-1 ${hit ? "hud-shake" : ""}`} aria-label={`${t("run.fans")} ${me.hp}`}>
        <div className="flex items-center justify-between text-[10px] text-[var(--ink-2)]"><span>♥ {t("run.fans")}</span><span className="num text-[13px] text-[var(--heart)]">{me.hp}</span></div>
        <div className={`hp ${hpClass}`}><i style={{ width: `${me.hp}%` }} /></div>
      </div>
      <div className="flex flex-col items-end leading-none">
        <span key={me.level} className="pop display text-[15px]">{t("run.level")} {me.level}</span>
        <span className="num text-[11px] text-[var(--ink-3)]">{me.level >= LEVELS.max ? "MAX" : `${me.xp}/${xpNeed} XP`}</span>
        <span className="mt-0.5 block h-[3px] w-14 overflow-hidden rounded-full bg-white/10"><i className="block h-full rounded-full bg-[var(--led)] transition-[width] duration-200 ease-out" style={{ width: `${me.level >= LEVELS.max ? 100 : Math.round((me.xp / Math.max(1, xpNeed)) * 100)}%` }} /></span>
      </div>
      {(me.winStreak >= 2 || me.loseStreak >= 2) && (
        <span className={`chip ${me.winStreak >= 2 ? "text-[var(--ok)]" : "text-[var(--bad)]"}`}>{me.winStreak >= 2 ? `${me.winStreak}${t("run.streakW")}` : `${me.loseStreak}${t("run.streakL")}`}</span>
      )}
      {onEmote && <div className="relative"><EmoteBubble playerId={me.id} /><EmotePicker onSend={onEmote} /></div>}
      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg bg-black/30 text-[16px]" aria-label={muted ? "소리 켜기" : "소리 끄기"} onClick={() => { const next = !muted; setMuted(next); setMutedState(next); if (!next) juice("button"); }}>{muted ? "🔇" : "🔊"}</button>
    </header>
  );
}
