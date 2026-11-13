-- 學習路線（Day 制）：依職缺差距把技能拆成主題，每天一兩課；每課是一頁知識頁，小測驗全對才解鎖下一課。
--
-- * 個人資料：兩張表都帶 user_id，RLS user_id = auth.uid()；課程用 (route_id, user_id) 複合外鍵。
-- * 路線可對應一份職缺，職缺刪除時路線保留（set null）；skills 是建立當下的技能快照，之後排課用它，不受職缺變動影響。
-- * diagnosis：診斷題（題目、標準答案、批改重點）；diagnosis_result：作答、逐題批改與各技能的初步程度。
--   初步程度只用來排課，不會寫進 user_skills。
-- * 課程的過關狀態不存表：由 knowledge_quiz_attempts 是否有全對的作答算出，避免兩邊不一致。
-- * ai_usage 加上 route_diagnose（出診斷題）、route_grade（批改診斷）、learning_route（排課）。
--
-- 本檔可重複執行。

create table if not exists dk.learning_routes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references dk.profiles (id) on delete cascade,
  job_posting_id   uuid references dk.job_postings (id) on delete set null,
  title            text not null check (char_length(btrim(title)) between 1 and 120),
  summary          text check (summary is null or char_length(summary) <= 1500),
  days             int not null check (days between 1 and 30),
  daily_minutes    int not null check (daily_minutes between 15 and 480),
  status           text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  skills           jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  diagnosis        jsonb,
  diagnosis_result jsonb,
  day_focus        jsonb not null default '[]'::jsonb check (jsonb_typeof(day_focus) = 'array'),
  notes            jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  provider         text,
  model_name       text,
  prompt_version   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists learning_routes_user_created_idx on dk.learning_routes (user_id, created_at desc);
create index if not exists learning_routes_job_idx on dk.learning_routes (job_posting_id);
drop trigger if exists learning_routes_updated_at on dk.learning_routes;
create trigger learning_routes_updated_at before update on dk.learning_routes for each row execute function dk.set_updated_at();

create table if not exists dk.learning_route_lessons (
  id                uuid primary key default gen_random_uuid(),
  route_id          uuid not null,
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  knowledge_node_id uuid references dk.knowledge_nodes (id) on delete set null,
  day_number        int not null check (day_number between 1 and 30),
  sort_order        int not null check (sort_order >= 0),
  topic             text not null check (char_length(btrim(topic)) between 1 and 80),
  skill_name        text check (skill_name is null or char_length(skill_name) <= 80),
  goal              text check (goal is null or char_length(goal) <= 300),
  estimated_minutes int not null check (estimated_minutes between 5 and 240),
  core              boolean not null default true,
  created_at        timestamptz not null default now(),
  foreign key (route_id, user_id) references dk.learning_routes (id, user_id) on delete cascade,
  -- 同一條路線的課序不能重複：兩個並發的排課請求只會有一個寫入成功
  unique (route_id, sort_order)
);
create index if not exists learning_route_lessons_route_idx on dk.learning_route_lessons (route_id, sort_order);
create index if not exists learning_route_lessons_node_idx on dk.learning_route_lessons (user_id, knowledge_node_id);

revoke all on dk.learning_routes, dk.learning_route_lessons from anon, authenticated;
grant select, insert, update, delete on dk.learning_routes, dk.learning_route_lessons to authenticated;

alter table dk.learning_routes enable row level security;
alter table dk.learning_route_lessons enable row level security;

drop policy if exists learning_routes_own on dk.learning_routes;
create policy learning_routes_own on dk.learning_routes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists learning_route_lessons_own on dk.learning_route_lessons;
create policy learning_route_lessons_own on dk.learning_route_lessons for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ai_usage.kind 的完整清單（驗證既有資料）。之後再加用途時：把這裡改成 not valid，並在新的 migration 定義完整清單。
alter table dk.ai_usage drop constraint if exists ai_usage_kind_check;
alter table dk.ai_usage add constraint ai_usage_kind_check
  check (kind in (
    'knowledge_generate', 'knowledge_quiz', 'job_analyze', 'learning_plan',
    'practice_question', 'practice_evaluate', 'route_diagnose', 'route_grade', 'learning_route'
  ));
