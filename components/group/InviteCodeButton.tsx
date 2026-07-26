"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function InviteCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`已复制${label}`);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const inviteUrl = `${origin}/join?code=${code}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="邀请码">
          <Ticket className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>邀请好友加入</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          邀请码
        </div>
        <DropdownMenuItem
          onClick={() => copy(code, "邀请码")}
          className="justify-between"
        >
          <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-sm tracking-[0.3em]">
            {code}
          </span>
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          邀请链接
        </div>
        <DropdownMenuItem
          onClick={() => copy(inviteUrl, "邀请链接")}
          className="justify-between"
        >
          <span className="truncate text-xs">{inviteUrl}</span>
          <Copy className="h-4 w-4 shrink-0" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
