import { STADIUMS } from "@dugout/engine";
import { STADIUM_IDS, type StadiumId } from "@dugout/protocol";
import { Suspense, lazy, useState } from "react";
import { t } from "../i18n/index.js";
import { initialQuality } from "../scene/quality.js";
import { useRun } from "../store/run.js";
import { useSession } from "../store/session.js";

const StadiumPreview = lazy(() => import("../scene/StadiumPreview.js"));

const ART: Record<StadiumId, { sky: string; note: string }> = {
  HITTER_FRIENDLY: { sky: "#7c2d12", note: "짧은 담장, 뜨거운 밤" },
  PITCHER_FRIENDLY: { sky: "#1e3a5f", note: "깊은 외야, 무거운 공기" },
  ARTIFICIAL_TURF: { sky: "#065f46", note: "빠른 인조잔디" },
  SEA_BREEZE: { sky: "#0e7490", note: "바다에서 불어오는 맞바람" },
  DOME: { sky: "#374151", note: "비가 와도 경기는 계속" },
};

function Park({ id }: { id: StadiumId }) {
  const a = ART[id];
  return (
    <svg viewBox="0 0 120 70" className="h-[52px] w-[88px] shrink-0 rounded-lg" aria-hidden>
      <rect width="120" height="70" fill={a.sky} />
      {id === "DOME" && <path d="M0 40 Q60 -10 120 40 Z" fill="#9ca3af" opacity="0.5" />}
      {id === "SEA_BREEZE" && <path d="M0 22 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#a5f3fc" strokeWidth="1.5" fill="none" />}
      <path d="M0 70 L60 22 L120 70 Z" fill="var(--turf)" />
      <path d="M60 70 L36 46 L60 30 L84 46 Z" fill="var(--dirt)" />
      <path d="M60 70 L36 46 M60 70 L84 46" stroke="var(--chalk)" strokeWidth="1" />
      {id === "HITTER_FRIENDLY" && <rect x="0" y="34" width="120" height="3" fill="#fbbf24" opacity="0.8" />}
      {id === "PITCHER_FRIENDLY" && <rect x="0" y="18" width="120" height="3" fill="#93c5fd" opacity="0.8" />}
    </svg>
  );
}

export function StadiumPick() {
  const dispatch = useRun((s) => s.dispatch);
  const busy = useRun((s) => s.busy);
  const quality = initialQuality(useSession((s) => s.settings.quality));
  const [focus, setFocus] = useState<StadiumId>(STADIUM_IDS[0]!);
  const f = STADIUMS[focus];
  return (
    <main className="relative mx-auto flex h-full max-w-md flex-col overflow-hidden">
      <section className="relative h-[42%] min-h-[240px] shrink-0 overflow-hidden" style={{ background: ART[focus].sky }}>
        {quality !== "low" ? <Suspense fallback={null}><StadiumPreview id={focus} quality={quality} /></Suspense> : <div className="grid h-full place-items-center"><Park id={focus} /></div>}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,7,15,0.6) 0%, transparent 30%, transparent 60%, #04070f 100%)" }} />
        <div className="pointer-events-none absolute inset-x-4 top-4">
          <div className="led text-[12px] tracking-[0.35em]">HOME FIELD</div>
          <h1 className="display text-[26px] leading-tight drop-shadow">{t("stadium.title")}</h1>
        </div>
        <div key={focus} className="rise pointer-events-none absolute inset-x-4 bottom-3">
          <div className="display text-[30px] leading-none text-[var(--gold)] drop-shadow-[0_3px_0_#0b1224]">{f.nameKo}</div>
          <div className="mt-1 text-[12px] font-semibold text-white/85">{f.descriptionKo}</div>
        </div>
      </section>
      <p className="px-4 pt-2 text-[12px] text-[var(--ink-2)]">{t("stadium.sub")}</p>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-6 pt-2">
        {STADIUM_IDS.map((id) => {
          const s = STADIUMS[id];
          const on = id === focus;
          return (
            <div key={id} role="group" aria-label={s.nameKo} onClick={() => setFocus(id)} className={`panel flex cursor-pointer items-center gap-3 rounded-2xl p-2 transition ${on ? "ring-2 ring-[var(--gold)] bg-white/10" : "opacity-85"}`}>
              <Park id={id} />
              <div className="min-w-0 flex-1">
                <div className="display text-[17px]">{s.nameKo}</div>
                <div className="truncate text-[11px] text-[var(--ink-3)]">{ART[id].note}</div>
              </div>
              <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); void dispatch({ type: "PICK_STADIUM", id }); }} className={`btn ${on ? "btn-gold" : "btn-primary"} !min-h-9 !px-3 text-[13px]`}>{t("stadium.pick")}</button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
