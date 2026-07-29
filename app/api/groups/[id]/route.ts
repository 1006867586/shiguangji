import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isAllowedImageUrl, isUuid, safeErrorMessage } from "@/lib/utils";
import type { Group, UpdateGroupBody } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 校验 settings 对象：仅允许已知布尔字段，过滤未知 key */
function sanitizeSettings(
  settings: unknown
): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const src = settings as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const allowedKeys: Array<keyof import("@/types").GroupSettings> = [
    "join_approval",
    "allow_member_pin",
    "allow_video",
  ];
  for (const key of allowedKeys) {
    if (typeof src[key] === "boolean") {
      out[key] = src[key];
    }
  }
  return out;
}

/**
 * PATCH /api/groups/[id] — 更新圈子信息
 * body: { name?, description?, avatarUrl?, settings? }
 * 仅 admin 可调用。
 * - name 非空且 ≤50 字符
 * - description ≤500 字符
 * - avatarUrl 用 isAllowedImageUrl 校验
 * - settings 为 GroupSettings 对象
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验当前用户为圈子 admin
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }
    if (membership.role !== "admin") {
      return jsonResponse(
        { error: "仅管理员可修改圈子信息" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as UpdateGroupBody;
    const patch: Record<string, unknown> = {};

    // name：非空且 ≤50 字符
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return jsonResponse({ error: "圈子名称不能为空" }, { status: 400 });
      }
      if (name.length > 50) {
        return jsonResponse(
          { error: "圈子名称不能超过 50 个字符" },
          { status: 400 }
        );
      }
      patch.name = name;
    }

    // description：可为空，≤500 字符
    if (typeof body.description === "string") {
      const desc = body.description.trim();
      if (desc.length > 500) {
        return jsonResponse(
          { error: "圈子描述不能超过 500 个字符" },
          { status: 400 }
        );
      }
      patch.description = desc || null;
    } else if (body.description === null) {
      patch.description = null;
    }

    // avatarUrl：用 isAllowedImageUrl 校验
    if (typeof body.avatarUrl === "string") {
      if (!isAllowedImageUrl(body.avatarUrl)) {
        return jsonResponse(
          { error: "头像 URL 域名不被允许" },
          { status: 400 }
        );
      }
      patch.avatar_url = body.avatarUrl;
    } else if (body.avatarUrl === null) {
      patch.avatar_url = null;
    }

    // settings：GroupSettings 对象
    if (body.settings !== undefined) {
      const cleaned = sanitizeSettings(body.settings);
      if (cleaned === null) {
        return jsonResponse(
          { error: "settings 必须是对象" },
          { status: 400 }
        );
      }
      patch.settings = cleaned;
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "没有可更新的字段" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("groups")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return jsonResponse(
        { error: safeErrorMessage(updateErr, "更新失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: updated as Group });
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
