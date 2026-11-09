# DevKnowledge AI 品牌規範 v1.0

> 更新：2026-11-09
> 狀態：定案（品牌圖示、色彩、字體）；語氣章節為第一版，之後依實際文案調整。
> 程式裡的唯一依據是 `web/src/app/globals.css` 的 token 與 `web/src/components/brand.tsx`；本文件是給人看的說明，兩邊不一致時以程式為準並回來修這裡。

## 速查

| 項目 | 值 |
|------|----|
| 品牌名稱 | DevKnowledge AI（英文字標固定這個大小寫與空格；中文不翻譯） |
| 副標 | 工程師的知識地圖 |
| 主色 | 青藍 `#1c7a8f` |
| 底色 | 淡青綠 `#f0f9f9` |
| 文字 | 深灰 `#4e4e4e` |
| 中文／內文字體 | Noto Sans TC 400／500 |
| 英文襯線字體 | Cormorant Garamond 400／500 |
| 圓角 | 0（全站直角） |
| 語氣 | 安靜、具體、不吹噓 |

---

## 1. 品牌圖示

### 1.1 構成與意義

兩圈不規則的等高線加一個定位點。等高線是「地圖」，定位點是「你現在在這裡」；合起來就是產品的副標「工程師的知識地圖」。單色、只有線與點，刻意不帶任何科技感裝飾。

### 1.2 檔案

| 用途 | 檔案 | 說明 |
|------|------|------|
| 元件（網站內） | `web/src/components/brand.tsx` → `BrandMark`、`Brand` | 以 `currentColor` 上色，預設 `text-primary`；青藍底時給 `text-white` 即反白 |
| 單色向量 | `docs/brand/logo-mark.svg` | 青藍實色，透明底 |
| 單色向量（繼承顏色） | `docs/brand/logo-mark-mono.svg` | `currentColor`，嵌進任何顏色的文件用 |
| 方塊版 | `docs/brand/logo-tile.svg`（＝`web/src/app/icon.svg`） | 青藍方塊上的反白圖示，給 favicon／App 圖示 |
| favicon | `web/src/app/favicon.ico` | 16、32 px PNG 封裝 |
| Apple touch icon | `web/src/app/apple-icon.png` | 180×180 |
| 分享預覽圖 | `web/src/app/opengraph-image.png`＋`.alt.txt` | 1200×630 |

圖示的路徑定義在 `BrandMark`；`icon.svg` 是同一組路徑縮放 0.84 放進方塊。**改圖示時兩處要一起改**，並重新產生 favicon、Apple icon 與 OG 圖。

### 1.3 組合方式

| 組合 | 用在哪 | 規格 |
|------|--------|------|
| 水平（預設） | 側欄、登入頁、文件頁首 | 圖示 32 px ＋ 間距 12 px ＋ 兩行字：「DevKnowledge AI」15 px／500／字距 0.1em，「工程師的知識地圖」11 px／字距 0.2em／`--muted-foreground` |
| 只有圖示 | favicon、頭像、很窄的空間 | `<Brand compact />`（目前沒有呼叫端，手機頂欄也用完整版）或 `logo-tile.svg` |
| 直式 | 正方形空間、簡報封面 | 圖示 44 px 置中，字標置中於下方；目前沒有元件，照水平版的字級排 |
| 反白 | 青藍或深色底 | 圖示與字標全部白色，副標白色 75% 不透明度 |

字標一律用 Noto Sans TC；英文襯線字（Cormorant Garamond）只用在頁面標題與 OG 圖的大字，不用在字標上。

### 1.4 留白與最小尺寸

- 留白：圖示四周至少保留一個圖示高度的空間。
- 最小尺寸：只有圖示 16 px（favicon）；水平組合 120 px 寬；印刷 10 mm／35 mm。
- 16 px 以下請用方塊版（`logo-tile.svg`），透明底的線條會糊掉。

### 1.5 可以放的底色

| 底色 | 用哪個版本 |
|------|------------|
| 白 `#ffffff`、淡青綠 `#f0f9f9`、淡青 `#e1f0f0` | 青藍版 |
| 青藍 `#1c7a8f`、深青 `#166a7c`、深灰 | 反白版 |
| 照片、有紋理的底 | 盡量避免；非用不可時放在白色或青藍的方塊裡 |

### 1.6 不要這樣做

- 不改顏色（只有青藍、白、深灰三種）；不加漸層、陰影、外框、透明度。
- 不旋轉、不拉伸、不裁切；不把點移位或加第三圈。
- 不把圖示和字標的相對位置改成其他排法（上下對調、字標壓在圖示上）。
- 不加其他圖形（腦、燈泡、晶片、機器人之類的 AI 慣用符號）。

---

## 2. 色彩

### 2.1 主要色

| 名稱 | Hex | token | 用途 |
|------|-----|-------|------|
| 青藍 | `#1c7a8f` | `--primary` | 標題、連結底線、主要按鈕、品牌圖示、焦點框 |
| 深青 | `#166a7c` | `--primary-strong` | 按鈕 hover |
| 白 | `#ffffff` | `--primary-foreground`／`--card` | 青藍上的文字、面板 |

### 2.2 中性色

| 名稱 | Hex | token | 用途 |
|------|-----|-------|------|
| 淡青綠 | `#f0f9f9` | `--background` | 整頁底色 |
| 淡青 | `#e1f0f0` | `--secondary`／`--muted` | 輸入框底、次要區塊、未學習標籤 |
| 淺青 | `#cee7ea` | `--border`／`--accent` | 分隔線、輸入框邊、已理解標籤 |
| 深灰 | `#4e4e4e` | `--foreground` | 內文 |
| 中灰 | `#666666` | `--muted-foreground` | 說明小字、副標 |
| 程式碼底 | `#35414a` | `--code` | 程式碼區塊 |

### 2.3 狀態色

| 狀態 | Hex | token | 用途 |
|------|-----|-------|------|
| 學習中 | `#f6efd6` | `--soft-yellow` | 進度標籤 |
| 已理解 | `#cee7ea` | `--soft-blue` | 進度標籤 |
| 已實作 | `#1c7a8f` 實底白字 | `--primary` | 進度標籤 |
| 錯誤／刪除 | `#b4453a` | `--destructive` | 錯誤訊息、刪除按鈕 |

沒有獨立的成功色：完成狀態就用青藍。圖表只用 `--chart-1`～`--chart-5`（青藍、深灰、淺青、灰青 `#9fb8bd`、淡青），不靠顏色單獨傳達意義。

### 2.4 對比（WCAG 2.1）

| 組合 | 對比 | 等級 |
|------|------|------|
| 青藍 `#1c7a8f` 在淡青綠 `#f0f9f9` | 4.64:1 | AA（一般文字） |
| 青藍 `#1c7a8f` 在白 | 4.96:1 | AA |
| 白字在青藍 | 4.96:1 | AA |
| 深灰 `#4e4e4e` 在淡青綠 | 7.78:1 | AAA |
| 中灰 `#666666` 在淡青綠 | 5.37:1 | AA |
| 中灰 `#666666` 在白 | 5.74:1 | AA |
| 青藍 `#1c7a8f` 在淡青 `#e1f0f0` | 4.24:1 | 未達 AA |

青藍只剛好過 AA，所以：青藍內文不小於 14 px；青藍的標籤小字（`.section-sub`、英文襯線小標）最小 12 px 並放寬字距；中灰說明字不小於 11 px；不要再把青藍調淺。**青藍文字不要放在淡青 `#e1f0f0` 上**（4.24:1 不到 AA）；淡青底上只放青藍的圖示與線條（非文字元素的 3:1 門檻有過）。

### 2.5 深色模式

`globals.css` 的 `.dark` 區塊有一組深青底（`#16262a`）＋淺青主色（`#5fb6c9`）的 token，尚未細調、也沒有切換機制。啟用前要重新量對比。

---

## 3. 字體

### 3.1 字體組

```css
--font-sans: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Segoe UI", system-ui, sans-serif;
--font-display: "Cormorant Garamond", "Times New Roman", Georgia, serif;
--font-mono: ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
```

Noto Sans TC 只載 400、500、700（700 幾乎不用，標題也是 500）；Cormorant Garamond 載 400、500。字體由瀏覽器端的 Google Fonts 載入（根 layout），不用 `next/font`。

### 3.2 使用規則

| 元素 | 字體 | 大小 | 字重 | 字距 | 備註 |
|------|------|------|------|------|------|
| 頁面標題（英文） | Cormorant Garamond | 28 px（`PageHeader`）／24 px（`SectionHeader`） | 400 | 0.04em | 青藍，`.section-label` |
| 標題下的中文小字 | Noto Sans TC | 14 px（最小 12 px） | 400 | 0.2em | 青藍，`.section-sub`；`SectionHeader` 與首頁用 12 px |
| 內容頁主標（中文） | Noto Sans TC | 30–48 px | 500 | 0.12–0.16em | 知識頁、職缺、計畫、練習的名稱 |
| 區塊標題 | Noto Sans TC | 16–18 px | 500 | 0.1–0.16em | |
| 內文 | Noto Sans TC | 14–16 px | 400 | 0.08em | 行高 1.8–2.0 |
| 說明小字 | Noto Sans TC | 11–12 px | 400 | 0.08–0.2em | `--muted-foreground` |
| 編號、年份、英文小標 | Cormorant Garamond | 依上下文 | 400 | 0.1em | 例如清單編號、側欄導覽的英文行 |
| 程式碼 | mono | 13 px | 400 | 0 | |

原則：中文承載內容、英文襯線當裝飾性的標籤或大字，不混用；全站不用粗體（700）做強調，用 500 或青藍色。

---

## 4. 版面與元件

- **直角**：`--radius: 0`，按鈕、輸入框、面板、標籤都沒有圓角。
- **面板**（`@utility panel`）：白底、沒有邊框、沒有陰影；靠底色差（白對淡青綠）分層。
- **按鈕**：主要＝青藍實底白字，次要＝青藍細框白底，`CtaButton`＝青藍實底＋細箭頭；hover 用深青。
- **輸入框**：淡青底、淺青細框，焦點用 `@utility focus-ring`（青藍 2 px 外框）。
- **連結**：青藍、點狀底線（`@utility dotted-underline`）。
- **留白**：字距寬、行距高、區塊之間留白大；內容區最寬 `max-w-5xl`。
- **導覽**：桌機左側純文字（中文一行＋英文襯線一行），目前頁青藍加底線；手機頂欄＋抽屜。
- **觸控**：焦點框不可移除。可點目標 44×44 px 是目標：輸入框、下拉選單與 `icon-lg` 按鈕已是 44 px 高，其他按鈕尺寸待調。
- **動效**：目標是只做顏色與透明度的短過場（150–200 ms）並尊重 `prefers-reduced-motion`；目前 shadcn 的 Sheet／Dialog／Select／DropdownMenu 仍帶位移與縮放動畫，也還沒有 reduced-motion 處理，待整理。

---

## 5. 語氣

### 5.1 性格

| 特質 | 是 | 不是 |
|------|----|------|
| 安靜 | 說明清楚就停，留白多 | 驚嘆號、表情符號、「超強」「一鍵」 |
| 具體 | 說做了什麼、依據是什麼（「依職缺要求的等級出題」） | 「智慧」「全方位」「賦能」 |
| 誠實 | 標示 AI 產生、附版本與來源、請使用者依官方文件確認 | 把 AI 的分數說成能力認定 |
| 同事口吻 | 像資深同事講話：平實、直接、用「你」 | 老師訓話、客服腔、過度客氣 |

### 5.2 寫法

- 繁體中文為主，技術名詞保留英文原文（RAG、Docker、Kubernetes），不硬翻。
- 中英文、中文與數字之間空一格；全形標點。
- 標題短，句子一個意思；按鈕用動詞（「分析職缺」「開始練習」），不用「提交」「確定」。
- 錯誤訊息說發生什麼、使用者可以怎麼做，不出現程式碼或內部名稱。
- AI 產出一律附「AI 產生，請依官方文件確認」之類的提醒；mock／示範模式要明說是示範。

### 5.3 不同情境

| 情境 | 語氣 | 例 |
|------|------|----|
| 登入頁、首頁 | 平實說明產品做什麼 | 「從一個技術名詞，長出整張技能地圖。」 |
| 功能說明小字 | 一句話講依據 | 「未評估的技能不算分。」 |
| 空狀態 | 告訴下一步 | 「還沒有職缺。貼上一份職缺描述，看看技能差距。」 |
| 錯誤 | 冷靜、可行動 | 「AI 服務暫時忙碌，請稍後再試一次。」 |
| 評估回饋 | 具體指出對與缺，不下評斷 | 「提到了 cache invalidation，但沒說明一致性的取捨。」 |

---

## 6. 檔案與維護

```
docs/
├── brand-guidelines.md      ← 本文件
└── brand/
    ├── logo-mark.svg        青藍，透明底
    ├── logo-mark-mono.svg   currentColor
    └── logo-tile.svg        青藍方塊反白（＝web/src/app/icon.svg）
web/src/app/
├── icon.svg · favicon.ico · apple-icon.png
└── opengraph-image.png · opengraph-image.alt.txt
web/src/components/brand.tsx   BrandMark／Brand
web/src/app/globals.css        所有色彩、字體、間距 token 與 utility
```

改動順序：先改 `globals.css` 或 `brand.tsx` → 跑過畫面與對比 → 回來更新本文件與 `web/README.md` 的「視覺」一節。
