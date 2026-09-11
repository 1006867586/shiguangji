-- ============================================================
-- 文件: 028_chat_extras.sql
-- 说明: 群聊扩展 —— 消息表情回应 + 引用回复
--   1. message_reactions   —— 消息 emoji 回应（一人每个 emoji 一条）
--   2. group_messages.reply_to_id —— 引用某条消息（文本回复/被引用内容预览）
-- ============================================================

-- ==================== 一、消息表情回应 ====================
create table if not exists public.message_reactions (
  id         uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists idx_message_reactions_message
  on public.message_reactions (message_id);

-- 开启实时广播（回应实时显示）
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
exception when duplicate_object then null;
end
$$;

alter table public.message_reactions enable row level security;

-- 成员可读
drop policy if exists "message_reactions_select_for_members" on public.message_reactions;
create policy "message_reactions_select_for_members"
  on public.message_reactions for select
  using (exists (
    select 1 from public.group_messages gm
    join public.group_members mem on mem.group_id = gm.group_id
    where gm.id = message_reactions.message_id and mem.user_id = auth.uid()
  ));

-- 本人可增
drop policy if exists "message_reactions_insert_for_members" on public.message_reactions;
create policy "message_reactions_insert_for_members"
  on public.message_reactions for insert
  with check (user_id = auth.uid());

-- 本人可删（取消自己加的表情）
drop policy if exists "message_reactions_delete_for_members" on public.message_reactions;
create policy "message_reactions_delete_for_members"
  on public.message_reactions for delete
  using (user_id = auth.uid());

-- ==================== 二、引用回复 ====================
-- 群消息增加「引用某条消息」字段
alter table public.group_messages
  add column if not exists reply_to_id uuid references public.group_messages(id) on delete set null;

create index if not exists idx_group_messages_reply_to
  on public.group_messages (reply_to_id);