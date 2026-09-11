import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import { attachDecorToProfiles } from "@/lib/server-decor";
import type {
  CreateGroupPollBody,
  GroupMessage,
  GroupPoll,
  GroupPollStatus,
} from "@/types";

export const dynamic = "force-dynamic";

const MAX_TITLE = 60;
const MAX_OPTIONS = 10;
const MAX_OPTION_LEN = 40;

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

/** 加载投票明细 + 当前用户视角聚合 */
async function loadPoll(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  pollId: string,
  viewerId: string,
  groupId: string
): Promise<GroupPoll | null> {
  const { data: poll, error } = await supabase
    .from("group_polls")
    .select("*")
    .eq("id", pollId)
    .maybeSingle();
  if (error || !poll || poll.group_id !== groupId) return null;

  const { data: opts } = await supabase
    .from("group_poll_options")
    .select("*")
    .eq("poll_id", pollId)
    .order("sort_order", { ascending: true });
  const optionList = (opts ?? []) as Array<{
    id: string;
    label: string;
    sort_order: number;
  }>;

  // 参与记录（含用户，用于接龙逐人展示 + 结果计数）
  const { data: entries } = await supabase
    .from("group_poll_entries")
    .select("id, poll_id, user_id, option_id, content, created_at")
    .eq("poll_id", pollId)
    .order("created_at", { ascending: true });
  const entryList = (entries ?? []) as Array<{
    id: string;
    poll_id: string;
    user_id: string;
    option_id: string | null;
    content: string | null;
    created_at: string;
  }>;

  // 聚合选项得票
  const countByOption = new Map<string, number>();
  const votedUserSet = new Set<string>();
  for (const e of entryList) {
    votedUserSet.add(e.user_id);
    if (e.option_id) {
      countByOption.set(e.option_id, (countByOption.get(e.option_id) ?? 0) + 1);
    }
  }
  const myOptionIds = new Set(
    entryList.filter((e) => e.user_id === viewerId && e.option_id).map((e) => e.option_id)
  );

  const options = optionList.map((o) => ({
    id: o.id,
    poll_id: pollId,
    label: o.label,
    sort_order: o.sort_order,
    count: countByOption.get(o.id) ?? 0,
    votedByMe: myOptionIds.has(o.id) ?? false,
  }));

  // 接龙：补充参与人资料
  let rollcallEntries: GroupPoll["rollcall_entries"];
  if (poll.kind === "rollcall") {
    const userIds = Array.from(new Set(entryList.map((e) => e.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds);
    await attachDecorToProfiles(supabase, profiles ?? []);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    rollcallEntries = entryList.map((e) => ({
      id: e.id,
      poll_id: e.poll_id,
      user_id: e.user_id,
      option_id: e.option_id,
      content: e.content,
      created_at: e.created_at,
      participant:
        profMap.get(e.user_id) ?? {
          id: e.user_id,
          nickname: "用户",
          avatar_url: null,
        },
    }));
  }

  return {
    id: poll.id,
    group_id: poll.group_id,
    created_by: poll.created_by,
    kind: poll.kind,
    title: poll.title,
    multiple: poll.multiple,
    status: poll.status as GroupPollStatus,
    created_at: poll.created_at,
    closed_at: poll.closed_at,
    options,
    i_participated:
      poll.kind === "poll"
        ? entryList.some((e) => e.user_id === viewerId)
        : false,
    participant_count:
      poll.kind === "poll" ? votedUserSet.size : entryList.length,
    rollcall_entries: rollcallEntries,
  };
}

/** 将投票卡片作为一条聊天消息插入（进入聊天流即可实时可见） */
async function insertPollMessage(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  groupId: string,
  senderId: string,
  pollId: string,
  pollTitle: string
): Promise<GroupMessage | null> {
  const { data, error } = await supabase
    .from("group_messages")
    .insert({
      group_id: groupId,
      sender_id: senderId,
      type: "text",
      content: `[${pollId}] ${pollTitle}`.slice(0, 200),
      image_url: null,
      reply_to_id: null,
      poll_id: pollId,
    })
    .select(
      "id, group_id, sender_id, type, content, image_url, reply_to_id, created_at"
    )
    .single();
  if (error) return null;
  return data as GroupMessage;
}

/**
 * POST /api/groups/[id]/polls — 创建投票/接龙
 * body: { kind:"poll"|"rollcall", title, multiple?, options? }
 * - 事务化创建 poll + 选项（RPC），随后插入一条聊天消息承载卡片
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (!(await assertMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权发起" }, { status: 403 });
    }

    const body = (await request.json()) as CreateGroupPollBody;
    const kind = body.kind ?? "";
    const title = body.title?.trim() ?? "";
    if (kind !== "poll" && kind !== "rollcall") {
      return jsonResponse({ error: "类型无效" }, { status: 400 });
    }
    if (!title || title.length > MAX_TITLE) {
      return jsonResponse({ error: "标题不能为空且不超过60字" }, { status: 400 });
    }

    let options: string[] = [];
    if (kind === "poll") {
      options = (body.options ?? [])
        .map((o) => o.trim())
        .filter((o) => o.length > 0 && o.length <= MAX_OPTION_LEN);
      if (options.length < 2) {
        return jsonResponse({ error: "投票至少需要2个选项" }, { status: 400 });
      }
      if (options.length > MAX_OPTIONS) {
        return jsonResponse({ error: `选项最多${MAX_OPTIONS}个` }, { status: 400 });
      }
    }

    const { data: pollId, error: rpcErr } = await supabase.rpc(
      "create_group_poll",
      {
        p_group_id: id,
        p_kind: kind,
        p_title: title,
        p_multiple: Boolean(body.multiple),
        p_options: options,
      }
    );
    if (rpcErr) {
      return jsonResponse(
        { error: safeErrorMessage(rpcErr, "创建失败") },
        { status: 500 }
      );
    }
    const createdPollId = pollId as string;

    // 插入聊天消息承载卡片
    await insertPollMessage(supabase, id, user.id, createdPollId, title);

    const poll = await loadPoll(supabase, createdPollId, user.id, id);
    return jsonResponse({ data: { poll } }, { status: 201 });
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