"use client";

import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  LogOut,
  Crown,
  UserMinus,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { formatDateTime } from "@/lib/utils";
import type { GroupMember, MemberRole } from "@/types";

interface MembersListProps {
  groupId: string;
  currentUserId: string;
  currentRole: MemberRole;
}

/**
 * MembersList — 客户端成员管理列表。
 * 展示成员头像/昵称/角色/加入时间；admin 可移除普通成员、转让管理员、退出团体。
 */
export function MembersList({
  groupId,
  currentUserId,
  currentRole,
}: MembersListProps) {
  const { members, loading, error, removeMember, transferAdmin, leaveGroup } =
    useGroupMembers(groupId);
  const router = useRouter();
  const isAdmin = currentRole === "admin";
  const adminCount = members.filter((m) => m.role === "admin").length;

  const handleRemove = async (m: GroupMember) => {
    if (m.role === "admin") {
      toast.error("不能移除管理员，请先转让管理员权限");
      return;
    }
    if (!confirm(`确定移除「${m.profile?.nickname ?? "该成员"}」吗？`)) return;
    try {
      await removeMember(m.user_id);
      toast.success("已移除成员");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失败");
    }
  };

  const handleTransfer = async (m: GroupMember) => {
    if (m.user_id === currentUserId) {
      toast.error("你已经是管理员");
      return;
    }
    if (
      !confirm(
        `确定将管理员转让给「${m.profile?.nickname ?? "该成员"}」吗？转让后你将成为普通成员。`
      )
    )
      return;
    try {
      await transferAdmin(m.user_id);
      toast.success("已转让管理员");
      // 当前用户角色已变，刷新服务端数据以同步权限态
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "转让失败");
    }
  };

  const handleLeave = async () => {
    if (isAdmin && adminCount <= 1) {
      toast.error("你是唯一管理员，无法退出。请先转让管理员或解散团体。");
      return;
    }
    if (!confirm("确定退出该团体吗？退出后将无法查看团体动态。")) return;
    try {
      await leaveGroup();
      toast.success("已退出团体");
      router.push("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "退出失败");
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="mb-2 px-1 text-xs text-muted-foreground">
        共 {members.length} 位成员
      </div>
      <ul className="space-y-2">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const memberIsAdmin = m.role === "admin";
          return (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <UserAvatar profile={m.profile} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {m.profile?.nickname ?? "未知用户"}
                  </span>
                  {isSelf ? (
                    <Badge variant="outline" className="text-[10px]">
                      我
                    </Badge>
                  ) : null}
                  {memberIsAdmin ? (
                    <Badge className="gap-1 text-[10px]">
                      <Crown className="h-3 w-3" />
                      管理员
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      成员
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  加入于 {formatDateTime(m.joined_at)}
                </div>
              </div>

              {isAdmin && !isSelf ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="管理操作"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleTransfer(m)}
                    >
                      <UserCog className="h-4 w-4" />
                      转让管理员
                    </DropdownMenuItem>
                    {memberIsAdmin ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled
                          className="text-muted-foreground"
                        >
                          <UserMinus className="h-4 w-4" />
                          不能移除管理员
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleRemove(m)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserMinus className="h-4 w-4" />
                          移除成员
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full text-destructive hover:text-destructive"
        onClick={handleLeave}
      >
        <LogOut className="h-4 w-4" />
        退出团体
      </Button>
    </div>
  );
}
