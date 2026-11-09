import { defineConfig, devices } from "@playwright/test";

/**
 * e2e：對本機示範模式（PGlite 記憶體、mock AI、沒有寄信服務）跑主要使用流程。
 * 每次執行都是全新的資料庫，示範使用者 A／B 由 Better Auth 在啟動時建立。
 *
 *   npm run test:e2e
 *
 * 瀏覽器預設用本機安裝的 Chrome（channel=chrome）；沒有 Chrome 時先 `npx playwright install chromium`，
 * 再以 PW_CHANNEL=chromium 執行。
 */
const PORT = 3400;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // 測試彼此共用同一個伺服器與資料庫，依序跑比較好追
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "zh-TW",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || "chrome" } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    // 空字串會蓋掉 .env.local 裡的值（Next 不會覆寫已存在的環境變數），確保跑在本機示範模式
    env: {
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      BETTER_AUTH_SECRET: "",
      BETTER_AUTH_URL: "",
      PGLITE_DATA_DIR: "memory://",
      AI_PROVIDER: "mock",
      GEMINI_API_KEY: "",
      MAIL_PROVIDER: "none",
      AUTH_REQUIRE_EMAIL_VERIFICATION: "",
    },
  },
});
