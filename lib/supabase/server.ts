import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookiesToSet } from "./cookies";

/**
 * 快速判断 env 中的 Supabase URL/KEY 是否已经是真实值（即已经过 entrypoint.sh
 * 或构建 --build-arg 替换，不是占位符/空值）。
 * 只要有一项是占位符，就认定整个配置「未就绪」，避免抛出硬错误导致 SSR 渲染 500。
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
 * Server Component / Route Handler 中使用的 Supabase Client。
 * 通过 cookies 读取用户会话，受 RLS 约束。
 *
 * 如果 Supabase 环境变量未就绪（仍是占位符），这里**不再 throw**，
 * 否则 SSR 渲染阶段（如 middleware / login 布局）一进来就 500，
 * 连登录页都打不开。改成 console.warn 提示运维去补 env。
 */
export async function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured()) {
    console.warn(
      "[lib/supabase/server] createServerClient 被调用但 Supabase env 未就绪，" +
        "所有 auth 查询将返回空。请设置 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。" +
        ` （URL=${url ?? ""}，KEY=${anonKey ? `${anonKey.slice(0, 10)}...` : "MISSING"}）`
    );
    // 返回一个最小「哑 client」：auth.* 全返回空/无，不抛异常。
    // 这样 getCurrentUser() → null，requireUser() → 正常抛 401，UI 能走降级分支。
    const noopAuth = {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error("Supabase 未配置") }),
      signUp: async () => ({ data: { user: null, session: null }, error: new Error("Supabase 未配置") }),
    } as unknown as ReturnType<typeof createSSRClient>["auth"];
    return { auth: noopAuth } as ReturnType<typeof createSSRClient>;
  }

  const cookieStore = await cookies();

  return createSSRClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // 在 Server Component 中调用 set 会被忽略（只读 cookies）
        }
      },
    },
  });
}

/**
 * 获取当前登录用户，未登录返回 null。
 */
export async function getCurrentUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * 获取当前登录用户，未登录抛错（用于必须登录的接口）。
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export class UnauthorizedError extends Error {
  status = 401;
  code = "unauthorized";
  constructor() {
    super("未登录或会话已过期");
  }
}
