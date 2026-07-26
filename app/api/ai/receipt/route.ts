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
import type { ParsedReceipt } from "@/types";

export const dynamic = "force-dynamic";

/** POST /api/ai/receipt — 识别账单小票照片，提取总金额与明细 */
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

    // 4. 调用 AI 视觉识别
    const prompt = buildPrompt();

    let parsed: ParsedReceipt;
    let aiModel = "unknown";
    let aiTokens: number | undefined;
    try {
      const aiResult = await vision(imageUrl, prompt, {
        temperature: 0.1,
        maxTokens: 4096,
      });
      aiModel = aiResult.model;
      aiTokens = aiResult.totalTokens;
      parsed = normalizeReceipt(
        parseJsonContent<Partial<ParsedReceipt>>(aiResult.content)
      );
    } catch (aiErr) {
      // 记录 AI 调用失败（best-effort）
      await recordAiGeneration({
        userId: user.id,
        type: "receipt",
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
      type: "receipt",
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
    return jsonResponse(
      { error: buildAiErrorMessage(e, "AI 账单识别失败") },
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

/** 构造视觉识别 prompt */
function buildPrompt(): string {
  return [
    "请识别这张账单/小票照片，提取消费信息。",
    "",
    "请严格按以下 JSON 格式返回，不要包含任何额外文本或 markdown 代码块：",
    "{",
    '  "totalAmount": 345.50,',
    '  "currency": "CNY",',
    '  "items": [',
    '    { "name": "毛血旺", "price": 88 },',
    '    { "name": "啤酒", "price": 30 }',
    "  ],",
    '  "restaurantName": "餐厅名（可空）",',
    '  "datetime": "2026-07-26 19:30（可空）",',
    '  "peopleCount": 6',
    "}",
    "注意：",
    "- totalAmount 必须是数字类型（单位：元），不要带货币符号或逗号",
    "- items 数组中每个 price 也必须是数字",
    "- restaurantName 识别不到时为 null",
    "- datetime 尽量标准化为 YYYY-MM-DD HH:mm 格式，识别不到时为 null",
    "- peopleCount 是用餐人数，必须是整数或 null；如小票上没有明确标注则为 null",
    "- currency 默认 CNY，除非小票上明确显示其他货币",
    "- 如果完全无法识别这是一张账单，totalAmount 设为 0，items 返回空数组 []",
  ].join("\n");
}

/** 清洗并补全 AI 返回的字段，保证类型与契约一致 */
function normalizeReceipt(raw: Partial<ParsedReceipt>): ParsedReceipt {
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const name =
            typeof it.name === "string" ? it.name.trim() : String(it.name ?? "");
          const price = Number(it.price);
          return {
            name,
            price: Number.isFinite(price) ? price : 0,
          };
        })
        .filter((it): it is { name: string; price: number } => it !== null)
    : [];

  const totalAmount = Number(raw.totalAmount);
  const peopleCountRaw = Number(raw.peopleCount);

  return {
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    currency:
      typeof raw.currency === "string" && raw.currency.trim()
        ? raw.currency.trim()
        : "CNY",
    items,
    restaurantName:
      typeof raw.restaurantName === "string" && raw.restaurantName.trim()
        ? raw.restaurantName.trim()
        : null,
    datetime:
      typeof raw.datetime === "string" && raw.datetime.trim()
        ? raw.datetime.trim()
        : null,
    peopleCount:
      Number.isFinite(peopleCountRaw) && peopleCountRaw > 0
        ? Math.floor(peopleCountRaw)
        : null,
  };
}
