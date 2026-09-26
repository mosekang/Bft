import type { GameState } from "@dugout/protocol";
import { activeSynergies, countSynergies } from "@dugout/engine";
import { ctx } from "./pack.js";

export interface AchievementDef {
  id: string;
  nameKo: string;
  descriptionKo: string;
  /** Evaluated on a finished run for player `me`. */
  check: (s: GameState, me: string) => boolean;
}

const me = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const boardCards = (s: GameState, id: string) => Object.values(me(s, id).board.slots).filter((x): x is string => !!x).map((x) => s.cards[x]!).filter(Boolean);
const syn = (s: GameState, id: string) => activeSynergies(countSynergies(me(s, id), s.cards, ctx));
const rerolls = (s: GameState) => s.log.filter((a) => a.type === "REROLL").length;
const myGames = (s: GameState, id: string) => s.matchups.filter((m) => m.home === id || m.away === id);

/** §14.1-9: 15 achievements. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_win", nameKo: "첫 승", descriptionKo: "한 판을 끝까지 플레이", check: (s, id) => me(s, id).placement !== undefined },
  { id: "top3", nameKo: "가을야구", descriptionKo: "3위 이내로 시즌 종료", check: (s, id) => (me(s, id).placement ?? 9) <= 3 },
  { id: "champion", nameKo: "우승", descriptionKo: "1위로 시즌 종료", check: (s, id) => me(s, id).placement === 1 },
  { id: "foreign_two", nameKo: "외국인 정확히 2", descriptionKo: "외국인 용병 시너지가 켜진 채로 우승", check: (s, id) => me(s, id).placement === 1 && syn(s, id).some((x) => x.id === "FOREIGN" && x.tier === 1) },
  { id: "prospect_six", nameKo: "육성의 결실", descriptionKo: "고졸 유망주 6 시너지 달성", check: (s, id) => syn(s, id).some((x) => x.id === "HS_PROSPECT" && x.tier === 3) },
  { id: "three_star", nameKo: "프랜차이즈 스타", descriptionKo: "★★★ 카드를 보드에 올리기", check: (s, id) => boardCards(s, id).some((c) => c.star === 3) },
  { id: "five_cost_two", nameKo: "슈퍼스타 영입", descriptionKo: "5코스트 ★★ 카드 보유", check: (s, id) => boardCards(s, id).some((c) => c.star >= 2 && ctx.defs.get(c.defId)?.cost === 5) },
  { id: "reroll_50", nameKo: "리롤 중독", descriptionKo: "한 판에 리롤 50회", check: (s) => rerolls(s) >= 50 },
  { id: "draws_3", nameKo: "무승부 수집가", descriptionKo: "한 판에 무승부 3회", check: (s, id) => myGames(s, id).filter((m) => m.winner === null).length >= 3 || s.players.find((p) => p.id === id)!.lastResult === "D" },
  { id: "full_hp", nameKo: "철옹성", descriptionKo: "팬심 70 이상으로 시즌 종료", check: (s, id) => me(s, id).placement === 1 && me(s, id).hp >= 70 },
  { id: "level_10", nameKo: "풀 로스터", descriptionKo: "레벨 10 도달", check: (s, id) => me(s, id).level >= 10 },
  { id: "replacement_win", nameKo: "대체선수의 반란", descriptionKo: "진짜 선수 3명 이하로 한 경기 승리", check: (s, id) => s.log.length > 0 && me(s, id).level <= 3 && (me(s, id).lastResult === "W" || myGames(s, id).some((m) => m.winner === id)) },
  { id: "gold_50", nameKo: "짠물 구단", descriptionKo: "골드 50 이상 보유 중 시즌 종료", check: (s, id) => me(s, id).gold >= 50 },
  { id: "all_items", nameKo: "장비 마니아", descriptionKo: "합성 아이템 3개를 보드에", check: (s, id) => boardCards(s, id).reduce((n, c) => n + c.items.filter((i) => !["BAT", "SPIKES", "GLOVE", "ROSIN", "ICING", "SCOUTING"].includes(i)).length, 0) >= 3 },
  { id: "three_augments", nameKo: "철학자", descriptionKo: "감독 철학 3개를 모두 프리즘으로", check: (s, id) => me(s, id).augments.length === 3 && me(s, id).augments.every((a) => ["BIG_SPENDER", "FRANCHISE", "SABERMETRICS", "DYNASTY", "MASTER_MANAGER"].includes(a)) },
];

export function evaluateAchievements(state: GameState, playerId: string): string[] {
  return ACHIEVEMENTS.filter((a) => { try { return a.check(state, playerId); } catch { return false; } }).map((a) => a.id);
}
