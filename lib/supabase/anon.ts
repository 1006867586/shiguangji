import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

/**
 * 服务端匿名 Supabase 客户端（免登录读写分享池等公共数据）。
 * 环境未配置时返回 null，调用方返回 501。
 */
export function createAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isPlaceholder(url) || isPlaceholder(anonKey)) return null;
  return createSupabaseClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
