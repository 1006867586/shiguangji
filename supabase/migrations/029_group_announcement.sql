-- ============================================================
-- 文件: 029_group_announcement.sql
-- 说明: 圈子公告（置顶）—— groups 增加 announcement 文本字段
--   设置权限：圈子创建者 / 管理员（group_members.role = admin）
-- ============================================================

alter table public.groups
  add column if not exists announcement text;

-- 更新公告的安全函数：仅创建者 / 管理员可调用
create or replace function public.set_group_announcement(p_group_id uuid, p_announcement text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 必须为圈子成员，且为创建者或 admin
  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and (
        gm.role = 'admin'
        or exists (
          select 1 from public.groups g
          where g.id = p_group_id and g.created_by = auth.uid()
        )
      )
  ) then
    raise exception '无权限修改公告';
  end if;

  update public.groups
    set announcement = nullif(trim(p_announcement), '')
  where id = p_group_id;

  return p_announcement;
end;
$$;

grant execute on function public.set_group_announcement(uuid, text) to authenticated;