-- Phase 4：面試練習（規格 6 節的 practice_sessions／practice_questions／practice_attempts）
--
-- * 個人資料：三張表都帶 user_id，RLS user_id = auth.uid()；子表用 (父 id, user_id) 複合外鍵。
-- * session 可對應職缺（刪除職缺時保留，set null）與知識節點。
-- * 題目的評分重點（rubric）與回答的評估（feedback）存 jsonb；score 是四個維度的平均（0–4）。
-- * user_confirmed_level：使用者看完評估後自己確認的程度，AI 的分數不會自動改技能等級。
--
-- 本檔可重複執行。

create table if not exists dk.practice_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  job_posting_id    uuid references dk.job_postings (id) on delete set null,
  knowledge_node_id uuid references dk.knowledge_nodes (id) on delete set null,
  mode              text not null default 'interview' check (mode in ('interview', 'quiz', 'coding')),
  topic             text not null check (char_length(btrim(topic)) between 1 and 80),
  topic_slug        text,
  question_type     text not null default 'mixed' check (question_type in ('concept', 'scenario', 'architecture', 'coding', 'mixed')),
  target_level      int check (target_level between 0 and 4),
  status            text not null default 'active' check (status in ('active', 'ended')),
  created_at        timestamptz not null default now(),
  ended_at          timestamptz,
  unique (id, user_id)
);
create index if not exists practice_sessions_user_created_idx on dk.practice_sessions (user_id, created_at desc);
create index if not exists practice_sessions_job_idx on dk.practice_sessions (job_posting_id);

create table if not exists dk.practice_questions (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null,
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  knowledge_node_id uuid references dk.knowledge_nodes (id) on delete set null,
  skill_name        text check (skill_name is null or char_length(skill_name) <= 80),
  question          text not null check (char_length(btrim(question)) between 1 and 1200),
  question_type     text not null check (question_type in ('concept', 'scenario', 'architecture', 'coding')),
  rubric            jsonb not null default '[]'::jsonb,
  reference_answer  text check (reference_answer is null or char_length(reference_answer) <= 3000),
  sort_order        int not null default 0,
  provider          text,
  model_name        text,
  prompt_version    text,
  created_at        timestamptz not null default now(),
  foreign key (session_id, user_id) references dk.practice_sessions (id, user_id) on delete cascade,
  unique (id, user_id)
);
create index if not exists practice_questions_session_idx on dk.practice_questions (session_id, sort_order);
-- 同一次練習的題序不能重複：兩個並發的出題請求只會有一個成功（表已存在時補上約束）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'practice_questions_session_order_key') then
    alter table dk.practice_questions add constraint practice_questions_session_order_key unique (session_id, sort_order);
  end if;
end $$;

create table if not exists dk.practice_attempts (
  id                   uuid primary key default gen_random_uuid(),
  question_id          uuid not null,
  user_id              uuid not null references dk.profiles (id) on delete cascade,
  answer               text not null check (char_length(btrim(answer)) between 1 and 6000),
  score                numeric(3, 1) check (score is null or (score >= 0 and score <= 4)),
  feedback             jsonb,
  user_confirmed_level int check (user_confirmed_level is null or user_confirmed_level between 0 and 4),
  review_flag          boolean not null default false,
  provider             text,
  model_name           text,
  prompt_version       text,
  created_at           timestamptz not null default now(),
  foreign key (question_id, user_id) references dk.practice_questions (id, user_id) on delete cascade,
  unique (question_id)
);
create index if not exists practice_attempts_user_created_idx on dk.practice_attempts (user_id, created_at desc);
create index if not exists practice_attempts_review_idx on dk.practice_attempts (user_id, review_flag) where review_flag;

revoke all on dk.practice_sessions, dk.practice_questions, dk.practice_attempts from anon, authenticated;
grant select, insert, update, delete on dk.practice_sessions, dk.practice_questions, dk.practice_attempts to authenticated;

alter table dk.practice_sessions enable row level security;
alter table dk.practice_questions enable row level security;
alter table dk.practice_attempts enable row level security;

drop policy if exists practice_sessions_own on dk.practice_sessions;
create policy practice_sessions_own on dk.practice_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists practice_questions_own on dk.practice_questions;
create policy practice_questions_own on dk.practice_questions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists practice_attempts_own on dk.practice_attempts;
create policy practice_attempts_own on dk.practice_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
