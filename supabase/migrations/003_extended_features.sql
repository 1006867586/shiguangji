-- ============================================================
-- 飨刻 (XiangKe) - 扩展功能迁移
-- 文件: 003_extended_features.sql
-- 说明: 通知/反应/收藏/标签/评分/RSVP/分摊/置顶/视频/举报/阅读记录等
-- ============================================================

-- ============================================================
-- 1. 通知表
-- ============================================================
create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null, -- 接收者
  actor_id uuid references public.profiles on delete cascade, -- 触发者(可为空,系统通知)
  type text not null check (type in (
    'comment', 'reply', 'like', 'repost', 'mention',
    'photo_added', 'rsvp', 'split', 'group_invite',
    'report_resolved', 'system'
  )),
  activity_id uuid references public.activities on delete cascade,
  group_id uuid references public.groups on delete cascade,
  comment_id uuid references public.comments on delete cascade,
  data jsonb, -- 额外数据
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);

-- ============================================================
-- 2. 多表情反应表(替代单一 like,保留 activity_likes 兼容)
-- ============================================================
create table if not exists public.activity_reactions (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  emoji text not null check (emoji in ('like','love','haha','wow','sad','angry')),
  created_at timestamptz default now(),
  unique (activity_id, user_id, emoji)
);

create index if not exists idx_activity_reactions_activity on public.activity_reactions(activity_id, emoji);
create index if not exists idx_activity_reactions_user on public.activity_reactions(user_id);

-- ============================================================
-- 3. 收藏表
-- ============================================================
create table if not exists public.activity_favorites (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  created_at timestamptz default now(),
  unique (activity_id, user_id)
);

create index if not exists idx_activity_favorites_user on public.activity_favorites(user_id, created_at desc);

-- ============================================================
-- 4. 标签表 + 活动标签关联
-- ============================================================
create table if not exists public.tags (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups on delete cascade not null,
  name text not null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz default now(),
  unique (group_id, name)
);

create table if not exists public.activity_tags (
  activity_id uuid references public.activities on delete cascade not null,
  tag_id uuid references public.tags on delete cascade not null,
  created_at timestamptz default now(),
  primary key (activity_id, tag_id)
);

create index if not exists idx_activity_tags_tag on public.activity_tags(tag_id);
create index if not exists idx_tags_group on public.tags(group_id, name);

-- ============================================================
-- 5. 评分表(团体成员对活动/餐厅的评分)
-- ============================================================
create table if not exists public.activity_ratings (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  score smallint not null check (score >= 1 and score <= 5),
  comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (activity_id, user_id)
);

create index if not exists idx_activity_ratings_activity on public.activity_ratings(activity_id);

-- ============================================================
-- 6. RSVP 报名表
-- ============================================================
create table if not exists public.activity_rsvp (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  status text not null check (status in ('attending','maybe','declined')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (activity_id, user_id)
);

create index if not exists idx_activity_rsvp_activity on public.activity_rsvp(activity_id, status);

-- ============================================================
-- 7. AA 账单分摊表
-- ============================================================
create table if not exists public.activity_splits (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  group_id uuid references public.groups on delete cascade not null,
  created_by uuid references public.profiles on delete cascade not null,
  title text not null default '聚餐账单',
  total_amount integer not null check (total_amount >= 0), -- 单位:分
  currency text not null default 'CNY',
  split_mode text not null default 'equal' check (split_mode in ('equal','custom')),
  status text not null default 'open' check (status in ('open','settled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.split_participants (
  id uuid default uuid_generate_v4() primary key,
  split_id uuid references public.activity_splits on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  share_amount integer not null default 0, -- 单位:分(custom 模式下使用)
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique (split_id, user_id)
);

create index if not exists idx_activity_splits_activity on public.activity_splits(activity_id);
create index if not exists idx_split_participants_split on public.split_participants(split_id);

-- ============================================================
-- 8. 活动 Pin 置顶表
-- ============================================================
create table if not exists public.activity_pins (
  activity_id uuid references public.activities on delete cascade primary key,
  pinned_by uuid references public.profiles on delete set null not null,
  pinned_at timestamptz default now()
);

create index if not exists idx_activity_pins_pinned on public.activity_pins(pinned_at desc);

-- ============================================================
-- 9. 媒体类型扩展(在 activity_photos 上加 kind 列)
-- ============================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'activity_photos' and column_name = 'kind') then
    alter table public.activity_photos add column kind text not null default 'image' check (kind in ('image','video'));
  end if;
end $$;

create index if not exists idx_activity_photos_kind on public.activity_photos(activity_id, kind);

-- ============================================================
-- 10. 内容举报表
-- ============================================================
create table if not exists public.content_reports (
  id uuid default uuid_generate_v4() primary key,
  reporter_id uuid references public.profiles on delete cascade not null,
  target_type text not null check (target_type in ('activity','comment','photo')),
  target_id uuid not null,
  group_id uuid references public.groups on delete cascade not null,
  reason text not null check (reason in ('spam','abuse','porn','illegal','other')),
  detail text,
  status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  resolved_by uuid references public.profiles on delete set null,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_content_reports_status on public.content_reports(status, created_at desc);
create index if not exists idx_content_reports_target on public.content_reports(target_type, target_id);

-- ============================================================
-- 11. 阅读记录表(已读活动)
-- ============================================================
create table if not exists public.activity_reads (
  activity_id uuid references public.activities on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  read_at timestamptz default now(),
  primary key (activity_id, user_id)
);

create index if not exists idx_activity_reads_user on public.activity_reads(user_id, read_at desc);

-- ============================================================
-- 12. 团体设置扩展(在 groups 上加列)
-- ============================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'groups' and column_name = 'settings') then
    alter table public.groups add column settings jsonb default '{}'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'groups' and column_name = 'updated_at') then
    alter table public.groups add column updated_at timestamptz default now();
  end if;
end $$;

-- ============================================================
-- 13. RLS 策略
-- ============================================================
alter table public.notifications enable row level security;
alter table public.activity_reactions enable row level security;
alter table public.activity_favorites enable row level security;
alter table public.tags enable row level security;
alter table public.activity_tags enable row level security;
alter table public.activity_ratings enable row level security;
alter table public.activity_rsvp enable row level security;
alter table public.activity_splits enable row level security;
alter table public.split_participants enable row level security;
alter table public.activity_pins enable row level security;
alter table public.content_reports enable row level security;
alter table public.activity_reads enable row level security;

-- notifications: 仅自己可见
drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
  on public.notifications for select using (user_id = auth.uid());

drop policy if exists "System can insert notifications" on public.notifications;
create policy "System can insert notifications"
  on public.notifications for insert with check (true);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update using (user_id = auth.uid());

drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
  on public.notifications for delete using (user_id = auth.uid());

-- activity_reactions: 团体成员可读,自己可增删
drop policy if exists "Reactions viewable by group members" on public.activity_reactions;
create policy "Reactions viewable by group members"
  on public.activity_reactions for select using (exists (
    select 1 from public.activities a
    where a.id = activity_reactions.activity_id and public.is_group_member(a.group_id)
  ));

drop policy if exists "Group members can react" on public.activity_reactions;
create policy "Group members can react"
  on public.activity_reactions for insert with check (
    exists (select 1 from public.activities a
            where a.id = activity_reactions.activity_id
              and public.is_group_member(a.group_id))
    and user_id = auth.uid()
  );

drop policy if exists "Users can remove own reactions" on public.activity_reactions;
create policy "Users can remove own reactions"
  on public.activity_reactions for delete using (user_id = auth.uid());

-- activity_favorites: 仅自己可见
drop policy if exists "Users can view own favorites" on public.activity_favorites;
create policy "Users can view own favorites"
  on public.activity_favorites for select using (user_id = auth.uid());

drop policy if exists "Group members can favorite" on public.activity_favorites;
create policy "Group members can favorite"
  on public.activity_favorites for insert with check (
    exists (select 1 from public.activities a
            where a.id = activity_favorites.activity_id
              and public.is_group_member(a.group_id))
    and user_id = auth.uid()
  );

drop policy if exists "Users can remove own favorites" on public.activity_favorites;
create policy "Users can remove own favorites"
  on public.activity_favorites for delete using (user_id = auth.uid());

-- tags: 团体成员可读,成员可创建
drop policy if exists "Tags viewable by group members" on public.tags;
create policy "Tags viewable by group members"
  on public.tags for select using (public.is_group_member(tags.group_id));

drop policy if exists "Group members can create tags" on public.tags;
create policy "Group members can create tags"
  on public.tags for insert with check (
    public.is_group_member(group_id) and created_by = auth.uid()
  );

drop policy if exists "Tag creator can delete" on public.tags;
create policy "Tag creator can delete"
  on public.tags for delete using (created_by = auth.uid());

-- activity_tags: 团体成员可读,成员可增删
drop policy if exists "Activity tags viewable by group members" on public.activity_tags;
create policy "Activity tags viewable by group members"
  on public.activity_tags for select using (exists (
    select 1 from public.activities a
    where a.id = activity_tags.activity_id and public.is_group_member(a.group_id)
  ));

drop policy if exists "Group members can add activity tags" on public.activity_tags;
create policy "Group members can add activity tags"
  on public.activity_tags for insert with check (exists (
    select 1 from public.activities a
    where a.id = activity_tags.activity_id and public.is_group_member(a.group_id)
  ));

drop policy if exists "Group members can remove activity tags" on public.activity_tags;
create policy "Group members can remove activity tags"
  on public.activity_tags for delete using (exists (
    select 1 from public.activities a
    where a.id = activity_tags.activity_id and public.is_group_member(a.group_id)
  ));

-- activity_ratings: 团体成员可读,自己可增删改
drop policy if exists "Ratings viewable by group members" on public.activity_ratings;
create policy "Ratings viewable by group members"
  on public.activity_ratings for select using (exists (
    select 1 from public.activities a
    where a.id = activity_ratings.activity_id and public.is_group_member(a.group_id)
  ));

drop policy if exists "Group members can rate" on public.activity_ratings;
create policy "Group members can rate"
  on public.activity_ratings for insert with check (
    exists (select 1 from public.activities a
            where a.id = activity_ratings.activity_id
              and public.is_group_member(a.group_id))
    and user_id = auth.uid()
  );

drop policy if exists "Users can update own ratings" on public.activity_ratings;
create policy "Users can update own ratings"
  on public.activity_ratings for update using (user_id = auth.uid());

drop policy if exists "Users can delete own ratings" on public.activity_ratings;
create policy "Users can delete own ratings"
  on public.activity_ratings for delete using (user_id = auth.uid());

-- activity_rsvp: 同 ratings
drop policy if exists "RSVP viewable by group members" on public.activity_rsvp;
create policy "RSVP viewable by group members"
  on public.activity_rsvp for select using (exists (
    select 1 from public.activities a
    where a.id = activity_rsvp.activity_id and public.is_group_member(a.group_id)
  ));

drop policy if exists "Group members can RSVP" on public.activity_rsvp;
create policy "Group members can RSVP"
  on public.activity_rsvp for insert with check (
    exists (select 1 from public.activities a
            where a.id = activity_rsvp.activity_id
              and public.is_group_member(a.group_id))
    and user_id = auth.uid()
  );

drop policy if exists "Users can update own RSVP" on public.activity_rsvp;
create policy "Users can update own RSVP"
  on public.activity_rsvp for update using (user_id = auth.uid());

drop policy if exists "Users can delete own RSVP" on public.activity_rsvp;
create policy "Users can delete own RSVP"
  on public.activity_rsvp for delete using (user_id = auth.uid());

-- activity_splits: 团体成员可读,作者可增删改
drop policy if exists "Splits viewable by group members" on public.activity_splits;
create policy "Splits viewable by group members"
  on public.activity_splits for select using (public.is_group_member(group_id));

drop policy if exists "Group members can create splits" on public.activity_splits;
create policy "Group members can create splits"
  on public.activity_splits for insert with check (
    public.is_group_member(group_id) and created_by = auth.uid()
  );

drop policy if exists "Split creator can update" on public.activity_splits;
create policy "Split creator can update"
  on public.activity_splits for update using (created_by = auth.uid());

drop policy if exists "Split creator can delete" on public.activity_splits;
create policy "Split creator can delete"
  on public.activity_splits for delete using (created_by = auth.uid());

-- split_participants: 团体成员可读,自己可改 paid 状态
drop policy if exists "Split participants viewable by group members" on public.split_participants;
create policy "Split participants viewable by group members"
  on public.split_participants for select using (exists (
    select 1 from public.activity_splits s
    where s.id = split_participants.split_id and public.is_group_member(s.group_id)
  ));

drop policy if exists "Split creator can manage participants" on public.split_participants;
create policy "Split creator can manage participants"
  on public.split_participants for all using (exists (
    select 1 from public.activity_splits s
    where s.id = split_participants.split_id and s.created_by = auth.uid()
  ));

drop policy if exists "Users can mark own payment" on public.split_participants;
create policy "Users can mark own payment"
  on public.split_participants for update using (user_id = auth.uid());

-- activity_pins: 团体成员可读,管理员可增删
drop policy if exists "Pins viewable by group members" on public.activity_pins;
create policy "Pins viewable by group members"
  on public.activity_pins for select using (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = activity_pins.activity_id
      and gm.user_id = auth.uid()
      and gm.role = 'admin'
  ));

drop policy if exists "Admins can pin" on public.activity_pins;
create policy "Admins can pin"
  on public.activity_pins for insert with check (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = activity_pins.activity_id
      and gm.user_id = auth.uid()
      and gm.role = 'admin'
  ));

drop policy if exists "Admins can unpin" on public.activity_pins;
create policy "Admins can unpin"
  on public.activity_pins for delete using (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = activity_pins.activity_id
      and gm.user_id = auth.uid()
      and gm.role = 'admin'
  ));

-- content_reports: 举报者自己可见,管理员可见
drop policy if exists "Users can view own reports" on public.content_reports;
create policy "Users can view own reports"
  on public.content_reports for select using (
    reporter_id = auth.uid() or exists (
      select 1 from public.group_members gm
      where gm.group_id = content_reports.group_id
        and gm.user_id = auth.uid()
        and gm.role = 'admin'
    )
  );

drop policy if exists "Group members can report" on public.content_reports;
create policy "Group members can report"
  on public.content_reports for insert with check (
    public.is_group_member(group_id) and reporter_id = auth.uid()
  );

drop policy if exists "Admins can resolve reports" on public.content_reports;
create policy "Admins can resolve reports"
  on public.content_reports for update using (exists (
    select 1 from public.group_members gm
    where gm.group_id = content_reports.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'admin'
  ));

-- activity_reads: 仅自己可见
drop policy if exists "Users can view own reads" on public.activity_reads;
create policy "Users can view own reads"
  on public.activity_reads for select using (user_id = auth.uid());

drop policy if exists "Users can mark own reads" on public.activity_reads;
create policy "Users can mark own reads"
  on public.activity_reads for insert with check (user_id = auth.uid());

drop policy if exists "Users can upsert own reads" on public.activity_reads;
create policy "Users can upsert own reads"
  on public.activity_reads for update using (user_id = auth.uid());

-- groups.settings 更新权限(管理员)
drop policy if exists "Group admins can update settings" on public.groups;
create policy "Group admins can update settings"
  on public.groups for update using (exists (
    select 1 from public.group_members gm
    where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'admin'
  ));

-- ============================================================
-- 14. 触发器:自动维护 updated_at
-- ============================================================
drop trigger if exists trg_activity_ratings_touch on public.activity_ratings;
create trigger trg_activity_ratings_touch
  before update on public.activity_ratings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_activity_rsvp_touch on public.activity_rsvp;
create trigger trg_activity_rsvp_touch
  before update on public.activity_rsvp
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_activity_splits_touch on public.activity_splits;
create trigger trg_activity_splits_touch
  before update on public.activity_splits
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_split_participants_touch on public.split_participants;
create trigger trg_split_participants_touch
  before update on public.split_participants
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_groups_touch on public.groups;
create trigger trg_groups_touch
  before update on public.groups
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 15. 触发器:点赞时同步写入 reaction(向后兼容)
-- ============================================================
create or replace function public.sync_like_to_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 插入 like 反应(若已存在则忽略)
  insert into public.activity_reactions (activity_id, user_id, emoji)
  values (new.activity_id, new.user_id, 'like')
  on conflict (activity_id, user_id, emoji) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_like_to_reaction on public.activity_likes;
create trigger trg_like_to_reaction
  after insert on public.activity_likes
  for each row execute function public.sync_like_to_reaction();

create or replace function public.sync_like_delete_to_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.activity_reactions
  where activity_id = old.activity_id and user_id = old.user_id and emoji = 'like';
  return old;
end;
$$;

drop trigger if exists trg_like_delete_to_reaction on public.activity_likes;
create trigger trg_like_delete_to_reaction
  after delete on public.activity_likes
  for each row execute function public.sync_like_delete_to_reaction();

-- ============================================================
-- 16. 触发器:评论/点赞/转发/照片时自动创建通知
-- ============================================================
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
    insert into public.notifications (user_id, actor_id, type, activity_id, group_id, comment_id)
    select c.author_id, new.author_id, 'reply', new.activity_id, v_activity_group_id, new.id
    from public.comments c where c.id = new.parent_id and c.author_id <> new.author_id
    on conflict do nothing;
  else
    if v_activity_author is not null and v_activity_author <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, activity_id, group_id, comment_id)
      values (v_activity_author, new.author_id, 'comment', new.activity_id, v_activity_group_id, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_group uuid;
begin
  select author_id, group_id into v_author, v_group from public.activities where id = new.activity_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, activity_id, group_id)
    values (v_author, new.user_id, 'like', new.activity_id, v_group)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_like on public.activity_likes;
create trigger trg_notify_like
  after insert on public.activity_likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_repost()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_orig_author uuid;
begin
  if new.type = 'repost' and new.repost_of_id is not null then
    select author_id into v_orig_author from public.activities where id = new.repost_of_id;
    if v_orig_author is not null and v_orig_author <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, activity_id, group_id)
      values (v_orig_author, new.author_id, 'repost', new.repost_of_id, new.group_id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_repost on public.activities;
create trigger trg_notify_repost
  after insert on public.activities
  for each row execute function public.notify_on_repost();

create or replace function public.notify_on_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_group uuid;
begin
  select a.author_id, a.group_id into v_author, v_group
  from public.activities a where a.id = new.activity_id;
  if v_author is not null and v_author <> new.uploaded_by then
    insert into public.notifications (user_id, actor_id, type, activity_id, group_id)
    values (v_author, new.uploaded_by, 'photo_added', new.activity_id, v_group)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_photo on public.activity_photos;
create trigger trg_notify_photo
  after insert on public.activity_photos
  for each row execute function public.notify_on_photo();

-- ============================================================
-- 17. 重置邀请码函数
-- ============================================================
create or replace function public.reset_invite_code(p_group_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_code text;
begin
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

-- ============================================================
-- 18. 转让管理员函数
-- ============================================================
create or replace function public.transfer_group_admin(
  p_group_id uuid,
  p_new_admin uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_target_is_member boolean;
begin
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

  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_new_admin
  ) into v_target_is_member;

  if not v_target_is_member then
    raise exception '目标用户不是团体成员';
  end if;

  update public.group_members set role = 'member' where group_id = p_group_id and user_id = v_user;
  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = p_new_admin;
  update public.groups set created_by = p_new_admin where id = p_group_id;
end;
$$;

-- ============================================================
-- 19. 移除成员函数
-- ============================================================
create or replace function public.remove_group_member(
  p_group_id uuid,
  p_user_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_target_is_admin boolean;
  v_member_count integer;
begin
  if v_user is null then
    raise exception '未登录' using errcode = '42501';
  end if;

  if v_user = p_user_id then
    raise exception '不能移除自己,请使用退出团体';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_user and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception '无权限' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id and role = 'admin'
  ) into v_target_is_admin;

  if v_target_is_admin then
    raise exception '不能移除其他管理员,请先转让管理员';
  end if;

  select count(*) into v_member_count from public.group_members where group_id = p_group_id;
  if v_member_count <= 1 then
    raise exception '团体只剩一个成员,无法移除';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- ============================================================
-- 20. Realtime 配置
-- ============================================================
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.activity_reactions;
alter publication supabase_realtime add table public.activity_favorites;
alter publication supabase_realtime add table public.activity_rsvp;
alter publication supabase_realtime add table public.activity_splits;
alter publication supabase_realtime add table public.activity_pins;
alter publication supabase_realtime add table public.activity_ratings;
