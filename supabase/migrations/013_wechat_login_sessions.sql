-- PC 端微信扫码登录（小程序辅助确认）：uuid → openid 一次性会话登记。
-- 仅服务端 service role 访问（qrcode / confirm-login / login-status 三个路由），
-- 不建 RLS 策略（默认 deny all），anon 无法读写。
create table if not exists public.wechat_login_sessions (
  uuid       text primary key,              -- 32 位 sessionId（scene 上限 32 可见字符）
  openid     text,                          -- 确认后回填（code2Session 结果）
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null           -- 生成时 now() + 5min
);

create index if not exists wechat_login_sessions_expires_idx
  on public.wechat_login_sessions (expires_at);
