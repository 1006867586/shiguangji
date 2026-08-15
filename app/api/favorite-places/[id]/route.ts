import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, isUuid } from "@/lib/utils";
import type {
  FavoritePlace,
  FavoritePlatform,
  UpdateFavoritePlaceBody,
} from "@/types";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS: FavoritePlatform[] = [
  "meituan",
  "dianping",
  "xiaohongshu",
  "douyin",
  "unknown",
];

/** 空串转 null（title/summary 除外，保持字符串语义） */
function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * PATCH /api/favorite-places/[id]
 * 编辑当前用户的一条店铺收藏（白名单字段，全部可选局部更新）。
 * RLS + user_id 条件保证只能改自己的。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "无效的 id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as UpdateFavoritePlaceBody;

    // 按白名单逐字段构造更新集；未出现的字段不动
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return jsonResponse({ error: "店名不能为空" }, { status: 400 });
      }
      updates.title = title;
    }
    if (body.address !== undefined) {
      updates.address = normalizeNullableString(body.address);
    }
    if (body.phone !== undefined) {
      updates.phone = normalizeNullableString(body.phone);
    }
    if (body.summary !== undefined) {
      updates.summary =
        typeof body.summary === "string" ? body.summary.trim() : "";
    }
    if (body.category !== undefined) {
      updates.category = normalizeNullableString(body.category);
    }
    if (body.price !== undefined) {
      updates.price = normalizeNullableString(body.price);
    }
    if (body.store_url !== undefined) {
      const url = normalizeNullableString(body.store_url);
      if (url && !/^https?:\/\//i.test(url)) {
        return jsonResponse(
          { error: "店铺链接需以 http(s):// 开头" },
          { status: 400 }
        );
      }
      updates.store_url = url;
    }
    if (body.signature_dishes !== undefined) {
      updates.signature_dishes = Array.isArray(body.signature_dishes)
        ? body.signature_dishes
            .map((d) => (typeof d === "string" ? d.trim() : ""))
            .filter(Boolean)
        : [];
    }
    if (body.rating !== undefined) {
      // rating: 0-5 保留一位小数；传 null 清空，非法值 400
      if (body.rating === null) {
        updates.rating = null;
      } else {
        const n =
          typeof body.rating === "number"
            ? body.rating
            : parseFloat(String(body.rating));
        if (!Number.isFinite(n) || n < 0 || n > 5) {
          return jsonResponse(
            { error: "评分需在 0-5 之间" },
            { status: 400 }
          );
        }
        updates.rating = Math.round(n * 10) / 10;
      }
    }
    if (body.platform !== undefined) {
      if (!VALID_PLATFORMS.includes(body.platform)) {
        return jsonResponse({ error: "无效的平台" }, { status: 400 });
      }
      updates.platform = body.platform;
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: "没有可更新的字段" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("favorite_places")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        "id, user_id, title, address, phone, signature_dishes, platform, summary, source_screenshot_url, created_at, category, rating, price, cover_image_url, store_url"
      )
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return jsonResponse(
          { error: "已存在同名同地址的店铺" },
          { status: 409 }
        );
      }
      return jsonResponse(
        { error: safeErrorMessage(error, "更新失败") },
        { status: 500 }
      );
    }

    if (!data) {
      // id 不存在或不属于当前用户
      return jsonResponse({ error: "收藏不存在" }, { status: 404 });
    }

    return jsonResponse({ data: data as FavoritePlace });
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
 * DELETE /api/favorite-places/[id]
 * 删除当前用户的一条店铺收藏。RLS 保证只能删自己的。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "无效的 id" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from("favorite_places")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "删除失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { success: true } });
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
