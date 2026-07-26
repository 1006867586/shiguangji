import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import {
  isAiConfigured,
  MiniMaxError,
  chat,
  parseJsonContent,
} from "@/lib/ai/minimax";
import { checkAiQuota, recordAiGeneration } from "@/lib/ai/quota";

export const dynamic = "force-dynamic";

type CopyStyle = "casual" | "formal" | "humorous" | "enthusiastic";

const VALID_STYLES: CopyStyle[] = [
  "casual",
  "formal",
  "humorous",
  "enthusiastic",
];

const STYLE_DESC: Record<CopyStyle, string> = {
  casual: "随意轻松、像朋友间的口吻",
  formal: "正式得体、礼貌周到",
  humorous: "幽默风趣、带点俏皮",
  enthusiastic: "热情洋溢、有号召力",
};

const SYSTEM_PROMPT =
  "你是飨刻 app 的文案助手，帮用户写聚餐活动邀请文案，要简短有感染力，50-150字。";

/** POST /api/ai/copywrite — 根据店名生成 3 个活动文案候选 */
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
      title?: string;
      style?: string;
      groupName?: string;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return jsonResponse({ error: "title 不能为空" }, { status: 400 });
    }

    const style: CopyStyle =
      typeof body.style === "string" && VALID_STYLES.includes(body.style as CopyStyle)
        ? (body.style as CopyStyle)
        : "casual";

    const groupName =
      typeof body.groupName === "string" ? body.groupName.trim() : "";

    // 4. 调用 AI 生成文案
    const prompt = buildUserPrompt(title, style, groupName);

    let copies: string[];
    let aiModel = "unknown";
    let aiTokens: number | undefined;
    try {
      const aiResult = await chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        { temperature: 0.9, maxTokens: 2048, thinking: "disabled" }
      );
      aiModel = aiResult.model;
      aiTokens = aiResult.totalTokens;
      const parsed = parseJsonContent<{ copies?: unknown }>(aiResult.content);
      copies = normalizeCopies(parsed.copies);
    } catch (aiErr) {
      // 记录 AI 调用失败（best-effort）
      await recordAiGeneration({
        userId: user.id,
        type: "copywrite",
        output: null,
        model: aiModel,
        tokensUsed: aiTokens,
        success: false,
        errorMessage: aiErr instanceof Error ? aiErr.message : String(aiErr),
      });
      throw aiErr;
    }

    // 5. 记录成功
    await recordAiGeneration({
      userId: user.id,
      type: "copywrite",
      output: { copies, style, title, groupName },
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
      { error: buildAiErrorMessage(e, "AI 文案生成失败") },
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

/** 构造用户 prompt */
function buildUserPrompt(
  title: string,
  style: CopyStyle,
  groupName: string
): string {
  const lines = [
    "请为以下聚餐活动生成 3 个邀请文案候选：",
    "",
    `店名：${title}`,
    `文案风格：${style}（${STYLE_DESC[style]}）`,
  ];
  if (groupName) {
    lines.push(`发布到的团体：${groupName}`);
  }
  lines.push(
    "",
    "要求：",
    "- 每个文案 50-150 字",
    `- 风格必须符合「${STYLE_DESC[style]}」`,
    "- 简短有感染力，适合在飨刻 app 的团体 feed 中发布",
    "- 不要包含 emoji 以外的特殊符号",
    "",
    "请严格按以下 JSON 格式返回，不要包含任何额外文本或 markdown 代码块：",
    "{",
    '  "copies": ["文案1", "文案2", "文案3"]',
    "}"
  );
  return lines.join("\n");
}

/** 清洗文案数组：过滤空串，保证至少返回数组（可能少于 3 个） */
function normalizeCopies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean);
}
