import { NextResponse } from "next/server";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/debug/auth — 诊断 auth.uid() 与 RLS 是否一致 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. server client 能否拿到 user
  let clientUser: unknown = null;
  let clientUserErr: string | null = null;
  try {
    clientUser = await getCurrentUser();
  } catch (e) {
    clientUserErr = e instanceof Error ? e.message : String(e);
  }

  // 2. server client 直接查 auth.uid()（受 RLS 约束的查询）
  const supabase = await createServerClient();
  const { data: uidResult, error: uidErr } = await supabase.rpc("get_current_uid");

  // 3. 用 admin client 查 profiles 表，确认表本身可访问
  const admin = createAdminClient();
  const { data: profilesCount, error: profilesErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    env: {
      hasSupabaseUrl: !!url,
      hasAnonKey: !!anonKey,
      hasServiceKey,
      urlPrefix: url?.slice(0, 30),
    },
    clientUser: clientUser
      ? { id: (clientUser as { id: string }).id, email: (clientUser as { email: string }).email }
      : null,
    clientUserErr,
    rlsUid: uidResult,
    rlsUidErr: uidErr?.message,
    profilesAccessible: !!profilesCount,
    profilesErr: profilesErr?.message,
  });
}
