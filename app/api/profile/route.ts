import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isAllowedImageUrl, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/profile — 当前用户资料 */
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取资料失败") },
        { status: 500 }
      );
    }
    return jsonResponse({
      data: profile ?? { id: user.id, nickname: user.email ?? "用户", avatar_url: null, created_at: null },
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

/** PATCH /api/profile — 更新当前用户资料 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as {
      nickname?: string;
      avatarUrl?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (body.nickname !== undefined) {
      if (!body.nickname.trim()) {
        return jsonResponse({ error: "昵称不能为空" }, { status: 400 });
      }
      patch.nickname = body.nickname.trim();
    }
    if (body.avatarUrl !== undefined) {
      // 允许为空（清空头像）；非空时校验域名
      const avatarUrl = body.avatarUrl || null;
      if (avatarUrl !== null && !isAllowedImageUrl(avatarUrl)) {
        return jsonResponse(
          { error: "头像 URL 域名不被允许" },
          { status: 400 }
        );
      }
      patch.avatar_url = avatarUrl;
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "没有需要更新的字段" }, { status: 400 });
    }

    // requireUser 已确保 user 存在 → profile 行必然存在，直接 update
    // （比 upsert 更明确，避免 onConflict / upsert 路径下的潜在 500）
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("id, nickname, avatar_url, created_at")
      .single();

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "更新资料失败") },
        { status: 500 }
      );
    }
    return jsonResponse({ data });
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
