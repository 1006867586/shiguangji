import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, isUuid } from "@/lib/utils";
import { fetchActivityDetail } from "@/lib/activities";
import {
  isAiConfigured,
  MiniMaxError,
  chat,
  parseJsonContent,
} from "@/lib/ai/minimax";
import { checkAiQuota, recordAiGeneration } from "@/lib/ai/quota";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "你是飨刻 app 的文案助手，帮用户把已发布的活动分享到其他圈子，生成 2-3 版邀请文案，语气自然、有吸引力，让人想参与。";

/** POST /api/ai/invite-text — 为分享到其他圈子生成邀请文案 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // 1. 检查 AI 是否配置
    if (!isAiConfigured()) {
      return jsonResponse({ error: "AI 功能未启用" }, { status: 503 });
    }

    // 2. 检查配额
    const quota = await checkAiQuota(user.id);
    if (!quota.allowed) {
      return jsonResponse(
        {
          error: `AI 调用配额已用完，每小时 ${quota.limit} 次，请稍后再试`,
        },
        { status: 429 }
      );
    }

    // 3. 解析 body
    const body = (await req.json().catch(() => ({}))) as {
      activityId?: string;
      targetGroupName?: string;
    };

    const activityId =
      typeof body.activityId === "string" ? body.activityId.trim() : "";
    if (!activityId) {
      return jsonResponse({ error: "activityId 不能为空" }, { status: 400 });
    }
    if (!isUuid(activityId)) {
      return jsonResponse({ error: "activityId 格式错误" }, { status: 400 });
    }

    const targetGroupName =
      typeof body.targetGroupName === "string"
        ? body.targetGroupName.trim()
        : "";
    if (!targetGroupName) {
      return jsonResponse(
        { error: "targetGroupName 不能为空" },
        { status: 400 }
      );
    }

    // 4. 服务端获取活动详情（受 RLS 约束，确保用户有权访问）
    const activity = await fetchActivityDetail({
      activityId,
      userId: user.id,
    });
    if (!activity) {
      return jsonResponse(
        { error: "活动不存在或无权访问" },
        { status: 404 }
      );
    }

    // 5. 调用 AI 生成邀请文案
    const prompt = buildUserPrompt(activity, targetGroupName);

    let copies: string[];
    let aiModel = "unknown";
    let aiTokens: number | undefined;
    try {
      const aiResult = await chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        // M2.5-highspeed 即使 thinking:disabled 仍会输出 <think> 标签消耗 token，
        // 2048 易被截断（finish_reason:length）导致无最终 JSON，增大到 4096。
        { temperature: 0.9, maxTokens: 4096, thinking: "disabled" }
      );
      aiModel = aiResult.model;
      aiTokens = aiResult.totalTokens;
      const parsed = parseJsonContent<{ copies?: unknown }>(aiResult.content);
      copies = normalizeCopies(parsed.copies);
    } catch (aiErr) {
      // 记录 AI 调用失败（best-effort）
      await recordAiGeneration({
        userId: user.id,
        type: "invite_text",
        activityId,
        output: null,
        model: aiModel,
        tokensUsed: aiTokens,
        success: false,
        errorMessage: aiErr instanceof Error ? aiErr.message : String(aiErr),
      });
      throw aiErr;
    }

    // 6. 记录成功
    await recordAiGeneration({
      userId: user.id,
      type: "invite_text",
      activityId,
      output: { copies, targetGroupName },
      model: aiModel,
      tokensUsed: aiTokens,
      success: true,
    });

    return jsonResponse({ data: { copies } });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return jsonResponse({ error: "未登录" }, { status: 401 });
    }
    return jsonResponse(
      { error: buildAiErrorMessage(e, "AI 邀请文案生成失败") },
      { status: 500 }
    );
  }
}

/**
 * 构造 AI 调用失败时返回给前端的错误信息。
 * - MiniMaxError：始终透传状态码 + 原始消息（401 已包含 Base URL 排查提示），
 *   让 prod 环境也能看到真实失败原因，而不是被 safeErrorMessage 覆盖成通用 fallback。
 * - 其他错误：开发环境透传，生产环境回退通用提示。
 */
function buildAiErrorMessage(e: unknown, fallbackPrefix: string): string {
  if (e instanceof MiniMaxError) {
    const code = e.statusCode ? `(${e.statusCode}) ` : "";
    return `${fallbackPrefix} ${code}${e.message}`;
  }
  return safeErrorMessage(e, `${fallbackPrefix}，请稍后重试`);
}

/** 构造用户 prompt：基于活动内容/外部链接/作者昵称组装上下文 */
function buildUserPrompt(
  activity: {
    content: string | null;
    external_link: {
      title: string;
      address?: string | null;
      url?: string;
    } | null;
    author: { nickname: string };
  },
  targetGroupName: string
): string {
  const lines = [
    "请基于以下已发布的活动，生成 2-3 版适合分享到其他圈子的邀请文案：",
    "",
    `目标圈子名称：${targetGroupName}`,
  ];

  const authorName = activity.author?.nickname || "好友";
  lines.push(`活动发布者：${authorName}`);

  const linkTitle = activity.external_link?.title?.trim();
  if (linkTitle) {
    lines.push(`店名/活动主题：${linkTitle}`);
  }
  if (activity.external_link?.address) {
    lines.push(`地址：${activity.external_link.address}`);
  }
  if (activity.content && activity.content.trim()) {
    lines.push(`原活动文案：${activity.content.trim()}`);
  }

  lines.push(
    "",
    "要求：",
    "- 每版文案 50-150 字",
    "- 语气自然，像在邀请别的圈子的朋友一起参加/关注这个活动",
    `- 可以自然地提到目标圈子「${targetGroupName}」`,
    "- 简短有吸引力，不要堆砌信息",
    "- 不要包含 emoji 以外的特殊符号",
    "",
    "请严格按以下 JSON 格式返回，不要包含任何额外文本或 markdown 代码块：",
    "{",
    '  "copies": ["文案1", "文案2", "文案3"]',
    "}"
  );
  return lines.join("\n");
}

/** 清洗文案数组：过滤空串 */
function normalizeCopies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean);
}
