-- ============================================================
-- 飨刻 (XiangKe) - 数据库初始化
-- 文件: 001_init.sql
-- 说明: 创建全部表结构、索引、RLS 策略、Feed 查询函数、触发器
-- ============================================================

-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. 表结构
-- ============================================================

-- 用户资料表（扩展 Supabase Auth）
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nickname text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- 团体表
create table if not exists public.groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  avatar_url text,
  invite_code text unique not null,
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

-- 团体成员关系表
create table if not exists public.group_members (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz default now(),
  unique (group_id, user_id)
);

-- 活动/动态表（朋友圈核心）
create table if not exists public.activities (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups on delete cascade not null,
  author_id uuid references auth.users not null,
  type text not null default 'original' check (type in ('original', 'repost')),
  content text,
  external_link jsonb,
  repost_of_id uuid references public.activities on delete set null,
  repost_comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 活动照片表
create table if not exists public.activity_photos (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  uploaded_by uuid references auth.users not null,
  url text not null,
  caption text,
  created_at timestamptz default now()
);

-- 评论表
create table if not exists public.comments (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  author_id uuid references auth.users not null,
  content text not null,
  parent_id uuid references public.comments on delete cascade,
  created_at timestamptz default now()
);

-- 点赞表
create table if not exists public.activity_likes (
  id uuid default uuid_generate_v4() primary key,
  activity_id uuid references public.activities on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  created_at timestamptz default now(),
  unique (activity_id, user_id)
);

-- ============================================================
-- 2. 索引
-- ============================================================
create index if not exists idx_activities_group_created on public.activities(group_id, created_at desc);
create index if not exists idx_activities_repost_of on public.activities(repost_of_id);
create index if not exists idx_activity_photos_activity on public.activity_photos(activity_id, created_at);
create index if not exists idx_comments_activity on public.comments(activity_id, created_at);
create index if not exists idx_comments_parent on public.comments(parent_id);
create index if not exists idx_activity_likes_activity on public.activity_likes(activity_id);
create index if not exists idx_activity_likes_user on public.activity_likes(user_id);
create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_group_members_group on public.group_members(group_id);
create index if not exists idx_groups_invite_code on public.groups(invite_code);

-- ============================================================
-- 3. updated_at 自动更新触发器
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_activities_touch on public.activities;
create trigger trg_activities_touch
  before update on public.activities
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 4. 新用户注册时自动创建 profile
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5. Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.activities enable row level security;
alter table public.activity_photos enable row level security;
alter table public.comments enable row level security;
alter table public.activity_likes enable row level security;

-- profiles
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- groups
drop policy if exists "Group members can view group" on public.groups;
create policy "Group members can view group"
  on public.groups for select
  using (exists (
    select 1 from public.group_members gm
    where gm.group_id = groups.id and gm.user_id = auth.uid()
  ));

drop policy if exists "Group creator can update" on public.groups;
create policy "Group creator can update"
  on public.groups for update
  using (created_by = auth.uid());

drop policy if exists "Authenticated users can create group" on public.groups;
create policy "Authenticated users can create group"
  on public.groups for insert
  with check (created_by = auth.uid());

-- group_members
drop policy if exists "Members visible to groupmates" on public.group_members;
create policy "Members visible to groupmates"
  on public.group_members for select
  using (exists (
    select 1 from public.group_members gm
    where gm.group_id = group_members.group_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Users can join via invite" on public.group_members;
create policy "Users can join via invite"
  on public.group_members for insert
  with check (user_id = auth.uid());

drop policy if exists "Members can leave group" on public.group_members;
create policy "Members can leave group"
  on public.group_members for delete
  using (user_id = auth.uid());

-- activities
drop policy if exists "Activities viewable by group members" on public.activities;
create policy "Activities viewable by group members"
  on public.activities for select
  using (exists (
    select 1 from public.group_members gm
    where gm.group_id = activities.group_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Group members can create activities" on public.activities;
create policy "Group members can create activities"
  on public.activities for insert
  with check (exists (
    select 1 from public.group_members gm
    where gm.group_id = activities.group_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Authors can update own activities" on public.activities;
create policy "Authors can update own activities"
  on public.activities for update
  using (author_id = auth.uid());

drop policy if exists "Authors can delete own activities" on public.activities;
create policy "Authors can delete own activities"
  on public.activities for delete
  using (author_id = auth.uid());

-- activity_photos
drop policy if exists "Photos viewable by group members" on public.activity_photos;
create policy "Photos viewable by group members"
  on public.activity_photos for select
  using (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = activity_photos.activity_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Group members can add photos" on public.activity_photos;
create policy "Group members can add photos"
  on public.activity_photos for insert
  with check (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = activity_photos.activity_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Photo owner can delete" on public.activity_photos;
create policy "Photo owner can delete"
  on public.activity_photos for delete
  using (uploaded_by = auth.uid());

-- comments
drop policy if exists "Comments viewable by group members" on public.comments;
create policy "Comments viewable by group members"
  on public.comments for select
  using (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = comments.activity_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Group members can comment" on public.comments;
create policy "Group members can comment"
  on public.comments for insert
  with check (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = comments.activity_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Authors can delete own comments" on public.comments;
create policy "Authors can delete own comments"
  on public.comments for delete
  using (author_id = auth.uid());

-- activity_likes
drop policy if exists "Likes viewable by group members" on public.activity_likes;
create policy "Likes viewable by group members"
  on public.activity_likes for select
  using (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = activity_likes.activity_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Group members can like" on public.activity_likes;
create policy "Group members can like"
  on public.activity_likes for insert
  with check (exists (
    select 1 from public.activities a
    join public.group_members gm on gm.group_id = a.group_id
    where a.id = activity_likes.activity_id and gm.user_id = auth.uid()
  ));

drop policy if exists "Users can unlike own likes" on public.activity_likes;
create policy "Users can unlike own likes"
  on public.activity_likes for delete
  using (user_id = auth.uid());

-- ============================================================
-- 6. 邀请码生成函数
-- ============================================================
create or replace function public.generate_invite_code()
returns text language sql as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', ceil(random()*31)::int, 1), '')
  from generate_series(1, 6);
$$;

-- ============================================================
-- 7. Feed 查询函数（避免 N+1）
-- ============================================================
create or replace function public.get_group_feed(
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
  repost_of jsonb
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
    else null end as repost_of
  from public.activities a
  join public.profiles p on a.author_id = p.id
  where a.group_id = p_group_id
    and a.created_at < coalesce(p_cursor, now())
  order by a.created_at desc
  limit p_limit;
$$;

-- ============================================================
-- 8. Realtime 配置（添加表到 publication）
-- ============================================================
alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.activity_photos;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.activity_likes;
