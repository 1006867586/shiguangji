import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/utils";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

/** 分享码字符集（去除易混淆的 0/O/1/I） */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode(len = 6): string {
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[arr[i] % CODE_CHARS.length];
  }
  return s;
}

/**
 * POST /api/roulette/pools — 创建分享池（免登录）
 * body: { name?: string }，返回 { id, code, name, created_at }
 */
export async function POST(request: NextRequest) {
  const client = createAnonClient();
  if (!client) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  let name: string | undefined;
  try {
    const body = (await request.json()) as { name?: unknown };
    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed) name = trimmed.slice(0, 50);
    }
  } catch {
    // 无 body 也允许（默认匿名池）
  }

  // 生成唯一 code（唯一键冲突重试）
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const { data, error } = await client
      .from("roulette_pools")
      .insert({ code, name })
      .select("id, code, name, created_at")
      .single();
    if (!error && data) {
      return jsonResponse({ data }, { status: 201 });
    }
    if (error && error.code !== "23505") {
      return jsonResponse({ error: "创建分享池失败" }, { status: 500 });
    }
  }
  return jsonResponse({ error: "创建分享池失败，请重试" }, { status: 500 });
}
