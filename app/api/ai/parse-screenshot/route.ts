import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, isAllowedImageUrl } from "@/lib/utils";
import {
  isAiConfigured,
  MiniMaxError,
  vision,
  parseJsonContent,
} from "@/lib/ai/minimax";
import { checkAiQuota, recordAiGeneration } from "@/lib/ai/quota";
import type { ParsedScreenshot } from "@/types";

export const dynamic = "force-dynamic";

type Platform = "xiaohongshu" | "douyin" | "dianping" | "unknown";

const VALID_PLATFORMS: Platform[] = [
  "xiaohongshu",
  "douyin",
  "dianping",
  "unknown",
];

/** POST /api/ai/parse-screenshot — 识别小红书/抖音/点评分享截图，提取店名/地址/招牌菜 */
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
      imageUrl?: string;
      platform?: string;
    };

    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!imageUrl) {
      return jsonResponse({ error: "imageUrl 不能为空" }, { status: 400 });
    }
    if (!isAllowedImageUrl(imageUrl)) {
      return jsonResponse(
        { error: "图片域名不被允许，请使用平台支持的图片地址" },
        { status: 400 }
      );
    }

    // 可选平台提示（作为 hint 传给 AI，由 AI 最终判定）
    const platformHint: Platform | undefined =
      typeof body.platform === "string" &&
      VALID_PLATFORMS.includes(body.platform as Platform)
        ? (body.platform as Platform)
        : undefined;

    // 4. 调用 AI 视觉识别
    const prompt = buildPrompt(platformHint);

    let parsed: ParsedScreenshot;
    let aiModel = "unknown";
    let aiTokens: number | undefined;
    try {
      const aiResult = await vision(imageUrl, prompt, {
        temperature: 0.2,
        maxTokens: 1024,
      });
      aiModel = aiResult.model;
      aiTokens = aiResult.totalTokens;
      parsed = normalizeScreenshot(
        parseJsonContent<Partial<ParsedScreenshot>>(aiResult.content)
      );
    } catch (aiErr) {
      // 记录 AI 调用失败（best-effort）
      await recordAiGeneration({
        userId: user.id,
        type: "parse_screenshot",
        output: null,
        model: aiModel,
        tokensUsed: aiTokens,
        success: false,
        errorMessage:
          aiErr instanceof Error ? aiErr.message : String(aiErr),
      });
      throw aiErr;
    }

    // 5. 记录成功
    await recordAiGeneration({
      userId: user.id,
      type: "parse_screenshot",
      output: parsed,
      model: aiModel,
      tokensUsed: aiTokens,
      success: true,
    });

    return jsonResponse({ data: parsed });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return jsonResponse({ error: "未登录" }, { status: 401 });
    }
    const fallback =
      e instanceof MiniMaxError ? "AI 识别失败，请稍后重试" : "服务器错误";
    return jsonResponse(
      { error: safeErrorMessage(e, fallback) },
      { status: 500 }
    );
  }
}

/** 构造视觉识别 prompt */
function buildPrompt(platformHint?: Platform): string {
  const hintLine = platformHint
    ? `\n用户提示的来源平台可能是：${platformHint}（仅供参考，请以截图实际内容为准）。`
    : "";

  return [
    "请识别这张分享截图（可能来自小红书、抖音、大众点评等平台），提取其中的餐厅/店铺信息。",
    hintLine,
    "请严格按以下 JSON 格式返回，不要包含任何额外文本或 markdown 代码块：",
    "{",
    '  "title": "店名（必填，识别不到则填"未知店铺"）",',
    '  "address": "地址，没有则为 null",',
    '  "phone": "电话，没有则为 null",',
    '  "signatureDishes": ["招牌菜1", "招牌菜2"],',
    '  "platform": "xiaohongshu | douyin | dianping | unknown",',
    '  "summary": "一句话简介（20字以内）"',
    "}",
    "注意：",
    '- platform 取值只能是 xiaohongshu、douyin、dianping、unknown 之一；小红书=xiaohongshu，抖音=douyin，大众点评=dianping，无法判断=unknown',
    "- signatureDishes 如果没有识别到招牌菜，返回空数组 []",
    "- address/phone 识别不到时必须为 null，而不是空字符串",
    "- summary 是对这家店的一句话概括，简短有信息量",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 清洗并补全 AI 返回的字段，保证类型与契约一致 */
function normalizeScreenshot(raw: Partial<ParsedScreenshot>): ParsedScreenshot {
  const platform: Platform =
    raw.platform && VALID_PLATFORMS.includes(raw.platform)
      ? raw.platform
      : "unknown";

  const dishes = Array.isArray(raw.signatureDishes)
    ? raw.signatureDishes
        .map((d) => (typeof d === "string" ? d.trim() : ""))
        .filter(Boolean)
    : [];

  return {
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : "未知店铺",
    address:
      typeof raw.address === "string" && raw.address.trim()
        ? raw.address.trim()
        : null,
    phone:
      typeof raw.phone === "string" && raw.phone.trim()
        ? raw.phone.trim()
        : null,
    signatureDishes: dishes,
    platform,
    summary:
      typeof raw.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "",
  };
}
