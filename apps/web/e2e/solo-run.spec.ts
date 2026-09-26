import { expect, test, type Page } from "@playwright/test";

/**
 * Plays a whole solo run through the UI on a Pixel 5 viewport (§17 Phase 3).
 * Decisions are simple: first option everywhere, buy the first affordable
 * shop card each round, and put bench cards on the board when possible.
 */
async function step(page: Page): Promise<"done" | "progress"> {
  try {
    return await stepInner(page);
  } catch {
    // Phase changed under us (overlay appeared, button vanished): just look again.
    return "progress";
  }
}

const T = { timeout: 3000 } as const;

async function stepInner(page: Page): Promise<"done" | "progress"> {
  if (await page.getByText("시즌 종료").isVisible().catch(() => false)) return "done";
  const click = async (name: string | RegExp) => {
    const b = page.getByRole("button", { name }).first();
    if (await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click(T); return true; }
    return false;
  };
  // Pending choice / augment / event overlays first.
  if (await page.getByText("감독 철학을 고르세요").isVisible().catch(() => false)) { await page.locator("div.fixed.inset-0").last().locator("button").first().click({ force: true, ...T }); return "progress"; }
  if (await page.getByText("당신 차례입니다").isVisible().catch(() => false)) {
    const overlay = page.locator("div.fixed.inset-0").last();
    const cards = overlay.locator("button[aria-label]");
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const b = cards.nth(i);
      if (!(await b.evaluate((el) => el.className.includes("opacity-50")))) { await b.click({ force: true, ...T }); return "progress"; }
    }
    await page.waitForTimeout(200);
    return "progress";
  }
  if (await page.getByText("다른 팀이 고르는 중").isVisible().catch(() => false)) { await page.waitForTimeout(200); return "progress"; }
  if (await page.getByText(/보상을 고르세요|프랜차이즈 스타를 고르세요|특수 아이템을 고르세요/).isVisible().catch(() => false)) { await page.locator("div.fixed.inset-0").last().locator("button").first().click({ force: true, ...T }); return "progress"; }
  if (await click("다음으로")) return "progress";
  if (await click("다음 라운드")) return "progress";
  if (await click("스킵")) return "progress";
  if (await click("다음")) return "progress";
  if (await page.getByText("홈구장을 고르세요").isVisible().catch(() => false)) { await click("이 구장으로"); return "progress"; }
  if (await page.locator("div.fixed.inset-0").count() > 0) { await page.waitForTimeout(150); return "progress"; }
  // PREP: buy something affordable, place bench cards, then start.
  const ready = page.getByRole("button", { name: "경기 시작" });
  if (await ready.isVisible().catch(() => false)) {
    const shopButtons = page.locator("[aria-label='상점'] button[aria-label]");
    const n = await shopButtons.count();
    for (let i = 0; i < n; i++) {
      const b = shopButtons.nth(i);
      const dim = await b.evaluate((el) => el.className.includes("opacity-50"));
      if (!dim) { await b.click(T); break; }
    }
    // Tap-tap: first bench card → first empty hitter slot ("대체").
    const benchCard = page.locator("[aria-label='벤치'] button[aria-label]").first();
    if (await benchCard.isVisible().catch(() => false)) {
      await benchCard.click(T);
      const empty = page.locator("[aria-label='라인업'] button:has-text('대체'), [aria-label='라인업'] button:has-text('P1')").first();
      if (await empty.isVisible().catch(() => false)) await empty.click(T);
    }
    if (await ready.isEnabled()) await ready.click(T);
    return "progress";
  }
  await page.waitForTimeout(150);
  return "progress";
}

test("a full solo run completes on a phone viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "덕아웃 택틱스" })).toBeVisible();
  // Instant playback via the settings panel.
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByRole("button", { name: "즉시" }).click();
  await page.getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: "새 게임" }).click();
  await expect(page.getByText("홈구장을 고르세요")).toBeVisible({ timeout: 30_000 });
  let rounds = 0;
  for (let i = 0; i < 2500; i++) {
    const r = await step(page);
    if (r === "done") break;
    if (i % 50 === 0) rounds++;
  }
  await expect(page.getByText("시즌 종료")).toBeVisible();
  await expect(page.getByText(/[1-8]위/)).toBeVisible();
  await page.screenshot({ path: "e2e/result.png" });
});

test("a run survives a reload (auto-save)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 게임" }).click();
  await page.getByRole("button", { name: "이 구장으로" }).first().click();
  await expect(page.getByText("S1-1")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "이어하기" }).click();
  await expect(page.getByText("S1-1")).toBeVisible();
});
