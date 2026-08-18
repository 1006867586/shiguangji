import { redirect } from "next/navigation";
import { LoginClient } from "@/components/auth/LoginClient";
import { getCurrentUser } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; redirect?: string }>;
};

/**
 * 登录页（Server Component）
 * - 已登录用户直接跳转目标页（middleware 在 EdgeOne 退役后的兜底）
 * - 服务端读取 QQ_APP_ID，决定是否显示 QQ 登录按钮
 * - 读取 URL error 参数，交由客户端组件展示 toast 提示
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const qqEnabled = Boolean(process.env.QQ_APP_ID);
  const wechatEnabled = Boolean(process.env.WEAPP_APPID && process.env.WEAPP_SECRET);

  const user = await getCurrentUser();
  if (user) {
    redirect(params.redirect ?? "/");
  }

  return (
    <LoginClient
      qqEnabled={qqEnabled}
      wechatEnabled={wechatEnabled}
      initialError={params.error ?? null}
    />
  );
}
