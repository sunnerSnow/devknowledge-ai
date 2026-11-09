import { expect, test } from "@playwright/test";
import { createAnalyzedJob, loginAsDemo } from "./helpers";

test.describe("職缺分析與學習計畫（Flow B、Phase 3）", () => {
  test("貼職缺 → 自評 → 差距排序 → 產生計畫 → 完成任務", async ({ page }) => {
    await loginAsDemo(page, "A");
    const jobUrl = await createAnalyzedJob(page);

    // 沒自評前不能產生計畫
    await expect(page.getByRole("button", { name: "產生學習計畫" })).toBeDisabled();

    // 自評三項
    for (const [name, level] of [
      ["React", "1"],
      ["PostgreSQL", "2"],
      ["Git", "4"],
    ] as const) {
      const select = page.getByLabel(`${name} 的程度`);
      await select.selectOption(level);
      // 存檔期間 select 是 disabled；等它回來才算存完，否則 reload 會中斷最後一次存檔
      await expect(select).toBeEnabled();
      await expect(select).toHaveValue(level);
    }
    await page.reload();
    await expect(page.getByText("技能差距表")).toBeVisible();
    // 差距最大的 React 排在建議學習順序前面；Git 沒有差距不進排序
    const order = await page.locator("ol li p.text-lg").allInnerTexts();
    expect(order[0]).toMatch(/React/);
    expect(order.join(" ")).not.toMatch(/\bGit\b/);

    // 產生學習計畫
    await page.getByRole("button", { name: "產生學習計畫" }).click();
    await page.waitForURL(/\/plans\/[0-9a-f-]{36}$/);
    await expect(page.getByText("學習計畫").first()).toBeVisible();
    const startButtons = page.getByRole("button", { name: "開始" });
    const todoCount = await startButtons.count();
    expect(todoCount).toBeGreaterThan(0);
    await startButtons.first().click();
    // 進行中的任務才有「還原」：等它出現才代表「開始」真的存了
    const inProgressTask = page.locator("li", { has: page.getByRole("button", { name: "還原", exact: true }) }).first();
    await expect(inProgressTask).toBeVisible();
    await expect(startButtons).toHaveCount(todoCount - 1);
    await inProgressTask.getByRole("button", { name: "完成" }).click();
    await expect(page.getByRole("button", { name: "還原為待辦" }).first()).toBeVisible();

    // 職缺頁列出這份計畫
    await page.goto(jobUrl);
    await expect(page.getByRole("button", { name: "再產生一份計畫" })).toBeVisible();
  });

  test("刪除職缺後列表為空", async ({ page }) => {
    await loginAsDemo(page, "A");
    const jobUrl = await createAnalyzedJob(page, "待刪除的職缺");
    await page.goto(jobUrl);
    await page.getByRole("button", { name: "刪除職缺" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "刪除" }).click();
    await page.waitForURL(/\/jobs$/);
    await expect(page.getByRole("link", { name: /待刪除的職缺/ })).toHaveCount(0);
  });
});
