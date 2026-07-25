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
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [submitting, setSubmitting] = useState(false);

  const codeFromUrl = searchParams.get("code");

  useEffect(() => {
    if (codeFromUrl) setCode(codeFromUrl.toUpperCase());
  }, [codeFromUrl]);

  const join = async () => {
    const c = code.trim().toUpperCase();
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
        <Ticket className="h-12 w-12 text-primary" />
        <h1 className="text-xl font-semibold">加入团体</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          请先登录后再使用邀请码加入团体
        </p>
        <Button asChild>
          <a href={`/login?redirect=${encodeURIComponent("/join")}`}>
            去登录
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <header className="flex h-14 items-center justify-center border-b border-border">
        <h1 className="text-base font-semibold">加入团体</h1>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Ticket className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold">输入邀请码</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            向团体创建者索取 6 位邀请码
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="code">邀请码</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
            className="text-center text-2xl font-mono tracking-[0.5em]"
            maxLength={6}
            onKeyDown={(e) => {
              if (e.key === "Enter") join();
            }}
          />
        </div>

        <Button onClick={join} disabled={submitting || code.length !== 6}>
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
