import { LoginClient } from "@/components/auth/LoginClient";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; redirect?: string }>;
};

/**
 * 登录页（Server Component）
 * - 服务端读取 QQ_APP_ID，决定是否显示 QQ 登录按钮
 * - 读取 URL error 参数，交由客户端组件展示 toast 提示
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const qqEnabled = Boolean(process.env.QQ_APP_ID);

  return (
    <LoginClient qqEnabled={qqEnabled} initialError={params.error ?? null} />
  );
}
