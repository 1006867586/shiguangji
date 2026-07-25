import { createBrowserClient } from "@supabase/ssr";

/**
 * 浏览器端 Supabase Client（带 Auth）
 * 仅在 Client Component / hooks 中使用。
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 环境变量"
    );
  }

  return createBrowserClient(url, anonKey);
}
