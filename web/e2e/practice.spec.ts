import { expect, test } from "@playwright/test";
import { loginAsDemo } from "./helpers";

test.describe("面試練習（Phase 4）", () => {
  test("開始練習 → 回答 → 看評估 → 確認程度 → 下一題 → 結束", async ({ page }) => {
    await loginAsDemo(page, "A");
    await page.goto("/practice");
    await page.locator("#practice-topic").fill("Docker");
    await page.getByRole("button", { name: "開始練習" }).click();
    await page.waitForURL(/\/practice\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Docker");

    // 第一題
    const answer = page.getByLabel("你的回答");
    await expect(answer).toBeVisible();
    await answer.fill("Docker 用 image 打包應用程式與相依套件，container 是 image 的執行實例，彼此共用主機核心但有獨立的檔案系統與網路命名空間。");
    await page.getByRole("button", { name: "送出回答" }).click();
    await expect(page.getByText("答對的部分")).toBeVisible();
    await expect(page.getByText("遺漏的重點")).toBeVisible();

    // AI 分數不會自動改技能；使用者自己確認的程度才會寫進 My Skills
    const confirm = page.getByLabel(/看完評估後/);
    await confirm.selectOption("2");
    await expect(confirm).toBeEnabled();
    await expect(confirm).toHaveValue("2");
    // 存檔失敗會在 select 旁顯示 <p role="alert">；Next 自己的路由播報器也是 role=alert，所以只看 p
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    const sessionUrl = page.url();
    await page.goto("/skills");
    const dockerRow = page.locator("li", { hasText: "Docker" }).first();
    await expect(dockerRow).toBeVisible();
    await expect(dockerRow.getByLabel("程度")).toHaveValue("2");
    await page.goto(sessionUrl);

    // 下一題後是新的作答框
    await page.getByRole("button", { name: "下一題" }).click();
    await expect(page.getByLabel("你的回答")).toBeVisible();

    // 結束練習
    await page.getByRole("button", { name: "結束練習" }).click();
    await expect(page.getByRole("button", { name: "結束練習" })).toHaveCount(0);
    await expect(page.getByLabel("你的回答")).toHaveCount(0);
  });
});
