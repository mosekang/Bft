import { useEffect, useState } from "react";
import { startBgm, stopBgm } from "../audio/index.js";
import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { useRun } from "../store/run.js";
import { useSession } from "../store/session.js";
import { Codex } from "./Codex.js";
import { Records } from "./Records.js";
import { SettingsPanel } from "./SettingsPanel.js";

function Lights() {
  return (
    <svg viewBox="0 0 400 220" className="pointer-events-none absolute inset-x-0 top-0 h-[220px] w-full" aria-hidden>
      <defs>
        <radialGradient id="beam" cx="50%" cy="0%" r="70%"><stop offset="0%" stopColor="#fef3c7" stopOpacity="0.55" /><stop offset="60%" stopColor="#fde68a" stopOpacity="0.08" /><stop offset="100%" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      <g className="lights"><ellipse cx="60" cy="0" rx="150" ry="230" fill="url(#beam)" /><ellipse cx="340" cy="0" rx="150" ry="230" fill="url(#beam)" /></g>
      <g fill="#fef3c7">{[40, 56, 72, 88].map((x) => <rect key={x} x={x} y="18" width="10" height="6" rx="1" />)}{[312, 328, 344, 360].map((x) => <rect key={x} x={x} y="18" width="10" height="6" rx="1" />)}</g>
      <rect x="60" y="24" width="4" height="60" fill="#1f2937" /><rect x="336" y="24" width="4" height="60" fill="#1f2937" />
    </svg>
  );
}

export function Lobby() {
  useEffect(() => { startBgm(); return () => stopBgm(0.6); }, []);
  const { hasSave, checkSave, newRun, resume, abandon, busy, hostRoom, joinRoom, startDaily } = useRun();
  const [panel, setPanel] = useState<"codex" | "records" | "settings" | null>(null);
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.update);
  const [nick, setNick] = useState(settings.nickname);
  const [code, setCode] = useState("");
  useEffect(() => { void checkSave(); }, [checkSave]);
  useEffect(() => setNick(settings.nickname), [settings.nickname]);
  if (panel === "codex") return <Codex onClose={() => setPanel(null)} />;
  if (panel === "records") return <Records onClose={() => setPanel(null)} />;
  if (panel === "settings") return <SettingsPanel onClose={() => setPanel(null)} />;
  return (
    <main className="relative mx-auto flex min-h-full max-w-md flex-col px-5 pb-8">
      <Lights />
      <div className="relative mt-16 text-center">
        <div className="led text-[14px] tracking-[0.4em]">PLAY BALL</div>
        <h1 className="display mt-1 text-[46px] leading-none">덕아웃<span className="text-[var(--gold)]"> 택틱스</span></h1>
        <p className="mt-2 text-[13px] text-[var(--ink-2)]">{t("app.tagline")}</p>
      </div>
      <div className="field relative mt-6 h-[84px] overflow-hidden rounded-2xl">
        <svg viewBox="0 0 400 84" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M200 84 L110 24 L200 -36 L290 24 Z" fill="var(--dirt)" opacity="0.7" /><path d="M200 84 L110 24 M200 84 L290 24" stroke="var(--chalk)" strokeWidth="1.5" opacity="0.7" />
          <ellipse cx="200" cy="34" rx="14" ry="6" fill="var(--dirt-2)" />
        </svg>
        <label className="scoreboard absolute right-3 top-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-[var(--ink-2)]">
          감독명
          <input value={nick} maxLength={10} onChange={(e) => setNick(e.target.value)} onBlur={() => void update({ nickname: nick.trim() || "감독" })} aria-label="닉네임" className="w-24 bg-transparent text-[15px] text-[var(--led)] outline-none placeholder:text-[var(--ink-3)]" />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {hasSave && <Button variant="gold" className="w-full !min-h-[52px] display text-[18px]" disabled={busy} onClick={() => void resume()}>▶ {t("lobby.continue")}</Button>}
        <Button className="w-full !min-h-[52px] display text-[18px]" variant={hasSave ? "secondary" : "primary"} disabled={busy} onClick={() => void newRun("", nick.trim() || "감독")}>{busy ? "…" : t("lobby.new")}</Button>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void hostRoom(settings.playerId, nick.trim() || "감독")}>{t("lobby.host")}</Button>
          <div className="flex gap-1">
            <input value={code} maxLength={6} placeholder="ABC123" onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label={t("lobby.code")} className="led w-[92px] rounded-xl border border-white/10 bg-black/40 px-2 text-center text-[20px] uppercase outline-none placeholder:text-[var(--led-dim)]" />
            <Button variant="secondary" disabled={busy || code.length !== 6} onClick={() => void joinRoom(code, settings.playerId, nick.trim() || "감독")}>{t("lobby.join")}</Button>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[12px]">
        {[["☀️", t("lobby.daily"), () => void startDaily(nick.trim() || "감독")], ["📖", t("lobby.codex"), () => setPanel("codex")], ["🏆", t("lobby.records"), () => setPanel("records")], ["⚙️", t("lobby.settings"), () => setPanel("settings")]].map(([icon, label, fn]) => (
          <button key={String(label)} type="button" disabled={busy} onClick={fn as () => void} className="panel flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl text-[var(--ink-2)] active:bg-white/10"><span className="text-[20px]">{String(icon)}</span>{String(label)}</button>
        ))}
      </div>
      {hasSave && <button type="button" className="mt-6 text-xs text-[var(--ink-3)] underline" onClick={() => void abandon()}>{t("lobby.abandon")}</button>}
      <p className="mt-auto pt-6 text-center text-[10px] text-[var(--ink-3)]">가상 선수 · 가상 구단 · 과금 없음</p>
    </main>
  );
}
