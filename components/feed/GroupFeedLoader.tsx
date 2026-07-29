"use client";

import { useEffect, useState } from "react";
import { FeedList } from "./FeedList";
import { STORAGE_KEYS } from "@/lib/constants";
import type { Group } from "@/types";

interface GroupFeedLoaderProps {
  groups: Group[];
  userId?: string;
}

/**
 * 根据上次访问的圈子 ID 加载对应 Feed。
 * 优先读取 localStorage 中的 lastGroupId，回退到第一个圈子。
 * 同时监听 GroupSelector 的切换事件，实现圈子切换。
 */
export function GroupFeedLoader({ groups, userId }: GroupFeedLoaderProps) {
  const [currentGroupId, setCurrentGroupId] = useState<string>(groups[0]?.id);

  // 读取上次访问的圈子
  useEffect(() => {
    const last = localStorage.getItem(STORAGE_KEYS.lastGroupId);
    if (last && groups.some((g) => g.id === last)) {
      setCurrentGroupId(last);
    }
  }, [groups]);

  // 监听圈子切换事件（来自 GroupSelector）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ groupId: string }>).detail;
      if (detail?.groupId) {
        setCurrentGroupId(detail.groupId);
        localStorage.setItem(STORAGE_KEYS.lastGroupId, detail.groupId);
      }
    };
    window.addEventListener("group-change", handler);
    return () => window.removeEventListener("group-change", handler);
  }, []);

  // 持久化当前圈子
  useEffect(() => {
    if (currentGroupId) {
      localStorage.setItem(STORAGE_KEYS.lastGroupId, currentGroupId);
    }
  }, [currentGroupId]);

  if (!currentGroupId) return null;

  return (
    <FeedList groupId={currentGroupId} currentUserId={userId} />
  );
}
