# DevKnowledge AI — MVP 產品規格與開發計畫

> 版本：MVP 1.0  
> 產品定位：從技術名詞建立知識地圖，從真實職缺補足工程師技能。  
> 目標使用者：正在學習或轉職的全端、前端、後端與雲端工程師。  
> 暫定名稱：DevKnowledge AI（可替換）

---

## 1. 產品願景

DevKnowledge AI 是一個 AI 輔助的工程師知識庫與職涯學習平台。使用者可以：

1. 輸入技術名詞或架構，例如 RAG、LLM、AWS、Docker，產生可持續累積的結構化知識頁。
2. 貼上 104 職缺的職務、工作內容與技能要求，拆解職缺能力並找出技能差距。
3. 根據技能差距建立學習路徑，透過面試題、考試與實作任務驗證理解。
4. 將學習成果回寫到個人技能地圖，逐步追蹤進步。

### 產品核心循環

`探索知識 → 理解與實作 → 評量能力 → 更新技能地圖 → 對照職缺 → 補足差距`

### MVP 原則

- 先建立能用、能儲存、能回訪的知識庫，不追求一次收錄所有技術。
- AI 產生內容必須結構化，方便前端呈現、編輯、搜尋與關聯。
- 職缺技能與個人能力分開儲存，不可因為使用者貼上職缺就推定其能力不足。
- 先以 PostgreSQL 全文搜尋為主；向量搜尋與進階 RAG 留到後續版本。
- MVP 不自動爬取 104；使用者自行貼上職缺內容。

---

## 2. MVP 功能範圍

### P0 — 第一版必做

| 模組 | 功能 |
|---|---|
| 首頁 | 技術搜尋、職缺分析入口、最近學習、待補強技能 |
| 知識探索 | 輸入技術名詞，AI 產生結構化知識頁 |
| 知識頁 | 定義、原理、用途、前置知識、程式碼、常見誤解、面試重點、延伸知識 |
| 知識關聯 | 前置知識、相關技術、延伸主題 |
| 職缺分析 | 貼上職稱、工作內容、技能要求，AI 拆解技能 |
| 技能自評 | 使用者逐項自評，或透過測驗建立初始程度 |
| 差距分析 | 顯示職缺需求與使用者能力差距 |
| 學習路徑 | 依差距產生可執行的學習任務 |
| 面試練習 | 依職缺技能產生題目、回答、回饋與評分 |
| 進度追蹤 | 知識閱讀、任務完成、測驗結果、技能狀態 |
| 基本帳號 | 註冊、登入、個人資料與資料隔離 |

### P1 — MVP 後續

- 職缺比較與共同技能分析
- 錯題本、間隔複習卡
- 知識內容版本與更新提醒
- Markdown 匯出
- 向量搜尋 / RAG
- 使用者自訂學習目標與每週時數
- 技能測驗自動更新能力等級（需使用者確認）

### 不在 MVP 範圍

- 自動登入或爬取 104
- 求職投遞、自動寄信
- 即時多人協作
- 完整課程影音平台
- 以 AI 分數直接判斷求職者是否合格
- 未經來源驗證的即時技術版本或雲端價格資訊

---

## 3. 使用者流程

### Flow A：探索技術

1. 使用者在首頁輸入 `RAG`。
2. 系統檢查知識庫是否已有 RAG 頁面。
3. 若已有內容，顯示既有頁面；使用者可選擇重新生成或更新。
4. 若沒有，呼叫 AI 產生結構化內容。
5. 驗證 AI 回傳 JSON，儲存知識頁與關聯。
6. 顯示知識頁、學習順序與相關技術。
7. 使用者標記「未學習 / 學習中 / 已理解 / 已實作」。
8. 更新個人進度。

### Flow B：分析 104 職缺

1. 使用者貼上職稱、工作內容、必要技能與加分技能。
2. 系統呼叫 AI 將職缺拆成標準化技能項目。
3. 系統比對既有知識節點；未存在的技能可建立待補知識。
4. 使用者逐項自評能力，或選擇「稍後評估」。
5. 系統顯示技能差距與優先順序。
6. 使用者產生學習路徑。
7. 學習完成後回到職缺頁更新狀態。

### Flow C：面試練習

1. 使用者選擇一份職缺與技能主題。
2. 選擇題型：概念題、情境題、架構題、程式題。
3. AI 一次提出一題。
4. 使用者輸入回答。
5. AI 根據明確評分規準回饋：正確性、完整度、表達、可改善處。
6. 使用者可查看參考答案與相關知識頁。
7. 儲存作答紀錄與複習項目。

---

## 4. 資訊架構與頁面

### 4.1 全站導覽

- Dashboard
- Knowledge
- Job Analyzer
- Interview Practice
- My Skills
- Settings

### 4.2 Dashboard `/`

區塊：
- 主搜尋框：「輸入技術名詞，例如 RAG、AWS、Docker」
- 「分析一份職缺」主要 CTA
- 最近瀏覽知識
- 本週學習進度
- 待補強技能
- 最近的面試練習

空狀態應提供清楚示例，不以大量圖表填滿畫面。

### 4.3 Knowledge Search `/knowledge`

- 搜尋技術名詞
- 搜尋結果顯示名稱、分類、簡短定義、熟悉度
- 無結果時提供「使用 AI 建立知識頁」
- 搜尋支援繁體中文與英文別名

### 4.4 Knowledge Detail `/knowledge/[slug]`

建議版面：
- 頁首：名稱、英文全名、分類、熟悉度、更新日期
- 左側或頂部：章節導覽
- 主內容：結構化知識
- 側欄：前置知識、相關技術、職缺需求關聯
- 操作：標記狀態、加入學習計畫、產生測驗、重新生成

內容區塊：
1. 快速理解（一句話結論、白話比喻、關鍵數字代入計算、面試 30 秒口語版、實務上會怎麼做；舊版內容只有「一句話理解」）
2. 為什麼需要它
3. 核心原理
4. 架構 / 流程圖（MVP 可用 Mermaid）
5. 實際使用場景
6. 程式碼範例（含語言與說明）
7. 與相似技術比較
8. 常見誤解
9. 面試重點
10. 前置知識與延伸學習
11. 小測驗（3～5 題；一次交卷，AI 逐題判定答對／部分正確／答錯／不知道，答錯時糾正誤解並給比喻；全部答對才建議標記已理解，由使用者確認）

### 4.5 Job Analyzer `/jobs/new`

表單欄位：
- 職缺名稱（必填）
- 公司名稱（選填）
- 職缺 URL（選填，僅保存，不自動抓取）
- 工作內容（必填）
- 必要技能（選填）
- 加分技能（選填）
- 使用者備註（選填）

貼上整份職缺也可以；AI 應嘗試從文字拆出上述資訊，讓使用者確認後再分析。

### 4.6 Job Detail `/jobs/[id]`

區塊：
- 職缺摘要
- 必要技能 / 加分技能
- 技能差距表
- 建議學習順序
- 面試題入口
- 學習進度
- 編輯與重新分析

技能狀態：
- 未評估
- 未接觸
- 知道概念
- 能解釋
- 能實作
- 能獨立應用

### 4.7 Interview Practice `/practice/[sessionId]`

- 一次一題，避免一次呈現大量題目
- 顯示題型、技能主題、題目、作答欄
- 提交後顯示評分、回饋、參考答案與相關知識
- 提供「下一題」與「加入複習」
- 不將 AI 評分呈現為客觀或正式能力認證

### 4.8 My Skills `/skills`

- 技能清單與熟悉程度
- 技能來源：自評、測驗、實作紀錄
- 最近更新時間
- 關聯職缺
- 可手動調整等級
- 可依分類篩選：Frontend、Backend、Database、Cloud、AI、Testing、DevOps

### 4.9 Learning Route `/routes/[id]`（MVP 後新增）

從職缺頁產生，和週學習計畫並存：計畫負責實作與專案，路線負責把觀念一課一課教完。
- 產生時填剩餘天數（1–30）與每天分鐘數；不用先自評
- 程度診斷（可略過）：3～6 題極短題，不會寫「不知道」；批改逐題附觀念修正，估出各技能的初步程度（只用來排課，不改技能等級）
- 排課：把技能拆成一課一個主題，依天數排成 Day 1、Day 2…；時間不夠只排面試必備，省略的寫在備註
- 每課是一頁知識頁（快速理解＋小測驗）；小測驗全對才解鎖下一課，全部通過後導向面試練習

---

## 5. 技能等級與優先排序

### 技能等級

| Level | 名稱 | 定義 |
|---|---|---|
| 0 | 未接觸 | 尚未學習 |
| 1 | 知道概念 | 能辨認並簡單描述 |
| 2 | 能解釋 | 能說明原理與用途 |
| 3 | 能實作 | 能依文件完成基本實作 |
| 4 | 能獨立應用 | 能處理常見問題並做合理取捨 |

每個技能的等級都應保留來源：
- `self_assessment`
- `quiz`
- `project`
- `interview_practice`

AI 測驗可以提出建議等級，但應由使用者確認後才更新正式技能狀態。

### 優先分數（MVP）

先採用可解釋的規則，而非黑箱模型：

`priority = requirement_weight × skill_gap × user_goal_weight`

- 必要技能權重：3
- 加分技能權重：1
- 技能差距：`max(0, required_level - current_level)`
- 使用者目標權重：預設 1，可由使用者調整

前端應顯示「為什麼這項技能排在前面」，避免只給一個分數。

---

## 6. 資料庫 Schema（PostgreSQL）

以下為概念 Schema；正式實作請使用 migration 管理。

### `profiles`
- `id UUID PRIMARY KEY REFERENCES auth.users(id)`
- `display_name TEXT`
- `target_role TEXT`
- `weekly_learning_minutes INT DEFAULT 120`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `knowledge_nodes`
- `id UUID PRIMARY KEY`
- `slug TEXT UNIQUE NOT NULL`
- `name TEXT NOT NULL`
- `english_name TEXT`
- `aliases TEXT[] DEFAULT '{}'`
- `category TEXT`
- `summary TEXT`
- `status TEXT DEFAULT 'published'`
- `created_by UUID NULL`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `knowledge_contents`
- `id UUID PRIMARY KEY`
- `knowledge_node_id UUID REFERENCES knowledge_nodes(id)`
- `version INT NOT NULL`
- `content JSONB NOT NULL`
- `source_notes JSONB DEFAULT '[]'`
- `model_name TEXT`
- `prompt_version TEXT`
- `created_by UUID NULL`
- `created_at TIMESTAMPTZ`
- UNIQUE (`knowledge_node_id`, `version`)

### `knowledge_relations`
- `id UUID PRIMARY KEY`
- `from_node_id UUID REFERENCES knowledge_nodes(id)`
- `to_node_id UUID REFERENCES knowledge_nodes(id)`
- `relation_type TEXT CHECK (relation_type IN ('prerequisite','related','extension','alternative'))`
- `strength NUMERIC DEFAULT 1`
- `created_at TIMESTAMPTZ`
- UNIQUE (`from_node_id`, `to_node_id`, `relation_type`)
- 不允許節點連到自己

### `user_knowledge_progress`
- `id UUID PRIMARY KEY`
- `user_id UUID REFERENCES profiles(id)`
- `knowledge_node_id UUID REFERENCES knowledge_nodes(id)`
- `status TEXT CHECK (status IN ('not_started','learning','understood','implemented'))`
- `confidence INT CHECK (confidence BETWEEN 0 AND 4)`
- `last_viewed_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`
- UNIQUE (`user_id`, `knowledge_node_id`)

### `job_postings`
- `id UUID PRIMARY KEY`
- `user_id UUID REFERENCES profiles(id)`
- `title TEXT NOT NULL`
- `company TEXT`
- `source_url TEXT`
- `raw_description TEXT NOT NULL`
- `analysis JSONB`
- `status TEXT DEFAULT 'active'`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `job_skills`
- `id UUID PRIMARY KEY`
- `job_posting_id UUID REFERENCES job_postings(id) ON DELETE CASCADE`
- `knowledge_node_id UUID NULL REFERENCES knowledge_nodes(id)`
- `skill_name TEXT NOT NULL`
- `category TEXT`
- `requirement_type TEXT CHECK (requirement_type IN ('required','preferred'))`
- `required_level INT CHECK (required_level BETWEEN 0 AND 4)`
- `importance INT DEFAULT 1`
- `reason TEXT`
- `created_at TIMESTAMPTZ`

### `user_skills`
- `id UUID PRIMARY KEY`
- `user_id UUID REFERENCES profiles(id)`
- `knowledge_node_id UUID NULL REFERENCES knowledge_nodes(id)`
- `skill_name TEXT NOT NULL`
- `category TEXT`
- `level INT CHECK (level BETWEEN 0 AND 4)`
- `evidence_type TEXT CHECK (evidence_type IN ('self_assessment','quiz','project','interview_practice'))`
- `evidence_note TEXT`
- `confirmed_by_user BOOLEAN DEFAULT FALSE`
- `updated_at TIMESTAMPTZ`
- UNIQUE (`user_id`, `skill_name`)

### `learning_plans`
- `id UUID PRIMARY KEY`
- `user_id UUID REFERENCES profiles(id)`
- `job_posting_id UUID NULL REFERENCES job_postings(id)`
- `title TEXT NOT NULL`
- `goal TEXT`
- `status TEXT DEFAULT 'active'`
- `created_at TIMESTAMPTZ`

### `learning_tasks`
- `id UUID PRIMARY KEY`
- `learning_plan_id UUID REFERENCES learning_plans(id) ON DELETE CASCADE`
- `knowledge_node_id UUID NULL REFERENCES knowledge_nodes(id)`
- `title TEXT NOT NULL`
- `description TEXT`
- `task_type TEXT CHECK (task_type IN ('read','quiz','code','project','review'))`
- `estimated_minutes INT`
- `sort_order INT`
- `status TEXT CHECK (status IN ('todo','in_progress','completed'))`
- `completed_at TIMESTAMPTZ`

### `practice_sessions`
- `id UUID PRIMARY KEY`
- `user_id UUID REFERENCES profiles(id)`
- `job_posting_id UUID NULL REFERENCES job_postings(id)`
- `mode TEXT CHECK (mode IN ('interview','quiz','coding'))`
- `topic TEXT`
- `created_at TIMESTAMPTZ`
- `ended_at TIMESTAMPTZ`

### `practice_questions`
- `id UUID PRIMARY KEY`
- `session_id UUID REFERENCES practice_sessions(id) ON DELETE CASCADE`
- `knowledge_node_id UUID NULL REFERENCES knowledge_nodes(id)`
- `question TEXT NOT NULL`
- `question_type TEXT`
- `rubric JSONB`
- `reference_answer TEXT`
- `created_at TIMESTAMPTZ`

### `practice_attempts`
- `id UUID PRIMARY KEY`
- `question_id UUID REFERENCES practice_questions(id) ON DELETE CASCADE`
- `user_id UUID REFERENCES profiles(id)`
- `answer TEXT`
- `score NUMERIC`
- `feedback JSONB`
- `user_confirmed_level INT NULL CHECK (user_confirmed_level BETWEEN 0 AND 4)`
- `created_at TIMESTAMPTZ`

### 建議索引
- `knowledge_nodes(slug)`
- `knowledge_nodes USING GIN (aliases)`
- `job_postings(user_id, created_at DESC)`
- `user_skills(user_id, category)`
- `user_knowledge_progress(user_id, status)`
- 對知識名稱、摘要與職缺文字建立 PostgreSQL Full-text Search 索引

---

## 7. AI 輸出格式與 Prompt

### 7.1 知識生成 Prompt

System Prompt：

```text
你是資深全端工程師與技術教育設計師。
你的任務是將使用者輸入的技術名詞轉換成清楚、正確、適合逐步學習的工程師知識頁。

規則：
1. 使用繁體中文，保留必要英文術語。
2. 先說明概念，再解釋原理，最後提供實作。
3. 明確列出前置知識，不要假設使用者已經熟悉。
4. 程式碼必須完整、可讀，並說明執行前提。
5. 不確定或可能隨版本變動的內容要標記，避免捏造。
6. 不要虛構來源、文件網址、版本號或 benchmark。
7. 回傳符合指定 JSON Schema 的 JSON，不要附加 Markdown code fence。
8. 將前置知識與延伸知識分開。
9. 面試題要附上評量重點，而非只給背誦答案。
```

User Prompt 模板：

```text
技術名詞：{{topic}}
使用者程度：{{level}}
目標職務：{{target_role}}
偏好：概念理解、程式實作、面試準備
請產生一份結構化知識頁。
```

預期 JSON：

```json
{
  "name": "RAG",
  "english_name": "Retrieval-Augmented Generation",
  "category": "AI",
  "summary": "讓大型語言模型在生成回答前，先檢索外部資料的架構。",
  "why_it_matters": "可讓回答參考特定知識來源並降低部分幻覺風險。",
  "prerequisites": [
    {"name": "LLM", "reason": "理解生成模型的基本能力與限制"},
    {"name": "Embedding", "reason": "理解文字如何轉成向量表示"}
  ],
  "sections": [
    {
      "title": "核心原理",
      "content_md": "內容...",
      "key_points": ["檢索", "上下文組裝", "生成"]
    }
  ],
  "architecture": {
    "mermaid": "flowchart LR\\nA[Question] --> B[Retrieve] --> C[Context] --> D[LLM] --> E[Answer]",
    "description": "使用者問題先檢索相關文件，再把文件與問題交給模型。"
  },
  "code_examples": [
    {
      "language": "python",
      "title": "簡化檢索流程",
      "code": "..."
    }
  ],
  "comparisons": [
    {
      "name": "Fine-tuning",
      "difference": "RAG 在推論時檢索外部資料；微調則調整模型參數。"
    }
  ],
  "common_misconceptions": ["RAG 不保證答案一定正確。"],
  "interview_topics": [
    {
      "question": "RAG 與 Fine-tuning 有何差異？",
      "evaluation_points": ["知識更新方式", "成本", "適用情境"]
    }
  ],
  "related_topics": [
    {"name": "Vector Database", "relation": "related"},
    {"name": "Reranking", "relation": "extension"}
  ],
  "learning_tasks": [
    {
      "title": "建立最小 RAG 流程",
      "description": "匯入文件、切分、向量化、檢索並生成回答。",
      "estimated_minutes": 120
    }
  ],
  "caveats": ["不同框架與模型的 API 可能隨版本改變。"]
}
```

### 7.2 職缺分析 Prompt

```text
你是技術職缺分析師與工程師職涯教練。
請將使用者提供的職缺內容拆解成標準化技能需求。

規則：
1. 區分 required 與 preferred。
2. 不要把一般工作描述誤判為技術技能。
3. 每項技能提供分類、建議需求等級、重要性與判斷理由。
4. 將同義技能合併，但保留原始職缺用語。
5. 不可推定使用者已具備或缺少技能；只分析職缺需求。
6. 若職缺資訊不足，標記 assumptions。
7. 回傳 JSON，不要加上額外文字。
```

預期輸出：

```json
{
  "role_summary": "負責前後端功能開發、API 整合與雲端部署。",
  "seniority": "junior",
  "skills": [
    {
      "name": "React",
      "category": "Frontend",
      "requirement_type": "required",
      "required_level": 3,
      "importance": 3,
      "original_phrase": "熟悉 React",
      "reason": "職缺明確要求使用 React 開發前端功能。"
    }
  ],
  "responsibilities": ["開發前端功能", "整合 API"],
  "interview_focus": ["React 元件設計", "API 錯誤處理"],
  "assumptions": []
}
```

### 7.3 技能差距與學習路徑 Prompt

輸入：
- 職缺技能需求
- 使用者已確認的技能程度
- 使用者每週可投入時間
- 已有知識頁與學習任務

輸出：
- 每項技能差距
- 優先順序與原因
- 依賴順序
- 每週學習任務
- 可驗證成果

AI 不可將自評結果視為絕對客觀；所有評估應可由使用者修改。

### 7.4 面試回答評估 Prompt

評估維度（每項 0–4 分）：
- 技術正確性
- 回答完整度
- 推理與取捨
- 表達清晰度

輸出：
- 各維度分數與理由
- 回答中正確的部分
- 遺漏的關鍵點
- 建議追問
- 參考回答
- 相關知識節點

不要只輸出總分；不能因回答長短直接判定能力。

---

## 8. API 設計

使用 Next.js Route Handlers；需要登入的端點一律驗證使用者身份。

| Method | Endpoint | 功能 |
|---|---|---|
| GET | `/api/knowledge?query=` | 搜尋知識 |
| POST | `/api/knowledge/generate` | 產生知識頁 |
| GET | `/api/knowledge/[id]` | 取得知識頁 |
| PATCH | `/api/knowledge/[id]/progress` | 更新學習狀態 |
| POST | `/api/jobs/analyze` | 分析職缺 |
| GET | `/api/jobs` | 取得使用者職缺 |
| GET | `/api/jobs/[id]` | 取得職缺與技能 |
| PATCH | `/api/jobs/[id]` | 編輯職缺 |
| POST | `/api/jobs/[id]/learning-plan` | 產生學習計畫 |
| POST | `/api/practice/sessions` | 建立練習 |
| POST | `/api/practice/[sessionId]/answer` | 評估回答 |
| GET | `/api/skills` | 取得技能清單 |
| PATCH | `/api/skills/[id]` | 更新技能等級 |

### API 注意事項

- 使用 Zod 驗證 request 與 AI response。
- AI 回傳格式錯誤時最多重試一次；仍失敗則回傳可理解錯誤。
- 設定 token 上限、請求逾時與使用量限制。
- 避免在前端暴露 AI API Key。
- 知識生成需避免重複建立相同 slug。
- 先檢查快取或既有內容，再決定是否重新生成。
- API 回傳統一格式：`{ data, error }`。
- 對使用者輸入做長度限制，避免超大職缺文字造成成本或濫用。

---

## 9. 技術架構

### 建議 Stack

- Frontend: Next.js App Router、TypeScript
- Styling: Tailwind CSS
- UI: shadcn/ui
- Form: React Hook Form + Zod
- Database / Auth: Supabase PostgreSQL + Supabase Auth
- AI: OpenAI API（使用支援結構化輸出的模型）
- Diagram: Mermaid
- Testing: Vitest、Playwright
- Deployment: Vercel
- Logging: server-side structured logs；避免記錄敏感原文

### 目錄結構

```text
src/
  app/
    (auth)/
      login/
      signup/
    (dashboard)/
      page.tsx
      knowledge/
        page.tsx
        [slug]/
      jobs/
        new/
        [id]/
      practice/
        [sessionId]/
      skills/
      settings/
    api/
      knowledge/
      jobs/
      practice/
      skills/
  components/
    layout/
    knowledge/
    jobs/
    practice/
    skills/
    ui/
  lib/
    ai/
      prompts/
      schemas/
      client.ts
    db/
    auth/
    validation/
    utils/
  types/
  tests/
```

### AI 呼叫設計

- 所有 AI 呼叫只在 server-side 執行。
- Prompt 與 JSON Schema 版本化。
- 儲存模型名稱、prompt 版本、生成時間。
- 對 AI 內容顯示「AI 產生，請依官方文件確認」提示。
- 技術版本、API 使用方式與雲端服務價格等易變資訊，應提供來源欄位或標示待驗證，不得自行捏造引用。

---

## 10. 安全與隱私

- Supabase RLS：使用者只能讀寫自己的職缺、技能、進度、練習與學習計畫。
- 公開知識節點可供所有登入使用者讀取；個人進度必須隔離。
- `service_role` 與 AI API Key 僅存放於 server environment variables。
- 不在 log 中保存完整履歷、個人聯絡資訊或不必要的職缺原文。
- 對貼上的職缺文字視為不可信輸入；其中若含有要求模型忽略規則的文字，不得遵循。
- AI 產生的 SQL、程式碼或 Markdown 不可直接執行。
- 限制請求頻率、輸入字數與每位使用者的 AI 使用量。
- 提供刪除職缺、練習紀錄與帳號資料的方式。
- RLS policy 必須有測試，不能只依賴前端隱藏 UI。

---

## 11. UI/UX 視覺方向

### 風格
- 專業、清晰、帶有探索感；避免像一般聊天機器人。
- 以知識節點、技能地圖與學習狀態作為主要視覺語言。
- 先確保閱讀舒適與資訊層級，不要讓圖表搶過內容。

### 建議配色
- Background: `#F7F7F2`
- Surface: `#FFFFFF`
- Primary: `#142B45`
- Accent: `#E9B949`
- Secondary: `#2C8C83`
- Text: `#1F2937`
- Muted: `#64748B`

### 元件
- 全站搜尋框
- 知識卡片
- 技能狀態標籤
- 學習路徑節點
- 職缺技能差距列
- Mermaid 架構圖容器
- 面試題卡片
- 空狀態與錯誤狀態
- Skeleton loading

### 響應式
- Desktop：左側導覽 + 主內容 + 可選右側關聯欄
- Tablet：可收合側欄
- Mobile：單欄，主要操作固定在易觸及位置

---

## 12. 開發階段

### Phase 0 — 專案初始化
- 建立 Next.js + TypeScript 專案
- 設定 Tailwind、shadcn/ui、ESLint、Prettier
- 建立 Supabase 專案與環境變數
- 建立 migration、RLS 與測試資料
- 建立共用 layout、navigation、loading/error 狀態

### Phase 1 — 知識庫核心
- 建立知識搜尋頁
- 建立 knowledge nodes / contents / relations
- 建立 AI 知識生成 API
- 使用 Zod 驗證結構化輸出
- 建立知識詳情頁
- 實作進度標記與關聯知識
- 測試輸入 RAG、LLM、AWS、Docker

### Phase 2 — 職缺分析
- 建立職缺輸入與確認表單
- 建立職缺分析 API
- 儲存技能需求
- 建立使用者技能自評
- 顯示差距與優先順序
- 將技能連結到既有知識頁

### Phase 3 — 學習計畫
- 根據差距產生學習任務
- 顯示任務順序與預估時間
- 支援開始、完成、略過
- 完成任務後更新知識進度
- 支援回到職缺頁查看差距變化

### Phase 4 — 面試與考試
- 建立練習 session
- AI 逐題產生問題
- 提交答案與評估
- 顯示參考答案、遺漏重點與相關知識
- 儲存紀錄與錯題複習

### Phase 5 — 穩定化與部署
- Playwright 測試主要使用流程
- 檢查 RLS 與 API 權限
- 加入 rate limit、成本限制與錯誤追蹤
- 部署 Vercel
- 建立 demo 帳號與種子知識資料

---

## 13. 驗收標準

### Knowledge
- 輸入技術名詞可產生並保存一份結構化知識頁。
- 再次搜尋同一名詞可找到既有頁面。
- 知識頁可顯示前置知識、延伸知識與程式碼。
- 使用者可更新自己的學習狀態。
- AI response 不符合 schema 時不會造成頁面崩潰。

### Job Analyzer
- 使用者可貼上職缺文字並保存。
- AI 可區分必要技能與加分技能。
- 使用者可自行評估技能，不會被系統預設為零。
- 差距排序能解釋原因。
- 技能可以連到知識頁或建立待補知識。

### Practice
- 可依技能或職缺建立練習。
- 每次只顯示一題。
- 回答後能看到評估理由與改善建議。
- 練習紀錄可回顧。
- AI 評分不會未經確認自動覆寫使用者技能程度。

### Security
- 使用者 A 無法讀取或修改使用者 B 的職缺與進度。
- API Key 不會出現在 client bundle。
- 未登入者無法存取私人資料。
- 所有輸入與 AI 輸出均有 schema / 長度驗證。

---

## 14. 建議的第一個 Demo

用以下資料做出完整端到端流程：

### 技術知識
`RAG`

產生：
- RAG 定義
- LLM、Embedding、Vector Database 前置知識
- 基本架構圖
- 簡化程式碼範例
- 3 道面試題
- 1 個實作任務

### 職缺
職稱：Junior Full-Stack Engineer

工作內容範例：
- 使用 React / Next.js 開發前端
- 使用 Node.js 建立 API
- 操作 PostgreSQL
- 使用 Git 進行版本控制
- 了解 Docker 與雲端部署

### Demo 成功條件
1. 使用者建立 RAG 知識頁。
2. 使用者貼上職缺。
3. 系統拆解技能。
4. 使用者自評技能。
5. 系統產生學習計畫。
6. 使用者完成一項任務。
7. 使用者進行一題面試練習。
8. 技能地圖顯示更新後狀態。

---

## 15. 給 Claude / Cursor 的開發指令

請依照本規格實作 DevKnowledge AI MVP。

開發要求：
1. 先檢查目前 repository 與既有技術，不要直接覆蓋已有架構。
2. 先產生實作計畫、資料模型與檔案變更清單，確認後再分階段開發。
3. 每個 phase 完成後執行 lint、typecheck 與相關測試。
4. 使用 TypeScript strict mode，避免 `any`；必要時說明原因。
5. 所有表單、API request 與 AI response 使用 Zod 驗證。
6. AI 呼叫必須在 server-side，API Key 不得暴露。
7. 實作 Supabase RLS 與對應測試。
8. UI 必須包含 loading、empty、error、success 狀態。
9. 不要只做靜態 mockup；MVP 的主要流程必須能實際儲存與讀取資料。
10. 若缺少 API Key，提供清楚的設定指引與可測試的 mock provider，但不得假裝 AI 已成功呼叫。
11. 先完成 Phase 0 與 Phase 1，再繼續 Phase 2；不要一次生成整個專案的大量未驗證程式碼。
12. 每個階段結束時回報：已完成內容、修改檔案、測試結果、尚待處理事項與下一步。

請先回覆：
- 你檢查到的 repository 現況
- 建議的第一階段實作範圍
- 需要我提供的環境變數或設定
不要在尚未確認專案現況前大規模修改檔案。
