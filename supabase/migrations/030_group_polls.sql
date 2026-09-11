-- ============================================================
-- 文件: 030_group_polls.sql
-- 说明: 圈内投票 / 接龙
--   1. group_polls        —— 投票/接龙主体
--   2. group_poll_options —— 投票选项（poll 用）
--   3. group_poll_entries —— 参与记录（投票勾选项 / 接龙自由填写）
-- ============================================================

create table if not exists public.group_polls (
  id          uuid primary key default uuid_generate_v4(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'poll' check (kind in ('poll','rollcall')),
  title       text not null,
  multiple    boolean not null default false,   -- poll：是否多选
  status      text not null default 'open' check (status in ('open','closed')),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create index if not exists idx_group_polls_group on public.group_polls(group_id, created_at);

-- 投票选项（kind='poll'）
create table if not exists public.group_poll_options (
  id         uuid primary key default uuid_generate_v4(),
  poll_id    uuid not null references public.group_polls(id) on delete cascade,
  label      text not null,
  sort_order integer not null default 0,
  unique (poll_id, sort_order)
);

-- 参与记录：poll -> 勾选某选项；rollcall -> 自由内容（option_id 为 null）
create table if not exists public.group_poll_entries (
  id         uuid primary key default uuid_generate_v4(),
  poll_id    uuid not null references public.group_polls(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  option_id  uuid references public.group_poll_options(id) on delete cascade,
  content    text,     -- rollcall：接龙补充内容（可空）
  created_at timestamptz not null default now(),
  unique (poll_id, user_id, option_id)
);

create index if not exists idx_group_poll_entries_poll on public.group_poll_entries(poll_id);
create index if not exists idx_group_poll_entries_option on public.group_poll_entries(option_id);
create index if not exists idx_group_poll_options_poll on public.group_poll_options(poll_id);

-- ==================== RLS ====================

alter table public.group_polls enable row level security;
alter table public.group_poll_options enable row level security;
alter table public.group_poll_entries enable row level security;

-- 仅圈子成员可读投票
drop policy if exists "group_polls_select_members" on public.group_polls;
create policy "group_polls_select_members"
  on public.group_polls for select
  using (exists (
    select 1 from public.group_members gm
    where gm.group_id = group_polls.group_id and gm.user_id = auth.uid()
  ));

-- 成员可在圈内发起投票/接龙
drop policy if exists "group_polls_insert_members" on public.group_polls;
create policy "group_polls_insert_members"
  on public.group_polls for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = group_polls.group_id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_poll_options_select_members" on public.group_poll_options;
create policy "group_poll_options_select_members"
  on public.group_poll_options for select
  using (exists (
    select 1 from public.group_polls p
    join public.group_members gm on gm.group_id = p.group_id and gm.user_id = auth.uid()
    where p.id = group_poll_options.poll_id
  ));

drop policy if exists "group_poll_options_insert" on public.group_poll_options;
create policy "group_poll_options_insert"
  on public.group_poll_options for insert
  with check (exists (
    select 1 from public.group_polls p
    where p.id = group_poll_options.poll_id and p.created_by = auth.uid()
  ));

drop policy if exists "group_poll_entries_select" on public.group_poll_entries;
create policy "group_poll_entries_select"
  on public.group_poll_entries for select
  using (exists (
    select 1 from public.group_polls p
    join public.group_members gm on gm.group_id = p.group_id and gm.user_id = auth.uid()
    where p.id = group_poll_entries.poll_id
  ));

-- 成员可参与：只能为自己记录
drop policy if exists "group_poll_entries_insert" on public.group_poll_entries;
create policy "group_poll_entries_insert"
  on public.group_poll_entries for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_polls p
      join public.group_members gm on gm.group_id = p.group_id and gm.user_id = auth.uid()
      where p.id = group_poll_entries.poll_id
    )
  );

-- 本人可撤销自己的参与记录
drop policy if exists "group_poll_entries_delete" on public.group_poll_entries;
create policy "group_poll_entries_delete"
  on public.group_poll_entries for delete
  using (user_id = auth.uid());

-- ==================== 聊天流载体 ====================
-- 投票卡片作为聊天消息实体：group_messages 新增 poll_id，消息进入聊天流即实时可见
alter table public.group_messages add column if not exists poll_id uuid references public.group_polls(id) on delete cascade;

drop index if exists idx_group_messages_poll; 
create index if not exists idx_group_messages_poll on public.group_messages(poll_id);

-- ==================== 实时广播 ====================
-- 参与人数变化实时更新前端卡片
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_poll_entries;
  end if;
exception when duplicate_object then null;
end
$$;

-- ==================== 事务化创建投票/接龙 ====================
-- 一次调用：插入 poll + 全部选项，返回新投票 id
create or replace function public.create_group_poll(
  p_group_id uuid,
  p_kind text,
  p_title text,
  p_multiple boolean,
  p_options text[]   -- poll 的选项列表；rollcall 传空数组
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_poll_id uuid;
  v_index integer;
begin
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  ) then
    raise exception '无权发起投票';
  end if;

  if p_kind not in ('poll','rollcall') then
    raise exception '投票类型无效';
  end if;

  insert into public.group_polls (group_id, created_by, kind, title, multiple)
  values (p_group_id, auth.uid(), p_kind, nullif(trim(p_title), ''), coalesce(p_multiple, false))
  returning id into v_poll_id;

  if p_kind = 'poll' then
    for v_index in array_lower(p_options, 1)..array_upper(p_options, 1) loop
      if nullif(trim(p_options[v_index]), '') is not null then
        insert into public.group_poll_options (poll_id, label, sort_order)
        values (v_poll_id, trim(p_options[v_index]), v_index - array_lower(p_options, 1));
      end if;
    end loop;
  end if;

  return v_poll_id;
end;
$$;