import { NextRequest } from "next/server";
import { jsonResponse, isUuid } from "@/lib/utils";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/roulette/pool/items/[id]?createdBy=xxx — 删除候选（免登录，仅自己添加的）
 * 由 security definer 函数 delete_roulette_pool_item 校验 created_by。
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const client = createAnonClient();
  if (!client) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonResponse({ error: "参数错误" }, { status: 400 });
  }

  const createdBy = new URL(request.url).searchParams.get("createdBy")?.trim() ?? "";
  if (!createdBy || createdBy.length > 64) {
    return jsonResponse({ error: "缺少 createdBy" }, { status: 400 });
  }

  const { data: ok, error } = await client.rpc("delete_roulette_pool_item", {
    p_item_id: id,
    p_created_by: createdBy,
  });
  if (error) {
    return jsonResponse({ error: "删除失败" }, { status: 500 });
  }
  if (!ok) {
    return jsonResponse({ error: "只能删除自己添加的候选" }, { status: 403 });
  }
  return jsonResponse({ success: true });
}
