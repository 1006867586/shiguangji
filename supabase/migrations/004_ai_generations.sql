-- ============================================================
-- 飨刻 (XiangKe) - AI 调用记录与配额
-- 文件: 004_ai_generations.sql
-- 说明: 记录每次 AI 调用（类型/输入/输出/Token/成功状态），用于审计与配额计数
-- ============================================================

create table if not exists public.ai_generations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  type text not null, -- 'parse_screenshot' | 'copywrite' | 'invite_text' | 'receipt' | ...
  activity_id uuid references public.activities on delete set null,
  input_hash text, -- 用于去重（如相同截图短时间内重复请求）
  output jsonb, -- AI 返回结果
  error_message text, -- 失败时的错误信息
  model text not null,
  tokens_used integer,
  success boolean not null default true,
  created_at timestamptz default now()
);

-- 按用户+时间查询配额（每小时限额）
create index if not exists idx_ai_generations_user_time
  on public.ai_generations(user_id, created_at desc);

-- 按类型查询（用于审计）
create index if not exists idx_ai_generations_type
  on public.ai_generations(type, created_at desc);

-- 按活动查询（用于查看某活动的所有 AI 生成内容）
create index if not exists idx_ai_generations_activity
  on public.ai_generations(activity_id) where activity_id is not null;

-- ============================================================
-- RLS: 用户只能查看自己的 AI 调用记录
-- ============================================================
alter table public.ai_generations enable row level security;

drop policy if exists "Users can view own AI generations" on public.ai_generations;
create policy "Users can view own AI generations"
  on public.ai_generations for select using (user_id = auth.uid());

-- 系统插入（RLS 允许所有认证用户插入自己的记录）
drop policy if exists "Users can insert own AI generations" on public.ai_generations;
create policy "Users can insert own AI generations"
  on public.ai_generations for insert with check (user_id = auth.uid());

-- 不允许更新与删除（保持审计完整性）
