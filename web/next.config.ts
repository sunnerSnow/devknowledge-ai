import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 頁面都是登入後的個人資料（進度、職缺、練習），沒有可共用的快取；讀 cookie 的頁面自然是動態頁。
  cacheComponents: false,
  // PGlite 會在執行時載入 WASM 與資料檔，postgres 是原生 TCP 驅動，都不要被打包
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  turbopack: {
    // 使用者家目錄有一份無關的 package-lock.json，明確指定專案根目錄
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
