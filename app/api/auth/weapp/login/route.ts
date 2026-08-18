import { jsonResponse } from "@/lib/utils";
import { isWeappConfigured } from "@/lib/wechat";
import {
  exchangeCodeForSession,
  WeappSessionError,
  httpStatusForWeappError,
} from "@/lib/auth/weapp-session";

/**
 * POST /api/auth/weapp/login — 微信小程序登录（weapp 分支）
 *
 * 链路：wx.login code → code2Session 换 openid → 虚拟邮箱 + magic link
 * 建立 Supabase 会话 → 把 access/refresh token 返回给小程序端。
 * 逻辑已提取到 lib/auth/weapp-session.ts（与 PC 扫码登录共用），本路由只做
 * 入参校验、环境检查与错误码映射，对外行为与响应结构保持不变。
 */

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export async function POST(request: Request) {
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return jsonResponse({ error: "缺少微信登录 code" }, { status: 400 });
  }

  if (!isWeappConfigured()) {
    console.error("[weapp/login] WEAPP_APPID / WEAPP_SECRET 未配置或仍是占位符");
    return jsonResponse(
      { error: "小程序登录未配置：请在服务端设置 WEAPP_APPID 与 WEAPP_SECRET", code: "weapp_not_configured" },
      { status: 501 }
    );
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    console.error("[weapp/login] Supabase 环境变量未就绪");
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  try {
    const session = await exchangeCodeForSession(code);
    return jsonResponse({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      isNewUser: session.isNewUser,
    });
  } catch (err) {
    if (err instanceof WeappSessionError) {
      console.error("[weapp/login] 微信登录失败:", err.code, err.message);
      return jsonResponse(
        { error: err.message, code: err.code },
        { status: httpStatusForWeappError(err) }
      );
    }
    console.error("[weapp/login] 未捕获异常:", err);
    return jsonResponse({ error: "登录失败，请稍后重试", code: "internal_error" }, { status: 500 });
  }
}
