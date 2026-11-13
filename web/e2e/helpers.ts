import { expect, type Page } from "@playwright/test";

/** 本機示範模式登入頁的一鍵登入 */
export async function loginAsDemo(page: Page, who: "A" | "B" = "A"): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: `以示範使用者 ${who}登入` }).click();
  await page.waitForURL("/");
}

/** 用 Email 註冊一個新帳號（每次不同的 Email） */
export async function registerUser(page: Page, prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "註冊" }).click();
  await page.getByLabel("顯示名稱").fill(prefix);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("密碼").fill("correct-horse-9");
  await page.getByRole("button", { name: "建立帳號" }).click();
  await page.waitForURL("/");
  return email;
}

/** 到某個主題的知識頁；還沒有、或只是其他頁面建立的 stub，就用 AI（mock）建立 */
export async function ensureKnowledgePage(page: Page, topic: string, slug: string): Promise<void> {
  await page.goto(`/knowledge?q=${encodeURIComponent(topic)}`);
  const generate = page.getByRole("button", { name: new RegExp(`用 AI 建立「${topic}」知識頁`) });
  if (await generate.count()) {
    await generate.click();
    await page.waitForURL(new RegExp(`/knowledge/${slug}$`));
  } else {
    await page.goto(`/knowledge/${slug}`);
    // stub（例如職缺分析建立的技能節點）在知識頁上才有建立按鈕
    if (await generate.count()) await generate.click();
  }
  await expect(page.getByRole("heading", { name: "快速理解" })).toBeVisible();
}

/** 新增一份職缺並等 AI（mock）分析完成，回傳職缺頁網址 */
export async function createAnalyzedJob(
  page: Page,
  title = "Junior Full-Stack Engineer",
  content: { description: string[]; preferred: string } = {
    description: ["使用 React / Next.js 開發前端", "使用 Node.js 建立 API", "操作 PostgreSQL", "使用 Git 進行版本控制", "了解 Docker 與雲端部署"],
    preferred: "AWS 經驗、單元測試",
  },
): Promise<string> {
  await page.goto("/jobs/new");
  await page.getByLabel(/職缺名稱/).fill(title);
  await page.getByLabel(/公司名稱/).fill("範例公司");
  await page.getByLabel(/工作內容/).fill(content.description.join("\n"));
  await page.getByLabel(/加分技能/).fill(content.preferred);
  await page.getByRole("button", { name: /儲存並用 AI 分析/ }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  await expect(page.getByText("技能差距表")).toBeVisible();
  return page.url();
}
