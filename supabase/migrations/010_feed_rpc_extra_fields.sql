-- ============================================================
-- 010: feed RPC 补全字段
-- get_group_feed 新增返回列：
--   repost_comment text —— 转发附言（此前 feed 流不返回，详情页有）
--   group_id        uuid —— 所属圈子（此前 feed 流不返回，恒为空）
--
-- 注意：CREATE OR REPLACE 不能修改函数的返回类型（42P13），
-- 必须先 DROP 再 CREATE。整体包在事务里，避免线上出现函数缺失窗口。
-- 在 Supabase SQL Editor 直接执行本文件即可。
-- ============================================================

begin;

drop function if exists public.get_group_feed(uuid, timestamptz, int, uuid);

create function public.get_group_feed(
  p_group_id uuid,
  p_cursor timestamptz default null,
  p_limit int default 20,
  p_user_id uuid default null
)
returns table (
  id uuid,
  type text,
  content text,
  external_link jsonb,
  created_at timestamptz,
  author jsonb,
  photo_count bigint,
  comment_count bigint,
  like_count bigint,
  is_liked boolean,
  repost_of jsonb,
  repost_comment text,
  group_id uuid
)
language sql stable
as $$
  select
    a.id,
    a.type,
    a.content,
    a.external_link,
    a.created_at,
    a.repost_comment,
    a.group_id,
    jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar_url', p.avatar_url) as author,
    (select count(*) from public.activity_photos ap where ap.activity_id = a.id) as photo_count,
    (select count(*) from public.comments c where c.activity_id = a.id) as comment_count,
    (select count(*) from public.activity_likes l where l.activity_id = a.id) as like_count,
    exists (
      select 1 from public.activity_likes l
      where l.activity_id = a.id and l.user_id = p_user_id
    ) as is_liked,
    case when a.repost_of_id is not null then
      (select jsonb_build_object(
          'id', ra.id,
          'type', ra.type,
          'content', ra.content,
          'external_link', ra.external_link,
          'created_at', ra.created_at,
          'author', jsonb_build_object('id', rp.id, 'nickname', rp.nickname, 'avatar_url', rp.avatar_url)
        )
       from public.activities ra
       join public.profiles rp on ra.author_id = rp.id
       where ra.id = a.repost_of_id)
    else null end as repost_of
  from public.activities a
  join public.profiles p on a.author_id = p.id
  where a.group_id = p_group_id
    and a.created_at < coalesce(p_cursor, now())
  order by a.created_at desc
  limit p_limit;
$$;

commit;
