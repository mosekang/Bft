# ADR-0001 — Phase 0 결정 사항 (사양서 v2에 없거나 상충하는 항목)

상태: 제안(승인 대기) · 날짜: 2026-09-26

사양서(`docs/DESIGN.md`)가 침묵하거나 서로 충돌하는 지점에서 Phase 0이 택한 결정이다. 승인되면 사양서 §18에 반영한다.

| # | 항목 | 결정 | 근거 / 대안 |
|---|---|---|---|
| 1 | **타순 저장 위치** | `Board.order: Pos[9]` 필드 추가(타자 9칸의 순열). | §13 `Board`에는 `slots`와 `forcePitch`만 있고 §4.3은 "칸 순서를 드래그로 정한다"고 한다. 별도 필드가 없으면 타순을 저장할 수 없다. |
| 2 | **포지션 최소치 vs 티어별 C·SS·CF** | 최소치(C 4 … 합 41)는 **주포지션** 기준. 티어별 "C·SS·CF 최소 1명"은 **주포지션 또는 부포지션** 기준. | 두 규칙을 모두 주포지션으로 읽으면 포수가 5명 필요해 41명 합계와 모순된다. 5코스트 티어는 부포지션 C 보유자 1명으로 충족. |
| 3 | **좌타/우타 태그** | `classes`에 저장하지 않고 `bats`에서 유도. `S`(양타)는 좌·우 둘 다로 센다. | §5.6은 "좌타/우타/양타(bats)"를 자동 태그로 적지만 §7.2에는 양타 시너지가 없다. 유도하면 데이터 중복·불일치가 없다. |
| 4 | **투수의 `pos`** | `"DH"` 플레이스홀더, `pos2 = []`. 검증기가 강제. | §13 `CardDef.pos: Pos`에 투수 포지션이 없다. `Pos`에 `P`를 넣으면 보드 `Slot`이 오염된다. |
| 5 | **카드 국적** | `CardDef.nationality?: string`(ISO 2자) 추가. FOREIGN은 KR 외 필수. | 외국인 이름 풀·도감 표시에 필요. §5.6 CSV의 "국적 열"에 대응. |
| 6 | **팩 메타데이터** | `Pack { formatVersion: 1, id, name, kind: fictional/private, generatedBy?, teams[], cards[] }` | §2·§5.5는 팩 JSON의 최상위 구조를 정하지 않았다. `kind: private`는 커밋 금지 검사에 쓴다. |
| 7 | **태그 최소 매수 해석** | 최고 단계가 2 이하인 시너지(외국인·군필·이닝이터·포수·마무리) 4장, 그 외 6장. | §5.3 "단계 2 시너지 4장 / 단계 3+ 6장"의 구체화. `SYNERGIES[id].minPackCards`. |
| 8 | **손 비율 허용 오차** | 목표(좌 40/우 52/양 8, 좌투 30)에서 ±8%p. | 41명·18명 표본에서 정확히 맞출 수 없다. 생성기는 정수 쿼터(16/22/3, 좌투 5)로 맞춘다. |
| 9 | **표시치 유도식** | 컨택 = 0.5·kRate + 0.25·contactL + 0.25·contactR, 파워 = 0.6·hrRate + 0.4·xbhRate, 선구 = bbRate, 스피드 = 0.6·speed + 0.4·sbSkill, 수비 = 0.7·def[주포지션] + 0.3·arm. 구위 = 0.5·kRate + 0.25·contactVsL + 0.25·contactVsR, 제구 = bbRate, 무브먼트 = 0.5·hrRate + 0.5·gbRate. | §5.1은 매핑만 적고 가중치는 없다. `engine/ratings.ts`. |
| 10 | **포스트시즌 라운드 수** | 스케줄에 7-1 ~ 7-3을 미리 잡고(총 26), 실제로는 생존자 수에 따라 조기 종료. | §4.1 "26라운드 내외". 3전 2선승은 한 라운드 안에서 최대 3경기. |
| 11 | **경기 이벤트 타입** | `BB HBP K HR 1B 2B 3B GO FO LO PO DP SF SH E FC SB CS PITCHING_CHANGE INNING_END GAME_END` | §6.5는 `type`만 적었다. 중계 템플릿(§14.6)의 키가 된다. |
| 12 | **워크스페이스 패키지 export** | `dist` 없이 `src/index.ts`를 직접 export. 소비자(vite·tsx·vitest·workers)가 모두 TS를 번들한다. | 빌드 순서 의존을 없앤다. 배포 시 필요하면 Phase 6에서 재검토. |
| 13 | **에러 코드** | `BAD_PHASE NOT_ENOUGH_GOLD BENCH_FULL LEVEL_CAP INVALID_SLOT INVALID_CARD INVALID_ITEM ROOM_FULL ROOM_NOT_FOUND RATE_LIMITED BAD_MESSAGE NOT_YOUR_TURN` | §12.3 `ERROR{code}`의 코드 목록이 없었다. |
| 14 | **RNG 알고리즘** | sfc32 + cyrb128 해시, 라벨 fork. | §3.1은 "예: mulberry32 + splitmix"라 예시일 뿐이다. sfc32는 같은 급의 32비트 PRNG로 통계 품질이 더 낫고 상태 4워드로 직렬화가 쉽다. |

## 사양서 원문에서 그대로 따른 것 (v1 초안과 달라진 값)

XP 표(4/8/16/24/32/40/56), 기본 수입(2/2/3, 이후 5), 연승·연패(2~3/4~5/6+), 판매가(코스트×1/3/9, 예외 없음), 별 보너스(+12/+25), 아이템 3개, 데미지 `stageBase + min(실점차, 8)`, 12회 무승부, 철학 선택 2-1/3-2/5-1, 6-4는 PvP, 대체선수 능력치 38.

## Phase 1 계획 (승인 요청)

목표(§17): `pnpm cli sim-game --seed X`가 9이닝 박스스코어를 출력, 같은 시드 = 같은 결과, 1경기 Node 30ms 이내, 10,000경기 평균 득점 4.4~5.2.

1. `engine/sim/probability.ts` — §6.2 능력치→배율, pBB/pK/pHR 산출과 클램프, 플래툰(§6.3-1), 보정 적용 순서(§6.3-2)를 받는 `Modifiers` 컨텍스트. 단위 테스트: 확률 합 1, 단조성(파워↑→홈런↑), 좌우 대칭.
2. `engine/sim/battedBall.ts` — 타구 유형·방향·담당 수비수, 안타 확률(§6.3-5), 안타 종류(§6.3-6), 아웃 처리(병살·희생플라이·실책, §6.3-7).
3. `engine/sim/baserunning.ts` — 추가 진루(§6.3-8), 도루(§6.3-9).
4. `engine/sim/pitching.ts` — 투구수, 한계 T와 누적 감쇠, 멘탈(§6.4), 자동 감독(선발 교체·불펜 순서·마무리·RP 제한), 로테이션 선택과 `forcePitch`.
5. `engine/sim/game.ts` — 9이닝·DH·12회 무승부·9회말 생략, `GameEvent` 로그(≤120), 하이라이트 중요도(§6.5), 박스스코어 집계.
6. `engine/sim/resolve.ts` — `PlayerState`+`Pack` → 시뮬용 팀(대체선수 채움, 포지션 효율 §4.3, 별 보너스, 구장). 시너지·아이템·철학 훅은 인터페이스만(Phase 2에서 채움).
7. `cli sim-game` — 팩에서 시드로 두 팀을 뽑아 경기 → 박스스코어·하이라이트 텍스트 출력, `--json`으로 `Matchup` 덤프. `--games N`으로 평균 득점·삼진·볼넷·홈런율·무승부율 리포트.
8. 검증: 결정론(같은 시드 100회 동일), 10,000경기 득점 4.4~5.2, 무승부 3~7%, 삼진·볼넷·홈런율이 §6.1 기준선 ±15%, 벤치마크 30ms.

Phase 1에서 하지 않는 것: 상점·경제·시너지 계산·봇 구매·`applyAction`·UI.
