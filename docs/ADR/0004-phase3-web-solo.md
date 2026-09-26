# ADR-0004 — Phase 3 웹 솔로 클라이언트 결정

상태: 채택(전체 Phase 자동 승인) · 날짜: 2026-09-26

`apps/web`가 §14를 솔로 모드 범위(§17 Phase 3)에서 구현하면서 정한 것.

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | **엔진 실행 위치** | 모든 엔진 호출(`newRun`, `applyAction`+`advance`, `advance`)을 Web Worker(`engine/worker.ts`)에서 실행. 메인 스레드는 `GameState`를 받아 zustand에 보관. Worker가 없는 환경(테스트)은 같은 모듈을 인라인 실행. | §14.2 "메인 스레드 블로킹 50ms 초과 금지". 한 라운드 시뮬(8팀 봇 + 4경기)은 약 5ms지만 저사양 폰에서 여유를 둔다. |
| 2 | **상태 전달** | 액션마다 전체 `GameState`를 Worker에 보내고 전체를 돌려받는다(구조화 복제). | 상태는 순수 JSON(수십~수백 KB). PATCH/JSON Patch는 Phase 4 서버 프로토콜에서 도입. |
| 3 | **자동 저장** | 모든 상태 변경 후 Dexie `runs["current"]`에 저장. 로비의 "이어하기"는 `phase !== GAME_OVER`일 때만. 저장 실패(프라이빗 모드)는 무시하고 메모리로 계속. | §12.1 솔로 "자동 저장, 이어하기". |
| 4 | **배치 입력** | 탭-탭(선택 → 대상)과 dnd-kit 드래그를 모두 지원. 투수 칸을 두 번 탭하면 "지쳐도 등판" 토글. 카드 롱프레스(450ms) 또는 우클릭으로 상세 시트. | §14.1-4 |
| 5 | **타순 편집** | Phase 3에서는 자동(엔진의 `order` 기본값 = 포지션 순). 드래그 타순 편집과 "타순 자동" 버튼의 실제 정렬은 Phase 4 UI 다듬기에서. | 범위 조절. 타순은 §4.3에서 사용자가 정하지만 봇과 동일한 기본 정렬로도 플레이 가능. |
| 6 | **중계 텍스트** | `lib/commentary.ts`에 §14.6 캐스터 톤 템플릿 1종(해설 톤은 Phase 4). 하이라이트 사이 6개 이상 건너뛰면 "n회~m회: 잠잠한 흐름…" 요약. 문장 선택은 이벤트 좌표로 시드해 재생마다 같다. | §14.6 |
| 7 | **연출 속도** | 설정 1×/2×/즉시(로비 설정 버튼 순환). 즉시는 하이라이트를 한 번에 표시. | §14.3 |
| 8 | **PWA 아이콘** | `public/icon-192.png`, `icon-512.png`(any + maskable), `apple-touch-icon.png`를 순수 Node PNG 인코더 스크립트로 생성(플랫 아이콘). | Lighthouse `installable-manifest`는 144px 이상 PNG를 요구한다. |
| 9 | **i18n** | `src/i18n/ko.json` + `t()`; 엔진의 `nameKo/descriptionKo`(시너지·아이템·철학·구장 설명)는 도감 데이터로 그대로 사용. | CLAUDE.md §1-9 |
| 10 | **미완(Phase 4+로)** | 방 대기·친구방, 일일 도전, 도감, 기록, 코치마크 3단계(현재 1단계 힌트만), 공유 이미지(현재 텍스트 공유), 홈런 연출·진동, 타순 드래그. | §17 Phase 4~6 범위. |

## Phase 3 완료 기준 증거
- **실기기 1판 완주**: 실기기 접근이 불가한 환경이라 Playwright(Pixel 5 뷰포트, 실제 Chromium)로 UI만 조작해 1판 완주를 자동화(`apps/web/e2e/solo-run.spec.ts`). 결과는 아래 "실행 기록".
- **자동 저장**: 새로고침 후 "이어하기"로 같은 라운드 복귀(e2e 두 번째 테스트).
- **Lighthouse PWA**: Lighthouse 12부터 PWA 카테고리가 삭제되어 `lighthouse@11`로 측정. 결과는 아래.
- **오프라인**: `vite-plugin-pwa`의 precache(13 entries)로 앱 셸·엔진 워커·팩 JSON을 모두 캐시. 솔로는 네트워크 요청이 없다.
- 번들: 메인 175 KB gzip + 워커 218 KB(비압축) — §14.2 예산(400 KB gzip) 안.

## 실행 기록 (2026-09-26)
- `playwright test e2e/solo-run.spec.ts` (Pixel 5, 실제 Chromium): **1판 완주 10.1초**(연출 "즉시"), **새로고침 후 이어하기 0.8초** — 2 passed.
- `playwright test e2e/room.spec.ts` (Node 방 서버): 2클라이언트 방 생성·입장·시작·경기·재접속 — passed.
- `lighthouse@11 --only-categories=pwa`: **PWA 1.0** (installable-manifest, splash, themed omnibox, content width, viewport, maskable icon 모두 통과).
- 번들: `index-*.js` 181 KB gzip, 워커 청크 218 KB(비압축), precache 13 entries.
