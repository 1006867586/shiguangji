"use client";

import { useEffect, useState } from "react";
import { Loader2, Bookmark, Search, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFavoritePlaces } from "@/hooks/useFavoritePlaces";
import type { FavoritePlace } from "@/types";

interface FavoritePlacePickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (place: FavoritePlace) => void;
}

const PLATFORM_LABEL: Record<string, string> = {
  meituan: "美团",
  dianping: "点评",
  xiaohongshu: "小红书",
  douyin: "抖音",
  unknown: "未知",
};

/**
 * FavoritePlacePicker — 从个人店铺收藏夹中选取一家，回填到发起活动表单。
 */
export function FavoritePlacePicker({
  open,
  onOpenChange,
  onPick,
}: FavoritePlacePickerProps) {
  const { places, loading } = useFavoritePlaces();
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (open) setKeyword("");
  }, [open]);

  const filtered = keyword.trim()
    ? places.filter((p) => {
        const k = keyword.trim().toLowerCase();
        return (
          p.title.toLowerCase().includes(k) ||
          (p.address ?? "").toLowerCase().includes(k) ||
          p.signature_dishes.some((d) => d.toLowerCase().includes(k))
        );
      })
    : places;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Bookmark className="h-4 w-4 text-primary" />
            从收藏夹选取
          </DialogTitle>
          <DialogDescription>
            选中一家店后，店名/地址/电话/招牌菜将自动填入下方表单
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜店名 / 地址 / 招牌菜…"
            className="h-9 pl-8 text-sm"
            autoComplete="off"
          />
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {places.length === 0
                ? "收藏夹还是空的，先去个人中心上传截图识别吧"
                : "没有匹配的店铺"}
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onPick(p);
                  onOpenChange(false);
                }}
                className="w-full rounded-lg border border-border/70 bg-card p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation active:scale-[0.99]"
              >
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <Badge
                    variant="secondary"
                    className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                  >
                    {PLATFORM_LABEL[p.platform] ?? "未知"}
                  </Badge>
                </div>
                {p.summary ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {p.summary}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {p.address ? (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      <span className="line-clamp-1 max-w-[12rem]">
                        {p.address}
                      </span>
                    </span>
                  ) : null}
                  {p.signature_dishes.length > 0 ? (
                    <span className="line-clamp-1">
                      招牌：{p.signature_dishes.join("、")}
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
