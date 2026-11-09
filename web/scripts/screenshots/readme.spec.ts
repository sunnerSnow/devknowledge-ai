import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createAnalyzedJob, ensureKnowledgePage, loginAsDemo } from "../../e2e/helpers";

const OUT = path.join(__dirname, "..", "..", "..", "docs", "screenshots");

async function shot(page: Page, name: string, scrollTo?: string): Promise<void> {
  // 拿掉 Next 開發工具的浮動按鈕與「本機示範模式」橫幅，畫面乾淨一點；README 會註明是示範模式
  await page.addStyleTag({ content: "nextjs-portal, .local-banner { display: none !important; }" });
  if (scrollTo) {
    await page.evaluate((text) => {
      const el = [...document.querySelectorAll("h2, p, span")].find((n) => n.textContent?.trim() === text);
      el?.scrollIntoView({ block: "start" });
      window.scrollBy(0, -48);
    }, scrollTo);
  }
  // 等網頁字體載完、版面穩定再拍
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

test("拍 README 的畫面", async ({ page }) => {
  // 登入頁
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "以示範使用者 A登入" })).toBeVisible();
  await shot(page, "login");

  await loginAsDemo(page, "A");

  // 知識頁（mock 內容）
  await ensureKnowledgePage(page, "RAG", "rag");
  await ensureKnowledgePage(page, "Docker", "docker");
  await page.goto("/knowledge/rag");
  await expect(page.getByRole("heading", { name: "一句話理解" })).toBeVisible();
  await shot(page, "knowledge");

  // 職缺分析 → 自評 → 差距表
  await createAnalyzedJob(page);
  for (const [name, level] of [
    ["React", "1"],
    ["PostgreSQL", "2"],
    ["Git", "4"],
  ] as const) {
    const select = page.getByLabel(`${name} 的程度`);
    await select.selectOption(level);
    await expect(select).toBeEnabled();
  }
  await page.reload();
  await expect(page.getByText("技能差距表")).toBeVisible();
  await shot(page, "job", "技能差距表");

  // 學習計畫
  await page.getByRole("button", { name: "產生學習計畫" }).click();
  await page.waitForURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "開始" }).first()).toBeVisible();
  await page.getByRole("button", { name: "開始" }).first().click();
  await expect(page.getByRole("button", { name: "還原", exact: true }).first()).toBeVisible();
  await shot(page, "plan", "週次任務");

  // 面試練習：回答後的評估
  await page.goto("/practice");
  await page.locator("#practice-topic").fill("Docker");
  await page.getByRole("button", { name: "開始練習" }).click();
  await page.waitForURL(/\/practice\/[0-9a-f-]{36}$/);
  await page.getByLabel("你的回答").fill("Docker 用 image 打包應用程式與相依套件，container 是 image 的執行實例，彼此共用主機核心但有獨立的檔案系統與網路命名空間。");
  await page.getByRole("button", { name: "送出回答" }).click();
  await expect(page.getByText("答對的部分")).toBeVisible();
  await shot(page, "practice", "Feedback");

  // Dashboard（有進度之後再拍）
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "dashboard");

});
