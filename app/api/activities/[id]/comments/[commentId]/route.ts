import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; commentId: string }> };

/** DELETE /api/activities/[id]/comments/[commentId] — 删除评论（仅作者） */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { commentId } = await params;

    const { data: comment, error } = await supabase
      .from("comments")
      .select("id, author_id")
      .eq("id", commentId)
      .maybeSingle();

    if (error || !comment) {
      return jsonResponse({ error: "评论不存在" }, { status: 404 });
    }
    if (comment.author_id !== user.id) {
      return jsonResponse({ error: "仅作者可删除" }, { status: 403 });
    }

    const { error: delErr } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (delErr) {
      return jsonResponse({ error: delErr.message }, { status: 500 });
    }
    return jsonResponse({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
