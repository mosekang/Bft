import { STADIUMS } from "@dugout/engine";
import { STADIUM_IDS, type StadiumId } from "@dugout/protocol";
import { t } from "../i18n/index.js";
import { useRun } from "../store/run.js";

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
    <svg viewBox="0 0 120 70" className="h-[70px] w-[120px] shrink-0 rounded-lg" aria-hidden>
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
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 px-4 pb-8">
      <div className="mt-6">
        <div className="led text-[13px] tracking-[0.3em]">HOME FIELD</div>
        <h1 className="display text-[30px] leading-tight">{t("stadium.title")}</h1>
        <p className="text-[13px] text-[var(--ink-2)]">{t("stadium.sub")}</p>
      </div>
      {STADIUM_IDS.map((id) => {
        const s = STADIUMS[id];
        return (
          <button key={id} type="button" disabled={busy} onClick={() => void dispatch({ type: "PICK_STADIUM", id })} className="panel rise flex items-center gap-3 rounded-2xl p-2 text-left active:bg-white/10">
            <Park id={id} />
            <div className="min-w-0 flex-1">
              <div className="display text-[19px]">{s.nameKo}</div>
              <div className="text-[12px] text-[var(--ink-2)]">{s.descriptionKo}</div>
              <div className="text-[11px] text-[var(--ink-3)]">{ART[id].note}</div>
            </div>
            <span className="btn btn-primary !min-h-9 !px-3 text-[13px]">{t("stadium.pick")}</span>
          </button>
        );
      })}
    </main>
  );
}
