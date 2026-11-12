-- 知識頁小測驗：讀完知識頁後作答，AI 逐題批改並糾正誤解。
--
-- * 個人資料：帶 user_id，RLS user_id = auth.uid()。
-- * (knowledge_node_id, content_version) 參照 knowledge_contents：作答綁定當時的內容版本；
--   重新生成後題目可能不同，頁面只顯示最新版本的作答。
-- * passed 只表示這次全部答對，不會自動改學習進度或技能等級（由使用者自己確認）。
-- * ai_usage 加上 knowledge_quiz 這種用途。
--
-- 本檔可重複執行。

create table if not exists dk.knowledge_quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references dk.profiles (id) on delete cascade,
  knowledge_node_id uuid not null references dk.knowledge_nodes (id) on delete cascade,
  content_version   int not null,
  answers           jsonb not null check (jsonb_typeof(answers) = 'array'),
  result            jsonb not null,
  correct_count     int not null,
  total_count       int not null check (total_count between 1 and 5),
  passed            boolean not null,
  provider          text,
  model_name        text,
  prompt_version    text,
  created_at        timestamptz not null default now(),
  foreign key (knowledge_node_id, content_version) references dk.knowledge_contents (knowledge_node_id, version) on delete cascade,
  check (correct_count between 0 and total_count),
  check (passed = (correct_count = total_count))
);
create index if not exists knowledge_quiz_attempts_user_node_idx
  on dk.knowledge_quiz_attempts (user_id, knowledge_node_id, content_version, created_at desc);

revoke all on dk.knowledge_quiz_attempts from anon, authenticated;
grant select, insert, delete on dk.knowledge_quiz_attempts to authenticated;

alter table dk.knowledge_quiz_attempts enable row level security;

drop policy if exists knowledge_quiz_attempts_own on dk.knowledge_quiz_attempts;
create policy knowledge_quiz_attempts_own on dk.knowledge_quiz_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ai_usage.kind：init 的欄位 check 由 Postgres 命名為 ai_usage_kind_check；換成包含 knowledge_quiz 的版本
alter table dk.ai_usage drop constraint if exists ai_usage_kind_check;
alter table dk.ai_usage add constraint ai_usage_kind_check
  check (kind in ('knowledge_generate', 'knowledge_quiz', 'job_analyze', 'learning_plan', 'practice_question', 'practice_evaluate'));
