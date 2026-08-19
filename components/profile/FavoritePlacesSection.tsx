"use client";

import { useRef, useState } from "react";
import {
  Bookmark,
  Upload,
  Loader2,
  Trash2,
  MapPin,
  MapPinned,
  Phone,
  Utensils,
  Star,
  Globe,
  ExternalLink,
  Pencil,
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
import { MapLauncher } from "@/components/common/MapLauncher";
import { CheckinSheet } from "@/components/map/CheckinSheet";
import { useUpload } from "@/hooks/useUpload";
import {
  useFavoritePlaces,
  useAiParseFavorites,
  useEnrichPlace,
} from "@/hooks/useFavoritePlaces";
import type {
  FavoritePlace,
  FavoritePlatform,
  UpdateFavoritePlaceBody,
} from "@/types";
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
  rating: number | null;
  averagePrice: string;
  category: string;
};

/**
 * FavoritePlacesSection — 店铺收藏夹区块。
 * 上传美团/点评收藏夹截图 → AI 识别多家店 → 预览编辑 → 批量入库。
 */
export function FavoritePlacesSection() {
  const aiEnabled = useAiEnabled();
  const { places, loading, addMany, remove, patchPlace, updateOne } =
    useFavoritePlaces();
  const { uploadFile, uploading } = useUpload();
  const { parse, loading: parsing } = useAiParseFavorites();
  const {
    enrichingIds,
    batchProgress,
    enrichOne,
    enrichMany,
    error: enrichError,
  } = useEnrichPlace(patchPlace);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drafts, setDrafts] = useState<DraftPlace[]>([]);
  const [draftPlatform, setDraftPlatform] = useState<FavoritePlatform>("unknown");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  /** 正在编辑的店铺（编辑对话框开关由 editingPlace 是否为空控制） */
  const [editingPlace, setEditingPlace] = useState<FavoritePlace | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  /** 正在打卡的收藏店铺（打开打卡表单，收藏夹无坐标时先在表单内搜索确认） */
  const [checkinTarget, setCheckinTarget] = useState<FavoritePlace | null>(
    null
  );

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
          rating: p.rating,
          averagePrice: p.averagePrice ?? "",
          category: p.category ?? "",
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
        // 入库后自动通过高德/百度地图补齐缺失的电话/地址（未配置地图 Key 时后端跳过）
        enrichPoi: true,
        places: valid.map((d) => ({
          title: d.title.trim(),
          address: d.address.trim() || null,
          phone: d.phone.trim() || null,
          signatureDishes: d.signatureDishes,
          summary: d.summary.trim(),
          rating: d.rating,
          averagePrice: d.averagePrice.trim() || null,
          category: d.category.trim() || null,
        })),
      });
      const parts: string[] = [];
      if (res.inserted > 0) parts.push(`新增 ${res.inserted} 家`);
      if (res.duplicated > 0) parts.push(`${res.duplicated} 家已存在`);
      if (res.poiEnriched && res.poiEnriched.matched > 0) {
        parts.push(`地图补齐 ${res.poiEnriched.matched} 家`);
      }
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

  /** 保存编辑：把对话框表单值规范化后 PATCH，成功后关闭并 toast */
  const handleSaveEdit = async (
    placeId: string,
    body: UpdateFavoritePlaceBody
  ) => {
    setSavingEdit(true);
    try {
      await updateOne(placeId, body);
      toast.success("已保存");
      setEditingPlace(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEnrichOne = async (placeId: string, force = false) => {
    try {
      const res = await enrichOne(placeId, force);
      if (res.skipped) {
        toast.info("该店铺信息已完整，无需补齐");
      } else if (res.updatedFields && res.updatedFields.length > 0) {
        toast.success(`已补齐 ${res.updatedFields.length} 个字段`);
      } else {
        toast.info("未搜索到可补齐的信息");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "联网搜索失败");
    }
  };

  const handleEnrichAll = async () => {
    // 仅补齐缺少封面图或店铺链接的条目，避免重复消耗配额
    const targets = places.filter(
      (p) => !p.cover_image_url || !p.store_url || !p.phone || !p.address
    );
    if (targets.length === 0) {
      toast.success("所有店铺信息已完整");
      return;
    }
    toast.info(`开始批量补齐 ${targets.length} 家店铺，请稍候`);
    try {
      await enrichMany(targets, false);
      toast.success("批量补齐完成");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量补齐失败");
    }
  };

  const busy = uploading || parsing;
  const batchRunning = batchProgress != null;
  const hasXhsOrDouyin = places.some(
    (p) => p.platform === "xiaohongshu" || p.platform === "douyin"
  );
  const showDegradedHint = !aiEnabled && hasXhsOrDouyin;

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
        <div className="flex items-center gap-1.5">
          {aiEnabled && places.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={batchRunning || enrichingIds.size > 0}
              onClick={handleEnrichAll}
              title="联网搜索补齐封面图、店铺链接、电话、地址"
            >
              {batchRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
              联网补齐
            </Button>
          ) : null}
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
      </div>

      {showDegradedHint ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          小红书/抖音店铺信息需 AI 联网补全，未配置 AI 时可能缺少封面与评分。
        </p>
      ) : null}

      {batchProgress ? (
        <div className="mb-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-primary">
              批量补齐中 {batchProgress.done}/{batchProgress.total}
            </span>
            <span className="text-muted-foreground">
              成功 {batchProgress.success} · 失败 {batchProgress.failed}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${
                  batchProgress.total > 0
                    ? (batchProgress.done / batchProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {enrichError ? (
        <p className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
          {enrichError}
        </p>
      ) : null}

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
          {places.map((p) => {
            const enriching = enrichingIds.has(p.id);
            const needEnrich =
              !p.cover_image_url || !p.store_url || !p.phone || !p.address;
            return (
              <div
                key={p.id}
                className="group relative rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs transition-all hover:border-border hover:shadow-md"
              >
                <div className="flex items-start gap-2">
                  {p.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.cover_image_url}
                      alt={p.title}
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Utensils className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.store_url ? (
                        <a
                          href={p.store_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-sm font-medium text-primary hover:underline"
                          title="点击查看店铺详情"
                        >
                          {p.title}
                        </a>
                      ) : (
                        <p className="truncate text-sm font-medium">{p.title}</p>
                      )}
                      <Badge
                        variant="secondary"
                        className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                      >
                        {PLATFORM_LABEL[p.platform]}
                      </Badge>
                      {p.category ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                        >
                          {p.category}
                        </Badge>
                      ) : null}
                      {p.rating != null ? (
                        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-warning">
                          <Star className="h-3 w-3 fill-current" />
                          {p.rating.toFixed(1)}
                        </span>
                      ) : null}
                      {p.price ? (
                        <span className="text-[11px] font-medium text-accent-foreground">
                          {p.price}
                        </span>
                      ) : null}
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
                          <MapLauncher name={p.title} address={p.address}>
                            <span className="line-clamp-1 max-w-[12rem]">
                              {p.address}
                            </span>
                          </MapLauncher>
                        </span>
                      ) : null}
                      {p.phone ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Phone className="h-3 w-3" />
                          {p.phone}
                        </span>
                      ) : null}
                      {p.store_url ? (
                        <a
                          href={p.store_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          详情
                        </a>
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {aiEnabled ? (
                      <button
                        type="button"
                        onClick={() => handleEnrichOne(p.id, !needEnrich)}
                        disabled={enriching || batchRunning}
                        aria-label="联网搜索补齐"
                        title={
                          needEnrich
                            ? "联网搜索补齐信息"
                            : "重新联网搜索（覆盖现有信息）"
                        }
                        className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-50"
                      >
                        {enriching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Globe className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setCheckinTarget(p)}
                      aria-label="去打卡"
                      title="去打卡"
                      className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                    >
                      <MapPinned className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPlace(p)}
                      aria-label="编辑店铺信息"
                      title="编辑店铺信息"
                      className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(p.id)}
                      disabled={removingId === p.id}
                      aria-label="删除"
                      className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-50"
                    >
                      {removingId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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

      <EditPlaceDialog
        key={editingPlace?.id ?? "none"}
        place={editingPlace}
        onOpenChange={(v) => {
          if (!v) setEditingPlace(null);
        }}
        onSave={handleSaveEdit}
        saving={savingEdit}
      />

      {/* 收藏夹一键打卡：收藏夹暂无坐标，表单内先搜索确认地点再打卡 */}
      <CheckinSheet
        open={Boolean(checkinTarget)}
        onOpenChange={(v) => {
          if (!v) setCheckinTarget(null);
        }}
        initialPlace={
          checkinTarget
            ? {
                name: checkinTarget.title,
                address: checkinTarget.address,
                city: checkinTarget.city ?? null,
              }
            : null
        }
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
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        评分
                      </Label>
                      <Input
                        value={d.rating?.toString() ?? ""}
                        onChange={(e) =>
                          onUpdate(idx, {
                            rating: e.target.value
                              ? parseFloat(e.target.value) || null
                              : null,
                          })
                        }
                        placeholder="4.5"
                        inputMode="decimal"
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        人均
                      </Label>
                      <Input
                        value={d.averagePrice}
                        onChange={(e) =>
                          onUpdate(idx, { averagePrice: e.target.value })
                        }
                        placeholder="￥80"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        分类
                      </Label>
                      <Input
                        value={d.category}
                        onChange={(e) =>
                          onUpdate(idx, { category: e.target.value })
                        }
                        placeholder="火锅"
                        className="h-8 text-sm"
                      />
                    </div>
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

// ============================================================
// 编辑对话框：修改已入库的单条店铺信息
// ============================================================

interface EditPlaceDialogProps {
  /** 为 null 时关闭 */
  place: FavoritePlace | null;
  onOpenChange: (v: boolean) => void;
  onSave: (placeId: string, body: UpdateFavoritePlaceBody) => void;
  saving: boolean;
}

function EditPlaceDialog({
  place,
  onOpenChange,
  onSave,
  saving,
}: EditPlaceDialogProps) {
  // place 变化时由父组件 key 重挂载，这里初始化一次即可
  const [title, setTitle] = useState(place?.title ?? "");
  const [address, setAddress] = useState(place?.address ?? "");
  const [phone, setPhone] = useState(place?.phone ?? "");
  const [storeUrl, setStoreUrl] = useState(place?.store_url ?? "");
  const [dishes, setDishes] = useState(
    place?.signature_dishes.join("，") ?? ""
  );
  const [rating, setRating] = useState(place?.rating?.toString() ?? "");
  const [price, setPrice] = useState(place?.price ?? "");
  const [category, setCategory] = useState(place?.category ?? "");
  const [summary, setSummary] = useState(place?.summary ?? "");
  const [platform, setPlatform] = useState<FavoritePlatform>(
    place?.platform ?? "unknown"
  );

  const canSubmit = title.trim().length > 0 && !saving;

  const handleSubmit = () => {
    if (!place || !canSubmit) return;
    const parsedRating = rating ? parseFloat(rating) : NaN;
    onSave(place.id, {
      title: title.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      store_url: storeUrl.trim() || null,
      signature_dishes: dishes
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      rating: rating && Number.isFinite(parsedRating) ? parsedRating : null,
      price: price.trim() || null,
      category: category.trim() || null,
      summary: summary.trim(),
      platform,
    });
  };

  return (
    <Dialog open={place != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑店铺</DialogTitle>
          <DialogDescription>
            修改后立即保存，留空的选填字段会清空
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
          <div>
            <Label className="text-[11px] text-muted-foreground">
              店名 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">
                地址
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">
                电话
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">
              店铺链接
            </Label>
            <Input
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">
              招牌菜（逗号分隔）
            </Label>
            <Input
              value={dishes}
              onChange={(e) => setDishes(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">
                评分
              </Label>
              <Input
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                placeholder="4.5"
                inputMode="decimal"
                type="number"
                min={0}
                max={5}
                step={0.1}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">
                人均
              </Label>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="￥80"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">
                分类
              </Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="火锅"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">
              一句话简介
            </Label>
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">来源平台</span>
            <select
              value={platform}
              onChange={(e) =>
                setPlatform(e.target.value as FavoritePlatform)
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
