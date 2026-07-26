"use client";

import { useRef, useState } from "react";
import {
  Bookmark,
  Upload,
  Loader2,
  Trash2,
  MapPin,
  Phone,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/EmptyState";
import { useUpload } from "@/hooks/useUpload";
import {
  useFavoritePlaces,
  useAiParseFavorites,
} from "@/hooks/useFavoritePlaces";
import type { FavoritePlatform } from "@/types";
import { useAiEnabled } from "@/hooks/useAiEnabled";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic";

const PLATFORM_LABEL: Record<FavoritePlatform, string> = {
  meituan: "美团",
  dianping: "大众点评",
  xiaohongshu: "小红书",
  douyin: "抖音",
  unknown: "未知",
};

type DraftPlace = {
  title: string;
  address: string;
  phone: string;
  signatureDishes: string[];
  summary: string;
};

/**
 * FavoritePlacesSection — 店铺收藏夹区块。
 * 上传美团/点评收藏夹截图 → AI 识别多家店 → 预览编辑 → 批量入库。
 */
export function FavoritePlacesSection() {
  const aiEnabled = useAiEnabled();
  const { places, loading, addMany, remove } = useFavoritePlaces();
  const { uploadFile, uploading } = useUpload();
  const { parse, loading: parsing } = useAiParseFavorites();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drafts, setDrafts] = useState<DraftPlace[]>([]);
  const [draftPlatform, setDraftPlatform] = useState<FavoritePlatform>("unknown");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const url = await uploadFile(file);
      if (!url) return;
      const result = await parse(url);
      if (result.places.length === 0) {
        toast.error("未识别到任何店铺，请换一张更清晰的收藏夹截图");
        return;
      }
      setDrafts(
        result.places.map((p) => ({
          title: p.title,
          address: p.address ?? "",
          phone: p.phone ?? "",
          signatureDishes: p.signatureDishes,
          summary: p.summary,
        }))
      );
      setDraftPlatform(result.platform);
      setSourceUrl(url);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "识别失败");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateDraft = (idx: number, patch: Partial<DraftPlace>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const valid = drafts.filter((d) => d.title.trim());
    if (valid.length === 0) {
      toast.error("没有有效的店铺条目");
      return;
    }
    setSaving(true);
    try {
      const res = await addMany({
        platform: draftPlatform,
        sourceScreenshotUrl: sourceUrl ?? undefined,
        places: valid.map((d) => ({
          title: d.title.trim(),
          address: d.address.trim() || null,
          phone: d.phone.trim() || null,
          signatureDishes: d.signatureDishes,
          summary: d.summary.trim(),
        })),
      });
      const parts: string[] = [];
      if (res.inserted > 0) parts.push(`新增 ${res.inserted} 家`);
      if (res.duplicated > 0) parts.push(`${res.duplicated} 家已存在`);
      toast.success(parts.length ? parts.join("，") : "没有变化");
      setPreviewOpen(false);
      setDrafts([]);
      setSourceUrl(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await remove(id);
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setRemovingId(null);
    }
  };

  const busy = uploading || parsing;

  return (
    <div className="mt-2 border-t border-border/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <Bookmark className="h-4 w-4 text-primary" />
          店铺收藏夹
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {places.length}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!aiEnabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          上传截图识别
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : places.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="h-8 w-8" />}
          title="还没有收藏的店铺"
          description={
            aiEnabled
              ? "上传美团/大众点评等收藏夹截图，AI 自动识别批量导入"
              : "AI 功能未启用，无法识别截图"
          }
        />
      ) : (
        <div className="space-y-2">
          {places.map((p) => (
            <div
              key={p.id}
              className="group relative rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs transition-all hover:border-border hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <Badge
                      variant="secondary"
                      className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                    >
                      {PLATFORM_LABEL[p.platform]}
                    </Badge>
                  </div>
                  {p.summary ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {p.summary}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {p.address ? (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        <span className="line-clamp-1 max-w-[12rem]">
                          {p.address}
                        </span>
                      </span>
                    ) : null}
                    {p.phone ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Phone className="h-3 w-3" />
                        {p.phone}
                      </span>
                    ) : null}
                  </div>
                  {p.signature_dishes.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <Utensils className="h-3 w-3 text-muted-foreground" />
                      {p.signature_dishes.slice(0, 4).map((d) => (
                        <span
                          key={d}
                          className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(p.id)}
                  disabled={removingId === p.id}
                  aria-label="删除"
                  className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-50"
                >
                  {removingId === p.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ParsePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        drafts={drafts}
        platform={draftPlatform}
        onPlatformChange={setDraftPlatform}
        onUpdate={updateDraft}
        onRemove={removeDraft}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}

// ============================================================
// 识别预览对话框：可编辑每条 / 删除单条 / 全部入库
// ============================================================

interface ParsePreviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  drafts: DraftPlace[];
  platform: FavoritePlatform;
  onPlatformChange: (p: FavoritePlatform) => void;
  onUpdate: (idx: number, patch: Partial<DraftPlace>) => void;
  onRemove: (idx: number) => void;
  onSave: () => void;
  saving: boolean;
}

function ParsePreviewDialog({
  open,
  onOpenChange,
  drafts,
  platform,
  onPlatformChange,
  onUpdate,
  onRemove,
  onSave,
  saving,
}: ParsePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>识别结果预览</DialogTitle>
          <DialogDescription>
            共识别到 {drafts.length} 家店铺，可逐条编辑或删除后批量入库
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">来源平台</span>
          <select
            value={platform}
            onChange={(e) =>
              onPlatformChange(e.target.value as FavoritePlatform)
            }
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(Object.keys(PLATFORM_LABEL) as FavoritePlatform[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {drafts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              已全部删除
            </p>
          ) : (
            drafts.map((d, idx) => (
              <div
                key={idx}
                className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    aria-label="删除该条"
                    className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      店名
                    </Label>
                    <Input
                      value={d.title}
                      onChange={(e) => onUpdate(idx, { title: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        地址
                      </Label>
                      <Input
                        value={d.address}
                        onChange={(e) =>
                          onUpdate(idx, { address: e.target.value })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        电话
                      </Label>
                      <Input
                        value={d.phone}
                        onChange={(e) =>
                          onUpdate(idx, { phone: e.target.value })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      招牌菜（逗号分隔）
                    </Label>
                    <Input
                      value={d.signatureDishes.join("，")}
                      onChange={(e) =>
                        onUpdate(idx, {
                          signatureDishes: e.target.value
                            .split(/[,，]/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      一句话简介
                    </Label>
                    <Input
                      value={d.summary}
                      onChange={(e) =>
                        onUpdate(idx, { summary: e.target.value })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={onSave} disabled={saving || drafts.length === 0}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            全部入库 ({drafts.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
