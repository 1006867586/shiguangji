-- ============================================================
-- 文件: 031_qq_bind.sql
-- 说明: 微信用户绑定 QQ 登录 (合二为一)
--   1. profiles.bound_qq_openid —— 已绑定的 QQ 互联 openid
--   2. partial unique index —— 保证一个 QQ openid 只被一个账号绑定
--   3. 数据迁移：从 auth.users.raw_user_meta_data->>'qq_openid'
--      提取到 profiles.bound_qq_openid（覆盖历史 QQ 登录的用户）
-- ============================================================

alter table public.profiles
  add column if not exists bound_qq_openid text;

-- 部分唯一索引：未绑定的行（NULL）允许任意多，绑定后必须全局唯一
create unique index if not exists profiles_bound_qq_openid_key
  on public.profiles (bound_qq_openid)
  where bound_qq_openid is not null;

-- 把历史 QQ 登录的用户从 user_metadata 迁移到 profiles
-- (老 /api/auth/qq/callback 写 user_metadata.qq_openid 但没写 profiles)
update public.profiles p
set bound_qq_openid = u.raw_user_meta_data->>'qq_openid'
from auth.users u
where p.id = u.id
  and u.raw_user_meta_data->>'qq_openid' is not null
  and u.raw_user_meta_data->>'qq_openid' <> ''
  and p.bound_qq_openid is null;

-- 触发器：保持 profiles.bound_qq_openid 与 user_metadata.qq_openid 同步
-- 当 /api/auth/qq/callback 在绑定模式写 metadata 时，
-- trigger 自动同步到 profiles（避免双写不一致）
create or replace function public.sync_qq_openid_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.raw_user_meta_data->>'qq_openid') is not null
     and (new.raw_user_meta_data->>'qq_openid') <> '' then
    insert into public.profiles (id, nickname, bound_qq_openid)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
      new.raw_user_meta_data->>'qq_openid'
    )
    on conflict (id) do update
      set bound_qq_openid = excluded.bound_qq_openid
        where excluded.bound_qq_openid is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_qq_openid_to_profile on auth.users;
create trigger trg_sync_qq_openid_to_profile
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.sync_qq_openid_to_profile();
