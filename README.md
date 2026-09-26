# 덕아웃 택틱스 (Dugout Tactics)

TFT의 룰로 하는 야구 오토배틀러. 모바일 웹(PWA), 솔로 + 친구방 8인, 무과금·무광고.

- 사양서(SSOT): [`docs/DESIGN.md`](docs/DESIGN.md)
- 결정 기록: [`docs/ADR/`](docs/ADR/)
- 작업 규범·아키텍처: [`CLAUDE.md`](CLAUDE.md)

```sh
pnpm install
pnpm test                               # 모든 패키지 테스트 (엔진·프로토콜·팩·CLI·서버)
pnpm pack:validate                      # 가상 팩 fictional-v1 검증
pnpm cli bot-arena --games 1000         # 밸런스 리포트
pnpm --filter @dugout/server dev:node   # 친구방 서버 (로컬)
pnpm dev                                # http://localhost:5173 (PWA)
pnpm --filter @dugout/web test:e2e      # Playwright: 솔로 1판 완주 + 친구방 2클라이언트
```

- 배포: [`docs/DEPLOY.md`](docs/DEPLOY.md) (Cloudflare Pages + Workers)
- 진행 기록: `docs/ADR/0001`~`0006` (Phase 0~5), 커밋 메시지에 검증 출력 요약

실명 선수 팩은 개인 기기에서만 쓰고 저장소에 커밋하지 않는다 (`packages/packs/private/`는 무시됨).
