import { expect, test } from "@playwright/test";
import { createAnalyzedJob, loginAsDemo } from "./helpers";

test.describe("使用者資料隔離（規格 13 節 Security）", () => {
  test("B 看不到、改不了 A 的職缺與計畫", async ({ browser }) => {
    const a = await browser.newContext();
    const pageA = await a.newPage();
    await loginAsDemo(pageA, "A");
    const jobUrl = await createAnalyzedJob(pageA, "A 的職缺");
    const jobId = jobUrl.split("/").pop()!;
    await a.close();

    const b = await browser.newContext();
    const pageB = await b.newPage();
    await loginAsDemo(pageB, "B");

    // 頁面：404
    await pageB.goto(`/jobs/${jobId}`);
    await expect(pageB.getByText("找不到這個頁面")).toBeVisible();

    // API：讀、改、刪都是 404，列表裡也沒有
    const read = await pageB.request.get(`/api/jobs/${jobId}`);
    expect(read.status()).toBe(404);
    // body 是合法的部分更新，所以 404 只會來自「不是你的職缺」
    const patch = await pageB.request.patch(`/api/jobs/${jobId}`, { data: { title: "改掉" }, headers: { "content-type": "application/json" } });
    expect(patch.status()).toBe(404);
    const del = await pageB.request.delete(`/api/jobs/${jobId}`);
    expect(del.status()).toBe(404);
    const list = await pageB.request.get("/api/jobs");
    expect(JSON.stringify((await list.json()).data)).not.toContain(jobId);
    await b.close();
  });

  test("跨站請求被拒絕", async ({ page }) => {
    await loginAsDemo(page, "A");
    const res = await page.request.post("/api/knowledge/generate", {
      data: { topic: "Docker" },
      headers: { "content-type": "application/json", origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden_origin");
  });
});
