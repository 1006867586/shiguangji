-- ============================================================
-- 飨刻 (XiangKe) - 修复外键指向
-- 文件: 002_repoint_fks_to_profiles.sql
-- 说明: 将 activities / activity_photos / comments 的用户外键
--       从 auth.users 改为指向 public.profiles，使 PostgREST
--       嵌套查询 (profiles!xxx_fkey) 能正确解析关系。
-- 背景: profiles.id 本身已 references auth.users on delete cascade，
--       因此用户删除时级联行为不变（auth.users → profiles → 业务表）。
-- ============================================================

-- 1. activities.author_id
alter table public.activities
  drop constraint if exists activities_author_id_fkey;

alter table public.activities
  add constraint activities_author_id_fkey
  foreign key (author_id) references public.profiles(id)
  on delete cascade;

-- 2. activity_photos.uploaded_by
alter table public.activity_photos
  drop constraint if exists activity_photos_uploaded_by_fkey;

alter table public.activity_photos
  add constraint activity_photos_uploaded_by_fkey
  foreign key (uploaded_by) references public.profiles(id)
  on delete cascade;

-- 3. comments.author_id
alter table public.comments
  drop constraint if exists comments_author_id_fkey;

alter table public.comments
  add constraint comments_author_id_fkey
  foreign key (author_id) references public.profiles(id)
  on delete cascade;
