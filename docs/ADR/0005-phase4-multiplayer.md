# ADR-0005 — Phase 4 친구방 서버 결정

상태: 채택(전체 Phase 자동 승인) · 날짜: 2026-09-26

`apps/server`가 §12를 구현하면서 정한 것.

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | **코어/어댑터 분리** | `core/room.ts`의 `RoomCore`는 플랫폼 포트(`save`, `setAlarm`, `now`, `onClose`)만 알고, `adapter/cloudflare.ts`(Durable Object + KV + D1)와 `adapter/node.ts`(`ws` + 메모리)가 감싼다. | §3.1 "DO 의존 코드는 adapter/에 격리". Node 어댑터는 Colyseus/Fly.io 대안이자 Playwright 다중 클라이언트 테스트 서버. |
| 2 | **방 코드 → DO** | Worker가 6자 코드를 만들고 KV `room:<code>`에 DO id를 6시간 TTL로 저장. DO 스토리지에 `RoomSnapshot`(멤버·상태·팩·타이머) 저장, 소켓은 Hibernation API(`acceptWebSocket` + 태그=playerId). | §12.2 |
| 3 | **PATCH** | 서버가 소켓별로 마지막 전송 상태와 새 상태의 RFC 6902 diff(`add/replace/remove`, 길이가 다른 배열은 통째로 replace)를 보낸다. 클라이언트는 적용 후 `version`이 어긋나면 JOIN을 다시 보내 SNAPSHOT을 받는다. | §12.2 "PATCH{ops[]}". `applyPatch/diff`는 `packages/protocol`에 두어 서버·클라이언트가 같은 구현을 쓴다. |
| 4 | **타이머** | 페이즈 진입 시 알람 1개(DO `setAlarm`, Node `setTimeout`). 만료 시 `waitingOn()`으로 아직 안 한 사람을 찾아 첫 번째 옵션/READY/SKIP을 대신 적용(§12.4). 스테일 알람은 라운드·페이즈 불일치로 무시. | |
| 5 | **봇 대체** | PREP 타임아웃이 2회 연속이거나 연결이 끊긴 채 타임아웃이면 `isBot = true`(원형 ECON). JOIN으로 돌아오면 즉시 `isBot = false`. | §12.5 |
| 6 | **시작 조건** | 접속 중인 전원이 READY이고 방장이 READY면 시작(마지막 READY가 누구든). 1명이어도 시작 가능하며 부족분은 봇. | §12.1 "2~8 + 봇 채움"에 1인 테스트 편의를 더함. |
| 7 | **팩 임시 업로드** | `POST /rooms/:code/pack` ≤ 200 KB, 스키마 검증, 시작 전만 허용. DO 스토리지에만 두고 방 종료(`deleteAll`) 시 함께 사라진다. D1 `packs_temp`는 만들지 않는다. | §2·§16 "방이 닫히면 삭제"를 가장 직접적으로 만족. |
| 8 | **레이트 리밋** | 초당 10 액션(메시지 단위, 초 경계 창). 초과는 `ERROR RATE_LIMITED`. | §12.5 |
| 9 | **계정** | 클라이언트가 기기 UUID를 `playerId`로 보낸다. 복구 코드/`players` 테이블은 Phase 5 리더보드에서 닉네임만 쓰므로 해시 검증은 후속(§18 "계정" 항목의 최소 구현). | 무인증 방 코드 모델. 서버는 클라 값(골드·카드)을 절대 믿지 않고 상태만 신뢰. |
| 10 | **클라이언트 예측** | 하지 않는다(액션 왕복 후 반영). 라운드당 액션 수가 적고 지연이 100ms 수준이라 체감이 작다. 필요 시 Phase 6. | §12.2의 "예측"은 선택 최적화로 본다. |
| 11 | **CORS/배포** | `ALLOWED_ORIGIN` 환경변수, `wrangler.toml`의 D1/KV id는 배포 시 채운다. 이 환경에서는 Cloudflare 자격 증명이 없어 배포하지 않았다. | |

## Phase 4 완료 기준 증거
- 단위 테스트(`apps/server/test/room.test.ts`): 입장·준비·시작, 9번째 입장 거부, 잘못된 메시지, 레이트 리밋, 액션 검증과 PATCH 전파, 타임아웃 자동 진행(구장→준비→경기→정산→다음 라운드), 2라운드 유휴 봇 대체와 복귀, 방장 이양과 30초 후 방 종료, **라운드 시뮬 < 200 ms**.
- Playwright 2클라이언트(`apps/web/e2e/room.spec.ts`, Node 어댑터): 방 생성 → 코드 입장 → 준비 → 동시 시작 → 경기 → 새로고침 후 재접속. 실행 기록은 커밋 메시지.
- "4명 실기기 3판 무중단"은 실기기·배포가 없어 미측정. Node 서버 + 2 브라우저 컨텍스트로 대체.
