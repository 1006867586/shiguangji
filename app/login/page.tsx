"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) router.replace(redirect);
        else setChecking(false);
      })
      .catch(() => setChecking(false));
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
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("登录成功");
        router.replace(redirect);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              nickname: nickname.trim() || email.split("@")[0],
            },
            emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(
              redirect
            )}`,
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("注册成功");
          router.replace(redirect);
          router.refresh();
        } else {
          toast.success("注册成功，请前往邮箱确认后登录");
          setMode("signin");
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
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
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
