import { expect, test } from "@playwright/test";
import { ensureKnowledgePage, loginAsDemo } from "./helpers";

test.describe("知識庫（Flow A）", () => {
  test("搜尋不到就用 AI 建立；再搜尋會找到既有頁面；可更新學習狀態", async ({ page }) => {
    await loginAsDemo(page, "A");

    await page.goto("/knowledge?q=RAG");
    await page.getByRole("button", { name: /用 AI 建立「RAG」知識頁/ }).click();
    await page.waitForURL(/\/knowledge\/rag$/);
    await expect(page.getByRole("heading", { name: "一句話理解" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/RAG/i);

    // 學習狀態
    await page.getByRole("radio", { name: "學習中" }).click();
    await expect(page.getByRole("radio", { name: "學習中" })).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await expect(page.getByRole("radio", { name: "學習中" })).toHaveAttribute("aria-checked", "true");

    // 再搜尋：直接列出既有頁面，不再出現「用 AI 建立」
    await page.goto("/knowledge?q=RAG");
    await expect(page.getByRole("link", { name: /RAG/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /用 AI 建立「RAG」知識頁/ })).toHaveCount(0);
  });

  test("另一位使用者看得到共用的知識頁，但學習狀態是自己的", async ({ page }) => {
    // 不依賴上一個測試：頁面不存在時自己建立（mock provider，幾秒）
    await loginAsDemo(page, "B");
    await ensureKnowledgePage(page, "RAG", "rag");
    await expect(page.getByRole("heading", { name: "一句話理解" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "學習中" })).toHaveAttribute("aria-checked", "false");
  });
});
