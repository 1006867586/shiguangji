"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Users, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchData } from "@/lib/fetcher";
import { STORAGE_KEYS } from "@/lib/constants";
import type { Group } from "@/types";

interface GroupSelectorProps {
  /** 服务端预取的圈子列表（可选） */
  initialGroups?: Group[];
  /** 受控当前圈子 ID */
  currentGroupId?: string;
  /** 选中圈子回调 */
  onSelect?: (group: Group) => void;
  /** 是否持久化到 localStorage（用于首页 lastGroupId） */
  storageKey?: "lastGroupId";
  id?: string;
}

export function GroupSelector({
  initialGroups,
  currentGroupId,
  onSelect,
  storageKey,
  id,
}: GroupSelectorProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>(initialGroups ?? []);
  const [loading, setLoading] = useState(!initialGroups);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    currentGroupId ?? initialGroups?.[0]?.id
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchData<Group[]>("/api/groups")
      .then((data) => setGroups(data))
      .catch((e) => {
        setGroups([]);
        setError(e instanceof Error ? e.message : "加载圈子列表失败");
      })
      .finally(() => setLoading(false));
  }, []);

  // 无 initialGroups 时从 API 加载
  useEffect(() => {
    if (!initialGroups) load();
  }, [initialGroups, load]);

  // 读取 localStorage 中上次访问的圈子
  useEffect(() => {
    if (storageKey && groups.length > 0) {
      const last = localStorage.getItem(STORAGE_KEYS.lastGroupId);
      if (last && groups.some((g) => g.id === last)) {
        setSelectedId(last);
      }
    }
  }, [storageKey, groups]);

  const current = groups.find((g) => g.id === selectedId);

  const handleSelect = (g: Group) => {
    setSelectedId(g.id);
    onSelect?.(g);
    if (storageKey) {
      localStorage.setItem(STORAGE_KEYS.lastGroupId, g.id);
      // 触发事件让 GroupFeedLoader 切换
      window.dispatchEvent(
        new CustomEvent("group-change", { detail: { groupId: g.id } })
      );
    } else {
      // 非首页：跳转到该圈子 Feed 页
      router.push(`/g/${g.id}`);
    }
  };

  if (error && !loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="truncate">{error}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={load}
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 font-display text-lg font-semibold tracking-tight hover:bg-muted/60"
        >
          <Users className="h-4 w-4 text-primary/70" strokeWidth={2} />
          <span className="max-w-[140px] truncate">
            {current?.name ?? (loading ? "加载中…" : "选择圈子")}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          我的圈子
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            还未加入任何圈子
          </div>
        ) : (
          groups.map((g) => (
            <DropdownMenuItem
              key={g.id}
              onClick={() => handleSelect(g)}
              className="justify-between"
            >
              <span className="truncate">{g.name}</span>
              {g.id === selectedId ? (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/groups/new" className="cursor-pointer">
            <Plus className="h-4 w-4" /> 创建新圈子
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/join" className="cursor-pointer">
            <Users className="h-4 w-4" /> 通过邀请码加入
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
