"use client";

// ============================================================
// BindQqConfirmSubmit — 确认转移 QQ 绑定的客户端提交
// 展示旧账号资料，用户确认后调用 /api/profile/qq-transfer
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/common/UserAvatar";
import { fetchData } from "@/lib/fetcher";
import type { Profile } from "@/types";

interface BindQqConfirmSubmitProps {
  openid: string;
  fromUserId: string;
  /** 当前登录账号资料 */
  me: Pick<Profile, "id" | "nickname" | "avatar_url"> | null;
  /** 已绑定该 QQ 的旧账号资料 */
  from: Pick<Profile, "id" | "nickname" | "avatar_url"> | null;
}

export function BindQqConfirmSubmit({
  openid,
  fromUserId,
  me,
  from,
}: BindQqConfirmSubmitProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetchData<{ ok: boolean }>("/api/profile/qq-transfer", {
        method: "POST",
        body: JSON.stringify({ openid, fromUserId }),
      });
      toast.success("QQ 登录已绑定到当前账号");
      router.push("/profile?bind_qq=ok");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "转移失败");
      setSubmitting(false);
    }
  };

  const maskOpenid = (v: string) =>
    v.length > 12 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v;

  return (
    <div className="space-y-4">
      {/* 转移示意 */}
      <div className="space-y-2">
        {[
          { label: "当前账号（微信登录）", p: me },
          { label: "QQ 原绑定账号", p: from },
        ].map(({ label, p }, idx) => (
          <div
            key={label}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            {idx === 1 ? (
              <ArrowRightLeft className="h-4 w-4 shrink-0 text-primary" />
            ) : null}
            <UserAvatar profile={p ?? null} size={34} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="truncate text-sm font-medium">
                {p?.nickname ?? "未知用户"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
        <p className="font-medium">转移后将发生：</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>QQ（{maskOpenid(openid)}）一键登录将进入当前账号</li>
          <li>旧账号将失去 QQ 登录能力，其余登录方式不受影响</li>
          <li>两个账号的数据不会合并</li>
        </ul>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={submitting}
          onClick={() => router.push("/profile")}
        >
          取消
        </Button>
        <Button
          className="flex-1"
          disabled={submitting}
          onClick={confirm}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "确认转移"
          )}
        </Button>
      </div>
    </div>
  );
}
