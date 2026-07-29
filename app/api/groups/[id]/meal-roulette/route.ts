import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type {
  CreateMealRouletteItemBody,
  ImportMealRouletteItemsBody,
  MealRouletteItem,
} from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_IMPORT = 50;

/** 校验当前用户是否为圈子成员，是则返回 true */
async function ensureMember(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  groupId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * GET /api/groups/[id]/meal-roulette
 * 返回该圈子的转盘候选项列表（按 created_at 倒序），附带添加者资料。
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    if (!(await ensureMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("meal_roulette_items")
      .select(
        `id, group_id, title, address, phone, signature_dishes, added_by, created_at,
         adder:profiles!meal_roulette_items_added_by_fkey(id, nickname, avatar_url)`
      )
      .eq("group_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取候选列表失败") },
        { status: 500 }
      );
    }

    // PostgREST 多对一嵌套返回单对象，TS 推断为数组，中转一下
    const items = (data ?? []) as unknown as MealRouletteItem[];
    return jsonResponse({ data: items });
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
 * POST /api/groups/[id]/meal-roulette
 * 支持两种用法：
 *  - 单条新增：body = { title, address?, phone?, signatureDishes? }
 *  - 批量导入：body = { items: [...] }（从收藏夹导入）
 * 应用层去重，避免触发唯一索引导致整批失败。
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    if (!(await ensureMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as
      | CreateMealRouletteItemBody
      | ImportMealRouletteItemsBody;

    // 统一规范化为 entries 数组
    const entries: Array<{
      title: string;
      address: string | null;
      phone: string | null;
      signatureDishes: string[];
    }> = [];

    if ("items" in body && Array.isArray(body.items)) {
      if (body.items.length === 0) {
        return jsonResponse({ error: "items 不能为空" }, { status: 400 });
      }
      if (body.items.length > MAX_IMPORT) {
        return jsonResponse(
          { error: `单次最多导入 ${MAX_IMPORT} 条` },
          { status: 400 }
        );
      }
      for (const it of body.items) {
        const title = typeof it?.title === "string" ? it.title.trim() : "";
        if (!title) continue;
        entries.push({
          title,
          address:
            typeof it.address === "string" && it.address.trim()
              ? it.address.trim()
              : null,
          phone:
            typeof it.phone === "string" && it.phone.trim()
              ? it.phone.trim()
              : null,
          signatureDishes: Array.isArray(it.signatureDishes)
            ? it.signatureDishes
                .map((d) => (typeof d === "string" ? d.trim() : ""))
                .filter(Boolean)
            : [],
        });
      }
    } else if ("title" in body && typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return jsonResponse({ error: "title 不能为空" }, { status: 400 });
      }
      entries.push({
        title,
        address:
          typeof body.address === "string" && body.address.trim()
            ? body.address.trim()
            : null,
        phone:
          typeof body.phone === "string" && body.phone.trim()
            ? body.phone.trim()
            : null,
        signatureDishes: Array.isArray(body.signatureDishes)
          ? body.signatureDishes
              .map((d) => (typeof d === "string" ? d.trim() : ""))
              .filter(Boolean)
          : [],
      });
    } else {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    if (entries.length === 0) {
      return jsonResponse({ error: "没有有效的条目" }, { status: 400 });
    }

    // 应用层去重：先取圈子已有项的归一化 key
    const { data: existing, error: selectErr } = await supabase
      .from("meal_roulette_items")
      .select("title, address")
      .eq("group_id", id);
    if (selectErr) {
      return jsonResponse(
        { error: safeErrorMessage(selectErr, "保存失败") },
        { status: 500 }
      );
    }
    const existingKeys = new Set(
      (existing ?? []).map((r) =>
        normalizeKey(r.title as string, r.address as string | null)
      )
    );
    const toInsert = entries
      .filter((e) => !existingKeys.has(normalizeKey(e.title, e.address)))
      .map((e) => ({
        group_id: id,
        title: e.title,
        address: e.address,
        phone: e.phone,
        signature_dishes: e.signatureDishes,
        added_by: user.id,
      }));

    if (toInsert.length === 0) {
      return jsonResponse({
        data: [],
        inserted: 0,
        duplicated: entries.length,
      });
    }

    const { data, error } = await supabase
      .from("meal_roulette_items")
      .insert(toInsert)
      .select(
        `id, group_id, title, address, phone, signature_dishes, added_by, created_at,
         adder:profiles!meal_roulette_items_added_by_fkey(id, nickname, avatar_url)`
      );

    if (error) {
      if (error.code === "23505") {
        return jsonResponse({
          data: [],
          inserted: 0,
          duplicated: toInsert.length,
        });
      }
      return jsonResponse(
        { error: safeErrorMessage(error, "保存失败") },
        { status: 500 }
      );
    }

    return jsonResponse({
      data: (data ?? []) as unknown as MealRouletteItem[],
      inserted: data?.length ?? 0,
      duplicated: entries.length - toInsert.length,
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

/**
 * DELETE /api/groups/[id]/meal-roulette?itemId=xxx
 * 删除该圈子下的一条候选项（成员即可删，RLS 校验 is_group_member）。
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    if (!(await ensureMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const itemId = new URL(req.url).searchParams.get("itemId");
    if (!itemId || !isUuid(itemId)) {
      return jsonResponse({ error: "缺少 itemId" }, { status: 400 });
    }

    const { error } = await supabase
      .from("meal_roulette_items")
      .delete()
      .eq("id", itemId)
      .eq("group_id", id);

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

function normalizeKey(title: string, address: string | null): string {
  const t = (title ?? "").trim().toLowerCase();
  const a = (address ?? "").trim().toLowerCase();
  return `${t}|${a}`;
}
