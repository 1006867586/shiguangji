"use client";

import { useState } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchData } from "@/lib/fetcher";
import type { PoiCandidate } from "@/lib/poi/types";

interface PlaceSearchBoxProps {
  city?: string | null;
  onPick?: (candidate: PoiCandidate) => void;
}

/** 地图页顶部搜索框：检索地点 → 点击候选回调（定位 + 打卡） */
export function PlaceSearchBox({ city, onPick }: PlaceSearchBoxProps) {
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<PoiCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSearch = async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearching(true);
    try {
      const list = await fetchData<PoiCandidate[]>(
        `/api/map/places/search?keyword=${encodeURIComponent(kw)}${
          city ? `&city=${encodeURIComponent(city)}` : ""
        }`
      );
      setCandidates(list);
      setOpen(true);
      if (list.length === 0) toast.info("未找到匹配地点，可更换关键词");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            if (!e.target.value) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          onFocus={() => {
            if (candidates.length > 0) setOpen(true);
          }}
          placeholder="搜索店铺并打卡"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={handleSearch}
          disabled={searching || !keyword.trim()}
          aria-label="搜索"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {open && candidates.length > 0 ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background shadow-md">
          {candidates.map((c) => (
            <li key={`${c.provider}-${c.id}`}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick?.(c);
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted"
              >
                <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {c.provider === "amap" ? "高德" : "百度"}
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
    </div>
  );
}
