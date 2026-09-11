import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import { attachDecorToProfiles } from "@/lib/server-decor";
import type {
  GroupPoll,
  GroupPollStatus,
  VoteGroupPollBody,
} from "@/types";

export const dynamic = "force-dynamic";

const MAX_OPTIONS = 10;
const MAX_ROLLCALL_CONTENT = 200;

type Params = { params: Promise<{ id: string; pollId: string }> };

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

async function loadPoll(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  pollId: string,
  viewerId: string,
  groupId: string
): Promise<GroupPoll | null> {
  const { data: poll } = await supabase
    .from("group_polls")
    .select("*")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll || poll.group_id !== groupId) return null;

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

  const countByOption = new Map<string, number>();
  const votedUserSet = new Set<string>();
  for (const e of entryList) {
    votedUserSet.add(e.user_id);
    if (e.option_id)
      countByOption.set(e.option_id, (countByOption.get(e.option_id) ?? 0) + 1);
  }
  const myOptionIds = new Set(
    entryList
      .filter((e) => e.user_id === viewerId && e.option_id)
      .map((e) => e.option_id)
  );
  const options = optionList.map((o) => ({
    id: o.id,
    poll_id: pollId,
    label: o.label,
    sort_order: o.sort_order,
    count: countByOption.get(o.id) ?? 0,
    votedByMe: myOptionIds.has(o.id) ?? false,
  }));

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
        profMap.get(e.user_id) ?? { id: e.user_id, nickname: "用户", avatar_url: null },
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
    i_participated: poll.kind === "poll"
      ? entryList.some((e) => e.user_id === viewerId)
      : false,
    participant_count: poll.kind === "poll" ? votedUserSet.size : entryList.length,
    rollcall_entries: rollcallEntries,
  };
}

/**
 * GET /api/groups/[id]/polls/[pollId] — 获取投票/接龙明细（可含实时刷新）
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, pollId } = await params;

    if (!isUuid(id) || !isUuid(pollId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (!(await assertMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }
    const poll = await loadPoll(supabase, pollId, user.id, id);
    if (!poll) {
      return jsonResponse({ error: "投票不存在" }, { status: 404 });
    }
    return jsonResponse({ data: { poll } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/**
 * POST /api/groups/[id]/polls/[pollId] — 投票 / 参与接龙
 * body:
 *   poll 单选: { optionId, selected }
 *   poll 多选: { selected:true, anyOptionId }
 *   rollcall: { content }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, pollId } = await params;

    if (!isUuid(id) || !isUuid(pollId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (!(await assertMember(supabase, id, user.id))) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data: poll } = await supabase
      .from("group_polls")
      .select("id, kind, multiple, status, created_by, group_id")
      .eq("id", pollId)
      .maybeSingle();
    if (!poll || poll.group_id !== id) {
      return jsonResponse({ error: "投票不存在" }, { status: 404 });
    }
    if (poll.status !== "open") {
      return jsonResponse({ error: "投票已结束" }, { status: 400 });
    }

    const body = (await request.json()) as VoteGroupPollBody;

    // ===== 接龙：参与/更新 或 取消接龙 =====
    if (poll.kind === "rollcall") {
      const content = body.content?.trim() ?? "";
      const { data: existing } = await supabase
        .from("group_poll_entries")
        .select("id")
        .eq("poll_id", pollId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!content) {
        // 空内容 → 取消接龙
        if (existing) {
          await supabase.from("group_poll_entries").delete().eq("id", existing.id);
        }
      } else {
        if (content.length > MAX_ROLLCALL_CONTENT) {
          return jsonResponse({ error: "接龙内容过长" }, { status: 400 });
        }
        if (existing) {
          await supabase
            .from("group_poll_entries")
            .update({ content })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("group_poll_entries")
            .insert({ poll_id: pollId, user_id: user.id, content });
        }
      }
    }

    // ===== 投票 =====
    else {
      const optionId = body.optionId?.trim() ?? "";
      if (!isUuid(optionId)) {
        return jsonResponse({ error: "参数错误" }, { status: 400 });
      }
      const { data: opt } = await supabase
        .from("group_poll_options")
        .select("id")
        .eq("id", optionId)
        .eq("poll_id", pollId)
        .maybeSingle();
      if (!opt) {
        return jsonResponse({ error: "选项不存在" }, { status: 404 });
      }

      const selected = body.selected !== false;
      if (poll.multiple) {
        // 多选：toggle 当前选项
        const { data: existing } = await supabase
          .from("group_poll_entries")
          .select("id")
          .eq("poll_id", pollId)
          .eq("user_id", user.id)
          .eq("option_id", optionId)
          .maybeSingle();
        if (existing) {
          await supabase.from("group_poll_entries").delete().eq("id", existing.id);
        } else if (selected) {
          await supabase
            .from("group_poll_entries")
            .insert({ poll_id: pollId, user_id: user.id, option_id: optionId });
        }
      } else {
        // 单选：先清本人所有票，再投该选项；selected=false 仅取消
        await supabase
          .from("group_poll_entries")
          .delete()
          .eq("poll_id", pollId)
          .eq("user_id", user.id);
        if (selected) {
          await supabase
            .from("group_poll_entries")
            .insert({ poll_id: pollId, user_id: user.id, option_id: optionId });
        }
      }
    }

    const pollDetail = await loadPoll(supabase, pollId, user.id, id);
    return jsonResponse({ data: { poll: pollDetail } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}