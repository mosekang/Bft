import type { Rng } from "@dugout/engine";

/** Weighted Korean surnames (§5.5). */
export const KOREAN_SURNAMES: readonly (readonly [string, number])[] = [
  ["김", 21], ["이", 15], ["박", 8], ["최", 5], ["정", 5], ["강", 2.5], ["조", 2], ["윤", 2], ["장", 2], ["임", 2],
  ["한", 1.5], ["오", 1.5], ["서", 1.5], ["신", 1.5], ["권", 1.4], ["황", 1.3], ["안", 1.2], ["송", 1.2], ["류", 1], ["전", 1],
  ["홍", 1], ["고", 0.9], ["문", 0.9], ["양", 0.9], ["손", 0.8], ["배", 0.8], ["백", 0.7], ["허", 0.7], ["유", 0.7], ["남", 0.6],
  ["심", 0.6], ["노", 0.6], ["하", 0.5], ["곽", 0.5], ["성", 0.5], ["차", 0.5], ["주", 0.5], ["우", 0.4], ["구", 0.4], ["민", 0.4],
];

export const GIVEN_FIRST = ["민", "서", "도", "현", "지", "준", "시", "우", "하", "승", "재", "태", "성", "정", "동", "건", "영", "수", "진", "호", "규", "원", "찬", "석", "한", "상", "경", "병", "용", "광"] as const;
export const GIVEN_SECOND = ["준", "현", "우", "서", "호", "민", "석", "훈", "환", "혁", "진", "율", "원", "빈", "수", "성", "영", "재", "찬", "규", "철", "기", "욱", "완", "식", "범", "섭", "택", "국", "건"] as const;

/** Foreign surname pools by ISO country, transliterated into Korean (§5.5). */
export const FOREIGN_SURNAMES: Readonly<Record<string, readonly string[]>> = {
  US: ["스미스", "존슨", "윌리엄스", "밀러", "데이비스", "앤더슨", "테일러", "토마스", "무어", "잭슨", "화이트", "해리스"],
  DO: ["라미레즈", "마르티네즈", "산체스", "페레즈", "로드리게스", "게레로", "폴랑코", "카스티요", "레예스"],
  VE: ["에르난데스", "곤살레스", "알바레스", "카브레라", "수아레스", "토레스"],
  CU: ["구리엘", "세스페데스", "모레혼", "디아스", "아브레우"],
  JP: ["사토", "스즈키", "다나카", "와타나베", "이토", "야마모토", "나카무라"],
  AU: ["클라크", "베이커", "휴즈", "워커", "라이언"],
};
export const FOREIGN_COUNTRIES = Object.keys(FOREIGN_SURNAMES);
const INITIALS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "O", "P", "R", "S", "T", "V", "W", "Y"] as const;

/** Fictional clubs (§2). */
/**
 * Ten fictional city clubs in the KBO mould (city + nickname, bold two-colour
 * uniforms). Names, wordmarks and colour pairs are invented: no real club
 * name, emblem or trademark is used (DESIGN §2).
 */
export const FICTIONAL_TEAMS = [
  { id: "seoul-a", name: "서울 코메츠", nickname: "코메츠", short: "COM", color: "#c8102e", secondary: "#101820", uniform: "pinstripe" },
  { id: "seoul-b", name: "서울 팔콘스", nickname: "팔콘스", short: "FAL", color: "#1d428a", secondary: "#e8e8e8", uniform: "pinstripe" },
  { id: "incheon", name: "인천 하버스", nickname: "하버스", short: "HAR", color: "#e30613", secondary: "#f6c700", uniform: "plain" },
  { id: "suwon", name: "수원 캐슬스", nickname: "캐슬스", short: "CAS", color: "#0b3d91", secondary: "#d7182a", uniform: "sash" },
  { id: "daejeon", name: "대전 로켓츠", nickname: "로켓츠", short: "ROC", color: "#f26522", secondary: "#141414", uniform: "plain" },
  { id: "daegu", name: "대구 블레이즈", nickname: "블레이즈", short: "BLZ", color: "#0d3b8c", secondary: "#f5f5f5", uniform: "sleeve" },
  { id: "gwangju", name: "광주 피닉스", nickname: "피닉스", short: "PHX", color: "#c70125", secondary: "#1a1a1a", uniform: "plain" },
  { id: "busan", name: "부산 오션스", nickname: "오션스", short: "OCN", color: "#0b5394", secondary: "#e31b23", uniform: "sleeve" },
  { id: "changwon", name: "창원 매머드", nickname: "매머드", short: "MAM", color: "#00a0b0", secondary: "#b08d57", uniform: "plain" },
  { id: "gocheok", name: "고척 메테오스", nickname: "메테오스", short: "MET", color: "#7b1f2f", secondary: "#c9a227", uniform: "sash" },
] as const;

/** Stateful unique-name factory for one pack. */
export class NameFactory {
  private readonly used = new Set<string>();
  constructor(private readonly rng: Rng) {}

  korean(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const surname = KOREAN_SURNAMES[this.rng.weightedIndex(KOREAN_SURNAMES.map(([, w]) => w))]![0];
      const name = `${surname}${this.rng.pick(GIVEN_FIRST)}${this.rng.pick(GIVEN_SECOND)}`;
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
    /* c8 ignore next */
    throw new Error("name pool exhausted");
  }

  foreign(country: string): string {
    const pool = FOREIGN_SURNAMES[country];
    if (!pool) throw new Error(`unknown country ${country}`);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const name = `${this.rng.pick(INITIALS)}. ${this.rng.pick(pool)}`;
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
    /* c8 ignore next */
    throw new Error("foreign name pool exhausted");
  }
}
