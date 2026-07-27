"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/utils";

function QqPenguinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#12B7F5"
        d="M824.8 613.2c-16-40.8-33.6-81.6-50.4-120.8-8-17.6-12.8-36-14.4-54.4-1.6-18.4 1.6-36.8 8.8-53.6 16-38.4 20.8-80 14.4-120.8-6.4-40.8-24-78.4-50.4-109.6-26.4-31.2-60.8-54.4-99.2-67.2-19.2-6.4-38.4-10.4-58.4-11.2-4.8 0-9.6-0.8-14.4-0.8H544c-4.8 0-9.6 0.8-14.4 0.8-20 0.8-39.2 4.8-58.4 11.2-38.4 12.8-72.8 36-99.2 67.2-26.4 31.2-44 68.8-50.4 109.6-6.4 40.8-1.6 82.4 14.4 120.8 7.2 16.8 10.4 35.2 8.8 53.6-1.6 18.4-6.4 36.8-14.4 54.4-16.8 39.2-34.4 80-50.4 120.8-17.6 45.6-9.6 96.8 21.6 135.2 28.8 35.2 72 56.8 118.4 59.2 44 2.4 87.2-11.2 121.6-37.6 9.6-7.2 20.8-11.2 32.8-11.2s23.2 4 32.8 11.2c34.4 26.4 77.6 40 121.6 37.6 46.4-2.4 89.6-24 118.4-59.2 31.2-38.4 39.2-89.6 21.6-135.2z"
      />
      <path
        fill="#fff"
        d="M512 560m-64 0a64 64 0 1 0 128 0 64 64 0 1 0-128 0zM400 448m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0zM624 448m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0z"
      />
      <path
        fill="#fff"
        d="M512 640c-56 0-104-40-112-96h224c-8 56-56 96-112 96z"
        opacity="0.6"
      />
    </svg>
  );
}

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
      <div className="flex min-h-dvh items-center justify-center text-[#999]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      {/* 顶部 QQ 企鹅 */}
      <div className="mb-8 flex flex-col items-center">
        <QqPenguinIcon className="h-20 w-20 drop-shadow-lg" />
        <h1 className="mt-4 text-2xl font-semibold text-[#333]">
          欢迎登录
        </h1>
        <p className="mt-1 text-sm text-[#999]">
          连接你我，畅享沟通
        </p>
      </div>

      {/* 登录卡片 */}
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-8 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
        <form onSubmit={submit} className="space-y-5">
          {mode === "signup" && (
            <div>
              <label
                htmlFor="nickname"
                className="mb-1.5 block text-sm font-medium text-[#555]"
              >
                昵称
              </label>
              <input
                id="nickname"
                name="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="你的昵称"
                maxLength={20}
                autoComplete="nickname"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full rounded-xl border border-[#e5e6eb] bg-[#fafafa] px-4 py-3 text-sm text-[#333] outline-none transition-all placeholder:text-[#bbb] focus:border-[#12B7F5] focus:bg-white focus:ring-2 focus:ring-[#12B7F5]/20"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-[#555]"
            >
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              className="w-full rounded-xl border border-[#e5e6eb] bg-[#fafafa] px-4 py-3 text-sm text-[#333] outline-none transition-all placeholder:text-[#bbb] focus:border-[#12B7F5] focus:bg-white focus:ring-2 focus:ring-[#12B7F5]/20"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-[#555]"
            >
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              className="w-full rounded-xl border border-[#e5e6eb] bg-[#fafafa] px-4 py-3 text-sm text-[#333] outline-none transition-all placeholder:text-[#bbb] focus:border-[#12B7F5] focus:bg-white focus:ring-2 focus:ring-[#12B7F5]/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#12B7F5] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#12B7F5]/25 transition-all hover:bg-[#0FA3DC] hover:shadow-lg hover:shadow-[#12B7F5]/30 active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "signin" ? (
              "登录"
            ) : (
              "注册"
            )}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === "signin" ? (
            <span className="text-[#999]">
              还没有账号？{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-medium text-[#12B7F5] hover:underline"
              >
                立即注册
              </button>
            </span>
          ) : (
            <span className="text-[#999]">
              已有账号？{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-medium text-[#12B7F5] hover:underline"
              >
                去登录
              </button>
            </span>
          )}
        </div>

        {/* 分隔线 */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#eee]" />
          <span className="text-xs text-[#bbb]">或</span>
          <div className="h-px flex-1 bg-[#eee]" />
        </div>

        {/* QQ 登录按钮 */}
        <a
          href={`/api/auth/qq?redirect=${encodeURIComponent(redirect)}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e6eb] bg-white px-4 py-3 text-sm font-medium text-[#555] shadow-sm transition-all hover:bg-[#f5f6f7] hover:text-[#12B7F5] active:scale-[0.98]"
        >
          <QqPenguinIcon className="h-5 w-5" />
          QQ 登录
        </a>
      </div>

      {/* 底部版权 */}
      <p className="mt-8 text-xs text-[#bbb]">
        登录即代表你同意服务条款和隐私政策
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-[#999]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
