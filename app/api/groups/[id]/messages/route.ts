import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeParseInt, safeErrorMessage } from "@/lib/utils";
import { containsSensitiveWord } from "@/lib/sensitive-words";
import { extractMentionedUserIds } from "@/lib/mention";
import { attachDecorToProfiles } from "@/lib/server-decor";
import type {
  ChatMessagesResponse,
  GroupMessage,
  SendMessageBody,
} from "@/types";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Params = { params: Promise<{ id: string }> };

/** 校验当前用户是否为圈子成员；返回 null 表示无权 */
async function assertMember(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  groupId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** 为一批消息批量合并发送者资料，保留原行其余字段 */
async function attachSenders<R extends Pick<GroupMessage, "sender_id">>(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  rows: R[]
): Promise<Array<R & { sender: GroupMessage["sender"] }>> {
  if (rows.length === 0) return rows as Array<R & { sender: GroupMessage["sender"] }>;
  const senderIds = Array.from(new Set(rows.map((m) => m.sender_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url")
    .in("id", senderIds);
  const profList = (profiles ?? []) as Array<{
    id: string;
    nickname: string;
    avatar_url: string | null;
  }>;
  // 批量补充头像框 / 佩戴徽章（装饰系统：聊天他人视角展示）
  await attachDecorToProfiles(supabase, profList);
  const profMap = new Map<string, (typeof profList)[number]>();
  for (const p of profList) {
    profMap.set(p.id, p);
  }
  return rows.map((m) => ({
    ...m,
    sender: (profMap.get(m.sender_id) ?? null) as GroupMessage["sender"],
  }));
}

/** GET /api/groups/[id]/messages — 获取圈子聊天消息（时间正序，支持加载更早） */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    if (!(await assertMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");
    const limit = safeParseInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

    // 取 limit+1 判断是否还有更早的消息
    let q = supabase
      .from("group_messages")
      .select("id, group_id, sender_id, type, content, image_url, created_at")
      .eq("group_id", id)
      .limit(limit + 1);

    if (before) q = q.lt("created_at", before);
    q = q.order("created_at", { ascending: false });

    const { data, error } = await q;
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取聊天记录失败") },
        { status: 500 }
      );
    }

    const raw = (data ?? []) as Array<{
      id: string;
      group_id: string;
      sender_id: string;
      type: GroupMessage["type"];
      content: string | null;
      image_url: string | null;
      created_at: string;
    }>;

    const hasMore = raw.length > limit;
    const windowRows = hasMore ? raw.slice(0, limit) : raw;
    // 正序（最早上 → 最新下），便于顶部加载更早、底部最新
    const ascending = windowRows.reverse();

    const messages = await attachSenders(supabase, ascending);
    const nextCursor = hasMore
      ? (ascending[0]?.created_at ?? null)
      : null;

    const result: ChatMessagesResponse = {
      data: messages,
      has_more: hasMore,
      next_cursor: nextCursor,
    };
    return jsonResponse({ data: result });
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

/** POST /api/groups/[id]/messages — 发送聊天消息（文本 / 图片） */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    if (!(await assertMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权发言" }, { status: 403 });
    }

    const body = (await request.json()) as SendMessageBody;
    const content = body.content?.trim() ?? "";
    const imageUrl = body.imageUrl?.trim() ?? "";

    if (imageUrl) {
      // 图片消息：image_url 必填
      if (!imageUrl.startsWith("http")) {
        return jsonResponse({ error: "图片地址无效" }, { status: 400 });
      }
    } else {
      // 文本消息：content 非空
      if (!content) {
        return jsonResponse({ error: "消息不能为空" }, { status: 400 });
      }
    }

    if (content) {
      const sensitiveCheck = containsSensitiveWord(content);
      if (sensitiveCheck.found) {
        return jsonResponse(
          { error: "内容包含敏感词，请修改后重试" },
          { status: 400 }
        );
      }
    }

    const type = imageUrl ? ("image" as const) : ("text" as const);
    const { data: message, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: id,
        sender_id: user.id,
        type,
        content: content || null,
        image_url: imageUrl || null,
      })
      .select("id, group_id, sender_id, type, content, image_url, created_at")
      .single();

    if (error || !message) {
      return jsonResponse(
        { error: safeErrorMessage(error, "发送失败") },
        { status: 500 }
      );
    }

    const [withSender] = await attachSenders(supabase, [message]);

    // @提及通知（best-effort）：提醒被提及的同圈子成员
    if (content) {
      try {
        const { data: members } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", id);
        const memberUserIds = (members ?? []).map((m) => m.user_id);
        if (memberUserIds.length > 0) {
          const { data: memberProfiles } = await supabase
            .from("profiles")
            .select("id, nickname")
            .in("id", memberUserIds);
          const membersWithProfile = (memberProfiles ?? [])
            .filter((p) => p.nickname)
            .map((p) => ({ user_id: p.id, profile: { nickname: p.nickname } }));
          const mentionedIds = extractMentionedUserIds(
            content,
            membersWithProfile
          );
          const targetIds = mentionedIds.filter((uid) => uid !== user.id);
          if (targetIds.length > 0) {
            await supabase.from("notifications").insert(
              targetIds.map((uid) => ({
                user_id: uid,
                actor_id: user.id,
                type: "message" as const,
                activity_id: null,
                group_id: id,
                comment_id: null,
                data: { snippet: content.slice(0, 100) },
              }))
            );
          }
        }
      } catch (mentionErr) {
        console.error("[messages/mention] 创建提及通知失败", mentionErr);
      }
    }

    return jsonResponse({ data: withSender }, { status: 201 });
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