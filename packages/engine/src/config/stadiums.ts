import type { StadiumId } from "@dugout/protocol";

export interface StadiumDef {
  readonly id: StadiumId;
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly hrMult: number;
  readonly doubleMult: number;
  readonly kMult: number;
  readonly groundBabipAdd: number;
  readonly infieldHitAdd: number;
  readonly errorMult: number;
  readonly flyHrMult: number;
  readonly lineBabipAdd: number;
  readonly weatherProof: boolean;
}

const base = { hrMult: 1, doubleMult: 1, kMult: 1, groundBabipAdd: 0, infieldHitAdd: 0, errorMult: 1, flyHrMult: 1, lineBabipAdd: 0, weatherProof: false };

/** Park factors (§6.7). */
export const STADIUMS: Readonly<Record<StadiumId, StadiumDef>> = {
  HITTER_FRIENDLY: { ...base, id: "HITTER_FRIENDLY", nameKo: "타자친화", descriptionKo: "홈런 ×1.20, 2루타 ×1.05", hrMult: 1.2, doubleMult: 1.05 },
  PITCHER_FRIENDLY: { ...base, id: "PITCHER_FRIENDLY", nameKo: "투수친화", descriptionKo: "홈런 ×0.82, 삼진 ×1.04", hrMult: 0.82, kMult: 1.04 },
  ARTIFICIAL_TURF: { ...base, id: "ARTIFICIAL_TURF", nameKo: "인조잔디", descriptionKo: "땅볼 BABIP +.020, 내야안타 +.010, 실책 ×1.15", groundBabipAdd: 0.02, infieldHitAdd: 0.01, errorMult: 1.15 },
  SEA_BREEZE: { ...base, id: "SEA_BREEZE", nameKo: "해풍구장", descriptionKo: "뜬공 홈런 ×0.88, 라이너 BABIP +.015", flyHrMult: 0.88, lineBabipAdd: 0.015 },
  DOME: { ...base, id: "DOME", nameKo: "돔구장", descriptionKo: "파크팩터 중립. 우천취소 대신 실내 훈련(부품 1)", weatherProof: true },
};
