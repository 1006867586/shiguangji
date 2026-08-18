import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonResponse } from "@/lib/utils";
import { getWeappAccessToken, isWeappConfigured } from "@/lib/wechat";

/**
 * POST /api/auth/weapp/qrcode — 生成 PC 扫码登录二维码（无需登录）
 *
 * 流程：生成 32 位一次性 sessionId → 预登记 wechat_login_sessions 行（TTL 5min）
 * → getwxacodeunlimit 生成小程序码（scene=sessionId，指向 pages/login-confirm/index）。
 *
 * 响应：{ data: { uuid, qrBase64 } }（PNG base64）
 * 小程序版本由 WEAPP_QR_ENV 控制：release（默认）/ trial / develop。
 */

const WXACODE_URL = "https://api.weixin.qq.com/wxa/getwxacodeunlimit";
const LOGIN_CONFIRM_PAGE = "pages/login-confirm/index";
const SESSION_TTL_MS = 5 * 60_000;

interface WxacodeErrorResponse {
  errcode?: number;
  errmsg?: string;
}

function parseErrorResponse(text: string): WxacodeErrorResponse | null {
  try {
    const parsed = JSON.parse(text) as WxacodeErrorResponse;
    if (parsed && typeof parsed === "object" && parsed.errcode != null) {
      return parsed;
    }
  } catch {
    // 不是 JSON：是 PNG 图片流，正常
  }
  return null;
}

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export async function POST(_request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }
  if (!isWeappConfigured()) {
    return jsonResponse(
      { error: "小程序登录未配置：请在服务端设置 WEAPP_APPID 与 WEAPP_SECRET", code: "weapp_not_configured" },
      { status: 501 }
    );
  }

  // 1. 生成一次性 sessionId（scene 上限 32 可见字符）
  const uuid = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. 顺带清理过期行（低频，不额外加定时任务）
  await admin.from("wechat_login_sessions").delete().lt("expires_at", new Date().toISOString());

  // 3. 预登记会话行
  const { error: insertErr } = await admin
    .from("wechat_login_sessions")
    .insert({ uuid, expires_at: expiresAt });
  if (insertErr) {
    console.error("[weapp/qrcode] 登记会话失败:", insertErr.message);
    return jsonResponse({ error: "生成二维码失败，请稍后重试", code: "session_write_failed" }, { status: 502 });
  }

  // 4. 生成小程序码（失败则删除预登记行，避免孤儿会话）
  const envVersion =
    process.env.WEAPP_QR_ENV === "trial" || process.env.WEAPP_QR_ENV === "develop"
      ? process.env.WEAPP_QR_ENV
      : "release";
  try {
    const token = await getWeappAccessToken();
    const res = await fetch(`${WXACODE_URL}?access_token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scene: uuid,
        page: LOGIN_CONFIRM_PAGE,
        check_path: false,
        width: 430,
        auto_color: false,
        line_color: { r: 0, g: 0, b: 0 },
        env_version: envVersion,
      }),
    });
    if (!res.ok) {
      throw new Error(`getwxacodeunlimit HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const err = parseErrorResponse(buffer.toString("utf-8"));
    if (err) {
      // 40001/42001：token 失效，强制刷新供下一次调用使用（前端刷新二维码重试）
      if (err.errcode === 40001 || err.errcode === 42001) {
        await getWeappAccessToken(true);
      }
      throw new Error(`小程序码生成失败：${err.errcode} ${err.errmsg ?? ""}`);
    }
    return jsonResponse({ data: { uuid, qrBase64: buffer.toString("base64") } });
  } catch (err) {
    await admin.from("wechat_login_sessions").delete().eq("uuid", uuid);
    console.error("[weapp/qrcode] 生成小程序码失败:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "生成二维码失败，请稍后重试", code: "qrcode_failed" },
      { status: 502 }
    );
  }
}
