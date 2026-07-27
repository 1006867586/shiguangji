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
// Vercel Hobby 套餐上限 60s，与 parse-favorites-screenshot 保持一致
export const maxDuration = 60;

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
 * 包含大众点评、美团、小红书、抖音、高德、百度地图等
 */
function isAllowedStoreUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return (
      /(^|\.)dianping\.com$/.test(host) ||
      host === "dpurl.cn" ||
      host.endsWith(".dpurl.cn") ||
      /(^|\.)meituan\.com$/.test(host) ||
      /(^|\.)xiaohongshu\.com$/.test(host) ||
      /(^|\.)douyin\.com$/.test(host) ||
      /(^|\.)amap\.com$/.test(host) ||
      /(^|\.)baidu\.com$/.test(host)
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
      // 两步式调用：M3 + web_search 在严格 prompt 下会"搜完即止"不生成最终 text，
      // 因此拆为两步：
      //   步骤1: 带 web_search 工具搜集搜索结果（不要求模型输出最终 JSON）
      //   步骤2: 把搜索结果作为上下文，让模型纯文本输出 JSON（不带工具）
      // 总耗时约 10-30s，在 Vercel 60s 限制内
      const step1 = await chat(
        [{ role: "user", content: prompt }],
        {
          system: STEP1_SYSTEM_PROMPT,
          enableWebSearch: true,
          // 允许空文本：步骤1 只关心 searchResults，模型可能不输出 text
          allowEmptyText: true,
          temperature: 0.3,
          maxTokens: 4096,
          // 步骤1 留 35s，步骤2 留 15s，共 50s < 60s Vercel 限制
          timeoutMs: 35_000,
        }
      );
      aiModel = step1.model;
      aiTokens =
        step1.inputTokens != null && step1.outputTokens != null
          ? step1.inputTokens + step1.outputTokens
          : undefined;

      // 如果步骤1 已经直接输出了 JSON（部分场景模型会直接给），优先用之
      let step1Parsed: Partial<EnrichedInfo> | null = null;
      if (step1.content.trim()) {
        try {
          step1Parsed = parseJsonContent<Partial<EnrichedInfo>>(step1.content);
        } catch {
          // 步骤1 输出不是 JSON（可能是引导语），走步骤2
        }
      }

      let rawEnriched: Partial<EnrichedInfo>;
      if (step1Parsed && (step1Parsed.storeUrl || step1Parsed.address || step1Parsed.phone || step1Parsed.coverImageUrl)) {
        // 步骤1 已给出可用 JSON，直接用
        rawEnriched = step1Parsed;
      } else {
        // 步骤2: 基于搜索结果生成 JSON
        const step2 = await chat(
          [
            {
              role: "user",
              content: buildStep2Prompt(place as FavoritePlace, step1.searchResults),
            },
          ],
          {
            system: STEP2_SYSTEM_PROMPT,
            temperature: 0,
            maxTokens: 1024,
            timeoutMs: 20_000,
          }
        );
        aiModel = step2.model;
        aiTokens =
          aiTokens != null && step2.inputTokens != null && step2.outputTokens != null
            ? aiTokens + step2.inputTokens + step2.outputTokens
            : step2.inputTokens != null && step2.outputTokens != null
            ? step2.inputTokens + step2.outputTokens
            : aiTokens;

        rawEnriched = parseJsonContent<Partial<EnrichedInfo>>(step2.content);
      }

      enriched = normalizeEnriched(rawEnriched, step1.searchResults);
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
    // 调试期：透传错误类型与原始消息，便于前端 Network 面板直接看到原因
    // 生产稳定后可改回 safeErrorMessage(e, fallback) 的简短提示
    const errType =
      e instanceof MiniMaxAnthropicError
        ? "MiniMaxAnthropicError"
        : e instanceof Error
        ? e.name
        : "Unknown";
    const errMsg = e instanceof Error ? e.message : String(e);
    return jsonResponse(
      {
        error: `联网搜索失败 [${errType}]: ${errMsg}`,
        code: e instanceof MiniMaxAnthropicError ? e.statusCode : undefined,
      },
      { status: 500 }
    );
  }
}

// 步骤1 system prompt：宽松，让模型自由搜索并简要总结
const STEP1_SYSTEM_PROMPT = [
  "你是店铺信息检索助手。请使用 web_search 工具联网搜索用户提供的店铺，",
  "找出店铺详情页链接（大众点评/美团/小红书/抖音/高德/百度地图均可）、电话、地址、封面图。",
  "搜索完成后简要总结找到的信息，不要编造。",
].join("");

// 步骤2 system prompt：严格，基于搜索结果输出 JSON
const STEP2_SYSTEM_PROMPT = [
  "你是店铺信息提取助手。下面会给你一家店铺的搜索结果，请从中提取信息并以 JSON 格式返回。",
  "JSON 格式：",
  "{",
  '  "coverImageUrl": "图片直链 URL 或 null",',
  '  "storeUrl": "店铺详情页 URL 或 null",',
  '  "phone": "电话号码 或 null",',
  '  "address": "完整地址 或 null"',
  "}",
  "",
  "要求：",
  "- storeUrl 接受大众点评(dianping.com)、美团(meituan.com)、小红书(xiaohongshu.com)、抖音(douyin.com)、高德(amap.com)、百度地图(baidu.com) 等可信平台",
  "- 优先选大众点评/美团的店铺详情页，其次小红书/抖音，最后地图类",
  "- 不要返回视频播放页（如 douyin.com/video/xxx），要店铺主页或图文笔记",
  "- coverImageUrl 必须是图片直链（以 http 开头，结尾为 .jpg/.png/.webp 等）",
  "- 搜索结果中没有的字段返回 null，不要编造",
  "- 只输出 JSON，不要输出任何其他内容",
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
    "请联网搜索这家店的信息，找出大众点评网链接、电话、地址、封面图。",
    "",
    "已知信息：",
    ...known,
    "",
    `建议搜索关键词：“${place.title} 大众点评”、“${place.title} 电话 地址”`,
  ].join("\n");
}

/** 步骤2 的 user prompt：把搜索结果作为上下文喂给模型 */
function buildStep2Prompt(
  place: {
    title: string;
    address: string | null;
    phone: string | null;
    category: string | null;
    summary: string;
    platform: string;
  },
  searchResults: Array<{ title: string; url: string; content?: string }>
): string {
  // 截断搜索结果内容，避免上下文过长
  const context = searchResults
    .slice(0, 30)
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n内容: ${(r.content ?? "").slice(0, 500)}`)
    .join("\n\n");

  return [
    `店铺名称：${place.title}`,
    ...(place.category ? [`分类：${place.category}`] : []),
    "",
    "搜索结果：",
    context,
    "",
    "请基于以上搜索结果提取信息，只输出 JSON：",
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
