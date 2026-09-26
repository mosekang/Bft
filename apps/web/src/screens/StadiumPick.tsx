import { STADIUMS } from "@dugout/engine";
import { STADIUM_IDS } from "@dugout/protocol";
import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { useRun } from "../store/run.js";

export function StadiumPick() {
  const dispatch = useRun((s) => s.dispatch);
  const busy = useRun((s) => s.busy);
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <h1 className="mt-4 text-2xl font-bold">{t("stadium.title")}</h1>
      <p className="text-sm text-slate-400">{t("stadium.sub")}</p>
      {STADIUM_IDS.map((id) => {
        const s = STADIUMS[id];
        return (
          <div key={id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div><div className="text-lg font-bold">{s.nameKo}</div><div className="text-sm text-slate-400">{s.descriptionKo}</div></div>
            <Button disabled={busy} onClick={() => void dispatch({ type: "PICK_STADIUM", id })}>{t("stadium.pick")}</Button>
          </div>
        );
      })}
    </main>
  );
}
