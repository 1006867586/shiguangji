-- ============================================================
-- 文件: 032_fix_decor_purchase_points_ambiguous.sql
-- 说明: 修复 purchase_decor_item 报 42702 "column reference points is ambiguous"
--
-- 根因: 函数签名 returns table (points integer, item_id uuid) 自带名为
--       points / item_id 的 OUT 参数；函数体内又出现**未限定表名**的
--       points、item_id 列引用（如 select points into v_points from
--       user_gamification）。PostgreSQL 在这些标识符同时命中「OUT 参数」
--       与「表列」时判定为歧义 → 42702。
--
-- 修复: 将所有与 OUT 参数同名的列引用补上表名（别名）限定，断开歧义。
-- ============================================================

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

  -- 关键修复：points 同时是 OUT 参数名与 user_gamification 列名，必须限定
  select g.points into v_points
  from public.user_gamification g
  where g.user_id = auth.uid();
  v_points := coalesce(v_points, 0);

  -- 关键修复：item_id 同时是 OUT 参数名与 user_decor_items 列名，必须限定
  select exists(
    select 1 from public.user_decor_items ud
    where ud.user_id = auth.uid() and ud.item_id = p_item_id
  ) into v_owns;
  if v_owns then
    raise exception 'DECOR_ALREADY_OWNED';
  end if;

  if v_points < v_item.price then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  update public.user_gamification g
  set points = v_points - v_item.price
  where g.user_id = auth.uid();
  insert into public.user_decor_items (user_id, item_id)
  values (auth.uid(), p_item_id);

  return query select v_points - v_item.price, v_item.id;
end;
$$;

grant execute on function public.purchase_decor_item(uuid) to authenticated;