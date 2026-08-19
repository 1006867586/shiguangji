-- ============================================================
-- 文件: 016_user_gamification.sql
-- 说明: 积分 / 成就 / 连续打卡（聚餐即打卡）
--   打卡 = 报名并参加聚餐(activity_rsvp.status='attending')
--   连续打卡天数 = 按聚餐日期(activities.created_at::date)连续天数
--   积分 = 聚餐*5 + 发动态*10 + 加入圈子*5
-- ============================================================

-- 1. 用户游戏化汇总表
create table if not exists public.user_gamification (
  user_id          uuid references public.profiles(id) on delete cascade primary key,
  points           integer not null default 0,
  streak_count     integer not null default 0,        -- 连续打卡天数
  last_meal_date   date,                              -- 最近一顿的日期
  total_meals      integer not null default 0,        -- 累计吃了几顿
  meals_this_week  integer not null default 0,        -- 本周吃了几顿
  circles_joined   integer not null default 0,        -- 加入圈子数
  activities_created integer not null default 0,      -- 发起聚餐/动态数
  updated_at       timestamptz not null default now()
);

-- 2. 成就目录
create table if not exists public.achievements (
  id         uuid default uuid_generate_v4() primary key,
  key        text unique not null,
  name       text not null,
  description text not null,
  icon       text not null,
  rule_type  text not null check (rule_type in ('meals_this_week','total_meals','streak','circles_joined','activities_created')),
  threshold  integer not null,
  sort_order integer not null default 0
);

-- 3. 用户已获得成就
create table if not exists public.user_achievements (
  user_id       uuid references public.profiles(id) on delete cascade,
  achievement_id uuid references public.achievements(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists idx_user_achievements_user on public.user_achievements(user_id);

-- 4. 种子成就
insert into public.achievements (key, name, description, icon, rule_type, threshold, sort_order) values
  ('meals_week_5',  '本周吃了5顿', '这一周参加了 5 顿聚餐',        '🍽️', 'meals_this_week', 5,  10),
  ('meals_week_10', '本周吃了10顿', '这一周参加了 10 顿聚餐',       '🔥', 'meals_this_week', 10, 20),
  ('total_meals_20','美食家',      '累计参加了 20 顿聚餐',         '🏅', 'total_meals',    20, 30),
  ('streak_3',      '连续打卡3天', '连续 3 天都有聚餐',            '⚡', 'streak',         3,  40),
  ('streak_7',      '一周不缺席',  '连续 7 天都有聚餐',            '📅', 'streak',         7,  50),
  ('circles_3',     '社交达人',    '加入了 3 个圈子',              '👥', 'circles_joined', 3,  60),
  ('activities_1',  '发起人',      '发起了 1 个聚餐 / 动态',       '🎉', 'activities_created', 1, 70)
on conflict (key) do nothing;

-- 5. 重算函数（security definer，绕过 RLS 自行读写）
create or replace function public.recalc_gamification(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_meals int := 0;
  v_meals_week  int := 0;
  v_streak      int := 0;
  v_last_meal   date;
  v_circles     int := 0;
  v_activities  int := 0;
  v_points      int := 0;
  v_meal_dates  date[];
  v_cur         date;
  v_today       date := current_date;
  v_ach         record;
  v_metric      int;
  v_already     boolean;
begin
  -- 聚餐日：attending 报名对应活动的创建日
  select
    coalesce(count(distinct a.id), 0),
    coalesce(count(distinct a.id) filter (
      where a.created_at >= date_trunc('week', v_today)
        and a.created_at < date_trunc('week', v_today) + interval '7 days'
    ), 0),
    array_agg(distinct (a.created_at::date) order by a.created_at::date desc),
    max(a.created_at::date)
  into v_total_meals, v_meals_week, v_meal_dates, v_last_meal
  from public.activity_rsvp r
  join public.activities a on a.id = r.activity_id
  where r.user_id = p_user_id and r.status = 'attending';

  select coalesce(count(*), 0) into v_circles from public.group_members where user_id = p_user_id;
  select coalesce(count(*), 0) into v_activities from public.activities where author_id = p_user_id;

  -- 连续打卡：从最近聚餐日往前数连续天数（最近一天须为今天或昨天）
  if v_meal_dates is not null and array_length(v_meal_dates, 1) > 0 then
    v_cur := v_meal_dates[1];
    if v_cur = v_today or v_cur = v_today - 1 then
      v_streak := 1;
      for i in 2..array_length(v_meal_dates, 1) loop
        if v_meal_dates[i] = v_cur - 1 then
          v_streak := v_streak + 1;
          v_cur := v_cur - 1;
        else
          exit;
        end if;
      end loop;
    end if;
  end if;

  v_points := v_total_meals * 5 + v_activities * 10 + v_circles * 5;

  insert into public.user_gamification
    (user_id, points, streak_count, last_meal_date, total_meals, meals_this_week, circles_joined, activities_created, updated_at)
  values
    (p_user_id, v_points, v_streak, v_last_meal, v_total_meals, v_meals_week, v_circles, v_activities, now())
  on conflict (user_id) do update set
    points = excluded.points,
    streak_count = excluded.streak_count,
    last_meal_date = excluded.last_meal_date,
    total_meals = excluded.total_meals,
    meals_this_week = excluded.meals_this_week,
    circles_joined = excluded.circles_joined,
    activities_created = excluded.activities_created,
    updated_at = excluded.updated_at;

  -- 成就评估：仅解锁新成就并推送通知
  for v_ach in select * from public.achievements order by sort_order loop
    v_already := exists(
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = v_ach.id
    );
    if not v_already then
      v_metric := case v_ach.rule_type
        when 'meals_this_week'   then v_meals_week
        when 'total_meals'       then v_total_meals
        when 'streak'            then v_streak
        when 'circles_joined'    then v_circles
        when 'activities_created' then v_activities
        else 0
      end;
      if v_metric >= v_ach.threshold then
        insert into public.user_achievements (user_id, achievement_id)
        values (p_user_id, v_ach.id);
        insert into public.notifications (user_id, actor_id, type, data)
        values (
          p_user_id, p_user_id, 'system',
          jsonb_build_object('kind', 'achievement', 'key', v_ach.key, 'name', v_ach.name, 'icon', v_ach.icon)
        );
      end if;
    end if;
  end loop;
end;
$$;

-- 6. 触发器函数
create or replace function public.trg_gamification_after_rsvp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_gamification(old.user_id);
    return old;
  end if;
  -- 进入或离开 attending 都需重算
  if new.status = 'attending' or old.status = 'attending' then
    perform public.recalc_gamification(new.user_id);
  end if;
  return new;
end;
$$;

create or replace function public.trg_gamification_after_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_gamification(new.author_id);
  return new;
end;
$$;

create or replace function public.trg_gamification_after_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_gamification(old.user_id);
    return old;
  end if;
  perform public.recalc_gamification(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_activity_rsvp_gamification on public.activity_rsvp;
create trigger trg_activity_rsvp_gamification
  after insert or update or delete on public.activity_rsvp
  for each row execute function public.trg_gamification_after_rsvp();

drop trigger if exists trg_activities_gamification on public.activities;
create trigger trg_activities_gamification
  after insert on public.activities
  for each row execute function public.trg_gamification_after_activity();

drop trigger if exists trg_group_members_gamification on public.group_members;
create trigger trg_group_members_gamification
  after insert or delete on public.group_members
  for each row execute function public.trg_gamification_after_member();

-- 7. RLS
alter table public.user_gamification enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

drop policy if exists "gamification_self_read" on public.user_gamification;
create policy "gamification_self_read" on public.user_gamification
  for select using (auth.uid() = user_id);

drop policy if exists "achievements_public_read" on public.achievements;
create policy "achievements_public_read" on public.achievements
  for select using (true);

drop policy if exists "user_achievements_self_read" on public.user_achievements;
create policy "user_achievements_self_read" on public.user_achievements
  for select using (auth.uid() = user_id);

-- 8. 授权
grant execute on function public.recalc_gamification(uuid) to authenticated, anon;
