-- ============================================================
-- 011: 转盘可分享池（免登录）
-- roulette_pools：分享池（每个池一个唯一 code，供分享卡片/链接进入）
-- roulette_pool_items：池内候选（created_by = 设备匿名 ID，仅可删自己添加的）
-- 删除用 security definer 函数 delete_roulette_pool_item 校验 created_by，
-- 即使直连 PostgREST 也无法删别人的条目。
-- ============================================================

create table if not exists public.roulette_pools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.roulette_pool_items (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.roulette_pools(id) on delete cascade,
  title text not null,
  address text,
  phone text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists roulette_pool_items_pool_id_idx
  on public.roulette_pool_items(pool_id);
create index if not exists roulette_pools_code_idx
  on public.roulette_pools(code);

alter table public.roulette_pools enable row level security;
alter table public.roulette_pool_items enable row level security;

-- 免登录：匿名可读池与条目、可插入（删除走 security definer 函数）
create policy "roulette_pools_select_public" on public.roulette_pools
  for select to anon, authenticated using (true);
create policy "roulette_pools_insert_public" on public.roulette_pools
  for insert to anon, authenticated with check (true);
create policy "roulette_pool_items_select_public" on public.roulette_pool_items
  for select to anon, authenticated using (true);
create policy "roulette_pool_items_insert_public" on public.roulette_pool_items
  for insert to anon, authenticated with check (true);

-- 删除条目：仅当 created_by 匹配（security definer 绕过 RLS，自行校验）
create or replace function public.delete_roulette_pool_item(
  p_item_id uuid,
  p_created_by text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by text;
begin
  select created_by into v_created_by
    from public.roulette_pool_items
    where id = p_item_id;
  if v_created_by is null then
    return false;
  end if;
  if v_created_by <> p_created_by then
    return false;
  end if;
  delete from public.roulette_pool_items where id = p_item_id;
  return true;
end;
$$;

grant execute on function public.delete_roulette_pool_item(uuid, text) to anon, authenticated;
