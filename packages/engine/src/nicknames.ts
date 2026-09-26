import type { CardDef } from "@dugout/protocol";
import type { Rng } from "./rng.js";
import { cardDisplay, type HitterDisplay, type PitcherDisplay } from "./ratings.js";

/**
 * Nickname rules (§5.7): highest-priority matching rule wins; each rule has
 * candidates for ★ and evolved candidates for ★★★. ★★ prefixes "주전 ".
 */
export interface NicknameRule {
  readonly id: string;
  readonly priority: number;
  readonly when: (card: CardDef, d: HitterDisplay | PitcherDisplay) => boolean;
  readonly base: readonly string[];
  readonly evolved: readonly string[];
}

const H = (d: HitterDisplay | PitcherDisplay): d is HitterDisplay => "contact" in d;
const P = (d: HitterDisplay | PitcherDisplay): d is PitcherDisplay => "stuff" in d;

export const NICKNAME_RULES: readonly NicknameRule[] = [
  { id: "hr-or-k", priority: 100, when: (_, d) => H(d) && d.power >= 80 && d.contact <= 55, base: ["홈런 아니면 삼진", "풀스윙 머신"], evolved: ["홈런 공장장", "담장 너머의 사나이"] },
  { id: "fast-only", priority: 95, when: (_, d) => H(d) && d.speed >= 85 && d.contact <= 50, base: ["발만 빠른 남자"], evolved: ["대주자의 정석"] },
  { id: "sb-king", priority: 94, when: (_, d) => H(d) && d.speed >= 85 && d.contact > 50, base: ["도루왕", "1루는 통과역"], evolved: ["그린라이트 영구 발급"] },
  { id: "bb-factory", priority: 90, when: (_, d) => H(d) && d.eye >= 80, base: ["볼넷 공장장", "출루 기계"], evolved: ["볼넷 공장 사장님"] },
  { id: "lefty-killer", priority: 88, when: (c) => c.role !== "H" && c.throws === "L" && (c.pitcher?.contactVsL ?? 0) >= 75, base: ["좌타 킬러", "좌완 스페셜리스트"], evolved: ["좌타자의 악몽"] },
  { id: "inning-hippo", priority: 85, when: (_, d) => P(d) && d.stamina >= 85, base: ["이닝 먹는 하마", "완투형 선발"], evolved: ["철완 그 자체"] },
  { id: "backstop", priority: 84, when: (c, d) => c.pos === "C" && H(d) && d.defense >= 80, base: ["안방마님", "포수 미트의 마술사"], evolved: ["안방의 지배자"] },
  { id: "ninth-scary", priority: 80, when: (_, d) => P(d) && d.mental <= 40, base: ["9회가 무서운 남자", "심장이 약한 투수"], evolved: ["극복한 남자"] },
  { id: "flamethrower", priority: 78, when: (_, d) => P(d) && d.stuff >= 82, base: ["파이어볼러", "스피드건 파괴자"], evolved: ["160의 사나이"] },
  { id: "control-artist", priority: 76, when: (_, d) => P(d) && d.control >= 82, base: ["컨트롤 아티스트", "스트라이크 존의 화가"], evolved: ["코너워크의 신"] },
  { id: "groundball", priority: 74, when: (c, d) => P(d) && (c.pitcher?.gbRate ?? 0) >= 78, base: ["땅볼 유도의 달인", "싱커볼러"], evolved: ["병살 제조기"] },
  { id: "vacuum", priority: 72, when: (c, d) => H(d) && c.pos !== "DH" && d.defense >= 85, base: ["진공청소기", "그물망 수비"], evolved: ["황금장갑 영구 소장"] },
  { id: "spray", priority: 70, when: (_, d) => H(d) && d.contact >= 82, base: ["안타 제조기", "스프레이 히터"], evolved: ["타격 기계"] },
  { id: "five-tool", priority: 68, when: (_, d) => H(d) && d.contact >= 70 && d.power >= 70 && d.speed >= 70, base: ["호타준족", "5툴 플레이어"], evolved: ["완성형 슈퍼스타"] },
  { id: "cannon", priority: 66, when: (c, d) => H(d) && (c.hitter?.arm ?? 0) >= 85, base: ["대포알 송구", "레이저 빔"], evolved: ["보살 제조기"] },
  { id: "closer", priority: 64, when: (c) => c.role === "RP" && c.classes.includes("CLOSER"), base: ["뒷문 지킴이", "9회의 남자"], evolved: ["철벽 마무리"] },
  { id: "prospect", priority: 60, when: (c) => c.origin === "HS_PROSPECT", base: ["미래의 4번 타자", "고졸 신인"], evolved: ["약속된 슈퍼스타"] },
  { id: "veteran", priority: 58, when: (c) => c.origin === "VETERAN", base: ["산전수전 다 겪은 남자", "라커룸의 리더"], evolved: ["살아있는 전설"] },
  { id: "foreign-ace", priority: 57, when: (c) => c.origin === "FOREIGN" && c.role !== "H", base: ["용병 에이스", "바다 건너온 에이스"], evolved: ["재계약 1순위"] },
  { id: "foreign", priority: 56, when: (c) => c.origin === "FOREIGN", base: ["바다 건너온 사나이", "용병 스카우트의 자랑"], evolved: ["재계약 1순위"] },
  { id: "journeyman", priority: 54, when: (c) => c.origin === "JOURNEYMAN", base: ["짐 싸는 데 도가 튼 남자", "저니맨"], evolved: ["마침내 정착한 남자"] },
];

export const GENERIC_NICKNAMES = {
  hitter: ["성실한 3번 타자", "묵묵한 2루수", "궂은일 전문", "팀 퍼스트", "감독이 좋아하는 타입"],
  pitcher: ["묵묵한 워크호스", "로테이션의 버팀목", "5선발의 자존심", "불펜의 소금", "롱릴리프 전문"],
  evolved: ["프랜차이즈 스타", "팀의 심장", "영구결번 후보"],
} as const;

export function baseNickname(card: CardDef, rng: Rng): string {
  const d = cardDisplay(card);
  const rule = [...NICKNAME_RULES].sort((a, b) => b.priority - a.priority).find((r) => r.when(card, d));
  if (rule) return rng.pick(rule.base);
  return rng.pick(card.role === "H" ? GENERIC_NICKNAMES.hitter : GENERIC_NICKNAMES.pitcher);
}

/** Nickname shown at a given star level (§5.7). */
export function nicknameAtStar(card: CardDef, star: 1 | 2 | 3, rng: Rng): string {
  if (star === 1) return card.nickname;
  if (star === 2) return `주전 ${card.nickname}`;
  const d = cardDisplay(card);
  const rule = [...NICKNAME_RULES].sort((a, b) => b.priority - a.priority).find((r) => r.when(card, d));
  return rng.pick(rule ? rule.evolved : GENERIC_NICKNAMES.evolved);
}
