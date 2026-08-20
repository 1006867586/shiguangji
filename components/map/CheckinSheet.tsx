"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, MapPinned } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { fetchData } from "@/lib/fetcher";
import type { CreateCheckinResult } from "@/types";
import type { PoiCandidate } from "@/lib/poi/types";

interface CheckinSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 预填地点：有坐标则直接打卡；无坐标（如收藏夹）则先搜索确认 */
  initialPlace?: {
    name?: string | null;
    address?: string | null;
    city?: string | null;
    lng?: number | null;
    lat?: number | null;
  } | null;
  /** 关联的聚餐活动（可选） */
  activityId?: string | null;
  onSuccess?: (result: CreateCheckinResult) => void;
}

type PlaceDraft = {
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  category: string | null;
  lng: number;
  lat: number;
  source: "amap" | "baidu" | "tencent" | "manual";
  poi_id: string | null;
  /** 富信息（来自高德 POI 详情，迁移 021） */
  rating?: number | null;
  average_price?: string | null;
  phone?: string | null;
  business_hours?: string | null;
  description?: string | null;
  tags?: string[] | null;
  /** 封面图 URL（迁移 022） */
  cover_image_url?: string | null;
};

function candidateToDraft(c: PoiCandidate): PlaceDraft {
  return {
    name: c.name,
    address: c.address,
    city: c.city,
    district: null,
    category: c.category,
    lng: c.location.lng,
    lat: c.location.lat,
    source: c.provider,
    poi_id: c.id,
    // 富信息（来自 PoiCandidate；tags/business_hours/description 暂未在 POI 接口返回，留待扩展）
    rating: c.rating,
    average_price: c.price != null ? `¥${c.price}` : null,
    phone: c.phone,
    cover_image_url: c.photos && c.photos.length > 0 ? c.photos[0] : null,
  } as PlaceDraft;
}

/** 打卡表单：地点搜索/确认 + 备注 + 提交 */
export function CheckinSheet({
  open,
  onOpenChange,
  initialPlace,
  activityId,
  onSuccess,
}: CheckinSheetProps) {
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<PoiCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PlaceDraft | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 打开时重置并预填
  useEffect(() => {
    if (!open) return;
    setNote("");
    setCandidates([]);
    setSearching(false);
    setSubmitting(false);
    setKeyword(initialPlace?.name ?? "");
    if (
      initialPlace &&
      typeof initialPlace.lng === "number" &&
      typeof initialPlace.lat === "number"
    ) {
      setSelected({
        name: initialPlace.name ?? "",
        address: initialPlace.address ?? null,
        city: initialPlace.city ?? null,
        district: null,
        category: null,
        lng: initialPlace.lng,
        lat: initialPlace.lat,
        source: "manual",
        poi_id: null,
      } as PlaceDraft);
    } else {
      setSelected(null);
    }
  }, [open, initialPlace]);

  const handleSearch = async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearching(true);
    try {
      const list = await fetchData<PoiCandidate[]>(
        `/api/map/places/search?keyword=${encodeURIComponent(kw)}&city=${
          initialPlace?.city ? encodeURIComponent(initialPlace.city) : ""
        }`
      );
      setCandidates(list);
      if (list.length === 0) toast.info("未找到匹配地点，可更换关键词");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected) {
      toast.error("请先选择地点");
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetchData<CreateCheckinResult>("/api/map/checkins", {
        method: "POST",
        body: JSON.stringify({
          place: selected,
          activity_id: activityId ?? null,
          note: note.trim() || null,
        }),
      });
      toast.success(result.place_created ? "打卡成功（新地点）" : "打卡成功");
      onSuccess?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "打卡失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>打卡</DialogTitle>
          <DialogDescription>
            {activityId
              ? "记录一次与聚餐相关的打卡"
              : "记录一次美食打卡，可关联聚餐活动"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {!selected ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  placeholder="输入店铺名搜索"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSearch}
                  disabled={searching || !keyword.trim()}
                  aria-label="搜索地点"
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              {candidates.length > 0 ? (
                <ul className="max-h-52 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {candidates.map((c) => (
                    <li key={`${c.provider}-${c.id}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(candidateToDraft(c))}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="flex w-full items-center justify-between text-sm font-medium">
                          {c.name}
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                            {c.provider === "amap" ? "高德" : "百度"}
                          </span>
                        </span>
                        {c.address ? (
                          <span className="text-xs text-muted-foreground">
                            {c.address}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{selected.name}</p>
                  {selected.address ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.address}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  重选
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="checkin-note">备注（可选）</Label>
            <Textarea
              id="checkin-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="比如：和朋友吃的、招牌菜不错…"
              rows={2}
              maxLength={200}
            />
          </div>

          <Button
            className="w-full"
            disabled={!selected || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <MapPinned className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            确认打卡
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
