-- DevKnowledge AI Phase 0／1：帳號、知識庫核心、個人學習進度、AI 使用量
--
-- 設計重點：
-- * 全部放在 dk schema：Supabase 的 Data API 只公開 public，這些表不會被前端直接讀寫，
--   一律經過伺服器的服務層。
-- * 知識節點、內容與關聯是「共用資料」：登入使用者都能讀，寫入只由伺服器（表的擁有者）進行，
--   authenticated 角色沒有 insert／update／delete 權限。
-- * 個人資料（profiles、user_knowledge_progress、ai_usage）帶 user_id，RLS 只認 user_id = auth.uid()。
--   伺服器以 postgres 連線後，每個請求在交易內 set local role authenticated 並帶入 JWT claims，
--   所以就算服務層漏寫條件，RLS 仍會擋下跨使用者存取。
-- * 搜尋：search_vector（英文全文檢索，simple）＋ search_text（中文與別名用 pg_trgm 的 ILIKE）。
--
-- 本檔可重複執行（if not exists、drop policy if exists）。

create schema if not exists dk;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 共用：updated_at
-- ---------------------------------------------------------------------------
create or replace function dk.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles：對應 auth.users 的個人設定
-- ---------------------------------------------------------------------------
create table if not exists dk.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text,
  display_name            text check (display_name is null or char_length(display_name) <= 60),
  target_role             text check (target_role is null or char_length(target_role) <= 80),
  weekly_learning_minutes int not null default 120 check (weekly_learning_minutes between 0 and 10080),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
drop trigger if exists profiles_updated_at on dk.profiles;
create trigger profiles_updated_at before update on dk.profiles for each row execute function dk.set_updated_at();

-- ---------------------------------------------------------------------------
-- knowledge_nodes：知識節點（共用）
-- status：
--   published  有內容可讀
--   generating 正在由 AI 產生（第一次生成時先插入佔位，同 slug 併發只會生成一次）
--   failed     生成失敗且還沒有任何版本的內容
--   stub       只有名稱（來自其他知識頁的前置／相關／延伸），尚未生成內容
-- ---------------------------------------------------------------------------
create table if not exists dk.knowledge_nodes (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (char_length(slug) between 1 and 80),
  name                  text not null check (char_length(btrim(name)) between 1 and 120),
  english_name          text check (english_name is null or char_length(english_name) <= 160),
  aliases               text[] not null default '{}',
  category              text check (category is null or char_length(category) <= 40),
  summary               text check (summary is null or char_length(summary) <= 1000),
  status                text not null default 'published' check (status in ('published', 'generating', 'failed', 'stub')),
  generation_started_at timestamptz,
  search_text           text not null default '',
  search_vector         tsvector generated always as (
                          to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(english_name, '') || ' ' || coalesce(summary, ''))
                        ) stored,
  created_by            uuid references dk.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- search_text：小寫的名稱＋英文名＋別名＋摘要，給中文與別名的模糊搜尋用（array_to_string 不是 immutable，不能當 generated column）
create or replace function dk.set_knowledge_search_text() returns trigger
language plpgsql as $$
begin
  new.search_text := lower(concat_ws(' ', new.name, new.english_name, array_to_string(new.aliases, ' '), new.summary));
  return new;
end;
$$;
drop trigger if exists knowledge_nodes_search_text on dk.knowledge_nodes;
create trigger knowledge_nodes_search_text before insert or update on dk.knowledge_nodes for each row execute function dk.set_knowledge_search_text();
drop trigger if exists knowledge_nodes_updated_at on dk.knowledge_nodes;
create trigger knowledge_nodes_updated_at before update on dk.knowledge_nodes for each row execute function dk.set_updated_at();

create index if not exists knowledge_nodes_aliases_idx on dk.knowledge_nodes using gin (aliases);
create index if not exists knowledge_nodes_search_vector_idx on dk.knowledge_nodes using gin (search_vector);
create index if not exists knowledge_nodes_search_text_idx on dk.knowledge_nodes using gin (search_text extensions.gin_trgm_ops);
create index if not exists knowledge_nodes_category_idx on dk.knowledge_nodes (category);

-- ---------------------------------------------------------------------------
-- knowledge_contents：每次生成一個版本，不覆寫舊版
-- ---------------------------------------------------------------------------
create table if not exists dk.knowledge_contents (
  id                uuid primary key default gen_random_uuid(),
  knowledge_node_id uuid not null references dk.knowledge_nodes (id) on delete cascade,
  version           int not null check (version >= 1),
  content           jsonb not null,
  source_notes      jsonb not null default '[]'::jsonb,
  provider          text not null,
  model_name        text,
  prompt_version    text not null,
  created_by        uuid references dk.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (knowledge_node_id, version)
);

-- ---------------------------------------------------------------------------
-- knowledge_relations：前置／相關／延伸／替代
-- ---------------------------------------------------------------------------
create table if not exists dk.knowledge_relations (
  id            uuid primary key default gen_random_uuid(),
  from_node_id  uuid not null references dk.knowledge_nodes (id) on delete cascade,
  to_node_id    uuid not null references dk.knowledge_nodes (id) on delete cascade,
  relation_type text not null check (relation_type in ('prerequisite', 'related', 'extension', 'alternative')),
  strength      numeric(4, 2) not null default 1 check (strength between 0 and 1),
  reason        text check (reason is null or char_length(reason) <= 300),
  created_at    timestamptz not null default now(),
  unique (from_node_id, to_node_id, relation_type),
  check (from_node_id <> to_node_id)
);
create index if not exists knowledge_relations_to_idx on dk.knowledge_relations (to_node_id);

-- ---------------------------------------------------------------------------
-- user_knowledge_progress：每位使用者對每個節點的學習狀態
-- ---------------------------------------------------------------------------
create table if not exists dk.user_knowledge_progress (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  knowledge_node_id uuid not null references dk.knowledge_nodes (id) on delete cascade,
  status            text not null default 'not_started' check (status in ('not_started', 'learning', 'understood', 'implemented')),
  confidence        int check (confidence is null or confidence between 0 and 4),
  last_viewed_at    timestamptz,
  updated_at        timestamptz not null default now(),
  unique (user_id, knowledge_node_id)
);
create index if not exists user_knowledge_progress_user_status_idx on dk.user_knowledge_progress (user_id, status);
create index if not exists user_knowledge_progress_user_viewed_idx on dk.user_knowledge_progress (user_id, last_viewed_at desc);
drop trigger if exists user_knowledge_progress_updated_at on dk.user_knowledge_progress;
create trigger user_knowledge_progress_updated_at before update on dk.user_knowledge_progress for each row execute function dk.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_usage：每次 AI 呼叫一筆（限制每小時次數、追蹤成本）
-- ---------------------------------------------------------------------------
create table if not exists dk.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references dk.profiles (id) on delete cascade,
  kind          text not null check (kind in ('knowledge_generate', 'job_analyze', 'learning_plan', 'practice_question', 'practice_evaluate')),
  provider      text not null,
  model_name    text,
  status        text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx on dk.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 權限與 RLS
-- ---------------------------------------------------------------------------
-- 不另外授予 extensions schema：查詢只用 ILIKE，索引的 opclass 由規劃器使用，不需要角色權限
grant usage on schema dk to authenticated;

-- 先收回 dk 裡所有表的權限，再只補回需要的（本檔可重跑）
revoke all on all tables in schema dk from authenticated, anon;

grant select on dk.knowledge_nodes, dk.knowledge_contents, dk.knowledge_relations to authenticated;
grant select, insert, update on dk.profiles to authenticated;
grant select, insert, update, delete on dk.user_knowledge_progress to authenticated;
grant select, insert, update on dk.ai_usage to authenticated;

alter table dk.profiles                enable row level security;
alter table dk.knowledge_nodes         enable row level security;
alter table dk.knowledge_contents      enable row level security;
alter table dk.knowledge_relations     enable row level security;
alter table dk.user_knowledge_progress enable row level security;
alter table dk.ai_usage                enable row level security;

drop policy if exists profiles_own on dk.profiles;
create policy profiles_own on dk.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists knowledge_nodes_read on dk.knowledge_nodes;
create policy knowledge_nodes_read on dk.knowledge_nodes for select to authenticated using (true);
drop policy if exists knowledge_contents_read on dk.knowledge_contents;
create policy knowledge_contents_read on dk.knowledge_contents for select to authenticated using (true);
drop policy if exists knowledge_relations_read on dk.knowledge_relations;
create policy knowledge_relations_read on dk.knowledge_relations for select to authenticated using (true);

drop policy if exists user_knowledge_progress_own on dk.user_knowledge_progress;
create policy user_knowledge_progress_own on dk.user_knowledge_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ai_usage_own on dk.ai_usage;
create policy ai_usage_own on dk.ai_usage for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
