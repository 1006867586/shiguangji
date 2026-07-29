import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { Tag, UpdateActivityTagsBody } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 标签名称最大长度 */
const MAX_TAG_NAME_LENGTH = 20;

/** GET /api/activities/[id]/tags — 获取活动的标签列表 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在且用户为圈子成员
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data: rows, error } = await supabase
      .from("activity_tags")
      .select(
        "tag:tags(id, group_id, name, created_by, created_at)"
      )
      .eq("activity_id", id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取标签失败") },
        { status: 500 }
      );
    }

    // PostgREST 嵌套资源返回为对象，TS 推断可能为数组，统一中转
    const tags = (rows ?? [])
      .map((r) => (r as { tag?: Tag | Tag[] }).tag)
      .filter((t): t is Tag => Boolean(t) && !Array.isArray(t)) as Tag[];

    return jsonResponse({ data: tags });
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
 * PUT /api/activities/[id]/tags — 替换活动的标签
 * body { tagNames: string[] }：查找/创建 group 内的 tag，然后替换 activity_tags 关联
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在且用户为圈子成员
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    const body = (await request.json()) as UpdateActivityTagsBody;
    if (!Array.isArray(body.tagNames)) {
      return jsonResponse(
        { error: "tagNames 必须是字符串数组" },
        { status: 400 }
      );
    }

    // 清洗 + 去重，校验每个名称
    const cleanedNames: string[] = [];
    const seen = new Set<string>();
    for (const raw of body.tagNames) {
      if (typeof raw !== "string") continue;
      const name = raw.trim();
      if (!name) continue;
      if (name.length > MAX_TAG_NAME_LENGTH) {
        return jsonResponse(
          { error: `标签名不能超过 ${MAX_TAG_NAME_LENGTH} 个字符` },
          { status: 400 }
        );
      }
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      cleanedNames.push(name);
    }

    const groupId = activity.group_id as string;

    // 1. 批量查询 group 内已存在的 tag
    let tagIds: string[] = [];
    if (cleanedNames.length > 0) {
      const { data: existingTags, error: existingErr } = await supabase
        .from("tags")
        .select("id, name")
        .eq("group_id", groupId)
        .in("name", cleanedNames);

      if (existingErr) {
        return jsonResponse(
          { error: safeErrorMessage(existingErr, "查询标签失败") },
          { status: 500 }
        );
      }

      const existingByName = new Map<string, string>();
      for (const t of existingTags ?? []) {
        existingByName.set(t.name, t.id);
      }

      // 2. 找出需要新建的 tag
      const toCreate: string[] = [];
      const resolvedIds: string[] = [];
      for (const name of cleanedNames) {
        const found = existingByName.get(name);
        if (found) {
          resolvedIds.push(found);
        } else {
          toCreate.push(name);
        }
      }

      // 3. 批量插入新 tag（忽略冲突，避免并发重复）
      if (toCreate.length > 0) {
        const { data: createdTags, error: createErr } = await supabase
          .from("tags")
          .insert(
            toCreate.map((name) => ({
              group_id: groupId,
              name,
              created_by: user.id,
            }))
          )
          .select("id, name");

        if (createErr) {
          // 并发冲突：逐个回退查询
          if (createErr.code === "23505") {
            const { data: retryTags } = await supabase
              .from("tags")
              .select("id, name")
              .eq("group_id", groupId)
              .in("name", toCreate);
            for (const name of toCreate) {
              const found = (retryTags ?? []).find((t) => t.name === name);
              if (found) resolvedIds.push(found.id);
            }
          } else {
            return jsonResponse(
              { error: safeErrorMessage(createErr, "创建标签失败") },
              { status: 500 }
            );
          }
        } else {
          for (const t of createdTags ?? []) {
            resolvedIds.push(t.id);
          }
        }
      }

      tagIds = resolvedIds;
    }

    // 4. 删除旧关联
    const { error: delErr } = await supabase
      .from("activity_tags")
      .delete()
      .eq("activity_id", id);

    if (delErr) {
      return jsonResponse(
        { error: safeErrorMessage(delErr, "更新标签失败") },
        { status: 500 }
      );
    }

    // 5. 插入新关联
    if (tagIds.length > 0) {
      const { error: insertErr } = await supabase
        .from("activity_tags")
        .insert(
          tagIds.map((tagId) => ({
            activity_id: id,
            tag_id: tagId,
          }))
        );

      if (insertErr) {
        return jsonResponse(
          { error: safeErrorMessage(insertErr, "更新标签失败") },
          { status: 500 }
        );
      }
    }

    // 6. 查询最终标签列表返回
    const { data: rows } = await supabase
      .from("activity_tags")
      .select("tag:tags(id, group_id, name, created_by, created_at)")
      .eq("activity_id", id);

    const tags = (rows ?? [])
      .map((r) => (r as { tag?: Tag | Tag[] }).tag)
      .filter((t): t is Tag => Boolean(t) && !Array.isArray(t)) as Tag[];

    return jsonResponse({ data: tags });
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

/** DELETE /api/activities/[id]/tags — 清除活动所有标签 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在且用户为圈子成员
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    const { error } = await supabase
      .from("activity_tags")
      .delete()
      .eq("activity_id", id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "清除标签失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ success: true });
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
