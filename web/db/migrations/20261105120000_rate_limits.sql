-- 伺服器端的簡單限流（登入／註冊嘗試次數等）：固定視窗計數。
-- 只有伺服器（表的擁有者）讀寫；authenticated／anon 沒有權限。

create table if not exists dk.rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

create index if not exists rate_limits_window_idx on dk.rate_limits (window_start);

revoke all on dk.rate_limits from anon, authenticated;
