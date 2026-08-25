import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { getDiancanMe } from "@/lib/diancan";

export const dynamic = "force-dynamic";

/** GET /api/diancan/me — 返回当前用户点餐侧状态 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const me = await getDiancanMe(supabase, user.id);
    return jsonResponse({ data: me });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}