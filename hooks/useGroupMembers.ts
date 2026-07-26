"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { GroupMember, UUID } from "@/types";

/** useGroupMembers 返回值 */
interface UseGroupMembersReturn {
  members: GroupMember[];
  loading: boolean;
  error: string | null;
  /** 移除成员（仅 admin，不能移除自己） */
  removeMember: (userId: UUID) => Promise<void>;
  /** 转让管理员（仅当前 admin） */
  transferAdmin: (newAdminId: UUID) => Promise<void>;
  /** 退出团体 */
  leaveGroup: () => Promise<void>;
  /** 重新拉取成员列表 */
  reload: () => Promise<void>;
}

/**
 * useGroupMembers — SWR 拉取团体成员列表，并提供移除/转让/退出操作。
 * 操作成功后自动重新拉取以同步服务端状态。
 */
export function useGroupMembers(
  groupId: string | null
): UseGroupMembersReturn {
  const { data, error, mutate, isLoading } = useSWR<GroupMember[]>(
    groupId ? `/api/groups/${groupId}/members` : null,
    (url: string) => fetchData<GroupMember[]>(url),
    { revalidateOnFocus: false }
  );

  const removeMember = useCallback(
    async (userId: UUID) => {
      await fetcher(
        `/api/groups/${groupId}/members/${userId}`,
        { method: "DELETE" }
      );
      await mutate();
    },
    [groupId, mutate]
  );

  const transferAdmin = useCallback(
    async (newAdminId: UUID) => {
      await fetchData(`/api/groups/${groupId}/transfer-admin`, {
        method: "POST",
        body: JSON.stringify({ newAdminId }),
      });
      await mutate();
    },
    [groupId, mutate]
  );

  const leaveGroup = useCallback(async () => {
    await fetchData(`/api/groups/${groupId}/leave`, {
      method: "POST",
    });
    // 退出后成员列表对当前用户已无意义，清空缓存
    await mutate([], { revalidate: false });
  }, [groupId, mutate]);

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    members: data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    removeMember,
    transferAdmin,
    leaveGroup,
    reload,
  };
}
