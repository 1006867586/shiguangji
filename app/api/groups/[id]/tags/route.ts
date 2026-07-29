import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { Tag } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 标签名称最大长度 */
const MAX_TAG_NAME_LENGTH = 20;

/** GET /api/groups/[id]/tags — 获取圈子所有标签（按 name 排序） */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验当前用户为圈子成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data: tags, error } = await supabase
      .from("tags")
      .select("id, group_id, name, created_by, created_at")
      .eq("group_id", id)
      .order("name", { ascending: true });

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取标签失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: (tags ?? []) as Tag[] });
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

/** POST /api/groups/[id]/tags — 创建标签（若已存在则返回现有），body { name } */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验当前用户为圈子成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim() ?? "";
    if (!name) {
      return jsonResponse({ error: "标签名不能为空" }, { status: 400 });
    }
    if (name.length > MAX_TAG_NAME_LENGTH) {
      return jsonResponse(
        { error: `标签名不能超过 ${MAX_TAG_NAME_LENGTH} 个字符` },
        { status: 400 }
      );
    }

    // 先查现有（圈子内 name 唯一），存在则直接返回，避免触发唯一约束错误
    const { data: existing } = await supabase
      .from("tags")
      .select("id, group_id, name, created_by, created_at")
      .eq("group_id", id)
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ data: existing as Tag });
    }

    const { data: tag, error } = await supabase
      .from("tags")
      .insert({
        group_id: id,
        name,
        created_by: user.id,
      })
      .select("id, group_id, name, created_by, created_at")
      .single();

    if (error || !tag) {
      // 并发场景下可能仍触发唯一约束冲突，做一次回退查询
      if (error && error.code === "23505") {
        const { data: fallback } = await supabase
          .from("tags")
          .select("id, group_id, name, created_by, created_at")
          .eq("group_id", id)
          .eq("name", name)
          .maybeSingle();
        if (fallback) {
          return jsonResponse({ data: fallback as Tag });
        }
      }
      return jsonResponse(
        { error: safeErrorMessage(error, "创建标签失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: tag as Tag }, { status: 201 });
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
