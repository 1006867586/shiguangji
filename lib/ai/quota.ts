/**
 * AI 调用配额管理
 *
 * 设计：
 * - 每用户每自然小时 N 次配额（默认 20 次）
 * - 配额计数存数据库 ai_generations 表（每小时一条记录或聚合查询）
 * - 失败降级：配额查询失败时不阻塞调用（避免数据库故障影响主流程）
 */

import { createServerClient } from "@/lib/supabase/server";

/** 每用户每小时配额上限 */
const HOURLY_QUOTA = 20;

/**
 * 检查当前用户是否还有 AI 调用配额
 * 返回 { allowed, used, limit }
 */
export async function checkAiQuota(
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  try {
    const supabase = await createServerClient();
    // 当前小时起始时间（UTC）
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    const { count, error } = await supabase
      .from("ai_generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", hourStart.toISOString());

    if (error) {
      // 查询失败：放行，避免阻塞用户
      return { allowed: true, used: 0, limit: HOURLY_QUOTA };
    }
    const used = count ?? 0;
    return { allowed: used < HOURLY_QUOTA, used, limit: HOURLY_QUOTA };
  } catch {
    // 任何异常：放行
    return { allowed: true, used: 0, limit: HOURLY_QUOTA };
  }
}

/**
 * 记录一次 AI 调用（成功或失败都记录，便于审计与计费）
 * 失败不抛错（best-effort）
 */
export async function recordAiGeneration(input: {
  userId: string;
  type: string;
  activityId?: string;
  inputHash?: string;
  output: unknown;
  model: string;
  tokensUsed?: number;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    const supabase = await createServerClient();
    await supabase.from("ai_generations").insert({
      user_id: input.userId,
      type: input.type,
      activity_id: input.activityId ?? null,
      input_hash: input.inputHash ?? null,
      output: input.success ? input.output : null,
      error_message: input.success ? null : input.errorMessage ?? null,
      model: input.model,
      tokens_used: input.tokensUsed ?? null,
      success: input.success,
    });
  } catch {
    // 记录失败不影响主流程
  }
}

export { HOURLY_QUOTA };
