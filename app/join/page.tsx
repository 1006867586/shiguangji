"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  LogIn,
  Ticket,
  Users,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchData } from "@/lib/fetcher";
import { useAuth } from "@/hooks/useAuth";
import { isValidInviteCode } from "@/lib/utils";
import type { GroupInvitePreview, JoinGroupResult } from "@/types";

/** 圈子头像：有图显示图片，否则显示首字母占位 */
function GroupAvatar({ src, name }: { src: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  if (src && !errored) {
    // 圈子头像为完整 URL（R2），用原生 img 避免 next/image 域名配置依赖
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className="h-20 w-20 rounded-2xl object-cover ring-1 ring-border/60"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary ring-1 ring-primary/10">
      {name.slice(0, 1) || "?"}
    </div>
  );
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const codeFromUrl = (searchParams.get("code") ?? "").trim().toUpperCase();
  const [codeInput, setCodeInput] = useState(codeFromUrl);
  const [submitting, setSubmitting] = useState(false);

  // 预览态
  const [preview, setPreview] = useState<GroupInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  // 携带 code 的登录回跳路径
  const redirectPath = codeFromUrl
    ? `/join?code=${encodeURIComponent(codeFromUrl)}`
    : "/join";

  // 同步手动输入框与 URL 邀请码（点「使用其他邀请码」后清空）
  useEffect(() => {
    setCodeInput(codeFromUrl);
  }, [codeFromUrl]);

  // 通过邀请码拉取圈子预览（已登录时重新拉取以更新 is_member）
  useEffect(() => {
    if (authLoading) return;
    if (!codeFromUrl) return;
    setPreviewLoading(true);
    setPreviewError(false);
    setPreview(null);
    fetchData<GroupInvitePreview>(
      `/api/groups/join?code=${encodeURIComponent(codeFromUrl)}`
    )
      .then((p) => setPreview(p))
      .catch(() => setPreviewError(true))
      .finally(() => setPreviewLoading(false));
    // 依赖邀请码与登录态：登录后重新拉取以刷新 is_member
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl, authLoading, user?.id]);

  // POST 加入圈子
  const join = useCallback(
    async (c: string) => {
      const code = c.trim().toUpperCase();
      if (!isValidInviteCode(code)) {
        toast.error("请输入有效的 6 位邀请码");
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetchData<JoinGroupResult>("/api/groups/join", {
          method: "POST",
          body: JSON.stringify({ inviteCode: code }),
        });
        toast.success(res.alreadyMember ? "你已是该圈子成员" : "加入成功");
        router.push(`/g/${res.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加入失败");
      } finally {
        setSubmitting(false);
      }
    },
    [router]
  );

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // ---- 1) 带邀请码：渲染预览卡片 ----
  if (codeFromUrl) {
    // 加载中
    if (previewLoading) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
          <JoinHeader />
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
            <div className="h-20 w-20 animate-pulse rounded-2xl bg-muted" />
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
        </div>
      );
    }

    // 邀请码无效 / 已失效
    if (previewError || !preview) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
          <JoinHeader />
          <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Ticket className="h-8 w-8" strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                邀请码无效或已失效
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                请确认链接完整性，或向邀请人索取新的邀请码
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push("/join")}>
              使用其他邀请码
            </Button>
          </div>
        </div>
      );
    }

    // 预览卡片
    const isMember = preview.is_member;
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background pb-20">
        <JoinHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
          <GroupAvatar src={preview.avatar_url} name={preview.name} />

          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              你被邀请加入
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
              {preview.name}
            </h2>
            {preview.description && (
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                {preview.description}
              </p>
            )}
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {preview.member_count} 位成员
            </p>
          </div>

          {isMember ? (
            <Button
              className="w-full max-w-xs shadow-sm transition-transform active:scale-[0.98]"
              onClick={() => router.push(`/g/${preview.id}`)}
            >
              <CheckCircle2 className="h-4 w-4" />
              进入圈子
            </Button>
          ) : !user ? (
            <Button asChild className="w-full max-w-xs shadow-sm">
              <a href={`/login?redirect=${encodeURIComponent(redirectPath)}`}>
                <LogIn className="h-4 w-4" />
                登录并加入
              </a>
            </Button>
          ) : (
            <Button
              className="w-full max-w-xs shadow-sm transition-transform active:scale-[0.98]"
              disabled={submitting}
              onClick={() => join(codeFromUrl)}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              加入圈子
            </Button>
          )}

          <button
            type="button"
            onClick={() => router.push("/join")}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            使用其他邀请码
          </button>
        </div>
      </div>
    );
  }

  // ---- 2) 无邀请码：手动输入 ----
  const handleManualSubmit = () => {
    const code = codeInput.trim().toUpperCase();
    if (!isValidInviteCode(code)) {
      toast.error("请输入有效的 6 位邀请码");
      return;
    }
    // 未登录：带上 code 跳登录，回来后自动走预览卡片
    if (!user) {
      router.push(
        `/login?redirect=${encodeURIComponent(`/join?code=${code}`)}`
      );
      return;
    }
    join(code);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background pb-20">
      <JoinHeader />
      <div className="flex flex-1 flex-col justify-center gap-7 p-6 max-w-md mx-auto w-full">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <Ticket className="h-8 w-8" strokeWidth={1.8} />
          </div>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            输入邀请码
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            向圈子创建者索取 6 位邀请码
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="code">邀请码</Label>
          <Input
            id="code"
            name="invite-code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
            className="rounded-xl bg-card text-center text-2xl font-mono tracking-[0.5em] pl-[0.25em] shadow-xs"
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualSubmit();
            }}
          />
        </div>

        <Button
          onClick={handleManualSubmit}
          disabled={submitting || codeInput.length !== 6}
          className="shadow-sm transition-transform active:scale-[0.98]"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          加入
        </Button>
      </div>
    </div>
  );
}

function JoinHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-center border-b border-border/60 bg-background/80 pt-safe-t backdrop-blur-xl">
      <h1 className="font-display text-lg font-semibold tracking-tight">加入圈子</h1>
    </header>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
