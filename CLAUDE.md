# CLAUDE.md — 덕아웃 택틱스 (Dugout Tactics)

TFT의 룰로 하는 야구 오토배틀러. 모바일 웹(PWA) 우선, 솔로 + 친구방 실시간 8인 + 일일 도전 + 고스트전.
**게임 설계의 단일 진실 원천은 `docs/DESIGN.md`(완전 사양서 v2)다.** 이 파일은 작업 규범·아키텍처·명령어만 다룬다.
사양서에 없는 결정은 `docs/ADR/`에 기록한다.

## 1. 작업 규범

1. **Phase 단위로 일한다.** 코드 전에 해당 Phase 구현 계획을 제시하고 승인을 받는다. Phase 표와 완료 기준은 `DESIGN.md §17`.
2. **최소·점진적 변경.** 한 PR(커밋 묶음)은 한 가지 목적. 여러 시스템을 한 번에 갈아엎지 않는다.
3. **완료 기준은 증거로 보고한다.** 테스트 로그, `bot-arena` 리포트, 스크린샷.
4. **밸런스는 통계로.** 수치를 바꾸면 `pnpm cli bot-arena`를 다시 돌리고 `DESIGN.md §15.1` 지표를 첨부한다.
5. **수치의 원본은 `packages/engine/src/config/*.ts`.** 문서와 어긋나면 상수를 고치고 문서를 갱신한다.
6. **결정하지 않는다.** 사양서에 없으면 `§18` 기본값, 그것도 없으면 질문. 새 결정은 ADR에 남긴다.
7. **결정론.** 엔진은 `Math.random`, `Date`, 네트워크를 쓰지 않는다. 난수는 `createRng(seed).fork(label)`, 시간은 라운드 번호.
8. **실명 선수 데이터는 커밋 금지.** `packages/packs/private/`는 `.gitignore`에 있다. 공개 팩은 `fictional-v1.json`뿐.
9. **언어.** UI 문자열 한국어(`apps/web/src/i18n/ko.json`), 코드·주석·커밋 영어. 엔진은 문자열을 모르고 코드만 내보낸다(설명용 `nameKo`/`descriptionKo`는 예외: 도감 데이터).
10. **테스트.** 엔진 커버리지 80%+. 버그는 시드가 붙은 재현 테스트부터.

## 2. 저장소 구조 (`DESIGN.md §3.2`)

```
apps/web            Vite + React 18 + TS + Tailwind 4 + PWA. zustand, Dexie, dnd-kit. (Phase 3)
apps/server         Cloudflare Workers + Durable Objects + D1. DO 의존 코드는 src/adapter/에 격리. (Phase 4, 아직 없음)
packages/protocol   zod 스키마 + 타입. 팩(CardDef/Pack), 상태(GameState…), 메시지(Action/ServerMessage). 의존성 없음(zod만).
packages/engine     순수 TS. config/(사양 수치) · rng · ratings(표시치·OVR) · nicknames · (P1) sim/ · (P2) run/, bots/, replay/
packages/packs      가상 팩 생성기·검증기·(P5) CSV 변환기. fictional-v1.json 커밋본.
packages/cli        sim-game · bot-arena · replay
docs/DESIGN.md      사양서 v2 원문. docs/ADR/ 결정 기록.
```

의존 방향: `protocol ← engine ← packs`, `protocol/engine ← cli`, `protocol/engine/packs ← web`, `protocol/engine ← server`. 역방향 금지.

## 3. 아키텍처 규약

- **상태는 불변 + 리듀서.** `applyAction(state, action, rng) → Result<GameState, ErrorCode>` 하나를 클라이언트 예측·서버 검증·리플레이·봇이 공유한다(Phase 2). 봇도 같은 액션 API만 쓴다.
- **표시치 5개 ↔ 내부치 분리.** 시뮬은 내부치(`HitterRatings`/`PitcherRatings`)만 읽는다. 표시치와 OVR은 `engine/ratings.ts`가 내부치에서 유도한다(카드·봇·리포트 전용).
- **효과 수치는 데이터.** 시너지·아이템·철학·구장의 숫자는 `config/*.ts`의 `params`에 있다. 시뮬 코드에 매직 넘버를 넣지 않는다.
- **시드 트리(§6.6).** `gameSeed → roundSeed → shopSeed(playerIdx) / matchSeed(matchIdx) / carouselSeed / eventSeed`. 리롤 한 번 더 했다고 경기 결과가 바뀌면 버그.
- **대체선수는 카드가 아니다.** 풀에 없고, 팔 수 없고, 태그·아이템 없음. 보드 빈 칸을 시뮬 직전에 채운다(§5.4).
- **좌타/우타 시너지는 저장하지 않는다.** `bats`에서 셀 때 유도한다(S는 양쪽). `classes`에는 나머지 10개 태그만.
- **투수 카드의 `pos`는 `"DH"` 플레이스홀더**, `pos2`는 빈 배열(ADR-0001). UI는 투수에게 `role`을 표시한다.
- **브랜드·id.** 카드 정의는 `defId`, 소유 인스턴스는 `instanceId`. 섞지 않는다.

## 4. 명령

```
pnpm install
pnpm test                         # 모든 워크스페이스 vitest
pnpm test:coverage                # engine/packs/protocol 커버리지, 임계값 80%
pnpm typecheck                    # tsc --noEmit 전체
pnpm build                        # web 빌드(PWA 포함)
pnpm dev                          # 웹 개발 서버 (--host)
pnpm pack:generate --seed fictional-v1     # 가상 팩 재생성 (커밋본과 같아야 함; 생성기 변경 시에만)
pnpm pack:validate [file.json]             # 팩 검증 (§5.3 제약)
pnpm pack:build input.csv --out my.json    # CSV → 개인 팩 (Phase 5)
pnpm cli sim-game --seed X                 # 1경기 박스스코어 (Phase 1)
pnpm cli bot-arena --games 1000 --seed X   # 밸런스 리포트 (Phase 2)
```

## 5. 코딩 규칙

- TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. `any` 금지.
- 상대 import에 `.js` 확장자(ESM, `verbatimModuleSyntax`). 워크스페이스 패키지는 소스(`src/index.ts`)를 직접 내보낸다.
- 확률은 0..1, 능력치는 1..99 정수. 퍼센트(0..100)는 상점·희귀도 확률표에만.
- 파일 하나에 한 관심사, 300줄 넘으면 나눈다. 테스트는 `packages/*/test/**/*.test.ts`.
- 커밋 메시지: 영어, 명령형, 첫 줄 72자 이내, 본문에 Phase와 검증 출력 요약.

## 6. 현재 상태

- 사용자가 **전체 Phase를 자동 승인**했다(2026-09-26). 각 Phase는 완료 기준 증거를 ADR에 남기고 커밋한다.
- Phase 0 완료(ADR-0001). Phase 1 완료(ADR-0002): `engine/sim/*`, `sim-game` CLI.
- 진행 중: Phase 2 (런 규칙·시너지·아이템·철학·봇·`applyAction`·`bot-arena`).
- 미해결 결정: 무승부 비율(ADR-0002 #6).
