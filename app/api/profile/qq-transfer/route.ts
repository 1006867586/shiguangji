import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/profile/qq-transfer — 把 QQ 绑定从旧账号转移到当前账号
 *
 * body: { openid, fromUserId }
 * 调用来源：/profile/bind-qq-confirm 确认页（用户已完成 QQ OAuth 授权）。
 *
 * 安全：
 * - 请求须带登录态（cookie 会话）
 * - 一次性票据 qq_transfer cookie（callback 写入）必须与 body 一致，防 CSRF
 * - 转移前重查 fromUserId.bound_qq_openid 仍等于 openid，防条件已变化
 *
 * 顺序（关键）：先清旧账号、再写当前账号——partial unique index
 * profiles_bound_qq_openid_key 禁止同一 openid 同时出现在两个账号上。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    let body: { openid?: string; fromUserId?: string };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
    }
    const openid = body.openid?.trim() ?? "";
    const fromUserId = body.fromUserId?.trim() ?? "";

    if (!openid || !isUuid(fromUserId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (fromUserId === user.id) {
      return jsonResponse({ error: "无法转移给自己" }, { status: 400 });
    }

    // 一次性票据校验：必须与 callback 写入的 qq_transfer 一致
    const ticket = request.cookies.get("qq_transfer")?.value;
    if (ticket !== `${openid}.${fromUserId}`) {
      return jsonResponse(
        { error: "转移确认已失效，请重新发起绑定" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. 重查：该 QQ 仍绑定在旧账号上（期间可能已被转移/解绑）
    const { data: fromProfile, error: fromErr } = await admin
      .from("profiles")
      .select("id, bound_qq_openid")
      .eq("id", fromUserId)
      .maybeSingle();
    if (fromErr || !fromProfile || fromProfile.bound_qq_openid !== openid) {
      return jsonResponse(
        { error: "该 QQ 的绑定状态已变化，请重新发起绑定" },
        { status: 409 }
      );
    }

    // 2. 先清旧账号：profiles.bound_qq_openid + metadata.qq_openid
    //    （trigger 只在 qq_openid 非空时同步，清 metadata 不会反向污染；
    //      若不清 metadata，旧账号下次 updateUserById 会把 openid 重新同步回去）
    await admin.from("profiles").update({ bound_qq_openid: null }).eq("id", fromUserId);
    const { data: fromAuth } = await admin.auth.admin.getUserById(fromUserId);
    const fromMeta = (fromAuth?.user?.user_metadata ?? {}) as Record<string, unknown>;
    if (fromMeta.qq_openid !== undefined) {
      const { qq_openid: _drop, ...rest } = fromMeta;
      await admin.auth.admin.updateUserById(fromUserId, { user_metadata: rest });
    }

    // 3. 再写当前账号：显式写 profiles + metadata（trigger 幂等同步，顺序已保证无唯一冲突）
    await admin.from("profiles").upsert({ id: user.id, bound_qq_openid: openid });
    const { data: curAuth } = await admin.auth.admin.getUserById(user.id);
    const curMeta = (curAuth?.user?.user_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...curMeta, qq_openid: openid },
    });

    const res = NextResponse.json({ data: { ok: true } });
    res.cookies.delete("qq_transfer");
    return res;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    console.error("[profile/qq-transfer] 转移失败:", err);
    return jsonResponse(
      { error: safeErrorMessage(err, "转移失败，请稍后重试") },
      { status: 500 }
    );
  }
}
