import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import { parseExternalLink } from "@/lib/activities";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 餐厅统计项 */
interface RestaurantStat {
  title: string;
  count: number;
  last_visited_at: string;
  platform?: string | null;
  address?: string | null;
}

/** 月度统计项 */
interface MonthlyCount {
  month: string; // YYYY-MM
  count: number;
}

/** 贡献者统计项 */
interface ContributorStat {
  user_id: string;
  activity_count: number;
  profile: {
    id: string;
    nickname: string;
    avatar_url: string | null;
  } | null;
}

/**
 * GET /api/groups/[id]/stats — 获取团体聚餐统计
 * 仅团体成员可调用。
 * 返回：total_activities / total_photos / total_comments / top_restaurants
 *      / monthly_counts（近 12 个月）/ top_contributors（前 5）/ avg_rating / total_spent
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验团体存在 + 当前用户为成员
    const { data: group } = await supabase
      .from("groups")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();

    if (!group) {
      return jsonResponse({ error: "团体不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    // 拉取团体所有活动（仅必要字段）
    const { data: activities, error: actErr } = await supabase
      .from("activities")
      .select("id, author_id, external_link, created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: false });

    if (actErr) {
      return jsonResponse(
        { error: safeErrorMessage(actErr, "获取活动失败") },
        { status: 500 }
      );
    }

    const activityList = (activities ?? []) as Array<{
      id: string;
      author_id: string;
      external_link: unknown;
      created_at: string;
    }>;
    const activityIds = activityList.map((a) => a.id);
    const total_activities = activityList.length;

    // 并行：照片计数 / 评论计数 / 评分 / 分账
    const [photosCountRes, commentsCountRes, ratingsRes, splitsRes] =
      await Promise.all([
        activityIds.length > 0
          ? supabase
              .from("activity_photos")
              .select("id", { count: "exact", head: true })
              .in("activity_id", activityIds)
          : Promise.resolve({ count: 0, error: null }),
        activityIds.length > 0
          ? supabase
              .from("comments")
              .select("id", { count: "exact", head: true })
              .in("activity_id", activityIds)
          : Promise.resolve({ count: 0, error: null }),
        activityIds.length > 0
          ? supabase
              .from("activity_ratings")
              .select("score")
              .in("activity_id", activityIds)
          : Promise.resolve({ data: [], error: null }),
        activityIds.length > 0
          ? supabase
              .from("activity_splits")
              .select("total_amount")
              .in("activity_id", activityIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (photosCountRes.error) {
      return jsonResponse(
        { error: safeErrorMessage(photosCountRes.error, "获取照片统计失败") },
        { status: 500 }
      );
    }
    if (commentsCountRes.error) {
      return jsonResponse(
        { error: safeErrorMessage(commentsCountRes.error, "获取评论统计失败") },
        { status: 500 }
      );
    }

    const total_photos = photosCountRes.count ?? 0;
    const total_comments = commentsCountRes.count ?? 0;

    // 平均评分
    const ratingScores = ((ratingsRes.data ?? []) as Array<{ score: number }>).map(
      (r) => r.score
    );
    const avg_rating =
      ratingScores.length > 0
        ? Math.round(
            (ratingScores.reduce((s, n) => s + n, 0) / ratingScores.length) * 10
          ) / 10
        : 0;

    // 总消费（单位:分）
    const total_spent = ((splitsRes.data ?? []) as Array<{ total_amount: number }>)
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    // ---- top_restaurants：按 external_link.title 聚合，前 10 ----
    const restaurantMap = new Map<string, RestaurantStat>();
    for (const a of activityList) {
      const link = parseExternalLink(a.external_link);
      if (!link || !link.title) continue;
      const title = link.title.trim();
      if (!title) continue;
      const existing = restaurantMap.get(title);
      if (existing) {
        existing.count += 1;
        // activities 已按 created_at desc 排序，首次出现即为最近一次
        if (a.created_at > existing.last_visited_at) {
          existing.last_visited_at = a.created_at;
        }
      } else {
        restaurantMap.set(title, {
          title,
          count: 1,
          last_visited_at: a.created_at,
          platform: link.platform ?? null,
          address: link.address ?? null,
        });
      }
    }
    const top_restaurants = Array.from(restaurantMap.values())
      .sort((a, b) => b.count - a.count || (a.last_visited_at < b.last_visited_at ? 1 : -1))
      .slice(0, 10);

    // ---- monthly_counts：近 12 个月 ----
    const now = new Date();
    const months: MonthlyCount[] = [];
    // 构建近 12 个月的空桶（YYYY-MM），从最早到最近
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month: key, count: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.month, i]));
    // 近 12 个月最早一天（含），用于过滤
    const earliest = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (const a of activityList) {
      const d = new Date(a.created_at);
      if (d < earliest) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const idx = monthIndex.get(key);
      if (idx !== undefined) months[idx].count += 1;
    }

    // ---- top_contributors：按 author_id 聚合，前 5 ----
    const contributorMap = new Map<string, number>();
    for (const a of activityList) {
      if (!a.author_id) continue;
      contributorMap.set(
        a.author_id,
        (contributorMap.get(a.author_id) ?? 0) + 1
      );
    }
    const topContributorIds = Array.from(contributorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid]) => uid);

    let top_contributors: ContributorStat[] = [];
    if (topContributorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url")
        .in("id", topContributorIds);
      const profileMap = new Map<
        string,
        { id: string; nickname: string; avatar_url: string | null }
      >();
      for (const p of profiles ?? []) {
        profileMap.set(p.id, p);
      }
      top_contributors = topContributorIds.map((uid) => ({
        user_id: uid,
        activity_count: contributorMap.get(uid) ?? 0,
        profile: profileMap.get(uid) ?? null,
      }));
    }

    return jsonResponse({
      data: {
        total_activities,
        total_photos,
        total_comments,
        top_restaurants,
        monthly_counts: months,
        top_contributors,
        avg_rating,
        total_spent,
      },
    });
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
