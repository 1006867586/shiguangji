import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { sanitizeDietaryTags } from "@/lib/dietary";

export const dynamic = "force-dynamic";

/** 忌口补充说明的最大长度 */
const MAX_NOTE_LENGTH = 200;

/** GET /api/profile/dietary — 读取当前用户的忌口档案 */
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("dietary_tags, dietary_note")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取忌口失败") },
        { status: 500 }
      );
    }

    return jsonResponse({
      data: {
        dietary_tags: data?.dietary_tags ?? [],
        dietary_note: data?.dietary_note ?? null,
      },
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

/** PATCH /api/profile/dietary — 更新当前用户的忌口档案 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json().catch(() => ({}))) as {
      dietaryTags?: unknown;
      dietaryNote?: unknown;
    };

    const patch: Record<string, unknown> = {};

    if (body.dietaryTags !== undefined) {
      // 白名单清洗：非法 key 直接丢弃，不报错（表单多选不会传非法值，
      // 报错反而会让整个保存失败）
      patch.dietary_tags = sanitizeDietaryTags(body.dietaryTags);
    }

    if (body.dietaryNote !== undefined) {
      if (body.dietaryNote === null) {
        patch.dietary_note = null;
      } else if (typeof body.dietaryNote === "string") {
        patch.dietary_note = body.dietaryNote.trim().slice(0, MAX_NOTE_LENGTH);
      } else {
        return jsonResponse({ error: "dietaryNote 格式错误" }, { status: 400 });
      }
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "没有需要更新的字段" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("dietary_tags, dietary_note")
      .single();

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "保存忌口失败") },
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
