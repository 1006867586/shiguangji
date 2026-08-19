-- ============================================================
-- 解散圈子（仅管理员）
-- 用于「圈子管理」页面的危险区操作：删除圈子并级联清理成员/活动。
-- groups 主表被删会由外键 ON DELETE CASCADE 自动清理
-- group_members、activities 及其子表（照片/评论/点赞等）。
-- ============================================================
create or replace function public.dissolve_group(
  p_group_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_member_count integer;
begin
  if v_user is null then
    raise exception '未登录' using errcode = '42501';
  end if;

  -- 仅圈子管理员可解散
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_user and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception '无权限' using errcode = '42501';
  end if;

  -- 仅剩自己时不允许用「解散」代替「退出」，引导走退出圈子流程
  select count(*) into v_member_count
    from public.group_members where group_id = p_group_id;
  if v_member_count <= 1 then
    raise exception '圈子只剩一个成员,请使用退出圈子';
  end if;

  -- 主表删除触发级联清理
  delete from public.groups where id = p_group_id;
end;
$$;

grant execute on function public.dissolve_group(uuid) to authenticated;
