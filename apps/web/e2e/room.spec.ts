import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Friend room over the Node adapter (§17 Phase 4): host creates a room, a
 * second device joins by code, both ready up, the run starts for both, and a
 * reload reconnects with the same state.
 */
async function newDevice(browser: Browser, nickname: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByLabel("닉네임").blur();
  return page;
}

test("two devices play a friend room and reconnect after reload", async ({ browser }) => {
  const host = await newDevice(browser, "호스트");
  const guest = await newDevice(browser, "손님");
  await host.getByRole("button", { name: "친구방 만들기" }).click();
  await expect(host.getByText("방 코드")).toBeVisible();
  const code = (await host.getByTestId("room-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await guest.getByLabel("방 코드 6자").fill(code);
  await guest.getByRole("button", { name: "코드로 입장" }).click();
  await expect(guest.getByText("방 코드")).toBeVisible();
  await expect(host.getByText("손님")).toBeVisible();

  await guest.getByRole("button", { name: "준비" }).click();
  await host.getByRole("button", { name: "준비" }).click();
  await expect(host.getByText("홈구장을 고르세요")).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText("홈구장을 고르세요")).toBeVisible();

  await host.getByRole("button", { name: "이 구장으로" }).first().click();
  await guest.getByRole("button", { name: "이 구장으로" }).nth(1).click();
  await expect(host.getByText("S1-1")).toBeVisible();
  await expect(guest.getByText("S1-1")).toBeVisible();
  await expect(host.getByLabel("남은 시간")).toBeVisible();

  // Host readies, guest times out (30 s prep in S1) or readies too → playback.
  await host.getByRole("button", { name: "경기 시작" }).click();
  await guest.getByRole("button", { name: "경기 시작" }).click();
  await expect(host.getByRole("button", { name: /스킵|다음/ })).toBeVisible({ timeout: 20_000 });

  // Reconnect: reload the guest mid-run; it must land back in the same run.
  await guest.reload();
  await guest.getByLabel("방 코드 6자").fill(code);
  await guest.getByRole("button", { name: "코드로 입장" }).click();
  await expect(guest.getByText(/S1-[12]/)).toBeVisible({ timeout: 20_000 });
});
