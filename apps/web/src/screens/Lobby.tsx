import { Suspense, lazy, useEffect, useState } from "react";
import { startBgm, stopBgm } from "../audio/index.js";
import { prewarmArt } from "../components/CardArt.js";
import { pack } from "../lib/pack.js";
import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { useRun } from "../store/run.js";
import { useSession } from "../store/session.js";
import { Codex } from "./Codex.js";
import { Records } from "./Records.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { initialQuality } from "../scene/quality.js";

const LobbyStage = lazy(() => import("../scene/LobbyStage.js"));

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
  // Render the card illustrations in the background while the player is in the lobby.
  useEffect(() => { const id = window.setTimeout(() => prewarmArt(pack.cards), 2500); return () => window.clearTimeout(id); }, []);
  const { hasSave, checkSave, newRun, resume, abandon, busy, hostRoom, joinRoom, startDaily, packId } = useRun();
  const [panel, setPanel] = useState<"codex" | "records" | "settings" | null>(null);
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.update);
  const [nick, setNick] = useState(settings.nickname);
  const [code, setCode] = useState("");
  const quality = initialQuality(settings.quality);
  useEffect(() => { void checkSave(); }, [checkSave]);
  useEffect(() => setNick(settings.nickname), [settings.nickname]);
  if (panel === "codex") return <Codex onClose={() => setPanel(null)} />;
  if (panel === "records") return <Records onClose={() => setPanel(null)} />;
  if (panel === "settings") return <SettingsPanel onClose={() => setPanel(null)} />;
  const who = nick.trim() || "감독";
  const privatePack = pack.kind === "private";
  return (
    <main className="lobby relative flex h-full flex-col overflow-hidden">
      {quality !== "low" ? (
        <Suspense fallback={<div className="lobby__sky absolute inset-0" />}><LobbyStage quality={quality} packId={packId} /></Suspense>
      ) : (
        <div className="lobby__sky absolute inset-0"><Lights /></div>
      )}
      <div className="lobby__shade pointer-events-none absolute inset-0" />

      <header className="relative flex items-center gap-2 px-3 pt-3">
        <label className="lobby__chip flex min-w-0 flex-1 items-center gap-2 rounded-full py-1 pl-1 pr-3">
          <span className="lobby__avatar display grid h-9 w-9 shrink-0 place-items-center rounded-full text-[17px]">{who.slice(0, 1)}</span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] text-[var(--ink-3)]">감독</span>
            <input value={nick} maxLength={10} onChange={(e) => setNick(e.target.value)} onBlur={() => void update({ nickname: nick.trim() || "감독" })} aria-label="닉네임" className="w-full min-w-0 bg-transparent text-[15px] font-bold text-white outline-none" />
          </span>
        </label>
        <button type="button" onClick={() => setPanel("settings")} className={`lobby__chip flex max-w-[48%] items-center gap-1.5 truncate rounded-full px-3 py-2 text-[12px] ${privatePack ? "text-[var(--gold)]" : "text-[var(--ink-2)]"}`} aria-label={`선수 팩 ${pack.name}`}>
          <span aria-hidden>{privatePack ? "★" : "🃏"}</span><span className="truncate">{pack.name}</span>
        </button>
      </header>

      <div className="pointer-events-none relative mt-4 text-center">
        <div className="led text-[13px] tracking-[0.45em]">PLAY BALL</div>
        <h1 className="lobby__logo display mt-1 leading-[0.95]"><span className="block text-[54px]">덕아웃</span><span className="lobby__logo-gold block text-[62px]">택틱스</span></h1>
        <p className="mt-2 text-[12px] font-semibold text-white/80 drop-shadow">{t("app.tagline")}</p>
      </div>

      <div className="flex-1" />

      <section className="lobby__dock relative flex flex-col gap-2 px-4 pb-4 pt-10">
        {hasSave && <Button variant="gold" className="lobby__play w-full !min-h-[54px] display text-[20px]" disabled={busy} onClick={() => void resume()}>▶ {t("lobby.continue")}</Button>}
        <Button className={`lobby__play w-full display ${hasSave ? "!min-h-[48px] text-[18px]" : "!min-h-[64px] text-[26px]"}`} variant={hasSave ? "secondary" : "primary"} disabled={busy} onClick={() => void newRun("", who)}>{busy ? "…" : t("lobby.new")}</Button>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void hostRoom(settings.playerId, who)}>{t("lobby.host")}</Button>
          <div className="flex gap-1">
            <input value={code} maxLength={6} placeholder="ABC123" onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label={t("lobby.code")} className="led w-[92px] rounded-xl border border-white/10 bg-black/60 px-2 text-center text-[20px] uppercase outline-none placeholder:text-[var(--led-dim)]" />
            <Button variant="secondary" disabled={busy || code.length !== 6} onClick={() => void joinRoom(code, settings.playerId, who)}>{t("lobby.join")}</Button>
          </div>
        </div>
        <nav className="lobby__nav mt-1 grid grid-cols-4 gap-1.5 rounded-2xl p-1.5 text-center text-[12px]">
          {[["☀️", t("lobby.daily"), () => void startDaily(who)], ["📖", t("lobby.codex"), () => setPanel("codex")], ["🏆", t("lobby.records"), () => setPanel("records")], ["⚙️", t("lobby.settings"), () => setPanel("settings")]].map(([icon, label, fn]) => (
            <button key={String(label)} type="button" disabled={busy} onClick={fn as () => void} className="lobby__tab flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl font-semibold text-white/85"><span className="text-[22px] leading-none drop-shadow">{String(icon)}</span>{String(label)}</button>
          ))}
        </nav>
        {hasSave && <button type="button" className="mt-1 text-xs text-[var(--ink-3)] underline" onClick={() => void abandon()}>{t("lobby.abandon")}</button>}
        <p className="text-center text-[10px] text-[var(--ink-3)]">{privatePack ? `개인 팩 · 이 기기에만 저장 · 과금 없음` : "가상 선수 · 가상 구단 · 과금 없음"}</p>
      </section>
    </main>
  );
}
