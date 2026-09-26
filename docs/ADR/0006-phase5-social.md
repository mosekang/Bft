# ADR-0006 — Phase 5 일일 도전·고스트·팩 변환·도감·업적

상태: 채택(전체 Phase 자동 승인) · 날짜: 2026-09-26

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | **일일 시드** | `daily:<YYYY-MM-DD UTC>:<packId>`. 서버 `GET /daily/seed`가 같은 식을 돌려주며, 오프라인이면 클라이언트가 같은 식으로 만든다. | §12.6 `hash(YYYY-MM-DD, packId)`. 문자열 자체가 시드이므로 해시는 RNG 초기화(cyrb128)에서 일어난다. |
| 2 | **점수** | 순위 점수 [100,80,65,50,40,30,20,10] + 라운드×2 + 남은 팬심. 하루 첫 제출만 저장(`INSERT OR IGNORE`), 이후 제출은 `exists`. 날짜는 오늘 또는 어제(UTC)만 허용. | §12.6 |
| 3 | **고스트** | 매 라운드 정산 시 `{packId, stageRound, hp, board{slots, order, cards, nickname, stadium}}` 업로드(설정으로 끔). 고스트전은 READY 직전에 같은 `stageRound`·가까운 hp 밴드 스냅샷 7개를 받아 봇 보드에 덮어쓴다(`engine/run/ghosts.ts`, 새 인스턴스 id `g:<bot>:<n>`, 피로 0). 봇은 그 라운드 이후에도 자기 경제로 계속 플레이한다. | §12.1·§12.6. 봇을 완전히 대체하지 않고 보드만 덮어써 라운드마다 새 스냅샷을 쓴다. |
| 4 | **저장소** | 서버 `SocialStore` 인터페이스: D1 구현(`adapter/d1.ts`, `sql/schema.sql`)과 메모리 구현(Node·테스트). | |
| 5 | **CSV 변환기** | `pnpm pack:build --hitters h.csv --pitchers p.csv --out my.json`. §5.6 백분위 공식 그대로, 코스트는 OVR 순위로 8/12/13/13/13, 태그는 규칙, 부족분은 가상 카드로 채움, 초과분은 OVR 하위 제외. 결과 `kind: "private"`. 검증기 오류는 경고로만 출력(실데이터는 §5.3 구성 제약을 정확히 못 맞추는 게 정상). | §5.6 |
| 6 | **팩 가져오기** | 설정 화면에서 JSON 파일을 Dexie `packs`에 저장하고 "사용 중" 팩을 고른다. Worker는 런 시작 시 `init(pack)`. 저장된 판은 `packId`로 팩을 되찾는다. | §2 "자기 기기에만". |
| 7 | **도감** | 카드(발견한 것만 공개, `collection`), 시너지·철학·아이템·구장·업적 탭. 데이터는 엔진 config의 `nameKo/descriptionKo`. | §14.1-8 |
| 8 | **업적 15종** | `lib/achievements.ts` — 시즌 종료 시 평가해 Dexie `achievements`에 저장. 목록: 첫 승, 가을야구(3위), 우승, 외국인 정확히 2 우승, 고졸 6, ★★★, 5코 ★★, 리롤 50, 무승부 3, 철옹성(hp≥70 우승), 레벨 10, 대체선수의 반란, 짠물 구단(골드 50), 장비 마니아(합성 3), 철학자(프리즘 3). | §14.1-9 |
| 9 | **기록 화면** | 최근 30판(Dexie) + 오늘 리더보드 상위 20과 내 순위(서버). | §14.1-9 |

## Phase 5 완료 기준 증거
- 일일 점수 기록·조회: `apps/server/test/social.test.ts`(첫 제출만 기록, 순위, 날짜 검증), 웹 `Result`에 점수·순위 표시.
- 고스트전 1판: 엔진 `run.test.ts` "ghost boards" + 웹 설정 토글. 서버가 없으면 자동으로 봇 보드 유지.
- 실명 CSV → 개인 팩 → 솔로 1판: `packs/test/build.test.ts`(합성 CSV 59장 구성·태그·채움) + 설정 화면 가져오기. 실명 CSV는 저장소에 없다.
