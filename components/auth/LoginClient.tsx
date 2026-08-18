"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { WechatQrLogin } from "@/components/auth/WechatQrLogin";

interface LoginClientProps {
  /** 服务器端根据 QQ_APP_ID 判断是否启用 QQ 登录 */
  qqEnabled: boolean;
  /** 服务器端根据 WEAPP_APPID/WEAPP_SECRET 判断是否启用微信扫码登录 */
  wechatEnabled: boolean;
  /** 由 URL error 参数触发的错误信息，mount 后展示一次 toast */
  initialError?: string | null;
}

/** 将 API 返回的 error code 映射为用户可读的中文提示 */
const ERROR_MESSAGES: Record<string, string> = {
  qq_not_configured: "当前未配置 QQ 登录，请使用邮箱登录/注册",
};

function formatError(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

function LoginForm({ qqEnabled, wechatEnabled, initialError }: LoginClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [wechatOpen, setWechatOpen] = useState(false);

  // mount 后展示初始错误（例如：从 /api/auth/qq?error=xxx 跳转回来）
  useEffect(() => {
    if (initialError) {
      toast.error(formatError(initialError));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        router.replace(redirect);
        return;
      }

      // 内存无会话时,尝试从 cookies 恢复(QQ 回调跳转后常见)
      const { data, error } = await supabase.auth.refreshSession();
      if (cancelled) return;

      if (!error && data.session) {
        router.replace(redirect);
      } else {
        setChecking(false);
      }
    };

    check().catch(() => {
      if (!cancelled) setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, [supabase, router, redirect]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("请填写邮箱和密码");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        // 走自家同域 /api/auth/signin：
        // 服务端 createServerClient().auth.signInWithPassword() 返回 cookies.setAll()，
        // NextResponse.cookies.set() 写 sb-* 到响应（同源 Set-Cookie，浏览器必收）
        const res = await fetch("/api/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email: email.trim(),
            password,
            redirect,
          }),
        });
        const info = await res.json().catch(() => ({})) as {
          ok?: boolean;
          error?: string;
          redirect?: string;
        };
        if (!info.ok) {
          throw new Error(info.error || "登录失败");
        }
        toast.success("登录成功");
        // 必须 window.location.href 硬跳转，不能 router.replace()
        // 否则客户端导航的 307 回 /login 不会真的触发浏览器顶级导航
        window.location.href = info.redirect ?? redirect;
      } else {
        // 注册：同样走自家同域 /api/auth/signup
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email: email.trim(),
            password,
            nickname: nickname.trim(),
            redirect,
          }),
        });
        const info = await res.json().catch(() => ({})) as {
          ok?: boolean;
          error?: string;
          redirect?: string;
          needVerify?: boolean;
          message?: string;
        };
        if (!info.ok) {
          throw new Error(info.error || "注册失败");
        }
        if (info.needVerify) {
          // Supabase 配置了「邮箱必须确认」，不返回 session → 切回登录模式
          toast.success(info.message || "注册成功，请前往邮箱确认后登录");
          setMode("signin");
        } else {
          // 免邮件验证的新用户，会话已写 cookie → 硬跳
          toast.success("注册成功");
          window.location.href = info.redirect ?? redirect;
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/10 via-primary/3 to-transparent blur-2xl"
      />
      <div className="flex flex-1 flex-col justify-center gap-7 p-6 pt-16">
        <div className="text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 animate-slide-up-fade items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-1 ring-primary/20"
            style={{ animationDelay: "0ms" }}
          >
            <UtensilsCrossed className="h-8 w-8" strokeWidth={2.2} />
          </div>
          <div
            className="flex animate-slide-up-fade items-center justify-center gap-2"
            style={{ animationDelay: "80ms" }}
          >
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              {APP_NAME}
            </h1>
            <span className="editorial-dot" aria-hidden="true" />
            <span className="font-display text-sm italic text-muted-foreground">
              XiangKe
            </span>
          </div>
          <p
            className="mt-2 animate-slide-up-fade text-sm text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            记录每一次与朋友的飨聚时刻
          </p>
        </div>

        <form
          onSubmit={submit}
          className="animate-slide-up-fade space-y-4"
          style={{ animationDelay: "240ms" }}
        >
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="nickname">昵称</Label>
              <Input
                id="nickname"
                name="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="你的昵称"
                maxLength={20}
                autoComplete="nickname"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
            />
          </div>

          <Button
            type="submit"
            className="w-full shadow-sm transition-transform active:scale-[0.98]"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "signin" ? (
              "登录"
            ) : (
              "注册"
            )}
          </Button>
        </form>

        <div
          className="animate-slide-up-fade text-center text-sm"
          style={{ animationDelay: "320ms" }}
        >
          {mode === "signin" ? (
            <span className="text-muted-foreground">
              还没有账号？{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-medium text-primary hover:underline"
              >
                注册
              </button>
            </span>
          ) : (
            <span className="text-muted-foreground">
              已有账号？{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-medium text-primary hover:underline"
              >
                登录
              </button>
            </span>
          )}
        </div>

        {qqEnabled ? (
          <>
            <div
              className="ornament-divider animate-slide-up-fade text-[11px] uppercase tracking-[0.3em]"
              style={{ animationDelay: "400ms" }}
            >
              <span>或</span>
            </div>

            <a
              href={`/api/auth/qq?redirect=${encodeURIComponent(redirect)}`}
              className="flex w-full animate-slide-up-fade items-center justify-center gap-2 rounded-lg bg-[#12B7F5] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#0FA3DC] hover:shadow-md active:scale-[0.98]"
              style={{ animationDelay: "480ms" }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.77 1.46 5.24 3.74 6.86-.18.62-.7 2.14-.78 2.4-.1.32.12.32.24.26.1-.05 1.6-.98 2.24-1.38.82.2 1.7.3 2.56.3 5.52 0 10-3.94 10-8.8S17.52 2 12 2zm0 14.4c-.8 0-1.58-.1-2.32-.3l-.5-.14-.5.3c-.36.22-.96.58-1.3.76.06-.24.16-.62.22-.86l.06-.24-.2-.14C5.2 14.5 4 12.74 4 10.8 4 7.04 7.58 4 12 4s8 3.04 8 6.8-3.58 6.8-8 6.8z" />
              </svg>
              QQ 登录
            </a>
          </>
        ) : null}

        {wechatEnabled ? (
          <button
            type="button"
            onClick={() => setWechatOpen(true)}
            className="flex w-full animate-slide-up-fade items-center justify-center gap-2 rounded-lg bg-[#07C160] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#06AD56] hover:shadow-md active:scale-[0.98]"
            style={{ animationDelay: "560ms" }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M9.5 4C5.36 4 2 6.69 2 10c0 1.89 1.08 3.56 2.78 4.66l-.7 2.14a.4.4 0 0 0 .61.43l2.42-1.47c.77.21 1.59.34 2.39.34h.66a5.9 5.9 0 0 1-.16-1.35C10 11.11 12.7 8.6 16 8.6c.36 0 .71.04 1.06.09C16.22 5.9 13.14 4 9.5 4zM7.2 7.9a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM16 9.6c-2.98 0-5.4 1.9-5.4 4.25 0 1.22.66 2.31 1.7 3.05l-.5 1.52a.29.29 0 0 0 .43.3l1.72-1.04c.66.18 1.33.28 2.05.28 2.98 0 5.4-1.9 5.4-4.25S18.98 9.6 16 9.6zm-1.55 2.1a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44zm3.1 0a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44z" />
            </svg>
            微信登录
          </button>
        ) : null}

        <WechatQrLogin
          open={wechatOpen}
          onClose={() => setWechatOpen(false)}
          redirect={redirect}
        />
      </div>
    </div>
  );
}

export function LoginClient(props: LoginClientProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <LoginForm {...props} />
    </Suspense>
  );
}
