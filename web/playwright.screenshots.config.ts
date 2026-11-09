import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * README 用的畫面截圖：沿用 e2e 的伺服器設定（本機示範模式、mock AI），
 * 只跑 scripts/screenshots/ 底下的腳本，輸出到 ../docs/screenshots/。
 *
 *   npm run screenshots
 */
export default defineConfig({
  ...base,
  testDir: "./scripts/screenshots",
  timeout: 180_000,
  reporter: [["list"]],
  use: { ...base.use, trace: "off", screenshot: "off" },
  // project 層的 use 會蓋過上面的 use，所以視窗大小與 2 倍解析度要放在這裡
  projects: base.projects?.map((p) => ({ ...p, use: { ...p.use, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } })),
});
