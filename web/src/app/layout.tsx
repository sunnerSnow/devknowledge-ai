import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DevKnowledge AI", template: "%s｜DevKnowledge AI" },
  description: "從技術名詞建立知識地圖，從真實職缺補足工程師技能。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
