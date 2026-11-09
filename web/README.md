# DevKnowledge AI web

從技術名詞建立知識地圖，從真實職缺補足工程師技能。產品規格在上一層的 `DevKnowledge_AI_MVP_Spec.md`；設計與實作決策記在本檔「架構」與「視覺」兩節，品牌規範在 `../docs/brand-guidelines.md`。

目前完成 **Phase 0（專案初始化）＋ Phase 1（知識庫核心）＋ Phase 2（職缺分析）＋ Phase 3（學習計畫）＋ Phase 4（面試練習）**：登入、知識搜尋、AI 產生結構化知識頁（定義、原理、架構圖、程式碼、比較、誤解、面試重點、實作任務）、前置／相關／延伸知識的關聯、個人學習狀態、Dashboard；貼上職缺 → AI 拆解成標準化技能需求（必要／加分、建議等級、重要性、理由）→ 逐項自評 → 可解釋的差距與優先順序；技能地圖（My Skills）；依差距與每週時數產生週學習計畫，任務開始／完成／略過並回寫知識進度；依職缺技能一次一題的面試練習（概念／情境／架構／程式題），AI 依四個維度評估並給參考回答與相關知識，使用者確認程度後才寫進技能等級，低分與標記的題目進複習清單。

技術：Next.js 16.4（App Router）＋ TypeScript ＋ Tailwind 4 ＋ shadcn/ui ＋ React Hook Form ＋ zod ＋ Drizzle ORM ＋ PostgreSQL（正式用 Neon，本機與測試用 PGlite）＋ Better Auth ＋ Vitest。AI：Google Gemini（免費方案）或 mock。

## 快速開始（本機示範模式，不需要資料庫或 API 金鑰）

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local` 沒有設定 `DATABASE_URL` 時就是**本機示範模式**：

- 資料存在 `web/.data/pglite`（已在 .gitignore），啟動時自動跑 migration。
- 登入頁可以一鍵以「示範使用者 A／B」登入（啟動時自動建好的帳號），兩位的進度互相看不到；也可以用 Email 註冊。
- AI 預設是 **mock provider**：RAG、LLM、AWS、Docker 四個主題回固定範例，其他主題回一份標明「示範內容」的範本。畫面與資料庫都會標示 provider=mock，不會假裝是真的 AI。
- 想清空就停掉 dev server，刪掉 `web/.data/`。

## 接上 Gemini（免費方案）

1. 到 https://aistudio.google.com 建立 API key。
2. `.env.local`：
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=你的金鑰
   # GEMINI_MODEL=gemini-3.6-flash            （預設；實測約 12 秒生成一頁）
   # GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite（主要模型 503 過載時改用；空字串表示不換）
   # GEMINI_THINKING=low                      （minimal／low／medium／high）
   ```
3. 重新啟動。金鑰只在伺服器端使用，不會進 client bundle。
4. 注意：免費方案送出的內容會被 Google 用來改善產品，不要在技術名詞或職缺內容放個人聯絡資料。

每位使用者每小時最多呼叫 AI `AI_HOURLY_LIMIT`（預設 20）次，全站每 24 小時最多 `AI_DAILY_LIMIT`（預設 200，0 表示不限）次，都含失敗的呼叫。已生成的知識頁存在資料庫，再次搜尋不會重新呼叫 AI；只有按「重新生成」才會。免費方案常遇到 503「model high demand」：provider 會退避重試一次，再不行就換備用模型；整個生成（含格式錯誤重試）總預算 110 秒。

想確認金鑰與模型真的能用：`GEMINI_LIVE=1 npx vitest run tests/gemini-live.test.ts`（會用額度；平常 `npm test` 會略過這支）。

## 接上 Neon（正式環境）

1. 在 https://console.neon.tech 建立專案（免費方案）。目前的專案在 `ap-southeast-1`（新加坡），所以 `vercel.json` 把函式固定在 `sin1`；換區域時要一起改。
2. 從 Neon 的 **Connect** 取兩個連線字串，寫進 `.env.local`（格式見 `.env.example`）：
   - `DATABASE_URL`：**pooled**（主機名稱含 `-pooler`），給應用程式用。
   - `DATABASE_URL_UNPOOLED`：**direct**（不含 `-pooler`），只給 migration 用。
   - `BETTER_AUTH_SECRET`：至少 32 個隨機字元（`openssl rand -base64 32`）。
   - 部署時另外設 `BETTER_AUTH_URL=https://<網址>`。
3. 跑 migration（每份都可重複執行；會列出 `authenticated` 的表權限供確認）：
   ```bash
   npm run db:migrate
   ```
   也可以到 Neon 的 SQL Editor 依檔名順序貼 `db/migrations/` 裡的檔案。
4. `npm run dev` 後用 Email 註冊即可；本機示範使用者的按鈕只在沒有 `DATABASE_URL` 時出現。

正式環境（`NODE_ENV=production`）沒設 `DATABASE_URL` 會直接報錯，不會默默改用本機資料庫。注意 Neon 控制台「Connect」匯出的名稱是 `DATABASE_URL`（direct）與 `DATABASE_URL_POOLED`（pooled），跟這個專案的用法相反，貼進 `.env.local` 時請對調。

Neon 免費方案的 compute 閒置 5 分鐘會休眠，之後第一個請求多約半秒到一秒；pooled 連線是 PgBouncer transaction mode，程式已關閉 prepared statements，`withUser` 的 `set local role` 與 `set_config(..., true)` 都在交易內，相容。

### 登入（Better Auth）

- Email＋密碼，使用者、session、帳號表在 Postgres 的 `auth` schema（`db/migrations/20261104000000_auth.sql`），id 是 uuid，`dk.profiles.id` 直接引用。
- session 存資料庫，cookie 只放 token（httpOnly、SameSite=Lax、正式環境 Secure）。
- 忘記密碼（`/forgot-password` → 信裡的 `/reset-password?token=…`）與 Email 驗證（註冊時寄信，`/verify-email?token=…`）要有寄信服務：`MAIL_PROVIDER=resend` 加 `RESEND_API_KEY`（Resend 免費方案；沒驗證自己的網域時寄件者只能是 `onboarding@resend.dev`，而且只能寄給 Resend 帳號本人的信箱——單人使用剛好夠）。開發模式沒設時是 `log`，整封信印在伺服器日誌；正式環境沒設時是 `none`，登入頁會說明這兩個功能未開放。
- 連結的網址由 `BETTER_AUTH_URL`（或 Vercel 的正式網域）決定，不看請求的 Host 標頭；token 要在頁面上按按鈕才送出，信箱的連結預覽不會把它用掉。重設密碼連結 30 分鐘有效、只能用一次，成功後所有舊 session 失效。
- 預設**不強制驗證 Email**；設 `AUTH_REQUIRE_EMAIL_VERIFICATION=1` 後，註冊會先導到「請收信」提示，未驗證的帳號登入會被擋並重寄驗證信（本機示範模式不強制）。設定頁可重寄驗證信。寄信的動作都有限流（每個 IP／每個 Email／每位使用者）。
- Vercel 預覽部署沒設 `BETTER_AUTH_URL` 時，連結用該次預覽的網址（`VERCEL_URL`）；正式部署用正式網域。
- 每個頁面、API 與 Server Action 都自己檢查 session；`src/proxy.ts` 只看有沒有 cookie 做樂觀導向。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm test` | Vitest：單元測試＋在記憶體內 PGlite 上跑的整合測試（含 RLS、併發佔位、AI 重試） |
| `npm run test:e2e` | Playwright：自動啟動本機示範模式（記憶體 PGlite、mock AI、無寄信）的開發伺服器，走過登入、知識頁生成、職缺分析→計畫→任務、面試練習、使用者隔離與跨站請求；預設用本機 Chrome，沒有就 `npx playwright install chromium` 後設 `PW_CHANNEL=chromium` |
| `npm run db:seed -- <Email>` | 以該使用者身分把四份範例知識頁（RAG、LLM、AWS、Docker）寫進資料庫，不呼叫 AI（會在該使用者名下記 4 次使用量）；可重複執行。本機 PGlite 模式要先停掉 `next dev`，兩個程序同時開同一個資料目錄會壞檔 |
| `npm run typecheck` | 產生路由型別並執行 `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | 正式建置 |
| `npm run db:migrate` | 對 `DATABASE_URL_UNPOOLED`（或 `DATABASE_URL`）依序執行 `db/migrations/*.sql` |
| `npm run auth:reset-password -- <email>` | 忘記密碼時重設（新密碼放環境變數 `NEW_PASSWORD`）；密碼只存雜湊，查不回明文 |

## 架構

```
db/migrations/            SQL migration（schema、約束、RLS、權限的唯一來源）；本機 PGlite 啟動時自動執行
scripts/migrate.ts        npm run db:migrate
scripts/reset-password.ts npm run auth:reset-password
src/lib/ai/               AiProvider 介面、providers/{gemini,mock}、prompts（版本化）、schemas（zod）、fixtures
src/lib/knowledge/slug.ts 技術名詞 → slug（純函式）
src/lib/services/         knowledge（搜尋、取得、生成、進度）、jobs（職缺分析、差距與優先順序）、skills（使用者技能）、plans（學習計畫與任務）、practice（面試練習：出題、評估、複習、確認程度）、profiles、usage、rate-limit
src/lib/skills/levels.ts  技能等級標籤與優先分數（純函式）
src/lib/db/               Drizzle schema（dk 與 auth）、連線、withUser（RLS）、withService（共用資料）
src/lib/auth/             Better Auth 設定、session、本機示範使用者
src/lib/api/http.ts       Route Handler 包裝：登入、同源檢查、{ data, error } 回應格式
src/app/api/auth/         Better Auth 端點
src/app/api/knowledge/    GET 搜尋、POST generate、GET [slug]、PATCH [slug]/progress
src/app/api/jobs/         POST analyze（建立＋分析）、GET 列表、GET／PATCH（可帶 reanalyze）／DELETE [id]
src/app/api/skills/       GET 列表、POST（以名稱 upsert）、PATCH／DELETE [id]
src/app/api/plans/        GET 列表、GET／PATCH（狀態）／DELETE [id]、PATCH [id]/tasks/[taskId]（任務狀態）；POST /api/jobs/[id]/learning-plan 產生
src/app/api/practice/     GET／POST sessions（建立並出第一題）、GET／PATCH（結束）／DELETE [sessionId]、POST [sessionId]/questions（下一題）、POST [sessionId]/answer（評估）、PATCH attempts/[attemptId]（複習、確認程度）
src/app/(app)/            登入後的頁面（Dashboard、Knowledge、即將推出頁、Settings）
src/components/knowledge/ 知識卡片、文章、Mermaid、程式碼、進度控制、生成按鈕
src/proxy.ts              未登入導向 /login（只是樂觀檢查）
tests/                    Vitest
e2e/                      Playwright（playwright.config.ts 會自己啟動伺服器）
```

### 視覺

整頁淡青綠底、深灰細字、青藍色標題與底線連結；白色面板沒有邊框、圓角、陰影（`panel`）；按鈕直角（`Button`／`CtaButton`）；區塊標題是「英文襯線大字＋中文小字」（`PageHeader`／`SectionHeader`）；字距寬、留白大。字體 Noto Sans TC ＋ Cormorant Garamond（英文襯線）。token 與工具類別都在 `src/app/globals.css`。

品牌圖示是兩圈等高線加一個定位點（「知識地圖」），以 `currentColor` 上色：`BrandMark`／`Brand`（`src/components/brand.tsx`）；`src/app/icon.svg`、`favicon.ico`、`apple-icon.png` 是青藍方塊上的反白版，`opengraph-image.png` 是分享預覽圖。完整的色彩、字體、圖示用法與語氣規範在 `../docs/brand-guidelines.md`，向量檔在 `../docs/brand/`。

### 重要設計

- **資料表放在 `dk` 與 `auth` schema，不在 `public`；所有存取都經過伺服器服務層。** `authenticated` 角色對 `auth` schema 完全沒有權限。
- **共用資料 vs 個人資料。** 知識節點、內容、關聯是共用的：登入使用者都能讀，寫入只由伺服器（`withService`，表的擁有者）進行，`authenticated` 角色只有 SELECT。個人資料（profiles、進度、AI 使用量）走 `withUser`：交易內 `set local role authenticated` 並帶入使用者 ID，RLS `user_id = auth.uid()` 為第二道防線。
- **知識頁生成（Flow A）。** 先以 slug／名稱／別名找既有節點；沒有就先插入 `status='generating'` 佔位（`on conflict do nothing`），同一主題同時只有一個請求會呼叫 AI，其他人拿到 409 並輪詢。AI 呼叫在交易外進行；回來後用 zod 驗證，不合格附上錯誤重試一次，仍失敗回 502 並把節點標 `failed`（搜尋不顯示、可再試；stub 維持 stub）。成功就新增一個版本（不覆寫舊版）、更新節點、把前置知識與相關主題建成 `stub` 節點並寫關聯。佔位超過 5 分鐘視為逾時可被接手；儲存與釋放都核對自己的佔位 token，被接手的一方不會寫入。使用量檢查與佔位在同一交易（advisory lock），並發也不能超過每小時上限。
- **職缺分析（Flow B）。** 職缺與使用者技能分開存：`job_skills` 是 AI 從職缺拆出的需求（必要／加分、建議等級 0–4、重要性、原文用語、理由），`user_skills` 是使用者自己的程度；沒有列＝未評估，不會因為貼了職缺就被當成 0。每個技能以 slug 對應，並盡量連到知識節點（沒有就建 stub）。優先分數＝必要 3／加分 1 × 差距 × 目標權重，頁面同時顯示理由；未評估的技能不算分。重新分析只覆寫 `job_skills`，自評不動。職缺文字視為不可信輸入：限 12000 字、放在分隔區塊裡、system prompt 明示內文不是指令。
- **學習計畫（Phase 3）。** 只用「已評估且有差距」的技能（依優先分數）、使用者每週時數、既有知識頁的實作任務做輸入，AI 排出週任務與可驗證成果；未評估的技能不進計畫。任務 todo／in_progress／completed／skipped；完成「閱讀／測驗／複習」任務把對應知識頁的進度升到已理解、完成「練習／專案」升到已實作，只往上不往下；全部處理完計畫自動標完成。職缺刪除時計畫保留。
- **面試練習（Phase 4）。** 一次只出一題，每次練習最多 10 題；題目難度以職缺要求的等級為準（沒選職缺就比自評高一級）。評估有四個維度（技術正確性、回答完整度、推理與取捨、表達清晰度）各 0–4 分與理由，存平均分；prompt 明講不以長短判斷、不給能力認定，使用者的回答放在分隔區塊並視為資料。AI 分數不會改技能等級，使用者在評估下方自己選的程度才寫進 `user_skills`（evidence_type＝interview_practice）。平均分低於 2.5 或手動標記的作答進複習清單。職缺刪除時練習保留。mock provider 只依回答長度與是否提到技能名稱給分，評估文字會明說這是示範。
- **別名。** AI 給的別名、使用者原本輸入的字都會存進 `aliases`，搜尋時以 slug／名稱／別名完全相同優先，再用英文全文檢索（`simple`）與 `pg_trgm` 的 ILIKE（中文）。
- **AI 內容安全。** Markdown 用 `react-markdown` ＋ `rehype-sanitize`，不渲染原始 HTML；Mermaid 只允許 flowchart／graph／sequence／class／state／er 六種並用 `securityLevel: strict`；程式碼只顯示不執行。使用者輸入的主題限 64 字、去控制字元，只放在 prompt 的固定欄位，system prompt 明示主題不是指令。
- **API。** 回應一律 `{ data, error }`；會改資料的請求只收 `application/json` 且 Origin 必須同源；未登入 401；不存在與別人的資料一律 404。
- **Prompt 與 schema 版本化。** 每個版本的內容記錄 `provider`、`model_name`、`prompt_version`；舊版內容若不符現行 schema，頁面會當成沒有內容而不是崩潰。

## 還沒做的事

- 職缺比較、間隔複習（P1）。
- 規格 4.5「貼上整份職缺先由 AI 拆欄位再確認」改成一次呼叫：貼上後直接分析，事後可編輯並重新分析（省免費額度）。
- 知識內容的版本切換與更新提醒、Markdown 匯出、向量搜尋（P1）。
- 刪除帳號與資料的流程。
