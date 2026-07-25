import { NextRequest } from "next/server";
import { fetchFeed } from "@/lib/activities";
import { getCurrentUser } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** GET /api/feed?groupId=<uuid>&cursor=<iso>&limit=20 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return jsonResponse({ error: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    if (!groupId) {
      return jsonResponse({ error: "缺少 groupId 参数" }, { status: 400 });
    }
    const cursor = searchParams.get("cursor");
    const limit = Math.min(
      Number(searchParams.get("limit") ?? DEFAULT_PAGE_SIZE),
      50
    );

    const result = await fetchFeed({
      groupId,
      cursor,
      limit,
      userId: user.id,
    });

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
