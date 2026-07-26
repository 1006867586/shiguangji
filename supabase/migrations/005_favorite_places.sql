-- ============================================================
-- 飨刻 (XiangKe) - 店铺收藏夹
-- 文件: 005_favorite_places.sql
-- 说明: 用户从美团/大众点评等收藏夹截图识别后沉淀的店铺列表
-- ============================================================

create table if not exists public.favorite_places (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  title text not null,
  address text,
  phone text,
  signature_dishes text[] not null default '{}'::text[],
  platform text not null default 'unknown' check (platform in (
    'meituan', 'dianping', 'xiaohongshu', 'douyin', 'unknown'
  )),
  summary text not null default '',
  source_screenshot_url text, -- 识别来源截图 URL（可空，便于追溯/重新识别）
  created_at timestamptz not null default now()
);

create index if not exists idx_favorite_places_user
  on public.favorite_places(user_id, created_at desc);

-- 同一用户下同名店铺（同地址）去重，避免重复导入
create unique index if not exists uq_favorite_places_user_title_address
  on public.favorite_places(user_id, lower(trim(title)), coalesce(lower(trim(address)), ''));

-- ============================================================
-- RLS: 仅自己可见、可增删
-- ============================================================
alter table public.favorite_places enable row level security;

drop policy if exists "Users can view own favorite places" on public.favorite_places;
create policy "Users can view own favorite places"
  on public.favorite_places for select using (user_id = auth.uid());

drop policy if exists "Users can insert own favorite places" on public.favorite_places;
create policy "Users can insert own favorite places"
  on public.favorite_places for insert with check (user_id = auth.uid());

drop policy if exists "Users can update own favorite places" on public.favorite_places;
create policy "Users can update own favorite places"
  on public.favorite_places for update using (user_id = auth.uid());

drop policy if exists "Users can delete own favorite places" on public.favorite_places;
create policy "Users can delete own favorite places"
  on public.favorite_places for delete using (user_id = auth.uid());

-- ============================================================
-- Realtime: 用户在自己设备上保持列表实时同步
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname || '.' || tablename = 'public.favorite_places'
  ) then
    alter publication supabase_realtime add table public.favorite_places;
  end if;
end $$;
