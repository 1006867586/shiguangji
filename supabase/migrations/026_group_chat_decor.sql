-- ============================================================
-- 文件: 026_group_chat_decor.sql
-- 说明: 群组聊天 + 装饰装扮系统（徽章佩戴 / 头像框 / 商城兑换）
--   1. group_messages   —— 圈子聊天消息（文本 / 图片）
--   2. decor_items      —— 装饰目录（badge / avatar_frame）
--   3. user_decor_items —— 用户已拥有项（成就联动 / 商城购买）
--   4. user_decor_display —— 用户佩戴配置（当前头像框 + 佩戴徽章）
-- ============================================================

-- ==================== 一、群组聊天 ====================
create table if not exists public.group_messages (
  id         uuid primary key default uuid_generate_v4(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  sender_id  uuid not null references auth.users(id) on delete cascade,
  type       text not null default 'text' check (type in ('text','image')),
  content    text,
  image_url  text,
  created_at timestamptz not null default now()
);

create index if not exists idx_group_messages_group_created
  on public.group_messages (group_id, created_at);

-- 开启实时广播
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_messages;
  end if;
exception when duplicate_object then null;
end
$$;

alter table public.group_messages enable row level security;

drop policy if exists "group_messages_select_for_members" on public.group_messages;
create policy "group_messages_select_for_members"
  on public.group_messages for select
  using (exists (
    select 1 from public.group_members gm
    where gm.group_id = group_messages.group_id and gm.user_id = auth.uid()
  ));

drop policy if exists "group_messages_insert_for_members" on public.group_messages;
create policy "group_messages_insert_for_members"
  on public.group_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = group_messages.group_id and gm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 二、装饰装扮系统
-- ============================================================

-- 装饰目录
create table if not exists public.decor_items (
  id              uuid primary key default uuid_generate_v4(),
  kind            text not null check (kind in ('badge','avatar_frame')),
  key             text unique not null,
  name            text not null,
  description     text,
  icon            text,             -- 徽章 emoji
  color           text,             -- 徽章底色 / 头像框环色（hex）
  frame_style     text not null default 'ring',  -- 头像框风格（占位，详情见前端渲染）
  price           integer not null default 0,     -- 积分价；0 = 不可购买（成就联动）
  unlock_type     text not null default 'shop' check (unlock_type in ('shop','achievement','system')),
  achievement_key text,             -- 关联的成就 key（unlock_type='achievement' 时使用）
  sort_order      integer not null default 0
);

-- 用户已拥有项
create table if not exists public.user_decor_items (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  item_id  uuid not null references public.decor_items(id) on delete cascade,
  owned_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- 佩戴配置
create table if not exists public.user_decor_display (
  user_id         uuid not null references public.profiles(id) on delete cascade primary key,
  avatar_frame_id uuid references public.decor_items(id) on delete set null,
  badge_ids       uuid[] not null default '{}',
  updated_at      timestamptz not null default now()
);

create index if not exists idx_user_decor_items_user on public.user_decor_items(user_id);
create index if not exists idx_user_decor_items_item on public.user_decor_items(item_id);

-- RLS
alter table public.decor_items enable row level security;
drop policy if exists "decor_items_read" on public.decor_items;
create policy "decor_items_read" on public.decor_items for select using (true);

alter table public.user_decor_items enable row level security;
drop policy if exists "user_decor_items_self_read" on public.user_decor_items;
create policy "user_decor_items_self_read"
  on public.user_decor_items for select using (auth.uid() = user_id);

alter table public.user_decor_display enable row level security;
drop policy if exists "user_decor_display_self_read" on public.user_decor_display;
create policy "user_decor_display_self_read"
  on public.user_decor_display for select using (auth.uid() = user_id);

-- ==================== 三、种子数据 ====================

-- 成就联动徽章（price=0，解锁成就是时自动获得）
insert into public.decor_items
  (kind, key, name, description, icon, color, price, unlock_type, achievement_key, sort_order)
values
  ('badge', 'badge_meals_week_5',   '本周吃了5顿', '这一周参加了 5 顿聚餐',        '🍽️', '#f59e0b', 0, 'achievement', 'meals_week_5',   10),
  ('badge', 'badge_meals_week_10',  '本周吃了10顿','这一周参加了 10 顿聚餐',       '🔥', '#ef4444', 0, 'achievement', 'meals_week_10',  20),
  ('badge', 'badge_total_meals_20', '美食家',       '累计参加了 20 顿聚餐',         '🏅', '#f59e0b', 0, 'achievement', 'total_meals_20',30),
  ('badge', 'badge_streak_3',       '连续打卡3天',   '连续 3 天都有聚餐',            '⚡', '#8b5cf6', 0, 'achievement', 'streak_3',       40),
  ('badge', 'badge_streak_7',       '一周不缺席',    '连续 7 天都有聚餐',            '📅', '#38bdf8', 0, 'achievement', 'streak_7',       50),
  ('badge', 'badge_circles_3',      '社交达人',      '加入了 3 个圈子',              '👥', '#10b981', 0, 'achievement', 'circles_3',      60),
  ('badge', 'badge_activities_1',   '发起人',        '发起了 1 个聚餐 / 动态',       '🎉', '#ec4899', 0, 'achievement', 'activities_1',   70)
on conflict (key) do nothing;

-- 商城徽章（可购买）
insert into public.decor_items
  (kind, key, name, description, icon, color, price, unlock_type, sort_order)
values
  ('badge', 'badge_star',       '闪耀之星',   '用 10 积分兑换',   '⭐',  '#fde047', 10, 'shop', 80),
  ('badge', 'badge_cup',        '干饭冠军',   '用 20 积分兑换',   '🏆',  '#f59e0b', 20, 'shop', 90),
  ('badge', 'badge_hotpot',     '火锅信徒',   '用 30 积分兑换',   '🍲',  '#ef4444', 30, 'shop', 100),
  ('badge', 'badge_crown',      '饕餮之王',   '用 50 积分兑换',   '👑',  '#a16207', 50, 'shop', 110)
on conflict (key) do nothing;

-- 头像框（免费一款 + 商城数款）
insert into public.decor_items
  (kind, key, name, description, icon, color, price, unlock_type, sort_order)
values
  ('avatar_frame', 'frame_gold',      '鎏金头像框', '用 30 积分兑换', '🖼️', '#f5b840', 30, 'shop', 120),
  ('avatar_frame', 'frame_rose',      '玫红头像框', '用 20 积分兑换', '🖼️', '#ec4899', 20, 'shop', 130),
  ('avatar_frame', 'frame_sky',       '天蓝头像框', '用 20 积分兑换', '🖼️', '#38bdf8', 20, 'shop', 140),
  ('avatar_frame', 'frame_emerald',   '翠绿头像框', '用 20 积分兑换', '🖼️', '#34d399', 20, 'shop', 150),
  ('avatar_frame', 'frame_onyx',      '曜黑头像框', '免费，首次兑换', '🖼️', '#1e293b', 0, 'shop', 160)
on conflict (key) do nothing;

-- 存量数据回填：已解锁成就 → 自动获得对应徽章（历史用户不依赖触发器）
insert into public.user_decor_items (user_id, item_id)
select ua.user_id, di.id
from public.user_achievements ua
join public.achievements a on a.id = ua.achievement_id
join public.decor_items di on di.achievement_key = a.key
on conflict (user_id, item_id) do nothing;

-- ==================== 四、成就解锁 → 自动拥有对应徽章 ====================
create or replace function public.trg_decor_auto_own_achievement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_decor_items (user_id, item_id)
  select new.user_id, di.id
  from public.decor_items di
  join public.achievements a on a.key = di.achievement_key
  where a.id = new.achievement_id
  on conflict (user_id, item_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_user_achievements_decor on public.user_achievements;
create trigger trg_user_achievements_decor
  after insert on public.user_achievements
  for each row execute function public.trg_decor_auto_own_achievement();

-- ==================== 五、装饰 RPC（security definer，绕过仅本人读 RLS） ====================

-- 批量读取多个用户的佩戴配置（供成员列表 / 其他地方展示他人徽章）
create or replace function public.get_users_decor_display(p_user_ids uuid[])
returns table (user_id uuid, avatar_frame_id uuid, badge_ids uuid[])
language sql
security definer
stable
set search_path = public
as $$
  select d.user_id, d.avatar_frame_id, d.badge_ids
  from public.user_decor_display d
  where d.user_id = any(p_user_ids);
$$;

-- 购买装饰（扣积分 + 记拥有）
create or replace function public.purchase_decor_item(p_item_id uuid)
returns table (points integer, item_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.decor_items%rowtype;
  v_points int;
  v_owns boolean;
begin
  select * into v_item from public.decor_items where id = p_item_id;
  if not found then
    raise exception 'DECOR_NOT_FOUND';
  end if;
  if v_item.price is null or v_item.price <= 0 then
    raise exception 'DECOR_NOT_PURCHASABLE';
  end if;

  select points into v_points from public.user_gamification where user_id = auth.uid();
  v_points := coalesce(v_points, 0);

  select exists(
    select 1 from public.user_decor_items
    where user_id = auth.uid() and item_id = p_item_id
  ) into v_owns;
  if v_owns then
    raise exception 'DECOR_ALREADY_OWNED';
  end if;

  if v_points < v_item.price then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  update public.user_gamification set points = v_points - v_item.price where user_id = auth.uid();
  insert into public.user_decor_items (user_id, item_id) values (auth.uid(), p_item_id);

  return query select v_points - v_item.price, v_item.id;
end;
$$;

-- 保存佩戴配置（校验已拥有）
create or replace function public.set_user_decor_display(p_avatar_frame_id uuid, p_badge_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frame_owned boolean;
  v_badges_owned boolean;
begin
  p_badge_ids := coalesce(p_badge_ids, '{}');
  p_badge_ids := (select array_agg(distinct x) from unnest(p_badge_ids) x);

  if p_avatar_frame_id is not null then
    select exists(
      select 1 from public.user_decor_items ud
      join public.decor_items di on di.id = ud.item_id
      where ud.user_id = auth.uid()
        and ud.item_id = p_avatar_frame_id
        and di.kind = 'avatar_frame'
    ) into v_frame_owned;
    if not coalesce(v_frame_owned, false) then raise exception 'FRAME_NOT_OWNED'; end if;
  end if;

  if cardinality(p_badge_ids) > 0 then
    select count(*) = cardinality(p_badge_ids) into v_badges_owned
    from public.user_decor_items ud
    join public.decor_items di on di.id = ud.item_id
    where ud.user_id = auth.uid()
      and ud.item_id = any(p_badge_ids)
      and di.kind = 'badge';
    if not coalesce(v_badges_owned, false) then raise exception 'BADGE_NOT_OWNED'; end if;
  end if;

  insert into public.user_decor_display (user_id, avatar_frame_id, badge_ids, updated_at)
  values (auth.uid(), p_avatar_frame_id, p_badge_ids, now())
  on conflict (user_id) do update set
    avatar_frame_id = excluded.avatar_frame_id,
    badge_ids = excluded.badge_ids,
    updated_at = excluded.updated_at;
end;
$$;

-- 授权
grant execute on function public.get_users_decor_display(uuid[]) to authenticated, anon;
grant execute on function public.purchase_decor_item(uuid) to authenticated;
grant execute on function public.set_user_decor_display(uuid, uuid[]) to authenticated;