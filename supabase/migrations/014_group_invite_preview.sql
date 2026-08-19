-- ============================================================
-- 14. 邀请码预览函数
-- ============================================================
-- 通过邀请码查询圈子的公开信息，供「邀请链接落地页」在未登录 / 非成员
-- 状态下也能渲染预览卡片。security definer 绕过 groups 表的 RLS
-- （仅圈子成员可读），调用方仍需持有有效邀请码才能查到结果。
-- 返回 is_member：当前登录用户是否已是该圈子成员（未登录时为 false）。
create or replace function public.get_group_preview_by_code(p_code text)
returns table (
  id uuid,
  name text,
  description text,
  avatar_url text,
  member_count bigint,
  is_member boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  return query
  select
    g.id,
    g.name,
    g.description,
    g.avatar_url,
    coalesce(
      (select count(*) from public.group_members gm where gm.group_id = g.id),
      0
    )::bigint as member_count,
    coalesce(
      (
        select true
        from public.group_members gm
        where gm.group_id = g.id
          and gm.user_id = v_user
        limit 1
      ),
      false
    ) as is_member
  from public.groups g
  where upper(g.invite_code) = upper(p_code);
end;
$$;

grant execute on function public.get_group_preview_by_code(text) to anon, authenticated;
