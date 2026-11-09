import { expect, test } from "@playwright/test";
import { loginAsDemo, registerUser } from "./helpers";

test.describe("登入", () => {
  test("未登入會被導到登入頁；API 回 401", async ({ page, request }) => {
    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/login$/);
    const res = await request.get("/api/jobs");
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  test("示範使用者一鍵登入到 Dashboard，登出後回登入頁", async ({ page }) => {
    await loginAsDemo(page, "A");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("示範使用者 A");
    await page.getByRole("button", { name: "登出" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("Email 註冊後直接登入；重複註冊會被告知", async ({ page }) => {
    const email = await registerUser(page, "e2e");
    await page.getByRole("button", { name: "登出" }).first().click();
    await page.goto("/login");
    await page.getByRole("tab", { name: "註冊" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("密碼").fill("another-pass-7");
    await page.getByRole("button", { name: "建立帳號" }).click();
    await expect(page.getByText("已經註冊過")).toBeVisible();
  });

  test("沒有寄信服務時，忘記密碼頁說明功能未開放", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByText("還沒有設定寄信服務")).toBeVisible();
    await page.goto("/reset-password");
    await expect(page.getByText("連結不完整")).toBeVisible();
  });
});
