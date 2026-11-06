# DevKnowledge AI web

從技術名詞建立知識地圖，從真實職缺補足工程師技能。產品規格在上一層的 `DevKnowledge_AI_MVP_Spec.md`，實作計畫與決策在 `PLAN.md`。

目前完成 **Phase 0（專案初始化）＋ Phase 1（知識庫核心）**：登入、知識搜尋、AI 產生結構化知識頁（定義、原理、架構圖、程式碼、比較、誤解、面試重點、實作任務）、前置／相關／延伸知識的關聯、個人學習狀態、Dashboard。Job Analyzer、Interview Practice、My Skills 是「即將推出」頁。

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
- 目前**不強制驗證 Email**（沒有寄信服務），也還沒有忘記密碼；接 Resend 之類的服務後再開。
- 每個頁面、API 與 Server Action 都自己檢查 session；`src/proxy.ts` 只看有沒有 cookie 做樂觀導向。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm test` | Vitest：單元測試＋在記憶體內 PGlite 上跑的整合測試（含 RLS、併發佔位、AI 重試） |
| `npm run typecheck` | 產生路由型別並執行 `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | 正式建置 |
| `npm run db:migrate` | 對 `DATABASE_URL_UNPOOLED`（或 `DATABASE_URL`）依序執行 `db/migrations/*.sql` |

## 架構

```
db/migrations/            SQL migration（schema、約束、RLS、權限的唯一來源）；本機 PGlite 啟動時自動執行
scripts/migrate.ts        npm run db:migrate
src/lib/ai/               AiProvider 介面、providers/{gemini,mock}、prompts（版本化）、schemas（zod）、fixtures
src/lib/knowledge/slug.ts 技術名詞 → slug（純函式）
src/lib/services/         knowledge（搜尋、取得、生成、進度）、profiles、usage（每小時限制）
src/lib/db/               Drizzle schema（dk 與 auth）、連線、withUser（RLS）、withService（共用資料）
src/lib/auth/             Better Auth 設定、session、本機示範使用者
src/lib/api/http.ts       Route Handler 包裝：登入、同源檢查、{ data, error } 回應格式
src/app/api/auth/         Better Auth 端點
src/app/api/knowledge/    GET 搜尋、POST generate、GET [slug]、PATCH [slug]/progress
src/app/(app)/            登入後的頁面（Dashboard、Knowledge、即將推出頁、Settings）
src/components/knowledge/ 知識卡片、文章、Mermaid、程式碼、進度控制、生成按鈕
src/proxy.ts              未登入導向 /login（只是樂觀檢查）
tests/                    Vitest
```

### 視覺

參考 ztdn.net：暖灰底＋細顆粒紋理、近乎單色、直角、字距略寬、留白大；主要 CTA 是黑底＋虛線分隔＋箭頭（`CtaButton`），區塊標題是「中文小標＋英文大標」（`PageHeader`／`SectionHeader`），顏色只用在進度標籤與登入頁／Dashboard 的漸層色塊。token 都在 `src/app/globals.css`。

### 重要設計

- **資料表放在 `dk` 與 `auth` schema，不在 `public`；所有存取都經過伺服器服務層。** `authenticated` 角色對 `auth` schema 完全沒有權限。
- **共用資料 vs 個人資料。** 知識節點、內容、關聯是共用的：登入使用者都能讀，寫入只由伺服器（`withService`，表的擁有者）進行，`authenticated` 角色只有 SELECT。個人資料（profiles、進度、AI 使用量）走 `withUser`：交易內 `set local role authenticated` 並帶入使用者 ID，RLS `user_id = auth.uid()` 為第二道防線。
- **知識頁生成（Flow A）。** 先以 slug／名稱／別名找既有節點；沒有就先插入 `status='generating'` 佔位（`on conflict do nothing`），同一主題同時只有一個請求會呼叫 AI，其他人拿到 409 並輪詢。AI 呼叫在交易外進行；回來後用 zod 驗證，不合格附上錯誤重試一次，仍失敗回 502 並把節點標 `failed`（搜尋不顯示、可再試；stub 維持 stub）。成功就新增一個版本（不覆寫舊版）、更新節點、把前置知識與相關主題建成 `stub` 節點並寫關聯。佔位超過 5 分鐘視為逾時可被接手；儲存與釋放都核對自己的佔位 token，被接手的一方不會寫入。使用量檢查與佔位在同一交易（advisory lock），並發也不能超過每小時上限。
- **別名。** AI 給的別名、使用者原本輸入的字都會存進 `aliases`，搜尋時以 slug／名稱／別名完全相同優先，再用英文全文檢索（`simple`）與 `pg_trgm` 的 ILIKE（中文）。
- **AI 內容安全。** Markdown 用 `react-markdown` ＋ `rehype-sanitize`，不渲染原始 HTML；Mermaid 只允許 flowchart／graph／sequence／class／state／er 六種並用 `securityLevel: strict`；程式碼只顯示不執行。使用者輸入的主題限 64 字、去控制字元，只放在 prompt 的固定欄位，system prompt 明示主題不是指令。
- **API。** 回應一律 `{ data, error }`；會改資料的請求只收 `application/json` 且 Origin 必須同源；未登入 401；不存在與別人的資料一律 404。
- **Prompt 與 schema 版本化。** 每個版本的內容記錄 `provider`、`model_name`、`prompt_version`；舊版內容若不符現行 schema，頁面會當成沒有內容而不是崩潰。

## Phase 1 沒有做的事

- Job Analyzer、學習計畫、面試練習、My Skills（Phase 2–4）。
- 知識內容的版本切換與更新提醒、Markdown 匯出、向量搜尋（P1）。
- 刪除帳號與資料的流程。
- Playwright e2e（Phase 5）；目前以 Vitest 整合測試＋手動走過主要流程。
