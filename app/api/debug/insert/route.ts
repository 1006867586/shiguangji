import { NextResponse } from "next/server";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import { generateInviteCode } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/debug/insert — 诊断 RLS 下 INSERT groups 的精确错误 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const supabase = await createServerClient();

  // 1. 先确认 auth.uid() 在 RPC 里返回值
  const { data: uid, error: uidErr } = await supabase.rpc("get_current_uid");

  // 2. 尝试用 server client 直接 INSERT groups（受 RLS 约束）
  const testCode = generateInviteCode();
  const { data: inserted, error: insertErr } = await supabase
    .from("groups")
    .insert({
      name: "__诊断测试团体__",
      description: null,
      avatar_url: null,
      invite_code: testCode,
      created_by: user.id,
    })
    .select()
    .single();

  // 3. 如果失败，用 admin client 清理可能残留的测试数据
  if (insertErr) {
    // 清理：用 admin client 删除可能的测试团体
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.from("groups").delete().eq("invite_code", testCode);
  }

  return NextResponse.json({
    userId: user.id,
    userEmail: user.email,
    rlsUid: uid,
    rlsUidErr: uidErr?.message,
    insertResult: inserted ? "SUCCESS" : "FAILED",
    insertErr: insertErr
      ? {
          code: insertErr.code,
          message: insertErr.message,
          details: insertErr.details,
          hint: insertErr.hint,
        }
      : null,
  });
}
