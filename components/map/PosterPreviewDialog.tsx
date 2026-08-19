"use client";

import { useEffect, useState } from "react";
import { Loader2, Download, Link2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { fetchData } from "@/lib/fetcher";

interface PosterPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "footprints" | "circle";
  groupId?: string;
}

interface PosterResult {
  url: string;
  points: number;
}

/** 打卡地图海报：打开后自动生成，展示 + 下载 + 复制链接 */
export function PosterPreviewDialog({
  open,
  onOpenChange,
  type,
  groupId,
}: PosterPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [poster, setPoster] = useState<PosterResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPoster(null);
    setCopied(false);
    fetchData<PosterResult>("/api/map/poster", {
      method: "POST",
      body: JSON.stringify({ type, groupId: groupId ?? null }),
    })
      .then((res) => {
        if (!cancelled) setPoster(res);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "海报生成失败");
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, groupId]);

  const handleCopy = async () => {
    if (!poster) return;
    try {
      await navigator.clipboard.writeText(poster.url);
      setCopied(true);
      toast.success("链接已复制");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请长按图片保存");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>打卡地图海报</DialogTitle>
          <DialogDescription>
            已按你的打卡记录生成，可下载保存或分享给朋友
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                海报生成中，请稍候…
              </p>
            </div>
          ) : poster ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={poster.url}
                  alt="打卡地图海报"
                  className="max-h-[24rem] w-full object-contain"
                />
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <a href={poster.url} download target="_blank" rel="noopener noreferrer">
                    <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    下载海报
                  </a>
                </Button>
                <Button size="sm" className="flex-1" onClick={handleCopy}>
                  {copied ? (
                    <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied ? "已复制" : "复制链接"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
