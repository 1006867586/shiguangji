-- ============================================================
-- 文件: 027_chat_unread.sql
-- 说明: 聊天未读红点
--   1. group_members.last_read_at —— 每个成员在每个圈子的「已读时间线」
--   2. 未读计数 RPC（支持单圈子 / 全部圈子）
--   3. 标记已读 RPC（无 UPDATE RLS，走 security definer）
-- ============================================================

-- 已读时间线：新成员默认 now()，存量行由 default 自动回填为 now()，避免上线即误报未读
alter table public.group_members
  add column if not exists last_read_at timestamptz not null default now();

-- 未读计数查询所需索引（group_id + sender_id + created_at）
create index if not exists idx_group_messages_group_sender_created
  on public.group_messages (group_id, sender_id, created_at);

-- ==================== 未读计数 RPC ====================
-- 当前用户在圈子里的未读消息数（排除自己的消息、只算 last_read_at 之后）
-- p_group_id 为 null 时返回全部圈子（为后续圈子列表红点预留）
create or replace function public.get_chat_unread_count(p_group_id uuid)
returns table (group_id uuid, unread_count bigint)
language sql
security definer
stable
set search_path = public
as $$
  select gm.group_id,
         count(m.id)::bigint as unread_count
  from public.group_members gm
  left join public.group_messages m
         on m.group_id = gm.group_id
        and m.sender_id <> gm.user_id
        and m.created_at > coalesce(gm.last_read_at, gm.joined_at, now())
  where gm.user_id = auth.uid()
    and (p_group_id is null or gm.group_id = p_group_id)
  group by gm.group_id;
$$;

-- ==================== 标记已读 RPC ====================
-- 打开聊天页时把该圈子 last_read_at 推到当前时间
create or replace function public.mark_group_chat_read(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_members
     set last_read_at = now()
   where group_id = p_group_id
     and user_id = auth.uid();
end;
$$;

-- 授权
grant execute on function public.get_chat_unread_count(uuid) to authenticated;
grant execute on function public.mark_group_chat_read(uuid) to authenticated;
