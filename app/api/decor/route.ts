import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import type {
  DecorDisplay,
  DecorResponse,
  PurchaseDecorResult,
  SetDecorDisplayBody,
} from "@/types";

export const dynamic = "force-dynamic";

/** 将 RPC 抛出的业务错误码映射为友好提示 */
const PURCHASE_ERROR_TEXT: Record<string, string> = {
  DECOR_NOT_FOUND: "装扮不存在",
  DECOR_NOT_PURCHASABLE: "该装扮不可购买",
  DECOR_ALREADY_OWNED: "你已经拥有该装扮了",
  INSUFFICIENT_POINTS: "积分不足",
};

/** GET /api/decor — 我的装扮页（目录 + 已拥有 + 当前佩戴 + 积分） */
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const [catalog, owned, displayRes, gam] = await Promise.all([
      supabase
        .from("decor_items")
        .select(
          "id, kind, key, name, description, icon, color, frame_style, price, unlock_type, achievement_key, sort_order"
        )
        .order("sort_order"),
      supabase.from("user_decor_items").select("item_id").eq("user_id", user.id),
      supabase
        .from("user_decor_display")
        .select("user_id, avatar_frame_id, badge_ids")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_gamification")
        .select("points")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (catalog.error || owned.error) {
      return jsonResponse(
        { error: "加载装扮数据失败" },
        { status: 500 }
      );
    }

    const ownedSet = new Set((owned.data ?? []).map((o) => o.item_id as string));
    const items = (catalog.data ?? []).map((it) => ({
      ...it,
      owned: ownedSet.has(it.id as string),
    }));

    const display = (displayRes.data as unknown as DecorDisplay | null) ?? {
      user_id: user.id,
      avatar_frame_id: null,
      badge_ids: [],
    };

    const result: DecorResponse = {
      items,
      display,
      points: (gam.data as { points?: number } | null)?.points ?? 0,
    };
    return jsonResponse({ data: result });
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

/** PUT /api/decor — 保存佩戴配置（头像框 + 佩戴徽章） */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const body = (await request.json()) as SetDecorDisplayBody;

    const avatarFrameId = body.avatarFrameId ?? null;
    const badgeIds = Array.isArray(body.badgeIds)
      ? body.badgeIds.filter(Boolean)
      : [];

    const { error } = await supabase.rpc("set_user_decor_display", {
      p_avatar_frame_id: avatarFrameId,
      p_badge_ids: badgeIds,
    });

    if (error) {
      const msg = (error as { code?: string }).code;
      const text =
        msg === "FRAME_NOT_OWNED"
          ? "请先拥有该头像框"
          : msg === "BADGE_NOT_OWNED"
            ? "请先拥有要佩戴的徽章"
            : safeErrorMessage(error, "保存失败");
      return jsonResponse({ error: text }, { status: 400 });
    }

    return jsonResponse({ data: { ok: true } });
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

/** POST /api/decor/purchase — 用积分购买装扮 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const body = (await request.json()) as { itemId: string };
    if (!body.itemId) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("purchase_decor_item", {
      p_item_id: body.itemId,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      return jsonResponse(
        { error: PURCHASE_ERROR_TEXT[code ?? ""] ?? safeErrorMessage(error, "购买失败") },
        { status: 400 }
      );
    }

    const row = (data ?? [])[0] as PurchaseDecorResult | undefined;
    return jsonResponse({ data: row ?? { points: 0, item_id: body.itemId } });
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