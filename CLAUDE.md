# CLAUDE.md — 덕아웃 택틱스 (Dugout Tactics)

TFT의 룰로 하는 야구 오토배틀러. 모바일 웹(PWA) 우선, 솔로 + 친구방 실시간 8인 + 일일 도전 + 고스트전.
**게임 설계의 단일 진실 원천은 `docs/DESIGN.md`(통합 사양서 v3)다.** 이 파일은 작업 규범·아키텍처·명령어만 다룬다.
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
apps/server         core/(RoomCore·social: 플랫폼 무관) + adapter/(cloudflare: DO·KV·D1, node: ws 개발 서버) + sql/schema.sql
packages/protocol   zod 스키마 + 타입. 팩(CardDef/Pack), 상태(GameState…), 메시지(Action/ServerMessage). 의존성 없음(zod만).
packages/engine     순수 TS. config/(사양 수치) · rng · ratings(표시치·OVR) · nicknames · sim/(경기) · run/(런 규칙, applyAction, advance) · bots/ · arena.ts(bot-arena)
packages/packs      가상 팩 생성기·검증기·(P5) CSV 변환기. fictional-v1.json 커밋본.
packages/cli        sim-game · bot-arena · replay
packages/cinematic  엔진 이벤트 → 연출 타임라인 DSL·릴 빌더·검증기 (순수 TS, three/React 없음)
packages/assets     에셋 매니페스트(sources.json)·LICENSES.md·검증기 — 에셋은 전부 코드 생성
apps/web/src/scene  R3F: 구장·절차 캐릭터·클립·오라·BoardStage(준비)·MatchStage(중계)·품질 등급
apps/web/src/audio  Web Audio 합성 효과음 31종·BGM·햅틱·juice()
docs/DESIGN.md      사양서 v3 원문. docs/ADR/ 결정 기록.
```

의존 방향: `protocol ← engine ← packs`, `protocol ← cinematic`, `protocol ← assets`, `protocol/engine ← cli`, `protocol/engine/packs/cinematic ← web`, `protocol/engine ← server`. 역방향 금지.

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
pnpm pack:roster --roster r.csv --teams t.csv --out my.json --id my-pack   # 수기 로스터(코스트+표시치) → 개인 팩. 입력·출력은 packages/packs/private/에만
pnpm cli sim-game --seed X                 # 1경기 박스스코어
pnpm cli bot-arena --games 1000 --seed X   # 밸런스 리포트 (§15.1)
pnpm --filter @dugout/web test:e2e         # Playwright: 솔로 1판 완주 + 친구방 2클라이언트 + v3(3D 보드·중계·CSV 팩)
pnpm --filter @dugout/assets validate      # 에셋 매니페스트 검증 (클립·효과음·라이선스)
pnpm --filter @dugout/server dev:node      # 로컬 방 서버 :8787 (VITE_SERVER_URL 기본값)
pnpm --filter @dugout/server dev:cf        # wrangler dev (Cloudflare)
```

## 5. 코딩 규칙

- TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. `any` 금지.
- 상대 import에 `.js` 확장자(ESM, `verbatimModuleSyntax`). 워크스페이스 패키지는 소스(`src/index.ts`)를 직접 내보낸다.
- 확률은 0..1, 능력치는 1..99 정수. 퍼센트(0..100)는 상점·희귀도 확률표에만.
- 파일 하나에 한 관심사, 300줄 넘으면 나눈다. 테스트는 `packages/*/test/**/*.test.ts`.
- 커밋 메시지: 영어, 명령형, 첫 줄 72자 이내, 본문에 Phase와 검증 출력 요약.

## 6. 현재 상태

- 사용자가 **전체 Phase를 자동 승인**했다(2026-09-26). 각 Phase는 완료 기준 증거를 ADR에 남기고 커밋한다.
- Phase 0 완료(ADR-0001). Phase 1 완료(ADR-0002): `engine/sim/*`, `sim-game` CLI. Phase 2 완료(ADR-0003): `engine/run/*`, `bots/`, `arena.ts`, `bot-arena` CLI. 1000판 지표 10/12 OK.
- Phase 3 완료(ADR-0004): `apps/web` 솔로(Worker·Dexie·PWA·Playwright e2e). Phase 4 완료(ADR-0005): `apps/server` 코어 + Cloudflare/Node 어댑터, 웹 친구방. Phase 5 완료(ADR-0006): 일일 도전·리더보드·고스트·CSV 팩 변환·도감·업적.
- Phase 6 완료(ADR-0007): 타순 편집(`SET_ORDER`), 해설 톤, 홈런 연출·진동, 코치마크, CI 워크플로, 배포 문서. **배포 URL은 미생성**(Cloudflare 자격 증명 없음 → `docs/DEPLOY.md`).
- v3 표현층 완료(ADR-0009): 절차 3D 캐릭터·구장, 중계 연출, 주스·사운드·햅틱, 시너지/아이템 비주얼, 결과 화면 MVP·명장면·이미지 공유, 이모트, 기기 내 CSV 팩. 콘텐츠 확장·밸런스 재검증은 ADR-0010.
- 미해결: 실기기 fps·로딩 예산 측정(샌드박스에 실기기 없음).
- 후속(범위 밖): Capacitor 패키징, 랭크, 시즌 팩 교체, 관전 모드, 클라이언트 예측(ADR-0005 #10).
- 런 루프 사용법: `createContext(pack)` → `createRun(ctx, {seed, players})` → 사람 입력은 `applyAction(state, playerId, action, ctx)` → 항상 `advance(state, ctx, bots)`로 봇과 페이즈를 진행 → `waitingOn(state, playerId)`로 UI가 기다릴 것을 안다.

## 7. 표현층 (v3, ADR 0008·0009)
- 준비 단계: `scene/BoardStage.tsx`. 캔버스 `frameloop="demand"` + 등급별 fps 캡, 카메라는 세로 화면에 맞춰 자동 거리. 슬롯 라벨은 DOM 레이어 하나(`[aria-label='라인업'] button[data-slot]`, e2e 핸들).
- 중계: `scene/MatchStage.tsx`가 `@dugout/cinematic`의 `buildReel()` 타임라인을 실행. 스텝 시각은 실시간, 애니·공·이동은 씬 시계(히트스톱·슬로모 반영).
- 좌표: 엔진/cinematic은 사양 좌표(3루 −x). 렌더는 `specToWorld`로 x 반전(3루 +x).
- 캐릭터 외형은 `lib/appearance.ts` 하나에서 결정론 생성 → SVG 초상(`lib/avatar.tsx`)과 3D가 같은 얼굴. 외부 이미지·모델·음원 금지(`packages/assets/LICENSES.md`).
- 품질: `?q=high|mid|low`로 강제. 자동화 브라우저(webdriver)는 low(2D)로 시작하므로 기존 e2e는 2D 경로를 탄다. 3D는 `e2e/v3.spec.ts`가 `?q=mid`로 검증.
- 연출 난수는 엔진의 별도 `presentation` 스트림 → 연출 필드를 바꿔도 경기 결과·골든 불변.
- 캐릭터: `scene/figureBatch.ts`(인스턴싱 SD 캐릭터: 툰+림라이트+외곽선+데칼 아틀라스). 카드 일러스트는 `scene/portraits.ts`가 오프스크린 WebGL로 흉상을 렌더해 webp로 캐시(`components/CardArt.tsx`, 실패 시 SVG).
- 히어로 씬: 로비·결과 화면은 `scene/LobbyStage.tsx`의 `HeroStage`(mood lobby/win/lose), 구장 선택은 `scene/StadiumPreview.tsx`. low 품질이면 2D 대체. 디버그: `?gallery`, `?gallery=win|lose`.
- 개인 팩: `pnpm pack:roster`(수기 로스터 CSV → 팩). 결과물은 `packages/packs/private/`에만, 기기에서 설정 → 팩 관리로 가져온다.
