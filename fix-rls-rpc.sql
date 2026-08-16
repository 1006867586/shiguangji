-- ===================================================================
-- 修复 RLS 阻挡 RPC 跨圈子查询的 bug
--
-- 根因：groups / group_members 等表的 SELECT RLS 策略是
--   "is_group_member(group_id)"——只有圈子成员能查。
--   security definer 函数虽然以定义者身份运行，但仍受 RLS 限制，
--   导致"按邀请码查找目标圈子"这类调用方尚未加入目标圈子的查询
--   永远返回 not found。
--
-- 修复：在 RPC 函数内显式 set local row_security = off，
--   让函数内的查询绕过 RLS（只对该事务生效，不影响外层调用）。
-- ===================================================================

-- 修复 1：join_group_by_code（按邀请码查找 + 加入）
create or replace function public.join_group_by_code(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_group public.groups;
begin
  -- 关闭本事务的 RLS，让"按邀请码查找任意圈子"能查到目标
  set local row_security = off;

  if v_user is null then
    raise exception '未登录' using errcode = '42501';
  end if;

  select * into v_group from public.groups where upper(invite_code) = upper(p_code);
  if not found then
    raise exception '邀请码无效或团体不存在';
  end if;

  if exists (select 1 from public.group_members where group_id = v_group.id and user_id = v_user) then
    return v_group;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user, 'member');

  return v_group;
end;
$$;

-- 修复 2：create_group（生成唯一邀请码时的撞码检查）
-- 新用户没加入任何圈子，RLS 会挡住撞码检查，导致重复邀请码被生成。
create or replace function public.create_group(
  p_name text,
  p_description text default null,
  p_avatar_url text default null
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_group public.groups;
  v_code text;
begin
  -- 关闭本事务的 RLS，让"邀请码唯一性检查"能看到全表
  set local row_security = off;

  if v_user is null then
    raise exception '未登录' using errcode = '42501';
  end if;

  -- 生成唯一邀请码（最多 5 次重试）
  for i in 1..5 loop
    v_code := public.generate_invite_code();
    if not exists (select 1 from public.groups where invite_code = v_code) then
      exit;
    end if;
    v_code := null;
  end loop;

  if v_code is null then
    raise exception '邀请码生成失败';
  end if;

  -- 插入团体
  insert into public.groups (name, description, avatar_url, invite_code, created_by)
  values (p_name, p_description, p_avatar_url, v_code, v_user)
  returning * into v_group;

  -- 创建者自动加入为 admin（这一步 insert 受 RLS 限制，但 SECURITY DEFINER
  -- 加 service role 权限足以绕过 insert 策略的 with check 检查）
  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user, 'admin');

  return v_group;
end;
$$;

-- 修复 3：reset_invite_code（管理员重置邀请码时的撞码检查）
-- admin 只能 SELECT 自己圈子，看不到其他圈子，导致撞码检查永远返回 false。
create or replace function public.reset_invite_code(p_group_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_code text;
begin
  -- 关闭本事务的 RLS，让"邀请码唯一性检查"能看到全表
  -- (admin 权限已经在手动验证中完成，所以这里关 RLS 安全)
  set local row_security = off;

  if v_user is null then
    raise exception '未登录' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_user and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception '无权限' using errcode = '42501';
  end if;

  for i in 1..5 loop
    v_code := public.generate_invite_code();
    if not exists (select 1 from public.groups where invite_code = v_code and id <> p_group_id) then
      update public.groups set invite_code = v_code where id = p_group_id;
      return v_code;
    end if;
    v_code := null;
  end loop;

  raise exception '邀请码生成失败';
end;
$$;
