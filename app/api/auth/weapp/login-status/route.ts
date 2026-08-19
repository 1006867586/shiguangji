import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { safeRedirectPath } from "@/lib/utils";
import {
  exchangeOpenIdForSession,
  WeappSessionError,
  httpStatusForWeappError,
} from "@/lib/auth/weapp-session";

/**
 * POST /api/auth/weapp/login-status — PC 端长轮询扫码登录结果（无需登录）
 *
 * 教程原案：最多 10 次 × 2s ≈ 20s（EdgeOne Cloud Functions 默认 30s 上限内）。
 * 命中（openid 已登记）→ 原子消费（DELETE RETURNING）→ 用 openid 建立 Web 会话
 * → 响应直写 sb-* cookie（与 /api/auth/signin 同模式）→ { status: "ok" }。
 * 未命中 → { status: "pending" }（前端续发）；行不存在/过期 → { status: "expired" }。
 */

const UUID_RE = /^[0-9a-f]{32}$/;
const MAX_CHECKS = 10;
const CHECK_INTERVAL_MS = 2_000;

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  let body: { uuid?: string; redirect?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "请求体必须是 JSON" }, { status: 400 });
  }
  const uuid = body.uuid?.trim().toLowerCase() ?? "";
  const redirect = safeRedirectPath(body.redirect);
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ status: "error", error: "无效的登录二维码" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    return NextResponse.json(
      { status: "error", error: "服务端 Supabase 未配置", code: "supabase_not_configured" },
      { status: 501 }
    );
  }

  const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (let i = 0; i < MAX_CHECKS; i++) {
    const { data: row, error: rowErr } = await admin
      .from("wechat_login_sessions")
      .select("uuid, openid, expires_at")
      .eq("uuid", uuid)
      .maybeSingle();
    if (rowErr) {
      console.error("[weapp/login-status] 查询失败:", rowErr.message);
      return NextResponse.json(
        { status: "error", error: "服务暂不可用，请稍后重试", code: "status_query_failed" },
        { status: 502 }
      );
    }
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      // 行不存在（伪造 uuid）或已过期 → 直接终止
      return NextResponse.json({ status: "expired" });
    }
    if (row.openid) {
      // 已确认：原子消费（DELETE RETURNING），防重复登录
      const { data: consumed, error: delErr } = await admin
        .from("wechat_login_sessions")
        .delete()
        .eq("uuid", uuid)
        .select("openid");
      if (delErr) {
        console.error("[weapp/login-status] 消费失败:", delErr.message);
        return NextResponse.json(
          { status: "error", error: "服务暂不可用，请稍后重试", code: "status_consume_failed" },
          { status: 502 }
        );
      }
      if (!consumed || consumed.length === 0) {
        // 已被并发轮询消费 → 视为 pending，前端续发
        return NextResponse.json({ status: "pending" });
      }

      // 用 openid 建立 Web 会话（虚拟邮箱 + magic link，无微信调用）。
      // writeProfile:false——confirm-login 已经把昵称/头像写入 user_metadata 与 profiles，
      // 此处若重复 upsert 默认值反而会抹掉刚写的头像。
      let session;
      try {
        session = await exchangeOpenIdForSession(consumed[0].openid, undefined, {
          writeProfile: false,
        });
      } catch (err) {
        if (err instanceof WeappSessionError) {
          return NextResponse.json(
            { status: "error", error: err.message, code: err.code },
            { status: httpStatusForWeappError(err) }
          );
        }
        console.error("[weapp/login-status] 建立会话失败:", err);
        return NextResponse.json(
          { status: "error", error: "登录失败，请稍后重试", code: "internal_error" },
          { status: 500 }
        );
      }

      // 写 sb-* cookies 到响应（与 /api/auth/signin 完全同模式）
      const sbCookies: CookiesToSet = [];
      const supabase = createServerClient(supabaseUrl!, anonKey!, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookiesToSet) {
            sbCookies.push(...cookiesToSet);
          },
        },
      });
      const { error: setErr } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (setErr) {
        console.error("[weapp/login-status] setSession 失败:", setErr.message);
        return NextResponse.json(
          { status: "error", error: "建立会话失败，请稍后重试", code: "session_failed" },
          { status: 502 }
        );
      }

      const isProd = process.env.NODE_ENV === "production";
      const res = NextResponse.json({
        status: "ok",
        isNewUser: session.isNewUser,
        redirect,
      });
      for (const { name, value, options } of sbCookies) {
        res.cookies.set(name, value, {
          ...options,
          httpOnly: options.httpOnly ?? true,
          sameSite: options.sameSite ?? "lax",
          secure: options.secure ?? isProd,
          path: options.path ?? "/",
        });
      }
      return res;
    }
    if (i < MAX_CHECKS - 1) {
      await sleep(CHECK_INTERVAL_MS);
    }
  }
  return NextResponse.json({ status: "pending" });
}
