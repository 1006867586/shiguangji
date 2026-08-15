import { createBrowserClient } from "@supabase/ssr";

/**
 * 判断 Supabase 是否在浏览器构建期拿到了真实配置值（非占位符）。
 * 用于 UI 层提前提示用户，避免点击按钮后才抛 "Failed to fetch"。
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  if (url.startsWith("BUILD_PLACEHOLDER")) return false;
  if (url.includes("placeholder.supabase.co")) return false;
  if (anonKey.startsWith("BUILD_PLACEHOLDER")) return false;
  if (anonKey === "placeholder-anon-key") return false;
  return true;
}

/**
 * 浏览器端 Supabase Client（带 Auth）
 * 仅在 Client Component / hooks 中使用。
 *
 * 容错：如果构建期没注入真实 NEXT_PUBLIC_*（仍是占位符），
 * 之前会 throw "缺少 env 变量" 导致整个 LoginClient 组件直接崩溃，
 * 登录表单都渲染不出来。改成返回一个「哑 client」：
 *   - 所有方法返回明确的中文错误 "Supabase 配置未就绪…"
 *   - 页面能正常渲染表单，用户点击登录时 toast 会显示可读错误
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured()) {
    const errMsg =
      "Supabase 配置未就绪（前端 JS bundle 中未写入真实 URL/anon key）。" +
      "请在 CloudBase 控制台【服务设置 → 环境变量】中设置：" +
      "NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY，然后重新部署。";
    // eslint-disable-next-line no-console
    console.error("[lib/supabase/client]", errMsg, { url, anonKey: anonKey ? `${anonKey.slice(0, 10)}...` : "MISSING" });

    const makeErr = () => ({ data: { user: null, session: null }, error: new Error(errMsg) });
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        signInWithPassword: async () => makeErr(),
        signUp: async () => makeErr(),
        signOut: async () => ({ error: null }),
      },
    } as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url!, anonKey!);
}
