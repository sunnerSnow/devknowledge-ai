-- Phase 3：學習計畫與學習任務（規格 6 節的 learning_plans／learning_tasks）
--
-- * 個人資料：帶 user_id，RLS user_id = auth.uid()；learning_tasks 用 (learning_plan_id, user_id) 複合外鍵。
-- * 計畫可對應一份職缺（job_posting_id），職缺刪除時計畫保留（set null）。
-- * 任務可連到知識節點：完成「閱讀」任務時知識進度至少變成已理解，「實作」變成已實作。
--
-- 本檔可重複執行。

create table if not exists dk.learning_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references dk.profiles (id) on delete cascade,
  job_posting_id  uuid references dk.job_postings (id) on delete set null,
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  goal            text check (goal is null or char_length(goal) <= 600),
  summary         text check (summary is null or char_length(summary) <= 1500),
  weekly_minutes  int not null default 120 check (weekly_minutes between 30 and 10080),
  status          text not null default 'active' check (status in ('active', 'completed', 'archived')),
  provider        text,
  model_name      text,
  prompt_version  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists learning_plans_user_created_idx on dk.learning_plans (user_id, created_at desc);
create index if not exists learning_plans_job_idx on dk.learning_plans (job_posting_id);
drop trigger if exists learning_plans_updated_at on dk.learning_plans;
create trigger learning_plans_updated_at before update on dk.learning_plans for each row execute function dk.set_updated_at();

create table if not exists dk.learning_tasks (
  id                uuid primary key default gen_random_uuid(),
  learning_plan_id  uuid not null,
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  knowledge_node_id uuid references dk.knowledge_nodes (id) on delete set null,
  skill_name        text check (skill_name is null or char_length(skill_name) <= 80),
  skill_slug        text check (skill_slug is null or char_length(skill_slug) <= 80),
  title             text not null check (char_length(btrim(title)) between 1 and 160),
  description       text check (description is null or char_length(description) <= 1500),
  task_type         text not null check (task_type in ('read', 'quiz', 'code', 'project', 'review')),
  estimated_minutes int not null check (estimated_minutes between 5 and 1200),
  verification      text check (verification is null or char_length(verification) <= 500),
  week_number       int not null default 1 check (week_number between 1 and 52),
  sort_order        int not null default 0,
  status            text not null default 'todo' check (status in ('todo', 'in_progress', 'completed', 'skipped')),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (learning_plan_id, user_id) references dk.learning_plans (id, user_id) on delete cascade
);
create index if not exists learning_tasks_plan_idx on dk.learning_tasks (learning_plan_id, week_number, sort_order);
create index if not exists learning_tasks_user_status_idx on dk.learning_tasks (user_id, status);
drop trigger if exists learning_tasks_updated_at on dk.learning_tasks;
create trigger learning_tasks_updated_at before update on dk.learning_tasks for each row execute function dk.set_updated_at();

revoke all on dk.learning_plans, dk.learning_tasks from anon, authenticated;
grant select, insert, update, delete on dk.learning_plans, dk.learning_tasks to authenticated;

alter table dk.learning_plans enable row level security;
alter table dk.learning_tasks enable row level security;

drop policy if exists learning_plans_own on dk.learning_plans;
create policy learning_plans_own on dk.learning_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists learning_tasks_own on dk.learning_tasks;
create policy learning_tasks_own on dk.learning_tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
