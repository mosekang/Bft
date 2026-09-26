# 배포 (Cloudflare Pages + Workers)

이 저장소는 Cloudflare 자격 증명 없이 개발됐다. 배포는 아래 순서로 한 번만 손으로 하거나, `.github/workflows/deploy.yml`을 `workflow_dispatch`로 실행한다.

## 1. 서버 (Workers + Durable Objects + D1 + KV)

```sh
cd apps/server
pnpm exec wrangler login
pnpm exec wrangler d1 create dugout                 # 출력된 database_id를 wrangler.toml에
pnpm exec wrangler kv namespace create KV           # 출력된 id를 wrangler.toml에
pnpm exec wrangler d1 execute dugout --remote --file=sql/schema.sql
pnpm exec wrangler deploy                           # https://dugout-tactics.<account>.workers.dev
```

`wrangler.toml`의 `ALLOWED_ORIGIN`을 Pages 도메인으로 바꾼다(기본 `*`).

## 2. 웹 (Pages)

```sh
VITE_SERVER_URL=https://dugout-tactics.<account>.workers.dev pnpm --filter @dugout/web build
pnpm --filter @dugout/server exec wrangler pages project create dugout-tactics --production-branch main
pnpm --filter @dugout/server exec wrangler pages deploy apps/web/dist --project-name dugout-tactics
```

## 3. 로컬 통합 확인

```sh
pnpm --filter @dugout/server dev:node      # :8787 (메모리 저장소, D1 없음)
pnpm dev                                    # :5173, VITE_SERVER_URL 기본값이 :8787
pnpm --filter @dugout/web test:e2e          # 솔로 1판 + 친구방 2클라이언트
```

## 4. 예산 점검

- 메인 번들 ≤ 400 KB gzip (CI가 검사). 현재 약 181 KB + 워커 청크.
- Lighthouse PWA(`npx lighthouse@11 --only-categories=pwa`) 1.0.
- 서버 라운드 시뮬 < 200 ms (`apps/server/test/room.test.ts`).

## 5. 서버 없이도 되는 것

솔로·일일 도전(점수 업로드 제외)·도감·기록은 오프라인에서 동작한다. 서버가 없으면 친구방·리더보드·고스트전만 비활성이다.
