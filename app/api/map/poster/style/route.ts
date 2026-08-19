import { NextRequest } from "next/server";
import {
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import {
  stylizePoster,
  isStyleConfigured,
} from "@/lib/poster";
import { uploadBufferToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isImageUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  return /\.(png|jpe?g|webp)(\?.*)?$/i.test(value);
}

/**
 * POST /api/map/poster/style
 * 对一期静态海报做 GPT Image 手绘风风格化，上传 R2 返回新 URL。
 * body: { url: <一期海报 R2 URL> }
 * 返回 { data: { url } }；未配置 OPENAI_API_KEY 时返回 503。
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    if (!isStyleConfigured()) {
      return jsonResponse(
        { error: "手绘风未启用：需配置 OPENAI_API_KEY（OpenAI 平台申请）" },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => null)) as { url?: string } | null;
    const url = body?.url?.trim();
    if (!url || !isImageUrl(url)) {
      return jsonResponse({ error: "url 参数不合法" }, { status: 400 });
    }

    // 下载一期海报
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      return jsonResponse({ error: "海报图片下载失败" }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return jsonResponse({ error: "目标地址不是图片" }, { status: 400 });
    }
    const imageBuf = Buffer.from(await res.arrayBuffer());

    // GPT Image 风格化（生成约 15-60s）
    const styledBuf = await stylizePoster(imageBuf);

    const { publicUrl } = await uploadBufferToR2({
      buffer: styledBuf,
      contentType: "image/png",
      ext: "png",
    });

    return jsonResponse({ data: { url: publicUrl } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "手绘风海报生成失败") },
      { status: 500 }
    );
  }
}
