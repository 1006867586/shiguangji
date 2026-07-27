import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, safeParseInt } from "@/lib/utils";
import type {
  CreateFavoritePlacesBody,
  FavoritePlace,
  FavoritePlatform,
} from "@/types";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS: FavoritePlatform[] = [
  "meituan",
  "dianping",
  "xiaohongshu",
  "douyin",
  "unknown",
];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_BATCH = 50;

/**
 * GET /api/favorite-places?limit=100
 * 返回当前用户的店铺收藏列表（按 created_at 倒序）。
 * 个人收藏夹体量有限，使用简单 limit 而非游标分页。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const limit = safeParseInt(
      searchParams.get("limit"),
      DEFAULT_LIMIT,
      MAX_LIMIT
    );

    const { data, error } = await supabase
      .from("favorite_places")
      .select(
        "id, user_id, title, address, phone, signature_dishes, platform, summary, source_screenshot_url, created_at, category, rating, price, cover_image_url, store_url"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取收藏夹失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: (data ?? []) as FavoritePlace[] });
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

/**
 * POST /api/favorite-places
 * 批量创建店铺收藏（来自 AI 识别结果，用户确认后调用）。
 * 同名同地址的店铺因唯一索引会冲突，使用 onConflict do nothing 跳过。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await req.json().catch(() => ({}))) as CreateFavoritePlacesBody;

    if (!Array.isArray(body.places) || body.places.length === 0) {
      return jsonResponse({ error: "places 不能为空" }, { status: 400 });
    }
    if (body.places.length > MAX_BATCH) {
      return jsonResponse(
        { error: `单次最多导入 ${MAX_BATCH} 家店铺` },
        { status: 400 }
      );
    }

    const platform: FavoritePlatform =
      body.platform && VALID_PLATFORMS.includes(body.platform)
        ? body.platform
        : "unknown";

    const sourceScreenshotUrl =
      typeof body.sourceScreenshotUrl === "string" &&
      body.sourceScreenshotUrl.trim()
        ? body.sourceScreenshotUrl.trim()
        : null;

    const rows = body.places
      .map((p) => {
        const title = typeof p?.title === "string" ? p.title.trim() : "";
        if (!title) return null;
        // rating: 0-5 保留一位小数；非法值视为 null
        let rating: number | null = null;
        if (p.rating != null) {
          const n =
            typeof p.rating === "number" ? p.rating : parseFloat(String(p.rating));
          if (Number.isFinite(n) && n >= 0 && n <= 5) {
            rating = Math.round(n * 10) / 10;
          }
        }
        const price =
          typeof p.averagePrice === "string" && p.averagePrice.trim()
            ? p.averagePrice.trim()
            : null;
        const category =
          typeof p.category === "string" && p.category.trim()
            ? p.category.trim()
            : null;
        return {
          user_id: user.id,
          title,
          address:
            typeof p.address === "string" && p.address.trim()
              ? p.address.trim()
              : null,
          phone:
            typeof p.phone === "string" && p.phone.trim()
              ? p.phone.trim()
              : null,
          signature_dishes: Array.isArray(p.signatureDishes)
            ? p.signatureDishes
                .map((d) => (typeof d === "string" ? d.trim() : ""))
                .filter(Boolean)
            : [],
          platform,
          summary: typeof p.summary === "string" ? p.summary.trim() : "",
          source_screenshot_url: sourceScreenshotUrl,
          category,
          rating,
          price,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      return jsonResponse({ error: "没有有效的店铺条目" }, { status: 400 });
    }

    // 应用层去重：先取该用户全部已有店铺的归一化 key（title|address 小写去空格），
    // 过滤掉重复条目，避免触发表达式唯一索引导致整批 insert 失败。
    const { data: existing, error: selectErr } = await supabase
      .from("favorite_places")
      .select("title, address")
      .eq("user_id", user.id);
    if (selectErr) {
      return jsonResponse(
        { error: safeErrorMessage(selectErr, "保存收藏失败") },
        { status: 500 }
      );
    }
    const existingKeys = new Set(
      (existing ?? []).map((r) =>
        normalizeKey(r.title as string, r.address as string | null)
      )
    );
    const toInsert = rows.filter(
      (r) => !existingKeys.has(normalizeKey(r.title, r.address))
    );

    if (toInsert.length === 0) {
      return jsonResponse({
        data: [],
        inserted: 0,
        duplicated: rows.length,
      });
    }

    const { data, error } = await supabase
      .from("favorite_places")
      .insert(toInsert)
      .select(
        "id, user_id, title, address, phone, signature_dishes, platform, summary, source_screenshot_url, created_at, category, rating, price, cover_image_url, store_url"
      );

    if (error) {
      if (error.code === "23505") {
        // 并发下仍可能冲突，按"已存在"友好返回
        return jsonResponse({
          data: [],
          inserted: 0,
          duplicated: toInsert.length,
        });
      }
      // 透传数据库错误码 + 消息，便于排查（如 migration 未执行导致列不存在 PGRST204 / 42703）
      return jsonResponse(
        {
          error: `保存收藏失败 [${error.code ?? "?"}] ${error.message ?? ""}`.trim(),
        },
        { status: 500 }
      );
    }

    return jsonResponse({
      data: (data ?? []) as FavoritePlace[],
      inserted: data?.length ?? 0,
      duplicated: rows.length - toInsert.length,
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

/** 与数据库表达式唯一索引保持一致的归一化 key */
function normalizeKey(title: string, address: string | null): string {
  const t = (title ?? "").trim().toLowerCase();
  const a = (address ?? "").trim().toLowerCase();
  return `${t}|${a}`;
}
