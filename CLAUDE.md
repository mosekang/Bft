# CLAUDE.md — 덕아웃 택틱스 (Dugout Tactics)

TFT(전략적 팀 전투)의 룰로 하는 야구 오토배틀러. 모바일 웹(PWA), 서버 없음, 과금 없음.
게임 설계의 단일 진실 공급원은 `docs/DESIGN.md`다. 이 파일은 **작업 규범과 아키텍처**만 다룬다.

## 1. 작업 규범 (반드시 지킬 것)

1. **Phase 단위로 일한다.** 코드를 쓰기 전에 해당 Phase의 구현 계획을 제시하고 승인을 받는다. 승인 없이 다음 Phase로 넘어가지 않는다. Phase 표는 `docs/DESIGN.md §10`.
2. **최소·점진적 변경.** 한 번에 여러 시스템을 갈아엎지 않는다. 한 PR/커밋은 한 가지 관심사.
3. **완료 기준은 검증 가능해야 한다.** 각 Phase의 완료 기준을 통과했음을 명령 출력으로 보고한다.
4. **밸런스는 감이 아니라 통계.** 수치 변경은 `pnpm cli bot-arena` 리포트(§8 지표)로 검증한다. 리포트 없는 밸런스 커밋은 하지 않는다.
5. **애매하면 `docs/DESIGN.md §11` 기본값을 쓰거나 질문한다.** 임의로 정하지 않는다. 새로 정한 결정은 §11 표에 추가한다.
6. **결정론.** 엔진의 모든 난수는 `createRng(seed)`와 `fork(label)`에서 나온다. `Math.random`, `Date.now()`를 엔진에서 쓰지 않는다. 같은 시드 = 같은 상점 = 같은 경기.
7. **엔진은 순수 TypeScript.** `packages/engine`은 React·DOM·브라우저 API에 의존하지 않는다. Node CLI에서 단독 실행 가능해야 한다.
8. **언어.** UI 문자열은 한국어, 코드·주석·커밋 메시지는 영어. 실명·실제 구단명 사용 금지.
9. **테스트.** 엔진 커버리지 80% 이상(`pnpm test:coverage`). 버그 수정은 재현 테스트(시드 포함)부터.

## 2. 저장소 구조

```
apps/web            Vite + React 18 + TS + Tailwind 4 + vite-plugin-pwa. 세로 화면, 최소 360×640.
packages/engine     순수 TS 시뮬 엔진. 타입 / 데이터(튜닝 상수) / RNG / (Phase 1+) 카드 생성·경기 시뮬 / (Phase 2+) 런 루프·AI.
packages/cli        `dugout sim-game`, `dugout bot-arena` — 박스스코어 출력과 밸런스 리포트.
docs/DESIGN.md      게임 설계 문서(정리본). 규칙·수치·결정 사항의 기준.
```

pnpm workspace. 의존 방향은 `web → engine`, `cli → engine`뿐이다. `engine`은 아무것도 import하지 않는다.

## 3. 엔진 아키텍처

```
packages/engine/src
  rng.ts            sfc32 시드 RNG. createRng / fork / state / rngFromState
  version.ts        ENGINE_VERSION, SAVE_FORMAT_VERSION (세이브 포맷 깨지면 올린다)
  types/            런타임 코드 없는 계약. common(브랜드 id) · player · synergy · modifiers · ballpark · item · philosophy · board · game · run
  data/             튜닝 상수와 순수 함수. economy · damage · fatigue · schedule · baseline
  (Phase 1) gen/    이름·별명·카드 생성기
  (Phase 1) sim/    Log5 타석 → 타구·수비 → 주루 → 경기. 투수 교체 AI 감독
  (Phase 2) run/    상점·경제·레벨·별업·시너지 계산·이벤트·팬심·스테이지 진행
  (Phase 2) ai/     원형(archetype)별 AI 팀 휴리스틱
```

핵심 규약:

- **효과는 전부 `Modifier` 데이터다.** 시너지·아이템·철학·구장·피로·플래툰·상황 보정은 `{target, op, value, source, when}`로 표현하고, Log5 단계는 "왜" 바뀌었는지 모른다. 새 효과를 추가할 때 시뮬 코드를 고치지 말고 Modifier를 추가한다. 새 target이 필요하면 `types/modifiers.ts`에 추가하고 적용 지점을 한 곳에 둔다.
- **카드에 보이는 5개 능력치(display)와 엔진 내부치(internals)는 분리**한다. 생성기가 internals → display를 유도한다. 시뮬은 internals만 읽는다.
- **RNG 스트림 분리.** 런 하나는 `shop` / `game` / `ai` / `events` 스트림을 따로 fork한다. 리롤 한 번 더 했다고 경기 결과가 바뀌면 버그다. 경기 하나는 `game.fork(\`${roundIndex}:${home}:${away}\`)`처럼 라운드·매치업 라벨로 fork한다.
- **대체선수는 카드가 아니다.** `ReplacementPlayer`는 풀에 없고, 팔 수 없고, 별이 없다. 보드의 빈 슬롯을 시뮬 직전에 채운다(`ResolvedTeam.replacements`).
- **상태는 불변.** `RunState`와 하위 타입은 전부 `readonly`. 리듀서 스타일로 새 객체를 반환한다. 이래야 IndexedDB 자동 저장과 시간 되감기(버그 재현)가 쉽다.
- **브랜드 id.** `CardId`(소유 인스턴스)와 `TemplateId`(풀의 정의)를 섞지 않는다. `asCardId()` 등으로만 만든다.

## 4. 명령

```
pnpm install
pnpm test               # 모든 워크스페이스 vitest (타입 테스트 포함)
pnpm test:coverage      # 엔진 커버리지, 임계값 80%
pnpm typecheck          # tsc --noEmit 전체
pnpm build              # engine, cli 빌드 후 web 빌드(PWA 포함)
pnpm dev                # 웹 개발 서버 (--host, 실기기 접속용)
pnpm cli sim-game --seed X          # 1경기 박스스코어 (Phase 1)
pnpm cli bot-arena --games 1000 --seed X   # 밸런스 리포트 (Phase 2)
```

## 5. 코딩 규칙

- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. `any` 금지, `as` 캐스팅은 브랜드 id 헬퍼와 테스트에만.
- 상대 import는 `.js` 확장자를 붙인다(ESM, `verbatimModuleSyntax`).
- 확률은 0..1 `Probability`, 표시 능력치는 1..99 `Rating`. 퍼센트(0..100)는 상점 확률표에만 쓴다.
- 파일 하나에 한 관심사. 300줄 넘으면 나눈다.
- 테스트 파일은 `packages/*/test/**/*.test.ts`, 타입 테스트는 `*.test-d.ts`.
- 커밋 메시지: 영어, 명령형, 첫 줄 72자 이내, 본문에 Phase와 검증 명령 출력 요약.

## 6. 현재 상태

- **Phase 0 완료 대기(설계 승인 필요).** 모노레포·타입·상수·RNG·CLI 뼈대·웹 뼈대·문서.
- 다음: Phase 1(엔진: 카드 생성기, Log5 타석·경기 시뮬, Modifier 적용 훅, 피로). 계획은 `docs/DESIGN.md §12`.
