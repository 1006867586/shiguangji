import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { getWeappAccessToken, isWeappConfigured } from "@/lib/wechat";

export const dynamic = "force-dynamic";

/**
 * POST /api/weapp/security/msg-sec-check — 微信内容安全文本检测（msgSecCheck 2.0）
 *
 * 供小程序端在发布动态 / 评论 / 创建圈子前调用。
 * openid 取自登录时写入 user_metadata.weapp_openid（2.0 版必填）。
 *
 * 降级策略：
 * - WEAPP 未配置（本地开发）→ 跳过检测直接放行（skipped: true）
 * - 微信接口故障 → 放行并记录错误日志（fallback: true），避免微信侧故障阻塞业务
 * - suggest = risky → 拦截；review（可疑待人审）→ 放行
 */

const MSG_SEC_CHECK_URL = "https://api.weixin.qq.com/wxa/msg_sec_check";

/** label 含义（微信文档），用于日志与前端提示 */
const RISK_LABELS: Record<number, string> = {
  10001: "广告",
  20001: "时政敏感",
  20002: "色情",
  20003: "辱骂",
  20006: "违法犯罪",
  20008: "欺诈",
  20012: "低俗",
  21000: "微博用户名",
};

interface WxSecCheckResponse {
  errcode?: number;
  errmsg?: string;
  result?: {
    suggest?: "pass" | "review" | "risky";
    label?: number;
  };
  trace_id?: string;
}

/**
 * 调用一次 msgSecCheck。40001（token 失效）时清缓存重试一次。
 */
async function callSecCheck(
  accessToken: string,
  content: string,
  scene: number,
  openid: string
): Promise<WxSecCheckResponse> {
  const doCall = (token: string) =>
    fetch(`${MSG_SEC_CHECK_URL}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, version: 2, scene, openid }),
    }).then((r) => r.json() as Promise<WxSecCheckResponse>);

  const first = await doCall(accessToken);
  if (first.errcode === 40001) {
    // token 被其他端顶掉：强制刷新后重试一次
    const fresh = await getWeappAccessToken(true);
    return doCall(fresh);
  }
  return first;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = (await request.json().catch(() => ({}))) as {
      content?: string;
      scene?: number;
    };

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return jsonResponse({ error: "content 不能为空" }, { status: 400 });
    }
    if (content.length > 2500) {
      return jsonResponse({ error: "文本过长" }, { status: 400 });
    }

    // scene: 1 资料 / 2 评论 / 3 论坛 / 4 社交日志（默认 4：动态发布）
    const scene = [1, 2, 3, 4].includes(body.scene ?? 4) ? (body.scene ?? 4) : 4;

    // 未配置小程序密钥（本地开发）→ 跳过
    if (!isWeappConfigured()) {
      return jsonResponse({ data: { pass: true, skipped: true } });
    }

    // openid 在登录时写入 user_metadata
    const openid = (user.user_metadata as Record<string, unknown> | undefined)
      ?.weapp_openid;
    if (typeof openid !== "string" || !openid) {
      // 老会话无 openid：提示重新登录获取（不阻塞，跳过检测）
      return jsonResponse({ data: { pass: true, skipped: true } });
    }

    let wx: WxSecCheckResponse;
    try {
      const token = await getWeappAccessToken();
      wx = await callSecCheck(token, content, scene, openid);
    } catch (err) {
      // 微信侧故障：放行 + 记录，不阻塞业务
      console.error("[msg-sec-check] 调用失败:", err);
      return jsonResponse({ data: { pass: true, fallback: true } });
    }

    if (wx.errcode && wx.errcode !== 0) {
      console.error("[msg-sec-check] 业务失败:", wx.errcode, wx.errmsg);
      return jsonResponse({ data: { pass: true, fallback: true } });
    }

    const suggest = wx.result?.suggest ?? "pass";
    const label = wx.result?.label ?? 100;

    if (suggest === "risky") {
      const reason = RISK_LABELS[label] ?? `违规（label=${label}）`;
      return jsonResponse({
        data: {
          pass: false,
          suggest,
          label,
          reason: `内容包含${reason}信息，请修改后发布`,
        },
      });
    }

    return jsonResponse({ data: { pass: true, suggest, label } });
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
