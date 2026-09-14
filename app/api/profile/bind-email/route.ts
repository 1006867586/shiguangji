import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import {
  requireUser,
  UnauthorizedError,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type { CookiesToSet } from "@/lib/supabase/cookies";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 6;

/**
 * POST /api/profile/bind-email — 给当前账号绑定「邮箱 + 密码」登录方式
 *
 * body: { email, password }
 *
 * 实现说明（复用 GoTrue 原生能力，不触碰虚拟邮箱标识）：
 * 1. supabase.auth.updateUser({ email }) 触发 GoTrue email change 流程：
 *    向新邮箱发确认邮件（Supabase 内建邮件服务），用户点链接后 email 才真正生效；
 * 2. updateUser({ password }) 立即设置密码，确认后即可用 邮箱 + 密码 登录；
 * 3. 不修改 user_metadata 里的 weapp_openid / qq_openid，微信/QQ 登录不受影响；
 *    微信登录的账号匹配（lib/auth/weapp-session.ts）已改为先按 openid 查
 *    auth.users，命中则用其当前 email，避免绑邮箱后虚拟邮箱失配导致建新号。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
    }
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!EMAIL_RE.test(email)) {
      return jsonResponse({ error: "邮箱格式不正确" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LEN) {
      return jsonResponse(
        { error: `密码至少 ${MIN_PASSWORD_LEN} 位` },
        { status: 400 }
      );
    }
    if (!isSupabaseConfigured()) {
      return jsonResponse({ error: "服务端 Supabase 未配置" }, { status: 500 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    // Route Handler 中 request.cookies 可读可写，setAll 写回以便后续同步到响应
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
        },
      },
    });

    // 1. 设置邮箱 → GoTrue 向新邮箱发送确认邮件（生效前 email 字段不变）
    const { error: emailErr } = await supabase.auth.updateUser({ email });
    if (emailErr) {
      const msg =
        emailErr.code === "email_exists" ||
        /already (been )?(used|taken)|already registered/i.test(
          emailErr.message
        )
          ? "该邮箱已被其他账号使用"
          : `设置邮箱失败：${emailErr.message}`;
      return jsonResponse({ error: msg }, { status: 400 });
    }

    // 2. 设置密码（立即生效，供邮箱确认后「邮箱 + 密码」登录）
    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) {
      return jsonResponse(
        { error: `设置密码失败：${pwErr.message}` },
        { status: 400 }
      );
    }

    // 3. 同步 updateUser 刷新后的会话 cookie 到响应（保持当前登录态）
    const response = NextResponse.json({ data: { ok: true } });
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-")) {
        response.cookies.set(c.name, c.value, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
        });
      }
    }
    return response;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    console.error("[profile/bind-email] 绑定失败:", err);
    return jsonResponse(
      { error: safeErrorMessage(err, "绑定失败，请稍后重试") },
      { status: 500 }
    );
  }
}
