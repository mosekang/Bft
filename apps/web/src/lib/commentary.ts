import type { GameEvent, Matchup } from "@dugout/protocol";
import { createRng } from "@dugout/engine";

type Tpl = string[];

/** §14.6 templates. `{batter}`, `{pitcher}`, `{inning}`, `{score}`, `{runner}`, `{runs}` are substituted. */
const CASTER: Record<string, Tpl> = {
  HR: ["{batter}! 이거 넘어갑니다! {inning} {score}", "담장 밖으로 사라집니다, {batter}의 홈런! {score}", "{pitcher}의 실투를 {batter}가 놓치지 않습니다. 홈런! {score}"],
  "3B": ["{batter}, 3루까지 내달립니다! {score}", "우중간을 갈라놓는 {batter}의 3루타!"],
  "2B": ["{batter}의 2루타! {score}", "펜스 앞에서 떨어지는 2루타, {batter}."],
  "1B": ["{batter}, 깨끗한 안타.", "{batter}가 {pitcher}를 공략합니다. 안타!"],
  BB: ["{batter}, 볼넷으로 걸어 나갑니다.", "{pitcher}의 제구가 흔들립니다. 볼넷."],
  K: ["{pitcher}, 헛스윙 삼진! {batter} 물러납니다.", "{batter}, 루킹 삼진."],
  K_BASES_LOADED_END: ["{pitcher}, 만루 위기에서 삼진으로 마무리합니다!", "만루의 위기, {pitcher}가 삼진으로 탈출합니다."],
  GO: ["{batter}, 땅볼 아웃.", "{batter}의 타구는 내야를 벗어나지 못합니다."],
  FO: ["{batter}, 뜬공 아웃.", "{batter}의 타구는 외야수 글러브 속으로."],
  LO: ["{batter}, 잘 맞았지만 직선타 아웃.", "라인드라이브, 정면입니다. {batter} 아웃."],
  PO: ["{batter}, 내야 뜬공."],
  DP: ["{batter}, 병살타! 이닝이 급하게 정리됩니다.", "6-4-3 병살! {batter}가 고개를 떨굽니다."],
  SF: ["{batter}의 희생플라이, 주자 홈인! {score}"],
  SH: ["{batter}, 희생번트로 주자를 보냅니다."],
  E: ["실책! {batter}가 살아 나갑니다.", "수비가 흔들립니다. {batter} 출루."],
  FC: ["{batter}, 야수선택으로 출루."],
  SB: ["{runner}, 2루 도루 성공!", "{runner}가 뛰었습니다. 세이프!"],
  CS: ["{runner}, 2루에서 잡힙니다. 무리한 시도였습니다.", "도루 실패, {runner} 태그아웃."],
  PITCHING_CHANGE: ["투수 교체. {pitcher}가 마운드에 오릅니다."],
  DRAW: ["12회까지 승부를 가리지 못했습니다. 무승부."],
  WALKOFF: ["끝내기! 경기 종료, {score}!"],
};

/** 해설 톤 (§14.6 두 번째 톤): 캐스터 문장 뒤에 짧은 코멘트를 덧붙인다. */
const ANALYST: Record<string, string[]> = {
  HR: ["타이밍이 완벽했어요.", "저 코스는 치라고 준 공이었죠.", "스윙 궤적이 아주 좋았습니다."],
  K: ["볼 배합이 좋았습니다.", "타자가 노림수를 놓쳤네요."],
  DP: ["수비진의 호흡이 좋습니다.", "저 타구는 방법이 없었어요."],
  E: ["기본기에서 나온 실수입니다.", "이런 플레이가 흐름을 바꾸죠."],
  SB: ["투수의 견제가 느슨했습니다.", "스타트가 좋았어요."],
  CS: ["포수의 송구가 정확했습니다."],
  "2B": ["갭을 정확히 봤습니다."],
  "3B": ["외야 수비 위치가 아쉬웠네요."],
  BB: ["선구안이 돋보입니다."],
  SF: ["해야 할 일을 했습니다."],
};

export function inningLabel(e: GameEvent): string {
  return `${e.inning}회${e.half === "T" ? "초" : "말"}`;
}

export function scoreLabel(e: GameEvent, homeName: string, awayName: string): string {
  return `${awayName} ${e.scoreAfter[0]} : ${e.scoreAfter[1]} ${homeName}`;
}

export function describe(e: GameEvent, m: Matchup, homeName: string, awayName: string, seed = "c"): string {
  const names = m.names ?? {};
  const name = (id: string) => names[id] ?? String(e.meta?.[id === e.batter ? "batterName" : "pitcherName"] ?? id);
  const vars: Record<string, string> = {
    batter: name(e.batter),
    pitcher: e.type === "PITCHING_CHANGE" ? String(e.meta?.["toName"] ?? name(e.pitcher)) : name(e.pitcher),
    inning: inningLabel(e),
    score: scoreLabel(e, homeName, awayName),
    runner: String(e.meta?.["runnerName"] ?? ""),
    runs: String(e.meta?.["runs"] ?? 0),
  };
  let key = e.type as string;
  if (e.type === "K" && e.meta?.["basesLoaded"] && e.meta?.["endsInning"]) key = "K_BASES_LOADED_END";
  if (e.type === "GAME_END") key = e.meta?.["draw"] ? "DRAW" : "WALKOFF";
  const tpl = CASTER[key];
  if (!tpl) return `${vars.inning} ${vars.batter} ${e.type}`;
  const rng = createRng(`${seed}:${e.inning}:${e.half}:${e.batter}:${e.type}`);
  let s = rng.pick(tpl);
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  const runs = Number(e.meta?.["runs"] ?? 0);
  if (runs > 0 && !s.includes(":") && key !== "SF") s += ` ${runs}득점, ${vars.score}`;
  const analyst = ANALYST[e.type];
  if (analyst && rng.chance(0.5)) s += ` — ${rng.pick(analyst)}`;
  return `${vars.inning} · ${s}`;
}

/** Highlight lines plus "…" summaries for skipped stretches. */
export function reel(m: Matchup, homeName: string, awayName: string): { text: string; key: string; big: boolean; idx: number }[] {
  const out: { text: string; key: string; big: boolean; idx: number }[] = [];
  const set = new Set(m.highlights);
  let lastShown = -1;
  m.events.forEach((e, i) => {
    if (e.type === "INNING_END") return;
    if (e.type === "GAME_END") {
      out.push({ text: describe(e, m, homeName, awayName), key: `end`, big: true, idx: i });
      return;
    }
    if (!set.has(i)) return;
    if (lastShown >= 0 && i - lastShown > 6) {
      const from = m.events[lastShown]!.inning;
      const to = e.inning;
      if (to > from + 1) out.push({ text: `${from + 1}회~${to - 1}회: 잠잠한 흐름…`, key: `gap${i}`, big: false, idx: i });
    }
    out.push({ text: describe(e, m, homeName, awayName), key: `h${i}`, big: e.type === "HR" || Number(e.meta?.["runs"] ?? 0) >= 2, idx: i });
    lastShown = i;
  });
  return out;
}
