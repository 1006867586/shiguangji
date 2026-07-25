import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { parseExternalLink, parseShareText } from "@/lib/link-preview";
import { jsonResponse, detectPlatform, extractUrlFromText } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** POST /api/link-preview — 解析外部链接（美团/点评分享文本或纯 URL） */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const { url } = (await request.json()) as { url?: string };
    const input = url?.trim();
    if (!input) {
      return jsonResponse({ error: "请输入链接或分享文本" }, { status: 400 });
    }

    const parsed = await parseExternalLink(input);
    if (!parsed) {
      // 解析失败：返回基础信息，前端降级为手动编辑
      const extractedUrl = extractUrlFromText(input);
      return jsonResponse({
        data: {
          platform: extractedUrl
            ? detectPlatform(extractedUrl)
            : parseShareText(input).platform ?? "other",
          url: extractedUrl ?? "",
          title: "",
          coverImage: null,
          rating: null,
          address: null,
          phone: null,
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
