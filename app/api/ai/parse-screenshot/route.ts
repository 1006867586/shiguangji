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
import { enrichLinkWithPoi } from "@/lib/poi/enrich";
import type { ExternalLink, ParsedScreenshot } from "@/types";

export const dynamic = "force-dynamic";
// 视觉识别耗时较长（MiniMax-M3 通常 15-30s），默认 10s 会触发 Vercel 函数超时导致前端 "failed to fetch"
export const maxDuration = 60;

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
        maxTokens: 4096,
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

    // 5. 识别结果含店名但存在空白字段时，用地图 POI 兜底补齐（点评/美团网页现强制登录，
    //    截图识别不到的电话/地址/评分/人均可借店名匹配地图数据补全）
    parsed = await poiBackfill(parsed);

    // 6. 记录成功
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
    return jsonResponse(
      { error: buildAiErrorMessage(e, "AI 识别失败") },
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

/**
 * 识别结果为空白的字段用店名跑地图 POI 兜底补齐。
 * 仅当店名存在且地址/电话/评分/人均/品类有缺失时匹配，只填空字段；
 * 地图接口失败或未命中时静默返回原结果，不阻塞主流程。
 */
async function poiBackfill(parsed: ParsedScreenshot): Promise<ParsedScreenshot> {
  const title = parsed.title?.trim();
  if (!title || title === "未知店铺") return parsed;

  const link: ExternalLink = {
    platform: "other",
    url: "",
    title,
    coverImage: null,
    rating: parsed.rating,
    address: parsed.address,
    phone: parsed.phone,
    price: null, // 人均以 POI 补齐为准（网页观测不到时可借地图人均）
    category: parsed.category,
  };

  try {
    const { link: enriched } = await enrichLinkWithPoi(link);
    return {
      ...parsed,
      address: parsed.address ?? enriched.address ?? null,
      phone: parsed.phone ?? enriched.phone ?? null,
      rating: parsed.rating ?? enriched.rating ?? null,
      category: parsed.category ?? enriched.category ?? null,
      averagePrice: parsed.averagePrice ?? enriched.price ?? null,
      coverImage: parsed.coverImage ?? enriched.coverImage ?? null,
    };
  } catch {
    return parsed;
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
    '  "rating": 4.5,',
    '  "averagePrice": "￥80",',
    '  "category": "火锅",',
    '  "summary": "一句话简介（20字以内）"',
    "}",
    "注意：",
    '- platform 取值只能是 xiaohongshu、douyin、dianping、unknown 之一；小红书=xiaohongshu，抖音=douyin，大众点评=dianping，无法判断=unknown',
    "- signatureDishes 如果没有识别到招牌菜，返回空数组 []",
    "- address/phone 识别不到时必须为 null，而不是空字符串",
    "- rating 是店铺评分（大众点评/美团等平台的星级评分，如 4.5、4.8），只能是数字，识别不到为 null",
    "- averagePrice 是人均消费，保留截图里展示的原样（含货币符号或单位，如 ￥80、80元），识别不到为 null",
    "- category 是餐厅分类，常见值如：火锅、烤肉、烧烤、川菜、粤菜、湘菜、日料、韩餐、西餐、东南亚菜、快餐、咖啡甜品、饮品、面食、海鲜、自助餐、家常菜、私房菜、其他；以截图实际展示为准，识别不到为 null",
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

  // rating: AI 可能返回数字或字符串，统一转 number；非有限数字或越界视为 null
  let rating: number | null = null;
  if (raw.rating != null) {
    const n = typeof raw.rating === "number" ? raw.rating : parseFloat(String(raw.rating));
    if (Number.isFinite(n) && n >= 0 && n <= 5) {
      rating = Math.round(n * 10) / 10; // 保留一位小数
    }
  }

  // averagePrice: 字符串，trim；空字符串视为 null
  const averagePrice =
    typeof raw.averagePrice === "string" && raw.averagePrice.trim()
      ? raw.averagePrice.trim()
      : null;

  // category: 字符串，trim；空字符串视为 null
  const category =
    typeof raw.category === "string" && raw.category.trim()
      ? raw.category.trim()
      : null;

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
    rating,
    averagePrice,
    category,
    summary:
      typeof raw.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "",
  };
}
