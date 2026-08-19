"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Settings as SettingsIcon,
  ShieldAlert,
  BarChart3,
  Link2,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  Loader2,
  LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGroupSettings } from "@/hooks/useGroupSettings";
import { fetcher } from "@/lib/fetcher";
import type { Group } from "@/types";

interface CircleManagementProps {
  groupId: string;
  group: Group;
  memberCount: number;
  isAdmin: boolean;
  currentUserId: string;
}

/**
 * CircleManagement — 圈子管理聚合页（客户端交互部分）。
 * 聚合：概览 / 成员·设置·举报·统计 入口 / 邀请管理（复制链接·重置码）/ 危险区（解散）。
 * 仅管理员可见 设置 / 举报 / 重置码 / 解散 等敏感操作。
 */
export function CircleManagement({
  groupId,
  group,
  memberCount,
  isAdmin,
}: CircleManagementProps) {
  const router = useRouter();
  const { resetInviteCode, loading: resettingCode } = useGroupSettings(groupId);

  const [inviteCode, setInviteCode] = useState(group.invite_code);
  const [copied, setCopied] = useState(false);
  const [dissolveOpen, setDissolveOpen] = useState(false);
  const [dissolving, setDissolving] = useState(false);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/join?code=${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("邀请链接已复制");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleResetCode = async () => {
    if (!confirm("确定重置邀请码吗？旧邀请码将立即失效。")) return;
    try {
      const newCode = await resetInviteCode();
      setInviteCode(newCode);
      toast.success("邀请码已重置");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重置失败");
    }
  };

  const handleDissolve = async () => {
    setDissolving(true);
    try {
      await fetcher(`/api/groups/${groupId}`, { method: "DELETE" });
      toast.success("圈子已解散");
      router.push("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解散失败");
      setDissolving(false);
      setDissolveOpen(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* 概览 */}
      <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {group.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={group.avatar_url}
              alt={group.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
              {group.name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold">
              {group.name}
            </span>
            {isAdmin ? (
              <Badge className="gap-1 text-[10px]">
                <ShieldAlert className="h-3 w-3" />
                管理员
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {memberCount} 位成员
          </div>
        </div>
      </section>

      {/* 管理入口 */}
      <section className="grid grid-cols-2 gap-2">
        <EntryCard
          href={`/g/${groupId}/members`}
          icon={<Users className="h-5 w-5" />}
          title="成员管理"
          desc="查看与移除成员"
        />
        <EntryCard
          href={`/g/${groupId}/stats`}
          icon={<BarChart3 className="h-5 w-5" />}
          title="圈子统计"
          desc="聚餐与消费概览"
        />
        {isAdmin ? (
          <>
            <EntryCard
              href={`/g/${groupId}/settings`}
              icon={<SettingsIcon className="h-5 w-5" />}
              title="圈子设置"
              desc="资料与权限开关"
            />
            <EntryCard
              href={`/g/${groupId}/reports`}
              icon={<ShieldAlert className="h-5 w-5" />}
              title="举报管理"
              desc="处理不良内容"
            />
          </>
        ) : null}
      </section>

      {/* 邀请管理 */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-medium">邀请管理</div>
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">邀请链接</div>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
              {typeof window !== "undefined"
                ? `${window.location.origin}/join?code=${inviteCode}`
                : `/join?code=${inviteCode}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              复制
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">邀请码</div>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm tracking-[0.3em]">
              {inviteCode}
            </span>
            {isAdmin ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetCode}
                disabled={resettingCode}
              >
                {resettingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                重置
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            分享链接或邀请码让朋友加入圈子
          </p>
        </div>
      </section>

      {/* 危险区（仅管理员） */}
      {isAdmin ? (
        <section className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="text-sm font-medium text-destructive">危险区</div>
          <p className="text-xs text-muted-foreground">
            解散后将删除圈子及其所有成员、活动数据，且不可恢复。
          </p>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={() => setDissolveOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            解散圈子
          </Button>
        </section>
      ) : null}

      <Dialog
        open={dissolveOpen}
        onOpenChange={(v) => {
          if (!v) setDissolveOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>解散圈子</DialogTitle>
            <DialogDescription>
              确定解散「{group.name}」吗？此操作将删除圈子、所有成员与活动数据，且不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDissolveOpen(false)}
              disabled={dissolving}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDissolve}
              disabled={dissolving}
            >
              {dissolving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              确认解散
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 管理入口卡片 */
function EntryCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{desc}</div>
      </div>
    </Link>
  );
}
