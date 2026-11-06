# DevKnowledge AI — 實作計畫（Phase 0 + Phase 1）

> **進度（2026-11-05）**：Phase 0 ＋ Phase 1 已完成，程式在 `web/`（接續前先讀 `web/README.md`）。
> 25 項 Vitest 測試、typecheck、lint、`next build` 通過；本機示範模式以 Chrome 走過登入→搜尋→AI 建立→標記進度→stub→別名搜尋→手機版。
> 2026-11-05 稍後：Gemini 以真實金鑰實測通過（預設 gemini-3.6-flash、備用 flash-lite）；資料庫決定改用 **Neon**（Supabase 免費版只允許 2 個 active 專案），登入改 **Better Auth**（Email＋密碼，使用者表在 auth schema，RLS 不變），Supabase 相依已移除；`npm run db:migrate` 可對 Neon 跑 migration。Neon 已接上並實測。
> **2026-11-06 已部署**：https://devknowledge-ai.vercel.app（Vercel 專案 devknowledge-ai，Root Directory `web`，函式 sin1；GitHub 整合，push main 自動部署）。Vercel 環境變數：DATABASE_URL（pooled）、BETTER_AUTH_SECRET、BETTER_AUTH_URL、AI_PROVIDER=gemini、GEMINI_API_KEY。正式站走過註冊／登入／登出／生成（Redis，17 秒）。踩坑：Vercel 的值不能帶引號；BETTER_AUTH_URL 與 BETTER_AUTH_SECRET 是兩個變數，漏了 secret 會 500。
> **2026-11-06 稍後**：視覺改版（5a）與 Phase 2 職缺分析（5b）完成。下一步：Phase 3 學習計畫。

> 依據：`DevKnowledge_AI_MVP_Spec.md`（MVP 1.0）第 15 節的要求，先回報現況、第一階段範圍與環境變數，確認後再開發。
> 日期：2026-11-05

---

## 1. Repository 現況

| 項目 | 現況 |
|---|---|
| 專案目錄 | `C:\Users\Uanalyze\Project\DevKnowledge AI\`，只有 spec 一份檔案，沒有任何程式 |
| Git | 目錄本身不是 repo。外層 `Project/` 是一個**沒有任何 commit** 的 repo（分支 master），所有子專案都顯示為 untracked；其他專案（stack、Wealth Blocks、gold-daily）各自是獨立 repo |
| 工具版本 | Node 22.14、npm 10.9、pnpm 10.24 |
| 可沿用的既有架構 | `Project/stack/web/`：Next.js 16.4.2 App Router ＋ TypeScript strict ＋ Tailwind 4 ＋ Drizzle ORM ＋ zod 4 ＋ Vitest 5；資料庫 Supabase（正式）／PGlite（本機示範與測試）雙模式；`withUser` 在交易內 `set local role authenticated` 讓 RLS 生效；整合測試在記憶體 PGlite 上跑含 RLS 的真 Postgres。Wealth Blocks 用同一套（使用者當時同意不裝 shadcn/ui 與 React Hook Form） |

**結論**：是全新專案。建議在 `DevKnowledge AI/` 建立獨立 git repo，程式放在 `web/`（與其他專案一致，Vercel Root Directory 設 `web`）。

---

## 2. 與 spec 的差異與決策點（需使用者確認）

| # | 項目 | Spec 建議 | 我的建議 | 原因 |
|---|---|---|---|---|
| D1 | 資料存取 | Supabase client（`@supabase/supabase-js`）直接存取 | **Drizzle ORM ＋ `DATABASE_URL`，表放在 `dk` schema（不在 public）**，RLS 為第二道防線（STACK 模式）。**2026-11-05 更新：資料庫改 Neon、登入改 Better Auth**（Supabase 免費版 2 個 active 專案的限制已用滿；Neon 是純 Postgres，程式碼不變，只換 Auth） | 可在 PGlite 上寫 RLS 整合測試（spec 第 10 節要求 RLS 必須有測試）；本機免外部服務就能跑完整流程 |
| D2 | UI 元件 | shadcn/ui ＋ React Hook Form | **已定案（2026-11-05）：照 spec 用 shadcn/ui ＋ RHF**，Phase 0 把 shadcn CSS 變數對到 spec 配色 | Phase 2–4 的逐項自評、一次一題作答、職缺欄位確認等表單與互動元件較多 |
| D3 | AI 供應商 | OpenAI API（支援結構化輸出的模型） | **已定案（2026-11-05）：免費優先 → Gemini 免費方案**（預設 `gemini-3.8-flash`，可改 flash-lite）＋ `mock`；做成 `AiProvider` 介面，之後要加 OpenAI／Claude 只需多一個檔案 | 使用者要求免費方案優先。OpenAI 無免費 token；Groq 免費但 TPM 太小。注意：Gemini 免費方案的資料會被 Google 用來改善產品，UI 要提醒不要貼個人聯絡資料 |
| D4 | 子表 user_id | `job_skills`、`learning_tasks`、`practice_questions` 沒有 `user_id` | **加上 `user_id` ＋ `(父 id, user_id)` 複合外鍵** | RLS policy 不用 join 父表、資料庫保證子資料不會掛到別人名下（STACK 模式） |
| D5 | 知識節點狀態 | `status DEFAULT 'published'` | 增加 `'generating'`、`'failed'`、`'stub'` 三種狀態 | 用「先插入 slug 佔位」解決同 slug 併發生成；前置知識／相關技術尚未生成時先建 stub 節點以保存關聯 |
| D6 | 搜尋 | PostgreSQL FTS | FTS（英文）＋ `pg_trgm` ILIKE（中文與別名）＋ aliases GIN | PG 的 FTS 不會切中文詞；PGlite 有 pg_trgm 擴充，本機測試也能跑 |

（D1、D3～D6 若無異議就照建議做；D2 請選。）

---

## 3. 第一階段範圍：Phase 0 ＋ Phase 1

目標：**登入後輸入技術名詞 → 產生／讀取結構化知識頁 → 標記學習狀態**，含關聯知識、RLS 測試、mock provider。Job Analyzer、Practice、Skills 先只有導覽與「即將推出」空狀態頁。

### 3.1 Phase 0 — 專案初始化

- `create-next-app`（Next 16、TypeScript strict、App Router、Tailwind 4、ESLint 9），關閉 `cacheComponents`（全是個人即時資料）。
- Vitest 5、`typecheck` script（`next typegen && tsc --noEmit`）、Prettier。
- 從 STACK 移植並改名：`lib/db/{client,local,with-user,pg-errors}.ts`、`lib/auth/{session,supabase,local-users}.ts`、`lib/api/http.ts`（統一回應 `{ data, error }`，依 spec 第 8 節）、`proxy.ts`（session 更新與未登入導向）。
- 雙模式：`.env.local` 全空 → PGlite 本機示範（示範使用者 A／B）；三個 Supabase 變數要一起設。正式環境沒設直接報錯。
- Migration `0001_init.sql`（可重跑）：`dk` schema、`profiles`、`knowledge_nodes`、`knowledge_contents`、`knowledge_relations`、`user_knowledge_progress`、索引、RLS、權限；`supabase/local/auth_stub.sql` 模擬 `auth.users`／`auth.uid()`。
- 共用 layout：左側導覽（Dashboard、Knowledge、Job Analyzer、Interview Practice、My Skills、Settings）、手機單欄、`loading.tsx`／`error.tsx`／`not-found.tsx`、本機示範提示列。
- 視覺 token（spec 第 11 節配色）寫進 `globals.css` 的 `@theme`。
- 登入／註冊頁（Supabase Auth email ＋ 本機示範使用者）、`/auth/callback`。
- `profiles` 在第一次登入時自動建立（`display_name`、`target_role`、`weekly_learning_minutes`）。

### 3.2 Phase 1 — 知識庫核心

**AI 層（`src/lib/ai/`）**
- `provider.ts`：`AiProvider` 介面 `generateStructured<T>({ system, user, schema, maxOutputTokens, timeoutMs })`。
- `providers/openai.ts`：Responses API，`text.format = json_schema (strict)`，由 zod 4 `z.toJSONSchema()` 產生 schema；逾時 60 s；格式錯誤重試一次。
- `providers/mock.ts`：讀 `fixtures/knowledge/{rag,llm,aws,docker}.json`；不在清單內的主題回傳一份通用範本並標 `caveats`。**絕不假裝成功呼叫**：畫面與 `knowledge_contents.model_name = 'mock'` 都會標示。
- `prompts/knowledge-v1.ts`：spec 7.1 的 system／user prompt，`PROMPT_VERSION = 'knowledge-v1'`。
- `schemas/knowledge.ts`：spec 7.1 JSON 的 zod schema（含長度上限、`mermaid` 只允許 `flowchart`／`graph`／`sequenceDiagram` 開頭）。
- 不可信輸入：使用者輸入的 topic 限 64 字、去除控制字元；只放在 user prompt 的固定欄位。

**服務層（`src/lib/services/knowledge.ts`）**
- `normalizeSlug(topic)`：trim、小寫、空白→`-`、保留中文；同時用 `aliases` 查既有節點。
- `search(q)`：FTS ＋ trgm ＋ aliases；回名稱、分類、摘要、該使用者的進度狀態。
- `getBySlug(slug, userId)`：節點＋最新版 content＋關聯（前置／相關／延伸／替代）＋使用者進度；讀取時更新 `last_viewed_at`。
- `generate(topic, userId, { regenerate })`：
  1. 查既有（slug 或 alias）；有且非 regenerate → 直接回。
  2. 以 `INSERT ... ON CONFLICT (slug) DO NOTHING` 插入 `status='generating'` 佔位；沒插到表示別人正在生成 → 回 409 `generating`，前端輪詢。
  3. 呼叫 provider（在交易外，不長時間持有連線）。
  4. 驗證成功 → 寫 `knowledge_contents`（version = 上一版 +1、`model_name`、`prompt_version`）、更新節點 `name/english_name/category/summary/aliases/status='published'`、對 `prerequisites`／`related_topics` 的每個名稱建立或連到節點（不存在就建 `status='stub'`），寫 `knowledge_relations`（不允許自連）。
  5. 失敗 → 節點標 `failed`（已有舊版內容則維持 published），回可理解錯誤。
- `setProgress(userId, nodeId, status, confidence)`：upsert `user_knowledge_progress`。
- 知識表是共用資料：寫入走 `withService`（不切 authenticated 角色，只有伺服器服務層能呼叫）；個人進度走 `withUser`（RLS 生效）。

**API（`src/app/api/`）**

| Method | Endpoint | 備註 |
|---|---|---|
| GET | `/api/knowledge?query=` | `query` 1–64 字 |
| POST | `/api/knowledge/generate` | body `{ topic, regenerate? }`；每位使用者每小時最多 N 次（先記在 `ai_usage` 表，N 預設 20） |
| GET | `/api/knowledge/[slug]` | spec 寫 `[id]`，頁面用 slug，API 同時接受 UUID 或 slug |
| PATCH | `/api/knowledge/[slug]/progress` | body `{ status, confidence? }` |

全部：登入驗證、zod 驗證、只收 `application/json` ＋ 同源 Origin、回應 `{ data, error }`。

**頁面**
- `/`（Dashboard）：主搜尋框、「分析一份職缺」CTA（Phase 2 前導向說明）、最近瀏覽知識、空狀態示例。
- `/knowledge`：搜尋結果卡片（名稱、分類、摘要、熟悉度）；無結果 → 「使用 AI 建立知識頁」按鈕 → 呼叫 generate，顯示生成中狀態與輪詢。
- `/knowledge/[slug]`：頁首（名稱、英文全名、分類、熟悉度、更新日期、「AI 產生，請依官方文件確認」）；章節導覽；內容區塊依 spec 4.4 的 10 項；Mermaid（client component，`securityLevel: 'strict'`）；Markdown 用 `react-markdown` ＋ `rehype-sanitize`，不渲染 raw HTML；程式碼區塊附語言與複製；側欄：前置知識／相關技術／延伸（stub 節點顯示「尚未生成，點擊建立」）；操作：標記狀態（未學習／學習中／已理解／已實作）、重新生成。Loading／empty／error／success 四態。
- `/jobs/new`、`/practice`、`/skills`、`/settings`：導覽可達的「即將推出」頁（settings 可先改 display_name／target_role）。

**測試（Vitest，記憶體 PGlite）**
- RLS：使用者 A 讀不到、改不了 B 的 `user_knowledge_progress`；`anon` 讀不到任何表。
- `generate`：mock provider 下 RAG/LLM/AWS/Docker 四主題可生成並保存；再次搜尋命中既有頁；併發同 slug 只生成一次；AI 回傳不合 schema 時回錯誤且節點標 failed、頁面不崩潰。
- 關聯：stub 節點建立、自連被拒、唯一約束。
- 搜尋：英文 FTS、中文 ILIKE、alias 命中。
- API：401／400／409 路徑；Origin 檢查。

**完成條件（對應 spec 第 13 節 Knowledge 與 Security）**
- 輸入技術名詞可產生並保存結構化知識頁；再次搜尋可找到；前置／延伸／程式碼可顯示；可更新學習狀態；schema 不符不崩潰；A 無法讀 B；API key 不在 client bundle；未登入 401。

### 3.3 Phase 1 預計新增檔案

```
web/
  package.json, tsconfig.json, next.config.ts, eslint.config.mjs, vitest.config.mts
  .env.example, .gitignore, README.md, vercel.json
  supabase/migrations/20261105000000_init.sql
  supabase/local/auth_stub.sql
  src/proxy.ts
  src/app/globals.css, layout.tsx
  src/app/login/page.tsx, src/app/auth/callback/route.ts
  src/app/(app)/layout.tsx, page.tsx, loading.tsx, error.tsx, not-found.tsx
  src/app/(app)/knowledge/page.tsx
  src/app/(app)/knowledge/[slug]/page.tsx
  src/app/(app)/{jobs/new,practice,skills,settings}/page.tsx   （即將推出／設定）
  src/app/api/knowledge/route.ts
  src/app/api/knowledge/generate/route.ts
  src/app/api/knowledge/[slug]/route.ts
  src/app/api/knowledge/[slug]/progress/route.ts
  src/lib/db/{schema,client,local,with-user,with-service,pg-errors}.ts
  src/lib/auth/{session,supabase,local-users}.ts
  src/lib/api/http.ts
  src/lib/ai/{provider,client}.ts, providers/{openai,mock}.ts, prompts/knowledge-v1.ts, schemas/knowledge.ts, fixtures/knowledge/*.json
  src/lib/services/{knowledge,profiles,usage}.ts
  src/lib/validation/knowledge.ts
  src/components/layout/{app-shell,nav,local-banner}.tsx
  src/components/knowledge/{search-box,knowledge-card,knowledge-article,mermaid-diagram,code-block,progress-control,relations-panel}.tsx
  src/components/ui/{button,input,badge,card,empty-state,skeleton,alert}.tsx
  tests/{rls,knowledge-service,knowledge-schema,search,api-knowledge}.test.ts
```

---

## 4. 資料模型（Phase 1 建的表；之後 Phase 依 spec 第 6 節補）

全部在 `dk` schema。欄位依 spec，差異如下：
- `knowledge_nodes.status`：`published | generating | failed | stub`；加 `search_vector tsvector`（generated column，英文 `simple`）；`aliases` GIN；`name`、`summary`、`aliases` 的 trgm 索引。
- `knowledge_contents`：依 spec；加 `provider TEXT`（`mock`／`openai`）。
- `knowledge_relations`：`CHECK (from_node_id <> to_node_id)`。
- `user_knowledge_progress`：依 spec；RLS `user_id = auth.uid()`。
- `ai_usage`（新增）：`user_id`、`kind`、`created_at`、`model_name`、`input_tokens`、`output_tokens`；用於每小時限制與成本追蹤。
- 權限：`authenticated` 對知識三表只有 SELECT（寫入由伺服器以服務角色進行）；對 `profiles`、`user_knowledge_progress`、`ai_usage` SELECT/INSERT/UPDATE 且 RLS 限本人；`anon` 無任何權限。

Phase 2 起新增 `job_postings`、`job_skills(+user_id)`、`user_skills`；Phase 3 `learning_plans`、`learning_tasks(+user_id)`；Phase 4 `practice_sessions`、`practice_questions(+user_id)`、`practice_attempts`。

---

## 5. 需要你提供的環境變數

**Phase 0／1 開發不需要任何變數**：本機示範模式用 PGlite ＋ mock provider 就能跑完整流程與測試。

要接真 AI 或正式環境時才需要：

| 變數 | 用途 | 何時需要 |
|---|---|---|
| `AI_PROVIDER` | `mock`（預設）或 `gemini` | 接真 AI 時 |
| `GEMINI_API_KEY` | Google AI Studio 金鑰（aistudio.google.com，只在 server 使用） | `AI_PROVIDER=gemini` 時必填 |
| `GEMINI_MODEL` | 預設 `gemini-3.8-flash`（免費方案；可改 `gemini-3.5-flash-lite`） | 選填 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL | 接 Supabase 時三個一起設 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key（舊專案 anon key） | 同上 |
| `DATABASE_URL` | Transaction pooler（6543）連線字串 | 同上 |
| `AI_HOURLY_LIMIT` | 每位使用者每小時生成次數，預設 20 | 選填 |

Supabase 專案可以晚點再建（Phase 1 完成、本機驗證後）；migration 依慣例由你在 SQL Editor 手動跑，我會給檔案路徑與順序。

---

## 5a. 視覺方向（2026-11-06 定案）

- 暖灰底 `#E9E9E4` ＋ SVG 細顆粒紋理（`body::before`，在內容之下，白卡片不受影響）；近乎單色：黑字、白卡片、灰說明。
- 直角（`--radius: 0`）；主要 CTA 是黑底、右側虛線分隔＋箭頭（`components/ui/cta-button.tsx`）；一般按鈕黑底或 outline。
- 字體 Noto Sans TC（瀏覽器端 Google Fonts；next/font 會在 build 時下載，開發機連不到就失敗），標題 500、字距 0.02–0.04em。
- 標題結構：小字中文標籤（`.section-label`）＋大字英文標題（`.section-title`）；導覽英文為主、中文小字在下，目前頁用虛線底線。
- 色彩只用在：進度標籤（未學習灰、學習中黃、已理解藍、已實作黑）與登入頁／Dashboard 的玻璃感漸層色塊（`.blob`，`mix-blend-mode: multiply`、尊重 reduced-motion）。
- 規格 11 節原本的藍綠金配色已不再使用。

## 5b. Phase 2 職缺分析（2026-11-06 完成）

- migration `20261106000000_jobs.sql`：`job_postings`、`job_skills`（含 user_id 複合外鍵）、`user_skills`（level 可為 null＝未評估、goal_weight）、RLS；`ai_usage(created_at)` 索引。
- AI：`schemas/job.ts`（規格 7.2）、`prompts/job-v1.ts`（職缺內文放分隔區塊、明示不是指令）、mock 以關鍵字表產生技能；共用的 `lib/ai/structured.ts`（預算制重試）。
- 服務：`services/jobs.ts`（建立＋分析、重新分析、列表、詳情含差距與優先順序、編輯、封存、刪除、Dashboard 待補強）、`services/skills.ts`（upsert、依 id 更新、刪除、列表含職缺數）、`lib/skills/levels.ts`（等級標籤、`computePriority` 含理由）。
- 頁面：`/jobs`、`/jobs/new`、`/jobs/[id]`、`/jobs/[id]/edit`、`/skills`（分類篩選、下拉自評立即儲存、新增、刪除）、Dashboard「待補強技能」。
- **D7 決策**：spec 4.5 的「先 AI 拆欄位 → 確認 → 再分析」改為一次呼叫（貼上即分析，事後可編輯重新分析），省免費額度。

## 6. 後續 Phase 概要（確認後再細化）

- **Phase 2 職缺分析**：`/jobs/new` 表單（整段貼上 → AI 拆欄位 → 使用者確認 → 分析）、`job_postings`／`job_skills`／`user_skills`、技能自評（預設「未評估」，不預設為 0）、差距表與可解釋的 priority（`requirement_weight × gap × goal_weight`）、技能連結知識頁／建立 stub。職缺文字視為不可信輸入（長度上限 8,000 字、prompt 內隔離）。
- **Phase 3 學習計畫**：依差距生成任務、順序與時數、開始／完成／略過、完成後更新知識進度。
- **Phase 4 面試練習**：session、一次一題、四維度 0–4 評分、參考答案、建議等級需使用者確認才寫入 `user_skills`。
- **Phase 5 穩定化**：Playwright e2e、rate limit、錯誤追蹤、Vercel hnd1 ＋ Supabase 東京、demo 帳號與種子知識。

每個 Phase 結束：`lint`、`typecheck`、`test` 通過 → `/review-gate` → 列 commit 訊息給你確認。
