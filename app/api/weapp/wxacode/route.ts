import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { getWeappAccessToken, isWeappConfigured } from "@/lib/wechat";

/**
 * POST /api/weapp/wxacode — 生成小程序码（wxacode.getUnlimited）。
 *
 * 用途：分享海报底部的小程序码，微信扫码直达小程序页面。
 * scene 上限 32 可见字符，活动 uuid 去横线后恰好 32 字符，
 * 前端 onLoad 时从 scene 还原 uuid（8-4-4-4-12）。
 *
 * 请求：{ scene: string; page?: string; width?: number }
 * 响应：{ data: { base64 } }（PNG base64）
 */

const WXACODE_URL = "https://api.weixin.qq.com/wxa/getwxacodeunlimit";

/** 允许的小程序页面白名单，防止任意页面生成码 */
const ALLOWED_PAGES = new Set(["pages/detail/index", "pages/index/index"]);

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
    // 不是 JSON：是图片流，正常
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();

    if (!isWeappConfigured()) {
      return jsonResponse(
        { error: "小程序未配置：缺少 WEAPP_APPID / WEAPP_SECRET" },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      scene?: string;
      page?: string;
      width?: number;
    };

    const scene = typeof body.scene === "string" ? body.scene.trim() : "";
    if (!scene || scene.length > 32) {
      return jsonResponse(
        { error: "scene 必填且不超过 32 字符" },
        { status: 400 }
      );
    }

    const page =
      typeof body.page === "string" && ALLOWED_PAGES.has(body.page)
        ? body.page
        : "pages/detail/index";
    const width =
      typeof body.width === "number" && body.width >= 280 && body.width <= 1280
        ? Math.round(body.width)
        : 430;

    const token = await getWeappAccessToken();
    const res = await fetch(`${WXACODE_URL}?access_token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scene,
        page,
        // 发布前页面可能尚未上线，跳过路径校验避免 41030
        check_path: false,
        width,
        auto_color: false,
        line_color: { r: 0, g: 0, b: 0 },
      }),
    });

    if (!res.ok) {
      return jsonResponse(
        { error: `小程序码接口 HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    // 失败时微信返回 JSON（errcode/errmsg），成功是 PNG 二进制流
    const err = parseErrorResponse(buffer.toString("utf-8"));
    if (err) {
      // 40001/42001：token 失效，强制刷新后由前端重试
      if (err.errcode === 40001 || err.errcode === 42001) {
        await getWeappAccessToken(true);
      }
      return jsonResponse(
        { error: `小程序码生成失败：${err.errcode} ${err.errmsg ?? ""}` },
        { status: 502 }
      );
    }

    return jsonResponse({
      data: { base64: buffer.toString("base64") },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}
