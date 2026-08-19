-- ============================================================
-- 飨刻 (XiangKe) - 美食打卡地图
-- 文件: 018_food_checkin_map.sql
-- 说明: 打卡地点主档 + 打卡记录；places 全站共享、checkins 仅本人可见（PIPL）
--      圈子打卡聚合走 security definer RPC（成员校验 + 脱敏，不暴露打卡人）
-- ============================================================

-- ============================================================
-- 1. places —— 打卡地点主档（共享 POI 注册表，全站统一去重）
-- ============================================================
create table if not exists public.places (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  address text,
  city text,
  district text,
  category text,               -- 品类：咖啡/餐厅/酒吧/甜品…
  lng numeric(10,6) not null,  -- GCJ-02 经度
  lat numeric(10,6) not null,  -- GCJ-02 纬度
  source text not null default 'manual' check (source in ('amap','baidu','tencent','manual')),
  poi_id text,                 -- 来源平台 POI ID（amap id / baidu uid），去重锚
  created_by uuid references public.profiles on delete set null,
  status text not null default 'approved' check (status in ('approved','pending_review','rejected')),
  created_at timestamptz not null default now()
);

-- 来源平台去重（有 poi_id 才参与）
create unique index if not exists uq_places_source_poi
  on public.places(source, poi_id) where poi_id is not null;

-- 手动/兜底去重：同名同城同坐标视为同一店
create unique index if not exists uq_places_name_city_lng_lat
  on public.places(lower(trim(name)), city, lng, lat);

-- 按城市/品类筛选
create index if not exists idx_places_city_category
  on public.places(city, category);
create index if not exists idx_places_lng_lat
  on public.places(lng, lat);

-- RLS：已审核地点对登录用户公开可读；登录用户可贡献写入
alter table public.places enable row level security;

drop policy if exists "places select approved" on public.places;
create policy "places select approved"
  on public.places for select using (status = 'approved');

drop policy if exists "places insert logged in" on public.places;
create policy "places insert logged in"
  on public.places for insert with check (auth.uid() is not null);

-- ============================================================
-- 2. checkins —— 打卡记录（个人私密，仅本人可读写）
--    activity_id 可空：关联聚餐活动时，圈子聚合可通过
--    activities.group_id 推导；纯个人足迹打卡不强制关联
-- ============================================================
create table if not exists public.checkins (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  place_id uuid references public.places on delete cascade not null,
  activity_id uuid references public.activities on delete set null,
  note text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_checkins_user
  on public.checkins(user_id, checked_at desc);
create index if not exists idx_checkins_place
  on public.checkins(place_id);
create index if not exists idx_checkins_activity
  on public.checkins(activity_id) where activity_id is not null;

-- RLS：仅本人
alter table public.checkins enable row level security;

drop policy if exists "checkins select own" on public.checkins;
create policy "checkins select own"
  on public.checkins for select using (user_id = auth.uid());

drop policy if exists "checkins insert own" on public.checkins;
create policy "checkins insert own"
  on public.checkins for insert with check (user_id = auth.uid());

drop policy if exists "checkins update own" on public.checkins;
create policy "checkins update own"
  on public.checkins for update using (user_id = auth.uid());

drop policy if exists "checkins delete own" on public.checkins;
create policy "checkins delete own"
  on public.checkins for delete using (user_id = auth.uid());

-- ============================================================
-- 3. 圈子打卡聚合（security definer + 成员校验 + 脱敏）
--    只返回 地点 + 打卡数 + 最近打卡时间，不暴露打卡人身份
-- ============================================================
create or replace function public.get_group_checkin_places(p_group_id uuid)
returns table (
  place_id uuid,
  name text,
  address text,
  category text,
  lng numeric,
  lat numeric,
  checkin_count bigint,
  last_checked_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  ) then
    raise exception 'not a member';
  end if;
  return query
    select p.id, p.name, p.address, p.category, p.lng, p.lat,
           count(c.id)::bigint as checkin_count,
           max(c.checked_at) as last_checked_at
    from public.checkins c
    join public.activities a on a.id = c.activity_id
    join public.places p on p.id = c.place_id
    where a.group_id = p_group_id
    group by p.id
    order by checkin_count desc, last_checked_at desc nulls last;
end; $$;

grant execute on function public.get_group_checkin_places(uuid) to authenticated;
