import { expect, test } from "@playwright/test";
import { createAnalyzedJob, loginAsDemo } from "./helpers";

test.describe("學習路線（Day 制）", () => {
  test("職缺 → 診斷 → 依診斷排課 → 建立這課的知識頁 → 小測驗全對 → 路線完成", async ({ page }) => {
    await loginAsDemo(page, "B");
    // mock 職缺分析只會挑出 Docker 與 AWS
    await createAnalyzedJob(page, "AI Infrastructure Engineer", { description: ["使用 Docker 封裝推論服務", "在 AWS 上部署"], preferred: "無" });

    // 不用先自評就能產生；預設先診斷
    await page.getByLabel("剩餘天數").fill("3");
    await page.getByLabel("每天分鐘數").fill("90");
    await expect(page.getByLabel("先做程度診斷（建議）")).toBeChecked();
    await page.getByRole("button", { name: "產生學習路線" }).click();
    await page.waitForURL(/\/routes\/[0-9a-f-]{36}$/);

    // 診斷：Docker 答到重點，AWS 不知道
    await expect(page.getByRole("heading", { name: "Diagnosis" })).toBeVisible();
    await page.locator("#diagnosis-0").fill("Docker 是容器，把程式和環境打包");
    await page.locator("#diagnosis-1").fill("不知道");
    await page.locator("#diagnosis-2").fill("Docker 映像檔要固定版本");
    await page.getByRole("button", { name: "交卷，開始診斷" }).click();
    await expect(page.getByText("Docker：掌握基礎")).toBeVisible();
    await expect(page.getByText("AWS：尚未掌握")).toBeVisible();
    await expect(page.getByText("觀念修正").first()).toBeVisible();

    // 排課：掌握基礎的 Docker 略過，只排 AWS
    await page.getByRole("button", { name: "依診斷結果排課" }).click();
    await expect(page.getByText("目前這課・DAY 01・第 1 / 1 課")).toBeVisible();
    const routeUrl = page.url();

    // 進到這課：AWS 若還是 stub 就先建立（保留路線脈絡）
    await page.getByRole("link", { name: /開始這課/ }).click();
    await page.waitForURL(/\/knowledge\/aws\?route=/);
    await expect(page.getByText("學習路線・DAY 01・第 1 / 1 課")).toBeVisible();
    // 頁面內容到了再判斷（count() 本身不會等）
    const create = page.getByRole("button", { name: /用 AI 建立「AWS」知識頁/ });
    await expect(create.or(page.getByRole("heading", { name: "快速理解" }))).toBeVisible();
    if (await create.count()) {
      await create.click();
      await page.waitForURL(/\/knowledge\/aws\?route=/);
    }
    await expect(page.getByText("學習路線・DAY 01・第 1 / 1 課")).toBeVisible();
    await expect(page.getByRole("heading", { name: "快速理解" })).toBeVisible();

    // 小測驗全對（mock 批改看批改重點的關鍵詞）
    await page.getByLabel(/為什麼很多新創用 AWS/).fill("按用量付費，快速取得或擴充資源；成本或權限要注意");
    await page.getByLabel(/忘了關/).fill("730 小時，要設預算告警或清理");
    await page.getByLabel(/S3 上的檔案/).fill("IAM 角色、短期憑證、最小權限；寫死金鑰會外洩");
    await page.getByLabel(/可用區（AZ）故障/).fill("至少 2 個 AZ、負載平衡器、資料庫 Multi-AZ");
    await page.getByRole("button", { name: /交卷，請 AI 批改/ }).click();
    await expect(page.getByText("全部答對")).toBeVisible();

    await page.getByRole("link", { name: "回到學習路線 →" }).click();
    await page.waitForURL(routeUrl);
    await expect(page.getByText("全部課程都通過了")).toBeVisible();

    // 列表頁
    await page.goto("/routes");
    await expect(page.getByText("1 / 1 課通過")).toBeVisible();
  });
});
