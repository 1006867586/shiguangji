import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { createPresignedUploadUrl } from "@/lib/r2";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import type { PresignBody } from "@/types";

export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
];

/** POST /api/upload/presign — 获取 R2 预签名上传 URL */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const body = (await request.json()) as PresignBody;
    if (!body.filename?.trim() || !body.contentType) {
      return jsonResponse(
        { error: "缺少 filename 或 contentType" },
        { status: 400 }
      );
    }

    // contentType 必须是 image/* 开头，且在白名单内
    if (
      !body.contentType.startsWith("image/") ||
      !ALLOWED_CONTENT_TYPES.includes(body.contentType)
    ) {
      return jsonResponse(
        { error: "仅支持图片格式（jpeg/png/webp/gif/heic）" },
        { status: 400 }
      );
    }

    const result = await createPresignedUploadUrl({
      filename: body.filename,
      contentType: body.contentType,
    });

    return jsonResponse(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}
