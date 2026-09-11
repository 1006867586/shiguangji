import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { MessageReactionAggregate } from "@/types";

export const dynamic = "force-dynamic";

const MAX_EMOJI_LEN = 16;

type Params = {
  params: Promise<{ id: string; mid: string }>;
};

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

/** 校验消息属于该圈子；返回消息或 null */
async function findMessage(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  groupId: string,
  messageId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("group_messages")
    .select("id, group_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!data || data.group_id !== groupId) return null;
  return { id: data.id };
}

/** 聚合某条消息的全部回应（含 viewer 视角 reactByMe） */
async function buildAggregate(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  messageId: string,
  userId: string
): Promise<MessageReactionAggregate[]> {
  const { data: raw } = await supabase
    .from("message_reactions")
    .select("emoji, user_id")
    .eq("message_id", messageId);
  const grouped = new Map<string, { count: number; me: boolean }>();
  for (const r of raw ?? []) {
    const g = grouped.get(r.emoji) ?? { count: 0, me: false };
    g.count += 1;
    g.me = g.me || r.user_id === userId;
    grouped.set(r.emoji, g);
  }
  return Array.from(grouped.entries()).map(([e, g]) => ({
    emoji: e,
    count: g.count,
    reactedByMe: g.me,
  }));
}

/** GET /api/groups/[id]/messages/[mid]/reactions — 单消息的回应聚合 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, mid } = await params;

    if (!isUuid(id) || !isUuid(mid)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (!(await assertMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }
    const message = await findMessage(supabase, id, mid);
    if (!message) {
      return jsonResponse({ error: "消息不存在" }, { status: 404 });
    }

    const reactions = await buildAggregate(supabase, message.id, user.id);
    return jsonResponse({ data: { reactions } });
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

/**
 * POST /api/groups/[id]/messages/[mid]/reactions — 切换表情回应
 * body: { emoji: "👍" }
 * - 本人已点该 emoji → 取消
 * - 本人未点该 emoji → 添加
 * 返回该消息最新的回应聚合。
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, mid } = await params;

    if (!isUuid(id) || !isUuid(mid)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (!(await assertMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }
    const message = await findMessage(supabase, id, mid);
    if (!message) {
      return jsonResponse({ error: "消息不存在" }, { status: 404 });
    }

    const body = (await request.json()) as { emoji?: string };
    const emoji = body.emoji?.trim() ?? "";
    if (!emoji || emoji.length > MAX_EMOJI_LEN) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 查询本人是否已点
    const { data: existing, error: existErr } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", message.id)
      .eq("user_id", user.id)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existErr) {
      return jsonResponse(
        { error: safeErrorMessage(existErr, "操作失败") },
        { status: 500 }
      );
    }

    if (existing) {
      // 已有 → 取消
      const { error: delErr } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existing.id);
      if (delErr) {
        return jsonResponse(
          { error: safeErrorMessage(delErr, "操作失败") },
          { status: 500 }
        );
      }
    } else {
      // 未点 → 添加（唯一约束冲突视为已存在，走删除兜底不返回错误）
      const { error: insErr } = await supabase
        .from("message_reactions")
        .insert({ message_id: message.id, user_id: user.id, emoji });
      if (insErr && !insErr.message.includes("duplicate")) {
        return jsonResponse(
          { error: safeErrorMessage(insErr, "操作失败") },
          { status: 500 }
        );
      }
    }

    // 返回最新聚合
    const reactions = await buildAggregate(supabase, message.id, user.id);
    return jsonResponse({ data: { reactions, reacted: !existing } });
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