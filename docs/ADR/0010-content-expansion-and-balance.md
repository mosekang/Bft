# ADR-0010 — v3 콘텐츠 확장(§18.3)과 밸런스 재검증(§19.1)

상태: 채택 · 날짜: 2026-09-26

v3 사양 §18.3의 콘텐츠(보드 시너지 6, 특수 아이템 6, 감독 철학 8)를 엔진 효과·시뮬 보정·봇·도감 데이터까지 연결하고, §19.1(= v2 §15.1) `bot-arena` 12개 지표를 모두 목표 범위 안으로 되돌렸다. 설정 수치와 봇 휴리스틱만 바꿨고 게임 규칙(스케줄, 풀 매수, 상점 확률, 경기 길이 등)은 건드리지 않았다.

## 1. 새 콘텐츠

### 1.1 보드 시너지 (`kind: "BOARD"`, 카드 태그 없음 · 팩 최소 수 0)
카드의 `team`·`pos2`·`armAngle`·`bats`와 타순에서 매번 센다(`engine/run/boardSynergies.ts`). 효과는 `run/effectsExpansion.ts`.

| id | 이름 | 단계 | 세는 대상 | 효과 |
|---|---|---|---|---|
| `HOMEGROWN` | 홈그로운 | 3 / 5 | 보드에서 가장 큰 같은 구단 그룹(동률은 팩의 구단 순서) | 보드 전원 내부치 +3 / +6 |
| `UTILITY` | 유틸리티 | 2 / 4 | `pos2.length ≥ 2` 타자 | 해당 선수의 주포지션 밖 수비 감소를 절반 / 없음(`offPositionPenaltyMult` 0.5 / 0) |
| `SIDEARM` | 사이드암 | 1 | `armAngle ≤ 30` 투수 | 같은 손 타자 상대 삼진 ×1.20 (`sameHandKMult`) |
| `SWITCH_HITTER` | 스위치히터 | 2 | `bats: "S"` 타자 | 플래툰 배율 하한 1(`noPlatoonPenalty`), BABIP +.010 |
| `LEADOFF` | 리드오프 | 1 | 타순 1·2번 중 표시 선구(★·성장 포함) ≥ 70 타자 | 볼넷 ×1.10, 도루 성공 +.03 |
| `BACKUP_CATCHER` | 백업 포수 | 2 | `CATCHER` 태그 카드(DH 포함 어느 칸이든) | 프레이밍 ×2(볼넷 감소폭 0.07 → 0.14), 매 라운드 30% 확률로 피로한 투수 1명 피로 −1 (`rng.fork("backup:{player}")`) |

- 카운팅 규칙 수치는 `BOARD_SYNERGY_RULES`(`config/synergies.ts`).
- 스위치히터는 `effectiveHand`상 항상 반대 손으로 타격하므로 "플래툰 불리 없음"은 현재 안전장치일 뿐이고 실효는 BABIP +.010이다.
- 프레이밍: 포수 시너지의 `teamBbMult`를 `1 − (1 − 0.93) × scale`로 적용, `scale` = 백업 포수 ×2 · 명포수 ×1.5. ABS면 여전히 무효.

### 1.2 특수 아이템 (`ItemDef.use`)
| id | 이름 | 사용 | 효과 |
|---|---|---|---|
| `SCOUT_REPORT` | 스카우트 리포트 | INSTANT | `perks.scoutRounds = 1`, `scoutingActive = true`, 다음 경기 라운드 동안 `RunEffects.revealOpponentBoard` |
| `SUPPLEMENT` | 체력 보충제 | INSTANT | 보유 투수 전원 라운드 피로 0 (1회) |
| `CONTRACT_EXTENSION` | 계약 연장 | EQUIP | 장착 카드 내부치 전부 +3, 부상 면역. 아이템 칸 차지 |
| `CHEER_SONG` | 응원가 | INSTANT | `perks.cheerRounds += 3`: 3경기 동안 타자 득점권 컨택·파워 +4 |
| `TRAINING_CAMP` | 트레이닝 캠프 | CONSUME_ON_EQUIP | EQUIP 대상 카드 `growth += 6`(영구), 아이템 칸 차지 없음 |
| `AGENT` | 에이전트 | INSTANT | `perks.freeRerolls += 5`: 다음 리롤 5회 0골드 |

- INSTANT는 `PICK_CHOICE` 시점에 적용되고 인벤토리에 들어가지 않는다(`run/specials.ts`). 대상이 필요한 둘은 기존 `EQUIP` 액션으로 처리.
- 레전드 매치 보상은 특수 10종 중 `SPECIAL_REWARD_OPTIONS = 4`개(시드 `legend:{player}`)를 제시한다(이전: v2 4종 고정).
- 봇 보상 선호: `BOT_ITEM_PREFS`(트레이닝 캠프 > 등번호 계승 > 계약 연장 > 에이전트 > 응원가 > …).

### 1.3 감독 철학
| id | 이름 | 희귀도 | 효과(`params`) |
|---|---|---|---|
| `DATA_BASEBALL` | 데이터 야구 | GOLD | 상점 내부치 공개, 라운드 첫 리롤 −1골드 |
| `VETERAN_PREFERENCE` | 노장 우대 | SILVER | 베테랑 카드 내부치 +6, S7 페널티 없음 |
| `REBUILDING` | 리빌딩 | SILVER | 팬심 ≥ 60이면 매 라운드(경기 없는 라운드 포함) +2골드, 고졸 유망주 성장 +1 |
| `HOME_ADVANTAGE` | 홈 어드밴티지 | GOLD | 홈 공격 시 아군 타자 BABIP +.012 |
| `CHEER_SQUAD` | 응원단 | SILVER | 홈 경기 승리마다 +1골드, 홈 공격 득점권 컨택·파워 +2(관중 효과) |
| `ROOKIE_RACE` | 신인왕 레이스 | GOLD | 보드 최연소 카드(동률: OVR 높은 쪽, 그다음 id) 내부치 +10 |
| `TRADE_MASTER` | 트레이드 명가 | GOLD | 트레이드 마감 제시 5장, 교환 2회 |
| `MASTER_CATCHER` | 명포수 | PRISM | 포수 카드가 포수·백업 포수 시너지에 2명으로 계산, 프레이밍 ×1.5 |

희귀도별 풀: 실버 6, 골드 12, 프리즘 6(제시 로직 변경 없음).

### 1.4 프로토콜·엔진 인터페이스
- `BOARD_SYNERGY_IDS`(→ `SYNERGY_IDS` 24개), `SPECIAL_ITEM_IDS` 10개, `AUGMENT_IDS` 24개.
- `PlayerState.perks?: { freeRerolls?, cheerRounds?, scoutRounds? }`, `lastIncome.bonus?`(철학 수입). 둘 다 optional이라 기존 세이브·스냅샷과 호환.
- `TRADE.offerIdx` 0..4, `PlayerChoice(TRADE).options` 1..5.
- 시뮬: `HitterMods.offPositionPenaltyMult / noPlatoonPenalty`, `PitcherMods.sameHandKMult`, `TeamMods.homeBabipAdd / homeRispAdd`, `PaContext.battingHome?`, `effectiveDefense(…, penaltyMult)`.
- 경제: `roundIncome(…, extraBonus)`, `hpGold()`, `rerollCostFor(player, effects)`(에이전트 → 데이터 야구 순).
- 봇: 철학 선호표 `BOT_AUGMENT_PREFS`, 보드 시너지 적합도 `BOT_BOARD_SYNERGY_FIT`·`BOT_BOARD_SYNERGY_PREFS`(`bots/boardFit.ts`), 새 특수 장착.
- 도감: `Codex.tsx`는 `SYNERGY_IDS`·`AUGMENTS`·`ITEMS`를 그대로 순회하므로 코드 변경 없이 새 항목이 보인다. `ko.json`에 라벨 키만 추가(`class.HOMEGROWN` 등, `perk.*`, `settle.bonus`, `item.use.*`).

## 2. 바꾼 파라미터 (이전 → 이후)

| 위치 | 항목 | 이전 | 이후 | 이유 |
|---|---|---|---|---|
| `config/league.ts` | `GAME.extraInnings` | k ×1.25, bb ×0.85, hr ×0.7, BABIP −.05 | k ×1.8, bb ×0.5, hr ×0.3, BABIP −.13 | 무승부 1.9% → 4.6%. 12회 무승부 규칙은 그대로 |
| `config/league.ts` | `RATING_K` (§6.2) | 타자 kRate −.018 / bbRate .020 / hrRate .030, 투수 .018 / −.020 / −.022 | 모두 ×1.1: −.0198 / .022 / .033, .0198 / −.022 / −.0242 | 새 보드 효과(홈그로운 등)는 OVR에 안 보여 강팀 승률이 0.650 경계에 붙음 → 0.66~0.68 |
| `config/league.ts` | `PIVOT.hitter` | 57 | 59 | k ×1.1로 오른 득점(5.4)을 4.8로 되돌림 |
| `config/synergies.ts` | `HS_PROSPECT` 성장 상한 | +6 / +12 / +20 | +4 / +8 / +16 | 유망주팀이 여전히 최강 원형(3.5~3.7) |
| `config/bots.ts` | `PROSPECTS.levelPace` | SLOW(§11.1 "느림") | STANDARD | 슬로 롤이 가장 강한 전략이라 원형 편차 1.6~1.9. ADR-0003 #18(용병팀)과 같은 종류의 조정 |
| `config/bots.ts` | `BOT_BOARD_SYNERGY_PREFS.SMALL_BALL` | `["LEADOFF", "SWITCH_HITTER"]`(1차 커밋) | `[]` | 태그 추격이 스몰볼팀을 더 약하게 만듦 |
| `config/bots.ts` | `BOT_LATE_FIVE_COST`(신설, 하드코딩 대체) | 레벨 ≥ 9에서 5코스트 사본 보유 시 +12 | 레벨 ≥ 8: 단일 +12, 사본 보유 +30. S6+·레벨 9+에서 5코 ★ 보유 시 리롤 확률 0.97, 바닥 2골드, 최대 30회(이전 0.9 / 10골드 / 20회) | 5코스트 ★★ 달성률 |
| `config/schedule.ts` | `carouselCostWeight`(신설) | (암묵적 1: 풀 매수 비례) | `{ 6: { 5: 3 } }` — 6-1 FA 최종 시장에서 5코스트 추첨 가중 ×3 | §10.1은 코스트 범위(4~5)만 정하고 비율은 정하지 않는다. 5코스트 ★★ 0.2~0.28 → 0.32~0.38 |
| `config/schedule.ts` | `tradeOptions`(신설) | 3(하드코딩) | 3 | 트레이드 명가가 5로 올림 |

사양서 수치와 달라진 것: §6.2 `k` 값(×1.1), §7.1 고졸 유망주 상한, §11.1 유망주팀 레벨 속도. v3 사양 본문에 이 값을 반영해야 한다(이 작업에서는 `DESIGN.md`를 수정하지 않았다).

## 3. `pnpm cli bot-arena --games 1000 --seed adr10` (최종)

| 지표 | 결과 | 목표 | 판정 |
|---|---|---|---|
| 평균 판 길이 | 25.99 라운드 | 26 ± 4 | OK |
| 강팀 승률 | 0.679 | 0.65~0.75 | OK |
| 무승부 비율 | 0.046 | 0.03~0.07 | OK |
| 팀당 경기 득점 | 4.79 | 4.4~5.2 | OK |
| 1등 조합 상위 5개 점유율 | 0.235 | < 0.60 | OK |
| 모든 시너지 1등 조합 등장률 최소(24종) | 0.050 (백업 포수) | ≥ 0.03 | OK |
| 원형별 평균 순위 차 | 1.23 | ≤ 1.5 | OK |
| 철학별 평균 순위 | 3.79(큰손) ~ 4.99(스몰볼) | 3.0~6.0 | OK |
| 구장별 평균 순위 편차 | 0.59 | ≤ 1.0 (±0.5) | OK |
| 5코스트 ★★ 달성률 | 0.32 / 판 | 0.3~0.8 | OK |
| S3 전 탈락 | 0.000 | < 0.05 | OK |
| 대체선수 평균 칸 수(S6) | 3.84 | 2.5~4.0 | OK |

**12/12 OK.** 재현성 확인(같은 설정, 다른 시드 1000판): `adr10b` 12/12(강팀 0.663, 편차 1.31, 5코 ★★ 0.38), `adr10c` 12/12(강팀 0.664, 편차 1.37, 5코 ★★ 0.36). 1000판 소요 약 190초.

원형 평균 순위(adr10): 뻥야구 4.19 · 스몰볼 5.22 · 용병 4.59 · 유망주 3.99 · 수비 4.58 · 이자 3.99 · 카피 4.41 · 리롤 5.04.
새 철학 평균 순위: 리빌딩 4.19 · 신인왕 레이스 4.32 · 응원단 4.47 · 노장 우대 4.50 · 명포수 4.50 · 홈 어드밴티지 4.55 · 트레이드 명가 4.64 · 데이터 야구 4.78.
새 시너지 1등 등장률: 리드오프 0.961 · 홈그로운 0.799 · 유틸리티 0.431 · 사이드암 0.370 · 스위치히터 0.139 · 백업 포수 0.050.

## 4. 남은 문제·후속

- **여유가 작은 지표**: 강팀 승률(시드별 0.66~0.68), 5코스트 ★★(0.32~0.38), 원형 편차(1.23~1.37). 세 시드 모두 범위 안이지만 경계에서 0.02~0.15 떨어져 있다. 스몰볼팀이 모든 실험에서 5.1~5.4로 최약: 선호 태그(스피드스터·컨택)를 쫓을수록 약해진다(태그를 비우면 5.1, 클러치를 넣으면 5.75). 다음 후보는 원형별 `tagFit` 가중 또는 스피드스터 수치 상향.
- **리드오프·홈그로운은 거의 항상 켜진다**(1등 팀의 96% / 80%). 문턱이 낮은 "기본 보너스"에 가깝다. 강팀 승률을 떨어뜨린 주 원인으로 보여 k ×1.1로 보정했다. 문턱 상향(리드오프 2명, 홈그로운 4/6)은 v3 사양 결정이 필요하다.
- **팩 의존**: 사이드암 카드 1장(2코 SP), 스위치히터 3장(4·5코), 포수 4장. 백업 포수 1등 등장률 5%는 이 구성에서 나온다. 팩 생성기를 바꾸지 않았다.
- **v2 특수 아이템 4종(구장 이전·FA 계약서·콜업권·등번호 계승)은 여전히 미구현**(인벤토리에만 남음, 기존 문제). 레전드 보상 4개 중 일부가 이들일 수 있다.
- **웹 UI**(이번 작업 범위 밖 파일): `Overlays.tsx`의 "특수 아이템" 제목과 `Run.tsx`의 장착 목록 필터가 v2 특수 4종을 하드코딩한다. 새 장착형(계약 연장·트레이닝 캠프)은 장착 목록에 보이므로 동작하지만, 보상 창 제목이 "보상을 고르세요"로 나올 수 있다. `perks`·`revealOpponentBoard`·`lastIncome.bonus` 표시는 아직 없다(키는 `ko.json`에 추가).

## 검증
- `pnpm typecheck`: 7개 워크스페이스 통과.
- `pnpm test`(vitest): 20 파일 / 245 테스트 통과. 새 `packages/engine/test/expansion.test.ts` 26개(시너지 문턱·효과 방향, 특수 아이템 사용 방식, 철학 효과, 새 콘텐츠를 모두 켠 봇 런의 결정론).
- 골든 스냅샷(`run.test.ts`, 시드 12345)은 두 번 의도적으로 갱신했다: 콘텐츠 커밋(철학 풀이 늘어 시드 오퍼가 바뀜), 밸런스 커밋(위 수치 변경).

## Addendum — v2 special items implemented (after merge)

The four v2 specials now work (§8.3): RELOCATION opens a `STADIUM` choice
(bots pick the first), FA_CONTRACT grants one free shop purchase
(`perks.freeBuys`), CALL_UP adds two bench slots, NUMBER_SUCCESSION raises
the target card one star on EQUIP (not on ★★★) and is consumed. The web
shows perk chips, FREE prices, the stadium re-pick and the income bonus.
Re-run `pnpm cli bot-arena --games 1000 --seed adr10`: **12/12 OK**
(avgRounds 25.99, strongTeamWinRate 0.679, drawRate 0.046, runs 4.80,
top5 0.241, min synergy share 0.049, archetype spread 1.27, stadium spread
0.65, 5-cost ★★ 0.42, eliminated before S3 0.000, replacement slots 3.84).
