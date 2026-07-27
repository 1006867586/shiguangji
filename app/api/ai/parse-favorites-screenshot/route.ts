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
import type { FavoritePlatform, ParsedFavoritesScreenshot } from "@/types";

export const dynamic = "force-dynamic";
// 视觉识别耗时较长（MiniMax-M3 通常 15-30s），默认 10s 会触发 Vercel 函数超时导致前端 "failed to fetch"
export const maxDuration = 60;

const VALID_PLATFORMS: FavoritePlatform[] = [
  "meituan",
  "dianping",
  "xiaohongshu",
  "douyin",
  "unknown",
];

/**
 * POST /api/ai/parse-favorites-screenshot
 * 识别美团/大众点评等"收藏夹"截图（一张图含多家店），批量提取店铺信息。
 * 与 parse-screenshot（单店分享截图）的区别：本接口返回 places 数组。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    if (!isAiConfigured()) {
      return jsonResponse({ error: "AI 功能未启用" }, { status: 503 });
    }

    const quota = await checkAiQuota(user.id);
    if (!quota.allowed) {
      return jsonResponse(
        {
          error: `AI 调用配额已用完，每小时 ${quota.limit} 次，请稍后再试`,
        },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      imageUrl?: string;
      platform?: string;
    };

    const imageUrl =
      typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!imageUrl) {
      return jsonResponse({ error: "imageUrl 不能为空" }, { status: 400 });
    }
    if (!isAllowedImageUrl(imageUrl)) {
      return jsonResponse(
        { error: "图片域名不被允许，请使用平台支持的图片地址" },
        { status: 400 }
      );
    }

    const platformHint: FavoritePlatform | undefined =
      typeof body.platform === "string" &&
      VALID_PLATFORMS.includes(body.platform as FavoritePlatform)
        ? (body.platform as FavoritePlatform)
        : undefined;

    const prompt = buildPrompt(platformHint);

    let parsed: ParsedFavoritesScreenshot;
    let aiModel = "unknown";
    let aiTokens: number | undefined;
    try {
      const aiResult = await vision(imageUrl, prompt, {
        temperature: 0.2,
        maxTokens: 2048,
      });
      aiModel = aiResult.model;
      aiTokens = aiResult.totalTokens;
      parsed = normalizeParsed(
        parseJsonContent<Partial<ParsedFavoritesScreenshot>>(aiResult.content)
      );
    } catch (aiErr) {
      await recordAiGeneration({
        userId: user.id,
        type: "parse_favorites_screenshot",
        output: null,
        model: aiModel,
        tokensUsed: aiTokens,
        success: false,
        errorMessage: aiErr instanceof Error ? aiErr.message : String(aiErr),
      });
      throw aiErr;
    }

    await recordAiGeneration({
      userId: user.id,
      type: "parse_favorites_screenshot",
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

function buildPrompt(platformHint?: FavoritePlatform): string {
  const hintLine = platformHint
    ? `\n用户提示的来源平台可能是：${platformHint}（仅供参考，请以截图实际内容为准）。`
    : "";

  return [
    "请识别这张\"收藏夹\"截图（通常来自美团、大众点评、小红书等平台的\"我的收藏\"页面），其中包含多家餐厅/店铺的列表。",
    "请提取截图中所有可见的店铺信息。",
    hintLine,
    "请严格按以下 JSON 格式返回，不要包含任何额外文本或 markdown 代码块：",
    "{",
    '  "platform": "meituan | dianping | xiaohongshu | douyin | unknown",',
    '  "places": [',
    "    {",
    '      "title": "店名（必填，识别不到则填\"未知店铺\"）",',
    '      "address": "地址，没有则为 null",',
    '      "phone": "电话，没有则为 null",',
    '      "signatureDishes": ["招牌菜1", "招牌菜2"],',
    '      "summary": "一句话简介（20字以内）"',
    "    }",
    "  ]",
    "}",
    "注意：",
    "- platform 取值只能是 meituan、dianping、xiaohongshu、douyin、unknown 之一；美团=meituan，大众点评=dianping，小红书=xiaohongshu，抖音=douyin，无法判断=unknown",
    "- places 数组必须包含截图中所有可见的店铺，按从上到下的顺序排列",
    "- 如果截图不是收藏夹列表（例如是单店详情页），places 仍应返回包含那一家店的数组",
    "- signatureDishes 没有识别到时返回空数组 []",
    "- address/phone 识别不到时必须为 null，而不是空字符串",
    "- summary 是对这家店的一句话概括，简短有信息量",
    "- 如果完全无法识别任何店铺，places 返回空数组 []",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeParsed(
  raw: Partial<ParsedFavoritesScreenshot>
): ParsedFavoritesScreenshot {
  const platform: FavoritePlatform =
    raw.platform && VALID_PLATFORMS.includes(raw.platform)
      ? raw.platform
      : "unknown";

  const places = Array.isArray(raw.places)
    ? raw.places
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const title =
            typeof p.title === "string" && p.title.trim()
              ? p.title.trim()
              : "未知店铺";
          const address =
            typeof p.address === "string" && p.address.trim()
              ? p.address.trim()
              : null;
          const phone =
            typeof p.phone === "string" && p.phone.trim()
              ? p.phone.trim()
              : null;
          const dishes = Array.isArray(p.signatureDishes)
            ? p.signatureDishes
                .map((d) => (typeof d === "string" ? d.trim() : ""))
                .filter(Boolean)
            : [];
          const summary =
            typeof p.summary === "string" ? p.summary.trim() : "";
          return { title, address, phone, signatureDishes: dishes, summary };
        })
        .filter(
          (
            p
          ): p is {
            title: string;
            address: string | null;
            phone: string | null;
            signatureDishes: string[];
            summary: string;
          } => p !== null
        )
    : [];

  return { platform, places };
}
