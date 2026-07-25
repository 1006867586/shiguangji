import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";

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
      return jsonResponse({ error: error.message }, { status: 500 });
    }
    return jsonResponse({
      data: profile ?? { id: user.id, nickname: user.email ?? "用户", avatar_url: null, created_at: null },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
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
      patch.avatar_url = body.avatarUrl || null;
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "没有需要更新的字段" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...patch })
      .select("id, nickname, avatar_url, created_at")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }
    return jsonResponse({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
