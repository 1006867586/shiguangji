import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/utils";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

/**
 * GET /api/roulette/pool?code=XXX — 获取分享池信息 + 候选列表（免登录）
 */
export async function GET(request: NextRequest) {
  const client = createAnonClient();
  if (!client) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code || code.length > 16) {
    return jsonResponse({ error: "参数错误：缺少 code" }, { status: 400 });
  }

  const { data: pool, error: poolErr } = await client
    .from("roulette_pools")
    .select("id, code, name, created_at")
    .eq("code", code)
    .maybeSingle();
  if (poolErr || !pool) {
    return jsonResponse({ error: "分享池不存在" }, { status: 404 });
  }

  const { data: items, error: itemErr } = await client
    .from("roulette_pool_items")
    .select("id, title, address, phone, created_by, created_at")
    .eq("pool_id", pool.id)
    .order("created_at", { ascending: false });
  if (itemErr) {
    return jsonResponse({ error: "获取候选列表失败" }, { status: 500 });
  }

  return jsonResponse({ data: { pool, items: items ?? [] } });
}

/**
 * POST /api/roulette/pool — 添加候选（免登录）
 * body: { code, title, address?, phone?, createdBy }
 */
export async function POST(request: NextRequest) {
  const client = createAnonClient();
  if (!client) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
    title?: unknown;
    address?: unknown;
    phone?: unknown;
    createdBy?: unknown;
  } | null;
  if (!body) {
    return jsonResponse({ error: "请求体格式错误" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const createdBy = typeof body.createdBy === "string" ? body.createdBy.trim() : "";
  if (!code || code.length > 16 || !title || !createdBy || createdBy.length > 64) {
    return jsonResponse({ error: "参数错误" }, { status: 400 });
  }
  if (title.length > 50) {
    return jsonResponse({ error: "店名不能超过 50 个字符" }, { status: 400 });
  }

  const { data: pool, error: poolErr } = await client
    .from("roulette_pools")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (poolErr || !pool) {
    return jsonResponse({ error: "分享池不存在" }, { status: 404 });
  }

  const address =
    typeof body.address === "string" && body.address.trim()
      ? body.address.trim().slice(0, 200)
      : null;
  const phone =
    typeof body.phone === "string" && body.phone.trim()
      ? body.phone.trim().slice(0, 50)
      : null;

  const { data: item, error } = await client
    .from("roulette_pool_items")
    .insert({
      pool_id: pool.id,
      title,
      address,
      phone,
      created_by: createdBy,
    })
    .select("id, title, address, phone, created_by, created_at")
    .single();
  if (error || !item) {
    return jsonResponse({ error: "添加失败" }, { status: 500 });
  }
  return jsonResponse({ data: item }, { status: 201 });
}
