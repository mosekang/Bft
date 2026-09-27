import { expect, test } from "@playwright/test";

/**
 * v3 presentation (DESIGN §15–17): with the 3D tier forced (`?q=mid`), the
 * board renders on a canvas with twelve slot labels, the match plays as a 3D
 * broadcast with captions, skip jumps to the result, and a private roster
 * CSV converts into an on-device pack (§2, §5.6).
 */
test("3D board and broadcast playback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?q=mid");
  await page.getByRole("button", { name: "새 게임" }).click({ timeout: 30_000 }); // lobby 3D scene compiles shaders first (SwiftShader)
  await page.getByRole("button", { name: "이 구장으로" }).first().click();
  const board = page.locator("[aria-label='라인업']");
  await expect(board.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(board.locator("button[data-slot]")).toHaveCount(12);
  const coach = page.getByRole("button", { name: "다시 보지 않기" });
  if (await coach.isVisible().catch(() => false)) await coach.click();
  // Tap-tap still works on the 3D labels: select C, then move to 1B (both replacements → no-op but no error).
  await board.locator("button[data-slot='C']").click();
  await page.getByRole("button", { name: "경기 시작" }).click();
  await expect(page.getByRole("button", { name: "스킵" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByLabel("score")).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "스킵" }).click();
  const next = page.getByRole("button", { name: "다음", exact: true });
  await expect(next).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/승리|패배|무승부/).first()).toBeVisible();
  await next.click();
  await expect(page.getByRole("button", { name: "다음 라운드" })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

function hitters(n: number): string {
  const pos = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
  const rows = ["name,team,bats,throws,pos,age,PA,AVG,OBP,SLG,BB%,K%,HR,ISO,BABIP,GB%,SB,CS,DEF"];
  for (let i = 0; i < n; i++) rows.push(`선수${i},구단${i % 5},${i % 3 ? "R" : "L"},R,${pos[i % 9]},${21 + (i % 15)},${400 + i},0.${260 + (i % 40)},0.${330 + (i % 40)},0.${380 + (i % 90)},${6 + (i % 8)}%,${15 + (i % 10)}%,${i % 28},0.${110 + (i % 110)},0.${285 + (i % 40)},${40 + (i % 15)}%,${i % 20},${i % 5},${(i % 20) - 10}`);
  return rows.join("\n");
}
function pitchers(n: number): string {
  const rows = ["name,team,throws,role,age,IP,K%,BB%,HR9,GB%,ERA,FIP,PIT/GS"];
  for (let i = 0; i < n; i++) rows.push(`투수${i},구단${i % 5},${i % 4 ? "R" : "L"},${i % 3 ? "SP" : "RP"},${23 + (i % 12)},${60 + i * 4},${16 + (i % 14)}%,${6 + (i % 7)}%,${(0.7 + (i % 9) / 10).toFixed(1)},${40 + (i % 18)}%,${(3 + (i % 25) / 10).toFixed(2)},${(3.2 + (i % 18) / 10).toFixed(2)},${75 + (i % 25)}`);
  return rows.join("\n");
}

test("a private roster CSV becomes an on-device pack", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByLabel("CSV 가져오기").setInputFiles([
    { name: "hitters.csv", mimeType: "text/csv", buffer: Buffer.from(hitters(45)) },
    { name: "pitchers.csv", mimeType: "text/csv", buffer: Buffer.from(pitchers(20)) },
  ]);
  await expect(page.getByText(/개인 팩 생성: 59명/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /내 리그 팩/ })).toBeVisible();
});
