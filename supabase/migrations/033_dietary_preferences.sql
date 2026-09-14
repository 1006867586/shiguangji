-- ============================================================
-- 文件: 033_dietary_preferences.sql
-- 说明: 忌口 / 口味档案 + 转盘候选项适配标签
--
-- 设计要点：
--   1. 人的忌口挂在 profiles 上（1:1，与现有人读策略一致：profiles 全员可读）
--   2. 餐厅侧的 dietary_tags 是「能满足的忌口」白名单，不是黑名单
--      —— 现实中非素食馆也能做素菜，用黑名单直接排除会误杀
--   3. 抽签时按「所有参与成员的忌口是否都被该餐厅满足」分级：
--      strict 模式只抽完全满足的；无结果时降级为宽松并给出提示
--   4. 圈子忌口汇总走 RPC 而非应用层 join，避免 N+1
-- ============================================================

-- 1. 人的忌口档案
alter table public.profiles
  add column if not exists dietary_tags text[] not null default '{}';
alter table public.profiles
  add column if not exists dietary_note text;

comment on column public.profiles.dietary_tags is
  '忌口标签 key 数组，取值见 lib/dietary.ts 的 DIETARY_TAGS';
comment on column public.profiles.dietary_note is
  '自由补充的忌口说明，如「花生严重过敏，会休克」';

-- 2. 转盘候选项的「能满足的忌口」白名单 + 菜系
alter table public.meal_roulette_items
  add column if not exists cuisine text;
alter table public.meal_roulette_items
  add column if not exists dietary_tags text[] not null default '{}';

comment on column public.meal_roulette_items.cuisine is
  '菜系 / 品类，如 川菜 / 火锅 / 日料，展示与后续推荐用';
comment on column public.meal_roulette_items.dietary_tags is
  '该餐厅能满足的忌口标签（白名单），空数组=未标注';

-- 3. 索引（数组列用 GIN 才能走索引contains 查询）
create index if not exists profiles_dietary_tags_gin
  on public.profiles using gin (dietary_tags);
create index if not exists meal_roulette_items_dietary_tags_gin
  on public.meal_roulette_items using gin (dietary_tags);

-- 4. 圈子忌口汇总
--    security definer 自行校验成员身份；
--    返回每种忌口的「人数 + 昵称列表」，供转盘页展示"本局需注意"。
--    昵称属于同圈子成员已在其他页面可见的数据，不构成新的信息暴露。
create or replace function public.get_group_dietary_summary(p_group_id uuid)
returns table (tag text, member_count integer, nicknames text[])
language sql
stable
security definer
set search_path = public
as $$
  select
    t.tag,
    count(*)::integer as member_count,
    array_agg(p.nickname order by p.nickname) as nicknames
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  cross join lateral unnest(p.dietary_tags) as t(tag)
  where gm.group_id = p_group_id
    -- 调用者必须是该圈子成员
    and exists (
      select 1 from public.group_members m
      where m.group_id = p_group_id and m.user_id = auth.uid()
    )
  group by t.tag
  order by count(*) desc, t.tag asc;
$$;

grant execute on function public.get_group_dietary_summary(uuid) to authenticated;

-- 5. 单个圈子成员的忌口明细（供转盘按"参与成员"而非全员过滤）
--    同样校验调用者成员身份。
create or replace function public.get_group_member_dietary(p_group_id uuid)
returns table (
  user_id uuid,
  nickname text,
  avatar_url text,
  dietary_tags text[],
  dietary_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nickname,
    p.avatar_url,
    p.dietary_tags,
    p.dietary_note
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and exists (
      select 1 from public.group_members m
      where m.group_id = p_group_id and m.user_id = auth.uid()
    )
  order by gm.joined_at asc;
$$;

grant execute on function public.get_group_member_dietary(uuid) to authenticated;
