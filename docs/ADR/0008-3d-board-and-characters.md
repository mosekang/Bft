# ADR 0008 — 3D 보드와 캐릭터 비주얼

- 상태: 채택
- 배경: 사용자 피드백 "캐릭터 사진이 없고 조작감이 웹 페이지 같다, 롤토체스처럼 3D로".

## 결정

1. **보드는 three.js(R3F) 3D 다이아몬드**로 렌더한다 (`apps/web/src/components/Board3D.tsx`).
   - 캔버스 텍스처로 잔디 스트라이프·흙·라인·베이스·마운드를 그린 평면 위에 슬롯 패드 12개.
   - 선수는 **절차적 로우폴리 피규어**(유니폼색 = 팀색, 타자 배트 / 투수 글러브, 별 링, 대기 애니메이션).
   - 빈 슬롯은 반투명 "대체 선수" 피규어로 표시.
2. **조작**: 탭-탭 이동, 피규어 드래그(지면 평면 교차 → 가장 가까운 유효 슬롯), 롱프레스/우클릭으로 카드 시트, 벤치 카드 드래그 → 3D 슬롯 라벨에 히트 테스트, 햅틱(`navigator.vibrate`, 설정으로 끔).
3. **캐릭터 초상**: `lib/avatar.tsx` — 카드 id 해시로 피부/머리/눈/입/수염/체형/등번호를 결정하는 SVG. 카드 타일·카드 시트·(추후) 플레이백에서 공통 사용. 외부 이미지 자산 없음 → 팩 교체 시에도 항상 초상이 존재.
4. **번들**: three 계열은 `React.lazy`로 분리(메인 ≈186 KB gzip, Board3D 청크 ≈226 KB gzip). 첫 화면(로비)은 3D를 로드하지 않는다.
5. **접근성/테스트**: 각 슬롯에 `<button data-slot aria-label="포지션 이름">` HTML 라벨을 겹쳐 두어 스크린리더와 Playwright가 3D 없이도 슬롯을 조작할 수 있다.

## 기각한 대안

- 2D 카드 그리드 유지 + 일러스트만 추가: "보드 위에서 선수가 서 있는" 느낌이 나지 않아 기각.
- 실제 선수 사진: §2 실명 데이터 금지 원칙과 충돌, 라이선스 문제 → 절차적 초상으로 대체.

## Addendum (2026-09-27): game-feel pass

- Characters rebuilt as SD (big head, toon ramp, rim light, inverted-hull outlines, blob shadows) in one instanced `FigureBatch`; decals (numbers, wordmarks from `pack.teams[].short`, faces) come from canvas atlases — still no external assets.
- Card illustrations are 3D busts rendered offscreen once per card and cached as webp data URLs; the SVG avatar remains the fallback (no WebGL, low tier).
- The FPS probe never demotes to the 2D tier on its own (shader-compile stalls on phones were dropping players into 2D); it skips a 1.5 s warm-up. 2D is reached only without WebGL2, under webdriver, or by setting.
- Lobby, stadium select and result screens gained 3D hero scenes (active pack's stars at home plate, fireworks; MVP line-up celebrates or hangs heads by placement). All cosmetic; no engine state.
- Real-name packs stay on-device: `pnpm pack:roster` builds from a hand-authored roster table into `packages/packs/private/` (gitignored), imported via Settings → 팩 관리. The public site ships only `fictional-v1`.
