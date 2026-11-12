import { expect, test } from "@playwright/test";
import { ensureKnowledgePage, loginAsDemo } from "./helpers";

test.describe("知識庫（Flow A）", () => {
  test("搜尋不到就用 AI 建立；再搜尋會找到既有頁面；可更新學習狀態", async ({ page }) => {
    await loginAsDemo(page, "A");

    await page.goto("/knowledge?q=RAG");
    await page.getByRole("button", { name: /用 AI 建立「RAG」知識頁/ }).click();
    await page.waitForURL(/\/knowledge\/rag$/);
    await expect(page.getByRole("heading", { name: "快速理解" })).toBeVisible();
    await expect(page.getByText("面試 30 秒怎麼答")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/RAG/i);

    // 學習狀態：畫面先樂觀更新，要等這次存檔的 server action 回應再重新整理，否則 reload 會中斷還沒寫入的請求。
    // 同一頁的瀏覽紀錄（ViewTracker）也是 POST 到同一個網址，所以用請求內容裡的狀態值辨認
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes('"learning"'));
    await page.getByRole("radio", { name: "學習中" }).click();
    await expect(page.getByRole("radio", { name: "學習中" })).toHaveAttribute("aria-checked", "true");
    await saved;
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
    await expect(page.getByRole("radio", { name: "學習中" })).toHaveAttribute("aria-checked", "false");
  });

  test("小測驗：交卷後逐題批改；答錯有觀念修正；全對後由自己標記已理解", async ({ page }) => {
    await loginAsDemo(page, "A");
    await ensureKnowledgePage(page, "Docker", "docker");
    await expect(page.getByRole("heading", { name: "小測驗" })).toBeVisible();

    // 第一次：一題答對、其他不會
    await page.getByLabel(/Docker 解決的是什麼問題/).fill("解決環境不一致的問題；它不是虛擬機，容器共用主機核心。");
    await page.getByLabel(/映像檔（image）和容器（container）的差別/).fill("不知道");
    await page.getByRole("button", { name: /交卷，請 AI 批改/ }).click();
    await expect(page.getByText("觀念修正").first()).toBeVisible();
    await expect(page.getByText("不知道", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "標記為已理解" })).toHaveCount(0);

    // 重新整理後仍看得到上一次的批改
    await page.reload();
    await expect(page.getByText("觀念修正").first()).toBeVisible();

    // 再測一次：全部答對
    await page.getByRole("button", { name: "再測一次" }).click();
    await page.getByLabel(/Docker 解決的是什麼問題/).fill("解決環境不一致的問題；它不是虛擬機，容器共用主機核心。");
    await page.getByLabel(/映像檔（image）和容器（container）的差別/).fill("容器是執行實例，比映像檔多一層可寫層。");
    await page.getByLabel(/資料庫的資料不見了/).fill("資料要放在 volume 才能持久化。");
    await page.getByLabel(/讓它變小的做法/).fill("用多階段建置，再加上 .dockerignore。");
    await page.getByRole("button", { name: /交卷，請 AI 批改/ }).click();
    await expect(page.getByText("全部答對")).toBeVisible();

    await page.getByRole("button", { name: "標記為已理解" }).click();
    await expect(page.getByRole("radio", { name: "已理解" })).toHaveAttribute("aria-checked", "true");
  });
});
