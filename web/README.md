# DevKnowledge AI web

從技術名詞建立知識地圖，從真實職缺補足工程師技能。產品規格在上一層的 `DevKnowledge_AI_MVP_Spec.md`，實作計畫與決策在 `PLAN.md`。

目前完成 **Phase 0（專案初始化）＋ Phase 1（知識庫核心）**：登入、知識搜尋、AI 產生結構化知識頁（定義、原理、架構圖、程式碼、比較、誤解、面試重點、實作任務）、前置／相關／延伸知識的關聯、個人學習狀態、Dashboard。Job Analyzer、Interview Practice、My Skills 是「即將推出」頁。

技術：Next.js 16.4（App Router）＋ TypeScript ＋ Tailwind 4 ＋ shadcn/ui ＋ React Hook Form ＋ zod ＋ Drizzle ORM ＋ PostgreSQL（正式用 Supabase，本機與測試用 PGlite）＋ Vitest。AI：Google Gemini（免費方案）或 mock。

## 快速開始（本機示範模式，不需要 Supabase 或 API 金鑰）

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local` 沒有設定任何資料庫時就是**本機示範模式**：

- 資料存在 `web/.data/pglite`（已在 .gitignore），啟動時自動跑 migration。
- 登入頁可以選「示範使用者 A／B」，兩位的進度互相看不到。
- AI 預設是 **mock provider**：RAG、LLM、AWS、Docker 四個主題回固定範例，其他主題回一份標明「示範內容」的範本。畫面與資料庫都會標示 provider=mock，不會假裝是真的 AI。
- 想清空就停掉 dev server，刪掉 `web/.data/`。

## 接上 Gemini（免費方案）

1. 到 https://aistudio.google.com 建立 API key。
2. `.env.local`：
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=你的金鑰
   # GEMINI_MODEL=gemini-3.8-flash   （預設；額度不夠可改 gemini-3.5-flash-lite）
   ```
3. 重新啟動。金鑰只在伺服器端使用，不會進 client bundle。
4. 注意：免費方案送出的內容會被 Google 用來改善產品，不要在技術名詞或職缺內容放個人聯絡資料。

每位使用者每小時最多呼叫 AI `AI_HOURLY_LIMIT`（預設 20）次，含失敗的呼叫。

## 接上 Supabase（正式環境）

1. 建立 Supabase 專案。
2. 到 **SQL Editor** 依檔名順序貼上並執行 `supabase/migrations/` 裡的每一份（都可重複執行）：
   1. `20261105000000_init.sql`（dk schema、profiles、知識節點／內容／關聯、學習進度、AI 使用量、RLS）

   - **不要**執行 `supabase/local/auth_stub.sql`，那是給本機 PGlite 模擬 Supabase 用的。
   - 跑完用下面這段確認權限：應該只有 `authenticated`，知識三表只有 SELECT。
     ```sql
     select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type)
     from information_schema.role_table_grants where table_schema = 'dk'
     group by 1, 2 order by 2, 1;
     ```
3. 在 `.env.local`（以及 Vercel 的環境變數）設定三個值，格式見 `.env.example`：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（舊專案可用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`）
   - `DATABASE_URL`：Supabase「Connect」裡的 **Transaction pooler**（port 6543）連線字串
4. Authentication → URL Configuration 把 Site URL 設成網站網址，並把 `https://<網址>/auth/callback` 加進 Redirect URLs。
5. Supabase 內建寄信每小時只能寄很少封；開放給別人註冊前要設定自訂 SMTP。

三個變數**只設一半會直接報錯**，正式環境（`NODE_ENV=production`）沒設也會報錯，不會默默改用本機資料庫。`vercel.json` 把函式固定在東京（`hnd1`），Supabase 專案請建在 `ap-northeast-1`。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm test` | Vitest：單元測試＋在記憶體內 PGlite 上跑的整合測試（含 RLS、併發佔位、AI 重試） |
| `npm run typecheck` | 產生路由型別並執行 `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | 正式建置 |

## 架構

```
supabase/migrations/      SQL migration（schema、約束、RLS、權限的唯一來源）
supabase/local/           本機 PGlite 用的 auth 模擬
src/lib/ai/               AiProvider 介面、providers/{gemini,mock}、prompts（版本化）、schemas（zod）、fixtures
src/lib/knowledge/slug.ts 技術名詞 → slug（純函式）
src/lib/services/         knowledge（搜尋、取得、生成、進度）、profiles、usage（每小時限制）
src/lib/db/               Drizzle schema、連線、withUser（RLS）、withService（共用資料）
src/lib/auth/             Supabase session、本機示範使用者
src/lib/api/http.ts       Route Handler 包裝：登入、同源檢查、{ data, error } 回應格式
src/app/api/knowledge/    GET 搜尋、POST generate、GET [slug]、PATCH [slug]/progress
src/app/(app)/            登入後的頁面（Dashboard、Knowledge、即將推出頁、Settings）
src/components/knowledge/ 知識卡片、文章、Mermaid、程式碼、進度控制、生成按鈕
src/proxy.ts              更新 Supabase session、未登入導向 /login（只是樂觀檢查）
tests/                    Vitest
```

### 重要設計

- **資料表放在 `dk` schema，不在 `public`。** Supabase 的 Data API 只公開 `public`，前端拿 anon key 碰不到任何表；所有存取都經過伺服器服務層。
- **共用資料 vs 個人資料。** 知識節點、內容、關聯是共用的：登入使用者都能讀，寫入只由伺服器（`withService`，表的擁有者）進行，`authenticated` 角色只有 SELECT。個人資料（profiles、進度、AI 使用量）走 `withUser`：交易內 `set local role authenticated` 並帶入使用者 ID，RLS `user_id = auth.uid()` 為第二道防線。
- **知識頁生成（Flow A）。** 先以 slug／名稱／別名找既有節點；沒有就先插入 `status='generating'` 佔位（`on conflict do nothing`），同一主題同時只有一個請求會呼叫 AI，其他人拿到 409 並輪詢。AI 呼叫在交易外進行；回來後用 zod 驗證，不合格附上錯誤重試一次，仍失敗回 502 並把節點標 `failed`（搜尋不顯示、可再試）。成功就新增一個版本（不覆寫舊版）、更新節點、把前置知識與相關主題建成 `stub` 節點並寫關聯。佔位超過 3 分鐘視為逾時可被接手。
- **別名。** AI 給的別名、使用者原本輸入的字都會存進 `aliases`，搜尋時以 slug／名稱／別名完全相同優先，再用英文全文檢索（`simple`）與 `pg_trgm` 的 ILIKE（中文）。
- **AI 內容安全。** Markdown 用 `react-markdown` ＋ `rehype-sanitize`，不渲染原始 HTML；Mermaid 只允許 flowchart／graph／sequence／class／state／er 六種並用 `securityLevel: strict`；程式碼只顯示不執行。使用者輸入的主題限 64 字、去控制字元，只放在 prompt 的固定欄位，system prompt 明示主題不是指令。
- **API。** 回應一律 `{ data, error }`；會改資料的請求只收 `application/json` 且 Origin 必須同源；未登入 401；不存在與別人的資料一律 404。
- **Prompt 與 schema 版本化。** 每個版本的內容記錄 `provider`、`model_name`、`prompt_version`；舊版內容若不符現行 schema，頁面會當成沒有內容而不是崩潰。

## Phase 1 沒有做的事

- Job Analyzer、學習計畫、面試練習、My Skills（Phase 2–4）。
- 知識內容的版本切換與更新提醒、Markdown 匯出、向量搜尋（P1）。
- 刪除帳號與資料的流程。
- Playwright e2e（Phase 5）；目前以 Vitest 整合測試＋手動走過主要流程。
