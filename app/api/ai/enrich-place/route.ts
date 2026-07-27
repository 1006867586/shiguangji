import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, isUuid, isUrl } from "@/lib/utils";
import {
  chat,
  isAiConfigured,
  MiniMaxAnthropicError,
  parseJsonContent,
} from "@/lib/ai/minimax-anthropic";
import { checkAiQuota, recordAiGeneration } from "@/lib/ai/quota";
import type { FavoritePlace } from "@/types";

export const dynamic = "force-dynamic";
// 联网搜索 + 模型生成耗时较长（M3 + web_search 通常 20-50s）
export const maxDuration = 90;

/** 联网搜索补齐结果（仅非空字段才会写回数据库） */
interface EnrichedInfo {
  coverImageUrl: string | null;
  storeUrl: string | null;
  phone: string | null;
  address: string | null;
}

const ALLOWED_IMAGE_HOSTS = [
  "meituan.net",
  "meituan.com",
  "dianping.com",
  "dianping.net",
  "p0.meituan.net",
  "p1.meituan.net",
  "qpic.cn",
  "bdimg.com",
  "xhscdn.com",
  "xiaohongshucdn.com",
  "douyinpic.com",
  "douyincdn.com",
];

/**
 * 校验封面图 URL 是否来自允许的域名（避免写入恶意/无关链接）
 */
function isAllowedCoverImage(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    // 允许常见图片 CDN 与 R2 自定义域名
    if (process.env.R2_PUBLIC_URL) {
      try {
        if (new URL(process.env.R2_PUBLIC_URL).hostname === host) return true;
      } catch {}
    }
    return (
      ALLOWED_IMAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ||
      /(^|\.)meituan\.net$/.test(host) ||
      /(^|\.)dianping\.com$/.test(host) ||
      /(^|\.)dianping\.net$/.test(host)
    );
  } catch {
    return false;
  }
}

/**
 * 校验店铺链接是否来自可信平台
 */
function isAllowedStoreUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return (
      /(^|\.)meituan\.com$/.test(host) ||
      /(^|\.)dianping\.com$/.test(host) ||
      /(^|\.)xiaohongshu\.com$/.test(host) ||
      /(^|\.)douyin\.com$/.test(host) ||
      /(^|\.)amap\.com$/.test(host) ||
      /(^|\.)baidu\.com$/.test(host) ||
      /(^|\.)tencent\.com$/.test(host)
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/ai/enrich-place
 * 通过 MiniMax web_search 服务端工具联网搜索，补齐店铺的封面图、店铺链接、电话、地址。
 * 仅当字段为空时才会补齐，已有值不覆盖（除非 force=true）。
 *
 * 请求体: { placeId: string, force?: boolean }
 * 返回: { data: FavoritePlace, enriched: EnrichedInfo }
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
      placeId?: string;
      force?: boolean;
    };

    const placeId =
      typeof body.placeId === "string" ? body.placeId.trim() : "";
    if (!placeId || !isUuid(placeId)) {
      return jsonResponse({ error: "placeId 不合法" }, { status: 400 });
    }
    const force = body.force === true;

    const supabase = await createServerClient();
    const { data: place, error: selectErr } = await supabase
      .from("favorite_places")
      .select(
        "id, user_id, title, address, phone, signature_dishes, platform, summary, category, cover_image_url, store_url"
      )
      .eq("id", placeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selectErr) {
      return jsonResponse(
        { error: safeErrorMessage(selectErr, "查询店铺失败") },
        { status: 500 }
      );
    }
    if (!place) {
      return jsonResponse({ error: "店铺不存在或无权访问" }, { status: 404 });
    }

    // 已有完整信息且未强制刷新，直接返回
    if (
      !force &&
      place.cover_image_url &&
      place.store_url &&
      place.phone &&
      place.address
    ) {
      return jsonResponse({
        data: place as FavoritePlace,
        enriched: {
          coverImageUrl: place.cover_image_url,
          storeUrl: place.store_url,
          phone: place.phone,
          address: place.address,
        },
        skipped: true,
      });
    }

    const prompt = buildPrompt(place as FavoritePlace);

    let enriched: EnrichedInfo;
    let aiModel = "unknown";
    let aiTokens: number | undefined;
    try {
      const aiResult = await chat(
        [{ role: "user", content: prompt }],
        {
          system: SYSTEM_PROMPT,
          enableWebSearch: true,
          temperature: 0.3,
          maxTokens: 2048,
          // 留 10s 余量给数据库写回，避免被 maxDuration 硬杀导致前端 "failed to fetch"
          timeoutMs: 80_000,
        }
      );
      aiModel = aiResult.model;
      aiTokens =
        aiResult.inputTokens != null && aiResult.outputTokens != null
          ? aiResult.inputTokens + aiResult.outputTokens
          : undefined;

      enriched = normalizeEnriched(
        parseJsonContent<Partial<EnrichedInfo>>(aiResult.content),
        aiResult.searchResults
      );
    } catch (aiErr) {
      await recordAiGeneration({
        userId: user.id,
        type: "enrich_place",
        output: null,
        model: aiModel,
        tokensUsed: aiTokens,
        success: false,
        errorMessage: aiErr instanceof Error ? aiErr.message : String(aiErr),
      });
      throw aiErr;
    }

    // 仅当新值非空且（字段当前为空或 force=true）时才更新
    const updates: Record<string, string | null> = {};
    if (enriched.coverImageUrl && (force || !place.cover_image_url)) {
      if (isAllowedCoverImage(enriched.coverImageUrl)) {
        updates.cover_image_url = enriched.coverImageUrl;
      }
    }
    if (enriched.storeUrl && (force || !place.store_url)) {
      if (isAllowedStoreUrl(enriched.storeUrl)) {
        updates.store_url = enriched.storeUrl;
      }
    }
    if (enriched.phone && (force || !place.phone)) {
      updates.phone = enriched.phone.trim();
    }
    if (enriched.address && (force || !place.address)) {
      updates.address = enriched.address.trim();
    }

    let updated: FavoritePlace = place as FavoritePlace;
    if (Object.keys(updates).length > 0) {
      const { data: updatedRow, error: updateErr } = await supabase
        .from("favorite_places")
        .update(updates)
        .eq("id", placeId)
        .eq("user_id", user.id)
        .select(
          "id, user_id, title, address, phone, signature_dishes, platform, summary, source_screenshot_url, created_at, category, rating, price, cover_image_url, store_url"
        )
        .maybeSingle();

      if (updateErr) {
        return jsonResponse(
          {
            error: `保存补齐信息失败 [${updateErr.code ?? "?"}] ${updateErr.message ?? ""}`.trim(),
          },
          { status: 500 }
        );
      }
      if (updatedRow) {
        updated = updatedRow as FavoritePlace;
      }
    }

    await recordAiGeneration({
      userId: user.id,
      type: "enrich_place",
      output: { placeId, updates, enriched },
      model: aiModel,
      tokensUsed: aiTokens,
      success: true,
    });

    return jsonResponse({
      data: updated,
      enriched,
      updatedFields: Object.keys(updates),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return jsonResponse({ error: "未登录" }, { status: 401 });
    }
    const fallback =
      e instanceof MiniMaxAnthropicError
        ? "联网搜索失败，请稍后重试"
        : "服务器错误";
    return jsonResponse(
      { error: safeErrorMessage(e, fallback) },
      { status: 500 }
    );
  }
}

const SYSTEM_PROMPT = [
  "你是一个店铺信息检索助手。",
  "用户会给你一家餐厅/店铺的名称、地址等已知信息，请你使用 web_search 工具联网搜索，补齐这家店的：",
  "1. 封面图 URL（coverImageUrl）：店铺首页/详情页的封面图，必须是可直接访问的图片 URL（以 http 开头）",
  "2. 店铺链接（storeUrl）：美团/大众点评/小红书/抖音/高德等平台上的店铺详情页 URL",
  "3. 电话（phone）：店铺联系电话",
  "4. 地址（address）：店铺完整地址",
  "搜索时优先使用「店名 + 城市/地址 + 美团/点评」等关键词。",
  "搜索不到的字段返回 null，不要编造。",
  "必须严格按 JSON 格式返回，不要包含任何额外文本或 markdown 代码块。",
].join("\n");

function buildPrompt(place: {
  title: string;
  address: string | null;
  phone: string | null;
  category: string | null;
  summary: string;
  platform: string;
}): string {
  const known: string[] = [`店名：${place.title}`];
  if (place.address) known.push(`已知地址：${place.address}`);
  if (place.phone) known.push(`已知电话：${place.phone}`);
  if (place.category) known.push(`分类：${place.category}`);
  if (place.summary) known.push(`简介：${place.summary}`);
  if (place.platform && place.platform !== "unknown")
    known.push(`来源平台：${place.platform}`);

  return [
    "请帮我搜索以下店铺的信息，补齐封面图、店铺链接、电话、地址。",
    "",
    "已知信息：",
    ...known,
    "",
    "请联网搜索后严格按以下 JSON 格式返回（不要 markdown 代码块）：",
    "{",
    '  "coverImageUrl": "https://...jpg 或 null",',
    '  "storeUrl": "https://www.dianping.com/... 或 null",',
    '  "phone": "电话号码 或 null",',
    '  "address": "完整地址 或 null"',
    "}",
    "",
    "注意：",
    "- coverImageUrl 必须是图片直链（以 http 开头，结尾为 .jpg/.png/.webp 等），不能是网页 URL",
    "- storeUrl 必须是美团/大众点评/小红书/抖音/高德等可信平台的店铺详情页 URL",
    "- 搜索不到的字段必须为 null，不要返回空字符串或编造内容",
  ].join("\n");
}

function normalizeEnriched(
  raw: Partial<EnrichedInfo>,
  searchResults: Array<{ title: string; url: string; content?: string }>
): EnrichedInfo {
  const coverImageUrl =
    typeof raw.coverImageUrl === "string" && raw.coverImageUrl.trim()
      ? raw.coverImageUrl.trim()
      : null;
  const storeUrl =
    typeof raw.storeUrl === "string" && raw.storeUrl.trim()
      ? raw.storeUrl.trim()
      : null;
  const phone =
    typeof raw.phone === "string" && raw.phone.trim()
      ? raw.phone.trim()
      : null;
  const address =
    typeof raw.address === "string" && raw.address.trim()
      ? raw.address.trim()
      : null;

  // 兜底：模型未给出 storeUrl 时，从搜索结果中找一条可信平台 URL
  let fallbackStoreUrl = storeUrl;
  if (!fallbackStoreUrl && searchResults.length > 0) {
    const hit = searchResults.find((r) => isUrl(r.url) && isAllowedStoreUrl(r.url));
    if (hit) fallbackStoreUrl = hit.url;
  }

  return {
    coverImageUrl,
    storeUrl: fallbackStoreUrl,
    phone,
    address,
  };
}
