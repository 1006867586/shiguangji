"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchData } from "@/lib/fetcher";
import type { PoiCandidate } from "@/lib/poi/types";

interface ActivityPlaceSearchProps {
  /** 选中候选后回调（不覆盖已有美团信息，参见 ActivityForm.handlePickPoi） */
  onPick?: (poi: PoiCandidate) => void;
}

/**
 * 发布动态页：高德地图店铺搜索。
 * - 输入店铺名 + 城市 → 调 /api/map/places/search 拉候选
 * - 选中候选 → 回调 onPick（由 ActivityForm 写入 externalLink）
 * - 与 PlaceSearchBox 的区别：无搜索历史、无 debounce、专注"选一次填一次"流程
 */
export function ActivityPlaceSearch({ onPick }: ActivityPlaceSearchProps) {
  const [city, setCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<PoiCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭候选框
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleSearch = async () => {
    const kw = keyword.trim();
    if (!kw) {
      toast.info("请输入店铺名");
      return;
    }
    setSearching(true);
    try {
      const list = await fetchData<PoiCandidate[]>(
        `/api/map/places/search?keyword=${encodeURIComponent(kw)}${
          city.trim() ? `&city=${encodeURIComponent(city.trim())}` : ""
        }`
      );
      setCandidates(list);
      setOpen(true);
      if (list.length === 0) toast.info("未找到匹配店铺，可更换关键词或城市");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const handlePick = (poi: PoiCandidate) => {
    setOpen(false);
    onPick?.(poi);
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* 城市 + 店铺名 同行输入 */}
      <div className="flex gap-2">
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="城市（如 武汉）"
          aria-label="城市"
          autoComplete="off"
          className="w-28 shrink-0"
        />
        <Input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            if (!e.target.value) setOpen(false);
          }}
          onFocus={() => {
            if (candidates.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch();
            }
          }}
          placeholder="搜索店铺名（如 海底捞火锅）"
          aria-label="店铺名"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleSearch}
          disabled={searching || !keyword.trim()}
          aria-label="搜索店铺"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* 候选列表 */}
      {open && candidates.length > 0 ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background shadow-md">
          {candidates.map((c) => (
            <li key={`${c.provider}-${c.id}`}>
              <button
                type="button"
                onClick={() => handlePick(c)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted"
              >
                <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {c.rating != null ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        ★{c.rating.toFixed(1)}
                      </span>
                    ) : null}
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                      {c.provider === "amap" ? "高德" : "百度"}
                    </span>
                  </span>
                </span>
                {c.address ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{c.address}</span>
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 空状态提示 */}
      {open && candidates.length === 0 && !searching ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-muted-foreground shadow-md">
          未找到匹配店铺
        </div>
      ) : null}

      {/* 搜索中 */}
      {searching ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-muted-foreground shadow-md">
          搜索中…
        </div>
      ) : null}

      {/* 隐藏的清除按钮占位（占位避免后续扩展） */}
      {keyword && !open ? (
        <button
          type="button"
          aria-label="清除关键词"
          onClick={() => {
            setKeyword("");
            setCandidates([]);
            setOpen(false);
          }}
          className="absolute right-12 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}