"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Users, Plus } from "lucide-react";
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
import type { Group } from "@/types";

interface GroupSelectorProps {
  currentGroupId?: string;
  onSelect?: (group: Group) => void;
}

export function GroupSelector({ currentGroupId, onSelect }: GroupSelectorProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData<{ id: string; name: string; invite_code: string }[] | Group[]>(
      "/api/groups"
    )
      .then((data) => setGroups(data as Group[]))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  const current = groups.find((g) => g.id === currentGroupId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 px-2">
          <Users className="h-4 w-4" />
          <span className="max-w-[140px] truncate font-medium">
            {current?.name ?? (loading ? "加载中…" : "选择团体")}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>我的团体</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            还未加入任何团体
          </div>
        ) : (
          groups.map((g) => (
            <DropdownMenuItem
              key={g.id}
              onClick={() => onSelect?.(g)}
              className="justify-between"
            >
              <span className="truncate">{g.name}</span>
              {g.id === currentGroupId ? (
                <span className="text-xs text-primary">●</span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/groups/new" className="cursor-pointer">
            <Plus className="h-4 w-4" /> 创建新团体
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
