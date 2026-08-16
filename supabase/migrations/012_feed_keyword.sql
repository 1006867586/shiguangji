-- ============================================================
-- 012: feed 支持关键词搜索
-- get_group_feed 新增参数 p_keyword text default null：
--   非空时对 content（正文）与 external_link（标题/描述）做 ILIKE 模糊匹配。
--
-- 注意（同 010）：
-- 1. 参数列表变化无法 CREATE OR REPLACE，必须先 DROP 再 CREATE。
-- 2. SELECT 列顺序必须与 returns table 声明一致，新增列放末尾。
-- 3. p_keyword 放参数表末尾并给 default null，兼容应用层不传。
-- 整体包在事务里。在 Supabase SQL Editor 直接执行本文件即可。
-- ============================================================

begin;

drop function if exists public.get_group_feed(uuid, timestamptz, int, uuid, text);

create function public.get_group_feed(
  p_group_id uuid,
  p_cursor timestamptz default null,
  p_limit int default 20,
  p_user_id uuid default null,
  p_keyword text default null
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
    else null end as repost_of,
    a.repost_comment,
    a.group_id
  from public.activities a
  join public.profiles p on a.author_id = p.id
  where a.group_id = p_group_id
    and a.created_at < coalesce(p_cursor, now())
    and (
      p_keyword is null
      or p_keyword = ''
      or a.content ilike '%' || p_keyword || '%'
      or a.external_link->>'title' ilike '%' || p_keyword || '%'
      or a.external_link->>'description' ilike '%' || p_keyword || '%'
    )
  order by a.created_at desc
  limit p_limit;
$$;

commit;
