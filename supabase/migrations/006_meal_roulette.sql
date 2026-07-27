-- ============================================================
-- 飨刻 (XiangKe) - 今天吃什么（团体转盘候选池）
-- 文件: 006_meal_roulette.sql
-- 说明: 团体级共享候选池，成员可增添/删除，转盘随机抽取
-- ============================================================

create table if not exists public.meal_roulette_items (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups on delete cascade not null,
  title text not null,
  address text,
  phone text,
  signature_dishes text[] not null default '{}'::text[],
  added_by uuid references public.profiles on delete set null not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meal_roulette_items_group
  on public.meal_roulette_items(group_id, created_at desc);

-- 同一团体下同名同地址去重，避免成员重复添加
create unique index if not exists uq_meal_roulette_items_group_title_address
  on public.meal_roulette_items(group_id, lower(trim(title)), coalesce(lower(trim(address)), ''));

-- ============================================================
-- RLS: 团体成员可读、可增删
-- ============================================================
alter table public.meal_roulette_items enable row level security;

drop policy if exists "Group members can view meal roulette items" on public.meal_roulette_items;
create policy "Group members can view meal roulette items"
  on public.meal_roulette_items for select using (public.is_group_member(group_id));

drop policy if exists "Group members can add meal roulette items" on public.meal_roulette_items;
create policy "Group members can add meal roulette items"
  on public.meal_roulette_items for insert with check (
    public.is_group_member(group_id) and added_by = auth.uid()
  );

drop policy if exists "Group members can delete meal roulette items" on public.meal_roulette_items;
create policy "Group members can delete meal roulette items"
  on public.meal_roulette_items for delete using (public.is_group_member(group_id));

-- ============================================================
-- Realtime: 团体成员间实时同步候选池
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname || '.' || tablename = 'public.meal_roulette_items'
  ) then
    alter publication supabase_realtime add table public.meal_roulette_items;
  end if;
end $$;
