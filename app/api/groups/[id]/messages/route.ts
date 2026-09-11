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
  GroupPoll,
  MessageReactionAggregate,
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

/**
 * 为一批消息批量合并「表情回应聚合」与「引用回复信息」。
 * - reactions：按 message_id 归并 emoji → {emoji, count, reactedByMe}
 * - reply_*：解析被引用消息（reply_to_id）的发送者昵称与内容预览
 */
async function attachExtras<
  R extends Pick<GroupMessage, "id" | "reply_to_id" | "type" | "content">
>(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  rows: R[],
  viewerId: string
): Promise<
  Array<
    R & {
      reply_sender: GroupMessage["reply_sender"];
      reply_preview: GroupMessage["reply_preview"];
      reactions: MessageReactionAggregate[];
    }
  >
> {
  if (rows.length === 0) return [];

  // ---- 表情回应聚合（保序：先出现者在前） ----
  const idList = rows.map((m) => m.id);
  const { data: rawReactions } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", idList);

  const rawByMessage = new Map<string, Array<{ emoji: string; me: boolean }>>();
  for (const r of rawReactions ?? []) {
    const list = rawByMessage.get(r.message_id) ?? [];
    list.push({ emoji: r.emoji, me: r.user_id === viewerId });
    rawByMessage.set(r.message_id, list);
  }

  const aggregateReactions = (messageId: string): MessageReactionAggregate[] => {
    const grouped = new Map<string, { count: number; me: boolean }>();
    for (const { emoji, me } of rawByMessage.get(messageId) ?? []) {
      const g = grouped.get(emoji) ?? { count: 0, me: false };
      g.count += 1;
      g.me = g.me || me;
      grouped.set(emoji, g);
    }
    return Array.from(grouped.entries()).map(([emoji, g]) => ({
      emoji,
      count: g.count,
      reactedByMe: g.me,
    }));
  };

  // ---- 引用回复信息：批量取被引用消息 + 其发送者昵称 ----
  const replyIds = Array.from(
    new Set(rows.map((m) => m.reply_to_id).filter((v): v is string => !!v))
  );
  const replyRowMap = new Map<
    string,
    { type: GroupMessage["type"]; content: string | null; sender_id: string }
  >();
  const replyDataByMsg = new Map<
    string,
    { reply_sender: GroupMessage["reply_sender"]; reply_preview: string }
  >();

  if (replyIds.length > 0) {
    const { data: replyRows } = await supabase
      .from("group_messages")
      .select("id, type, content, sender_id")
      .in("id", replyIds);
    const profileIds = Array.from(
      new Set((replyRows ?? []).map((r) => r.sender_id))
    );
    const { data: replyProfiles } = await supabase
      .from("profiles")
      .select("id, nickname")
      .in("id", profileIds);
    const nameMap = new Map(
      (replyProfiles ?? []).map((p) => [p.id, p.nickname])
    );
    for (const r of replyRows ?? []) {
      replyRowMap.set(r.id, {
        type: r.type,
        content: r.content,
        sender_id: r.sender_id,
      });
    }
    for (const [id, replied] of replyRowMap) {
      replyDataByMsg.set(id, {
        reply_sender: replied.sender_id
          ? { id: replied.sender_id, nickname: nameMap.get(replied.sender_id) ?? "用户" }
          : null,
        reply_preview:
          replied.type === "image"
            ? "[图片]"
            : replied.content?.slice(0, 80) ?? "",
      });
    }
  }

  return rows.map((m) => {
    const replied = m.reply_to_id ? replyDataByMsg.get(m.reply_to_id) : undefined;
    return {
      ...m,
      reply_sender: replied?.reply_sender ?? null,
      reply_preview: replied?.reply_preview ?? null,
      reactions: aggregateReactions(m.id),
    };
  });
}

/** 为一批消息批量合并投票/接龙卡片负载 */
async function attachPolls<
  R extends Pick<GroupMessage, "id" | "group_id">
>(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  rows: R[],
  viewerId: string
): Promise<Array<R & { poll: GroupPoll | null }>> {
  const withPoll = rows as Array<R & { poll: GroupPoll | null }>;
  const pollIds = Array.from(
    new Set(
      withPoll
        .map((m) => (m as R & { poll_id?: string | null }).poll_id)
        .filter((v): v is string => !!v)
    )
  );
  if (pollIds.length === 0) return withPoll;

  const { data: polls } = await supabase
    .from("group_polls")
    .select("*")
    .in("id", pollIds);
  const pollMap = new Map((polls ?? []).map((p) => [p.id, p]));

  const { data: opts } = await supabase
    .from("group_poll_options")
    .select("*")
    .in("poll_id", pollIds)
    .order("sort_order", { ascending: true });
  const optByPoll = new Map<string, GroupPoll["options"]>();
  for (const o of opts ?? []) {
    const list = optByPoll.get(o.poll_id) ?? [];
    list.push(o);
    optByPoll.set(o.poll_id, list);
  }

  const { data: entries } = await supabase
    .from("group_poll_entries")
    .select("id, poll_id, user_id, option_id, content, created_at")
    .in("poll_id", pollIds);
  const entryByPoll = new Map<string, typeof entries>();
  for (const e of entries ?? []) {
    const list = entryByPoll.get(e.poll_id) ?? [];
    list.push(e);
    entryByPoll.set(e.poll_id, list);
  }
  const entryList = (entries ?? []) as Array<{
    id: string;
    poll_id: string;
    user_id: string;
    option_id: string | null;
    content: string | null;
    created_at: string;
  }>;

  for (const m of withPoll) {
    const pid = (m as R & { poll_id?: string | null }).poll_id;
    const raw = pid ? pollMap.get(pid) : null;
    if (!raw || !pid) {
      m.poll = raw ?? null;
      continue;
    }

    const optionList = optByPoll.get(pid) ?? [];
    const pollEntries = entryList.filter((e) => e.poll_id === pid);
    const countByOption = new Map<string, number>();
    const votedUsers = new Set<string>();
    for (const e of pollEntries) {
      votedUsers.add(e.user_id);
      if (e.option_id)
        countByOption.set(e.option_id, (countByOption.get(e.option_id) ?? 0) + 1);
    }
    const myOptionIds = new Set(
      pollEntries.filter((e) => e.user_id === viewerId && e.option_id).map((e) => e.option_id)
    );

    const options: GroupPoll["options"] = optionList.map((o) => ({
      id: o.id,
      poll_id: o.poll_id,
      label: o.label,
      sort_order: o.sort_order,
      count: countByOption.get(o.id) ?? 0,
      votedByMe: myOptionIds.has(o.id) ?? false,
    }));

    m.poll = {
      id: raw.id,
      group_id: raw.group_id,
      created_by: raw.created_by,
      kind: raw.kind,
      title: raw.title,
      multiple: raw.multiple,
      status: raw.status,
      created_at: raw.created_at,
      closed_at: raw.closed_at,
      options,
      i_participated: raw.kind === "poll"
        ? pollEntries.some((e) => e.user_id === viewerId)
        : false,
      participant_count:
        raw.kind === "poll" ? votedUsers.size : pollEntries.length,
    };
  }
  return withPoll;
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
    const qParam = searchParams.get("q")?.trim() ?? "";
    const limit = safeParseInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

    // 取 limit+1 判断是否还有更早的消息
    let q = supabase
      .from("group_messages")
      .select("id, group_id, sender_id, type, content, image_url, reply_to_id, created_at, poll_id")
      .eq("group_id", id)
      .limit(limit + 1);

    if (qParam) {
      // 搜索模式：仅匹配文本消息内容，忽略分页游标（群聊搜索通常直接看最新命中）
      q = q
        .eq("type", "text")
        .not("content", "is", null)
        .ilike("content", `%${qParam}%`);
    } else if (before) {
      q = q.lt("created_at", before);
    }
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
      reply_to_id: string | null;
      created_at: string;
      poll_id?: string | null;
    }>;

    const hasMore = raw.length > limit;
    const windowRows = hasMore ? raw.slice(0, limit) : raw;
    // 正序（最早上 → 最新下），便于顶部加载更早、底部最新
    const ascending = windowRows.reverse();

    const withSender = await attachSenders(supabase, ascending);
    const withExtras = await attachExtras(supabase, withSender, user.id);
    const messages = await attachPolls(supabase, withExtras, user.id);
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
    const replyToId = body.replyToId?.trim() ?? "";

    if (replyToId && !isUuid(replyToId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

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

    // 校验被引用消息存在且属于当前圈子
    if (replyToId) {
      const { data: replied } = await supabase
        .from("group_messages")
        .select("id, group_id")
        .eq("id", replyToId)
        .maybeSingle();
      if (!replied || replied.group_id !== id) {
        return jsonResponse({ error: "引用的消息不存在" }, { status: 400 });
      }
    }

    const { data: message, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: id,
        sender_id: user.id,
        type,
        content: content || null,
        image_url: imageUrl || null,
        reply_to_id: replyToId || null,
      })
      .select(
        "id, group_id, sender_id, type, content, image_url, reply_to_id, created_at, poll_id"
      )
      .single();

    if (error || !message) {
      return jsonResponse(
        { error: safeErrorMessage(error, "发送失败") },
        { status: 500 }
      );
    }

    const [withSender] = await attachSenders(supabase, [message]);
    const [extended] = await attachExtras<typeof withSender>(
      supabase,
      [withSender],
      user.id
    );
    const [withPoll] = await attachPolls(supabase, [extended], user.id);

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

    return jsonResponse(
      {
        data: {
          ...withSender,
          reply_sender: extended.reply_sender,
          reply_preview: extended.reply_preview,
          reactions: extended.reactions,
          poll: withPoll.poll,
        },
      },
      { status: 201 }
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