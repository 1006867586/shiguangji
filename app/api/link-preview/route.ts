import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { parseExternalLinkUrl } from "@/lib/link-preview";
import { jsonResponse, isUrl, detectPlatform } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** POST /api/link-preview — 解析外部链接（美团/点评等） */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const { url } = (await request.json()) as { url?: string };
    if (!url || !isUrl(url)) {
      return jsonResponse({ error: "URL 不合法" }, { status: 400 });
    }

    const parsed = await parseExternalLinkUrl(url);
    if (!parsed) {
      // 解析失败：返回基础信息，前端降级为手动编辑
      return jsonResponse({
        data: {
          platform: detectPlatform(url),
          url,
          title: "",
          coverImage: null,
          rating: null,
          address: null,
          price: null,
        },
        fallback: true,
      });
    }

    return jsonResponse({ data: parsed });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
