import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { createPresignedUploadUrl } from "@/lib/r2";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import type { PresignBody } from "@/types";

export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
];

const ALLOWED_VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/webm",
];

/** 视频允许的文件扩展名（用于后缀校验） */
const ALLOWED_VIDEO_EXTENSIONS = ["mp4", "webm"];

/** 从文件名提取扩展名（小写，不含点） */
function getExt(filename: string): string {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

/** POST /api/upload/presign — 获取 R2 预签名上传 URL（图片 / 视频） */
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

    const isImageType = body.contentType.startsWith("image/");
    const isVideoType = body.contentType.startsWith("video/");
    // kind 字段优先用于决定走图片还是视频逻辑
    const kind = body.kind;

    const treatAsImage =
      kind === "image" || (!kind && isImageType) || (isImageType && kind !== "video");
    const treatAsVideo =
      kind === "video" || (!kind && isVideoType) || (isVideoType && kind !== "image");

    if (treatAsImage && ALLOWED_IMAGE_CONTENT_TYPES.includes(body.contentType)) {
      // 图片：正常 presign
      const result = await createPresignedUploadUrl({
        filename: body.filename,
        contentType: body.contentType,
      });
      return jsonResponse({ data: result });
    }

    if (treatAsVideo && ALLOWED_VIDEO_CONTENT_TYPES.includes(body.contentType)) {
      // 视频：先校验后缀
      const ext = getExt(body.filename);
      if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
        return jsonResponse(
          { error: "视频仅支持 .mp4 / .webm 格式" },
          { status: 400 }
        );
      }
      const result = await createPresignedUploadUrl({
        filename: body.filename,
        contentType: body.contentType,
      });
      return jsonResponse({ data: result });
    }

    return jsonResponse(
      {
        error:
          "不支持的文件格式（图片：jpeg/png/webp/gif/heic；视频：mp4/webm）",
      },
      { status: 400 }
    );
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
