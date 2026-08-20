-- 023: 通知补齐内容预览
--
-- 背景：comment / reply / like / repost / photo_added 通知由触发器创建，
-- 但插入时未写入 data，导致通知列表只能显示「某人评论了你的动态」这类干巴巴的文案。
-- 本迁移覆写相关触发器，把届时可见的内容片段写入 notifications.data.preview，
-- 前端 NotificationsList.extractPreview 据此渲染两行预览。

-- 1. 评论 / 回复：预览为评论正文
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_activity_group_id uuid;
  v_activity_author uuid;
begin
  select group_id, author_id into v_activity_group_id, v_activity_author
  from public.activities where id = new.activity_id;

  -- 楼中楼回复:通知父评论作者;否则通知活动作者
  if new.parent_id is not null then
    insert into public.notifications (user_id, actor_id, type, activity_id, group_id, comment_id, data)
    select c.author_id, new.author_id, 'reply', new.activity_id, v_activity_group_id, new.id,
           jsonb_build_object('preview', new.content)
    from public.comments c where c.id = new.parent_id and c.author_id <> new.author_id
    on conflict do nothing;
  else
    if v_activity_author is not null and v_activity_author <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, activity_id, group_id, comment_id, data)
      values (v_activity_author, new.author_id, 'comment', new.activity_id, v_activity_group_id, new.id,
              jsonb_build_object('preview', new.content));
    end if;
  end if;
  return new;
end;
$$;

-- 2. 点赞：预览为被赞动态的内容或标题
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_group uuid;
  v_preview text;
begin
  select author_id, group_id,
         coalesce(nullif(a.content, ''), a.external_link->>'title', null)
    into v_author, v_group, v_preview
  from public.activities a where a.id = new.activity_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, activity_id, group_id, data)
    values (v_author, new.user_id, 'like', new.activity_id, v_group,
            case when v_preview is null then null
                 else jsonb_build_object('preview', left(v_preview, 100)) end)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- 3. 转发：预览为转发附言，其次原动态内容
create or replace function public.notify_on_repost()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_orig_author uuid;
  v_preview text;
begin
  if new.type = 'repost' and new.repost_of_id is not null then
    select author_id into v_orig_author from public.activities where id = new.repost_of_id;
    if v_orig_author is not null and v_orig_author <> new.author_id then
      v_preview := coalesce(nullif(new.repost_comment, ''), new.content);
      insert into public.notifications (user_id, actor_id, type, activity_id, group_id, data)
      values (v_orig_author, new.author_id, 'repost', new.repost_of_id, new.group_id,
              case when v_preview is null then null
                   else jsonb_build_object('preview', left(v_preview, 100)) end)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- 4. 补充照片：预览为照片标题
create or replace function public.notify_on_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_group uuid;
begin
  select a.author_id, a.group_id into v_author, v_group
  from public.activities a where a.id = new.activity_id;
  if v_author is not null and v_author <> new.uploaded_by then
    insert into public.notifications (user_id, actor_id, type, activity_id, group_id, data)
    values (v_author, new.uploaded_by, 'photo_added', new.activity_id, v_group,
            case when nullif(new.caption, '') is null then null
                 else jsonb_build_object('preview', left(new.caption, 100)) end)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- 触发器本身不需要重挂载（函数体覆写即可），保持原有 trg_notify_* 定义不变