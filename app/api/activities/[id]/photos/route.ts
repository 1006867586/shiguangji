import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isAllowedImageUrl, isAllowedMediaUrl, isUuid, safeErrorMessage } from "@/lib/utils";
import { checkImageContent, isWeappConfigured } from "@/lib/wechat";
import type { AddPhotoBody, MediaKind } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 图片内容安全 label → 中文（命中 risky 时用于提示用户） */
const MEDIA_RISK_LABELS: Record<number, string> = {
  100: "违规",
  10001: "广告",
  20001: "时政敏感",
  20002: "色情",
  20003: "辱骂",
  20006: "违法犯罪",
  20008: "欺诈",
  20012: "低俗",
  20013: "版权",
};

/** POST /api/activities/[id]/photos — 追加活动照片/视频（仅记录 URL + kind） */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在且用户为圈子成员
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    const body = (await request.json()) as AddPhotoBody;
    if (!body.url || !isAllowedImageUrl(body.url)) {
      return jsonResponse({ error: "媒体 URL 不合法" }, { status: 400 });
    }

    // kind 字段：'image' | 'video'，默认 'image' 保持向后兼容
    const kind: MediaKind = body.kind === "video" ? "video" : "image";

    // Live Photo 配对视频 URL（仅 Live Photo 携带，需同样校验域名）
    const pairedVideoUrl =
      typeof body.pairedVideoUrl === "string" && body.pairedVideoUrl.trim()
        ? body.pairedVideoUrl.trim()
        : null;
    if (pairedVideoUrl && !isAllowedMediaUrl(pairedVideoUrl)) {
      return jsonResponse({ error: "配对视频 URL 不合法" }, { status: 400 });
    }
    // Live Photo 的主记录 kind 必须为 image（视频本身不需要再配对视频）
    const finalPairedVideoUrl =
      pairedVideoUrl && kind === "image" ? pairedVideoUrl : null;

    // ---- 图片内容安全（UGC，运营规范 10.2/5.18）----
    // 服务端在入库前检测，命中违规（risky）直接拒绝；视频暂无可用的官方检测接口，跳过。
    // 降级策略（同文本检测）：未配置 WEAPP 密钥 / 微信侧故障 / 超时 → 放行并记录日志，
    // 避免微信侧故障阻塞正常发布。
    if (kind === "image" && isWeappConfigured()) {
      const openid = (user.user_metadata as Record<string, unknown> | undefined)
        ?.weapp_openid;
      if (typeof openid === "string" && openid) {
        try {
          const check = await checkImageContent(body.url, openid);
          if (!check.pass) {
            const reason =
              (check.label !== undefined &&
                MEDIA_RISK_LABELS[check.label]) ||
              "违规";
            return jsonResponse(
              { error: `照片包含${reason}内容，请更换后重试` },
              { status: 400 }
            );
          }
        } catch (err) {
          // 微信侧故障 / 超时：放行，避免阻塞业务
          console.error("[photos] 图片内容安全检测失败（放行）:", err);
        }
      }
    }

    const { data: photo, error } = await supabase
      .from("activity_photos")
      .insert({
        activity_id: id,
        uploaded_by: user.id,
        url: body.url,
        caption: body.caption?.trim() || null,
        kind,
        paired_video_url: finalPairedVideoUrl,
      })
      .select(
        "id, activity_id, uploaded_by, url, caption, kind, paired_video_url, created_at"
      )
      .single();

    if (error || !photo) {
      return jsonResponse(
        { error: safeErrorMessage(error, "添加媒体失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: photo }, { status: 201 });
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

/** GET /api/activities/[id]/photos — 获取活动全部照片 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data: photos, error } = await supabase
      .from("activity_photos")
      .select(
        "id, activity_id, uploaded_by, url, caption, kind, paired_video_url, created_at, uploader:profiles!activity_photos_uploaded_by_fkey(id, nickname, avatar_url)"
      )
      .eq("activity_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取照片失败") },
        { status: 500 }
      );
    }
    return jsonResponse({ data: photos });
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
