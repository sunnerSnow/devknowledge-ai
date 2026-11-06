-- Phase 2：職缺分析、職缺技能、使用者技能（規格 6 節的 job_postings／job_skills／user_skills）
--
-- * 都是個人資料：帶 user_id，RLS user_id = auth.uid()；job_skills 用 (job_posting_id, user_id) 複合外鍵，
--   資料庫保證技能一定掛在同一個使用者的職缺下。
-- * 職缺技能與使用者能力分開存：job_skills 是職缺要求，user_skills 是使用者自己的程度；
--   沒有 user_skills 列＝「未評估」，不會因為貼了職缺就被推定為 0。
-- * 兩邊都以 skill_slug（normalizeSlug 後的名稱）對應，並盡量連到 knowledge_nodes。
--
-- 本檔可重複執行。

create table if not exists dk.job_postings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references dk.profiles (id) on delete cascade,
  title               text not null check (char_length(btrim(title)) between 1 and 120),
  company             text check (company is null or char_length(company) <= 120),
  source_url          text check (source_url is null or char_length(source_url) <= 500),
  raw_description     text not null check (char_length(raw_description) between 1 and 12000),
  required_skills_raw text check (required_skills_raw is null or char_length(required_skills_raw) <= 4000),
  preferred_skills_raw text check (preferred_skills_raw is null or char_length(preferred_skills_raw) <= 4000),
  notes               text check (notes is null or char_length(notes) <= 2000),
  analysis            jsonb,
  analysis_provider   text,
  analysis_model      text,
  analysis_prompt_version text,
  analyzed_at         timestamptz,
  status              text not null default 'active' check (status in ('active', 'archived')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists job_postings_user_created_idx on dk.job_postings (user_id, created_at desc);
-- 只允許 http(s)：頁面會把它當連結渲染。寫在 create table 裡的 check 在表已存在時不會套用，所以用具名約束補上（可重跑）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_postings_source_url_http') then
    alter table dk.job_postings add constraint job_postings_source_url_http check (source_url is null or source_url ~* '^https?://');
  end if;
end
$$;
drop trigger if exists job_postings_updated_at on dk.job_postings;
create trigger job_postings_updated_at before update on dk.job_postings for each row execute function dk.set_updated_at();

create table if not exists dk.job_skills (
  id                uuid primary key default gen_random_uuid(),
  job_posting_id    uuid not null,
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  knowledge_node_id uuid references dk.knowledge_nodes (id) on delete set null,
  skill_name        text not null check (char_length(btrim(skill_name)) between 1 and 80),
  skill_slug        text not null check (char_length(skill_slug) between 1 and 80),
  category          text check (category is null or char_length(category) <= 40),
  requirement_type  text not null check (requirement_type in ('required', 'preferred')),
  required_level    int not null check (required_level between 0 and 4),
  importance        int not null default 1 check (importance between 1 and 3),
  original_phrase   text check (original_phrase is null or char_length(original_phrase) <= 300),
  reason            text check (reason is null or char_length(reason) <= 500),
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  foreign key (job_posting_id, user_id) references dk.job_postings (id, user_id) on delete cascade,
  unique (job_posting_id, skill_slug)
);
create index if not exists job_skills_job_idx on dk.job_skills (job_posting_id);
create index if not exists job_skills_user_slug_idx on dk.job_skills (user_id, skill_slug);

create table if not exists dk.user_skills (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  knowledge_node_id uuid references dk.knowledge_nodes (id) on delete set null,
  skill_name        text not null check (char_length(btrim(skill_name)) between 1 and 80),
  skill_slug        text not null check (char_length(skill_slug) between 1 and 80),
  category          text check (category is null or char_length(category) <= 40),
  -- null＝未評估（使用者選「稍後評估」或只調整了目標權重）
  level             int check (level is null or level between 0 and 4),
  evidence_type     text not null default 'self_assessment' check (evidence_type in ('self_assessment', 'quiz', 'project', 'interview_practice')),
  evidence_note     text check (evidence_note is null or char_length(evidence_note) <= 500),
  confirmed_by_user boolean not null default true,
  goal_weight       numeric(3, 1) not null default 1 check (goal_weight between 0 and 3),
  updated_at        timestamptz not null default now(),
  unique (user_id, skill_slug)
);
create index if not exists user_skills_user_category_idx on dk.user_skills (user_id, category);
drop trigger if exists user_skills_updated_at on dk.user_skills;
create trigger user_skills_updated_at before update on dk.user_skills for each row execute function dk.set_updated_at();

-- 全站每日 AI 上限的計數查 created_at（原本只有 (user_id, created_at)）
create index if not exists ai_usage_created_idx on dk.ai_usage (created_at desc);

-- 權限與 RLS
revoke all on dk.job_postings, dk.job_skills, dk.user_skills from anon, authenticated;
grant select, insert, update, delete on dk.job_postings, dk.job_skills, dk.user_skills to authenticated;

alter table dk.job_postings enable row level security;
alter table dk.job_skills   enable row level security;
alter table dk.user_skills  enable row level security;

drop policy if exists job_postings_own on dk.job_postings;
create policy job_postings_own on dk.job_postings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists job_skills_own on dk.job_skills;
create policy job_skills_own on dk.job_skills for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists user_skills_own on dk.user_skills;
create policy user_skills_own on dk.user_skills for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
