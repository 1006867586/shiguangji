-- ============================================================
-- 017: 名称旁成就徽章的数据支撑
--   1. get_unlocked_achievements_for_users(uuid[]) — security definer
--      批量返回多个用户「已解锁」的成就(jsonb 数组)，绕过 user_achievements
--      的 RLS（否则非本人只能看到自己的成就，feed/成员列表无法显示他人徽章）。
--   2. get_group_feed 作者/转发作者的 jsonb 增加 achievements 字段
--      （沿用 012 的 drop+create 事务写法，参数签名保持不变以兼容应用层）。
-- 整体包在事务里，Supabase SQL Editor 直接执行本文件即可。
-- ============================================================

begin;

-- 1. 批量查询已解锁成就（security definer 绕过 RLS）
create or replace function public.get_unlocked_achievements_for_users(p_user_ids uuid[])
returns table (
  user_id uuid,
  achievements jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    ua.user_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'icon', a.icon,
          'description', a.description,
          'rule_type', a.rule_type,
          'threshold', a.threshold,
          'unlocked', true
        )
        order by a.sort_order
      ) filter (where a.id is not null),
      '[]'::jsonb
    ) as achievements
  from public.user_achievements ua
  join public.achievements a on a.id = ua.achievement_id
  where ua.user_id = any(p_user_ids)
    and ua.unlocked_at is not null
  group by ua.user_id
$$;

grant execute on function public.get_unlocked_achievements_for_users(uuid[]) to authenticated, anon;

-- 2. 给 get_group_feed 的作者补充 achievements
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
    jsonb_build_object(
      'id', p.id,
      'nickname', p.nickname,
      'avatar_url', p.avatar_url,
      'achievements', coalesce(
        (select achievements
         from public.get_unlocked_achievements_for_users(array[p.id])
         limit 1),
        '[]'::jsonb
      )
    ) as author,
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
          'author', jsonb_build_object(
            'id', rp.id,
            'nickname', rp.nickname,
            'avatar_url', rp.avatar_url,
            'achievements', coalesce(
              (select achievements
               from public.get_unlocked_achievements_for_users(array[rp.id])
               limit 1),
              '[]'::jsonb
            )
          )
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
