"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchData } from "@/lib/fetcher";
import { useAuth } from "@/hooks/useAuth";
import type { Group } from "@/types";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const codeFromUrl = searchParams.get("code");
  const [code, setCode] = useState(codeFromUrl ?? "");
  const [submitting, setSubmitting] = useState(false);

  // 构造携带 code 的完整 redirect 路径，供登录跳转使用
  const redirectPath = codeFromUrl
    ? `/join?code=${encodeURIComponent(codeFromUrl.toUpperCase())}`
    : "/join";

  useEffect(() => {
    if (codeFromUrl) setCode(codeFromUrl.toUpperCase());
  }, [codeFromUrl]);

  const join = async (candidate?: unknown) => {
    const c = (typeof candidate === "string" ? candidate : code).trim().toUpperCase();
    if (!c) {
      toast.error("请输入邀请码");
      return;
    }
    setSubmitting(true);
    try {
      const group = await fetchData<Group>("/api/groups/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: c }),
      });
      toast.success("加入成功");
      router.push(`/g/${group.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 自动加入：已登录 + URL 携带合法长度邀请码，自动提交一次
  useEffect(() => {
    if (loading || !user) return;
    const c = (codeFromUrl ?? "").trim().toUpperCase();
    if (c.length === 6 && !submitting) {
      join(c);
    }
    // 仅在「首次进入 / 登录状态刚确认 / URL code 刚变化」时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, codeFromUrl]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10">
          <Ticket className="h-10 w-10" strokeWidth={1.8} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">加入圈子</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          请先登录后再使用邀请码加入圈子
        </p>
        <Button asChild className="shadow-sm">
          <a href={`/login?redirect=${encodeURIComponent(redirectPath)}`}>
            去登录
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background pb-20">
      <header className="flex h-14 items-center justify-center border-b border-border/60 bg-background/80 backdrop-blur-xl pt-safe-t">
        <h1 className="font-display text-lg font-semibold tracking-tight">加入圈子</h1>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-7 p-6 max-w-md mx-auto w-full">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <Ticket className="h-8 w-8" strokeWidth={1.8} />
          </div>
          <h2 className="font-display text-xl font-semibold tracking-tight">输入邀请码</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            向圈子创建者索取 6 位邀请码
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="code">邀请码</Label>
          <Input
            id="code"
            name="invite-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
            className="rounded-xl bg-card text-center text-2xl font-mono tracking-[0.5em] pl-[0.25em] shadow-xs"
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            onKeyDown={(e) => {
              if (e.key === "Enter") join();
            }}
          />
        </div>

        <Button
          onClick={join}
          disabled={submitting || code.length !== 6}
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
