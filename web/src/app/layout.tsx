import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DevKnowledge AI", template: "%s｜DevKnowledge AI" },
  description: "從技術名詞建立知識地圖，從真實職缺補足工程師技能。",
};

/*
 * 字體用瀏覽器端載入的 Google Fonts，而不是 next/font：
 * next/font 會在 build 時下載字體檔，開發機連不到 fonts.gstatic.com 時 build 會失敗。
 * no-page-custom-font 這條規則只適用 pages 目錄；App Router 的根 layout 放在這裡所有頁面都會載到。
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
