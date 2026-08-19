"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, History, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchData } from "@/lib/fetcher";
import type { PoiCandidate } from "@/lib/poi/types";

interface PlaceSearchBoxProps {
  city?: string | null;
  onPick?: (candidate: PoiCandidate) => void;
}

const HISTORY_KEY = "xiangke:map:search-history";
const HISTORY_MAX = 10;
const DEBOUNCE_MS = 350;

/** 从 localStorage 读取搜索历史（容错 + 上限） */
function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string").slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function writeHistory(items: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    // localStorage 满了或禁用，静默忽略
  }
}

/**
 * 地图页顶部搜索框：
 * - 输入时 debounce 350ms 自动联想
 * - 候选来自高德/百度 POI（受当前城市限定）
 * - 选中候选后回调 onPick
 * - 搜索历史写入 localStorage（最多 10 条）
 */
export function PlaceSearchBox({ city, onPick }: PlaceSearchBoxProps) {
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<PoiCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 初始加载历史
  useEffect(() => {
    setHistory(readHistory());
  }, []);

  // 点击外部关闭候选框
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const runSearch = async (kw: string) => {
    if (!kw) {
      setCandidates([]);
      setOpen(false);
      return;
    }
    // 取消上一次未完成请求
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    try {
      const list = await fetchData<PoiCandidate[]>(
        `/api/map/places/search?keyword=${encodeURIComponent(kw)}${
          city ? `&city=${encodeURIComponent(city)}` : ""
        }`,
        { signal: ctrl.signal }
      );
      setCandidates(list);
      setOpen(true);
      if (list.length === 0) toast.info("未找到匹配地点，可更换关键词");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (value: string) => {
    setKeyword(value);
    if (!value) {
      setCandidates([]);
      setOpen(history.length > 0);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), DEBOUNCE_MS);
  };

  const commitPick = (c: PoiCandidate) => {
    // 写入历史（按关键词去重，最近的排前）
    const next = [keyword, ...history.filter((h) => h !== keyword)].slice(0, HISTORY_MAX);
    setHistory(next);
    writeHistory(next);
    setOpen(false);
    onPick?.(c);
  };

  const pickHistory = (kw: string) => {
    setKeyword(kw);
    setOpen(false);
    void runSearch(kw);
  };

  const removeHistory = (kw: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = history.filter((h) => h !== kw);
    setHistory(next);
    writeHistory(next);
  };

  const showHistory = open && !keyword && history.length > 0;
  const showCandidates = open && keyword && candidates.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <Input
          value={keyword}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (!keyword && history.length > 0) setOpen(true);
            if (keyword && candidates.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              void runSearch(keyword);
            }
          }}
          placeholder="搜索店铺并打卡"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            void runSearch(keyword);
          }}
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

      {/* 联想候选 */}
      {showCandidates ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background shadow-md">
          {candidates.map((c) => (
            <li key={`${c.provider}-${c.id}`}>
              <button
                type="button"
                onClick={() => commitPick(c)}
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

      {/* 搜索历史 */}
      {showHistory ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border bg-background shadow-md">
          <div className="flex items-center justify-between px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <History className="h-3 w-3" aria-hidden="true" />
              最近搜索
            </span>
          </div>
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  onClick={() => pickHistory(h)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{h}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => removeHistory(h, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        removeHistory(h, e as unknown as React.MouseEvent);
                    }}
                    aria-label={`删除历史：${h}`}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 联想中（防抖期间） */}
      {open && keyword && searching && candidates.length === 0 ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-muted-foreground shadow-md">
          搜索中…
        </div>
      ) : null}
    </div>
  );
}