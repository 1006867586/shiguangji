"use client";

import { useEffect, useState } from "react";
import { Loader2, Link2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLinkCard } from "@/components/activity/ExternalLinkCard";
import { updateActivity } from "@/hooks/useActivity";
import { fetchData } from "@/lib/fetcher";
import { isUrl, detectPlatform, extractUrlFromText } from "@/lib/utils";
import type { Activity, ExternalLink } from "@/types";

interface EditActivityDialogProps {
  activity: Activity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (activity: Activity) => void;
}

export function EditActivityDialog({
  activity,
  open,
  onOpenChange,
  onUpdated,
}: EditActivityDialogProps) {
  const [content, setContent] = useState(activity.content ?? "");
  const [linkUrl, setLinkUrl] = useState("");
  const [externalLink, setExternalLink] = useState<ExternalLink | null>(
    activity.external_link
  );
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 每次打开时同步初始值（同一组件实例可能被多次打开编辑不同活动）
  useEffect(() => {
    if (open) {
      setContent(activity.content ?? "");
      setExternalLink(activity.external_link);
      setLinkUrl("");
    }
  }, [open, activity.id, activity.content, activity.external_link]);

  const parseLink = async () => {
    const input = linkUrl.trim();
    if (!input) {
      toast.error("请输入链接或分享文本");
      return;
    }
    const extractedUrl = extractUrlFromText(input);
    if (!isUrl(input) && !extractedUrl) {
      toast.error("未识别到有效链接");
      return;
    }
    setParsing(true);
    try {
      const res = await fetchData<{ fallback?: boolean } & ExternalLink>(
        "/api/link-preview",
        {
          method: "POST",
          body: JSON.stringify({ url: input }),
        }
      );
      setExternalLink(res);
      if (res.fallback) {
        toast.info("无法自动解析，请手动补充标题与封面");
      } else {
        toast.success("已解析链接");
      }
    } catch {
      const fallbackUrl = extractedUrl ?? input;
      setExternalLink({
        platform: detectPlatform(fallbackUrl),
        url: fallbackUrl,
        title: "",
        coverImage: null,
        rating: null,
        address: null,
        phone: null,
        price: null,
      });
      toast.info("解析失败，可手动补充信息");
    } finally {
      setParsing(false);
    }
  };

  const updateLinkField = (field: keyof ExternalLink, value: string) => {
    setExternalLink((prev) =>
      prev ? { ...prev, [field]: value || null } : prev
    );
  };

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed && !externalLink) {
      toast.error("内容和链接不能同时为空");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateActivity(activity.id, {
        content: trimmed,
        externalLink,
      });
      toast.success("已保存");
      onUpdated?.(updated);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const updateLinkRating = (value: string) => {
    setExternalLink((prev) =>
      prev
        ? {
            ...prev,
            rating: value ? parseFloat(value) || null : null,
          }
        : prev
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑动态</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* 文字内容 */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-content">想说点什么</Label>
            <Textarea
              id="edit-content"
              name="edit-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="今晚吃火锅！@大家 7点老地方见"
              rows={4}
              maxLength={1000}
              autoComplete="off"
            />
            <div className="text-right text-xs text-muted-foreground">
              {content.length}/1000
            </div>
          </div>

          {/* 外部链接 */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-link-url">美团/点评链接（可选）</Label>
            <div className="flex gap-2">
              <Input
                id="edit-link-url"
                name="edit-link-url"
                type="url"
                inputMode="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="粘贴美团分享文本或链接…"
                autoComplete="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    parseLink();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={parseLink}
                disabled={parsing || !linkUrl.trim()}
              >
                {parsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                解析
              </Button>
            </div>

            {externalLink ? (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    链接卡片预览
                  </span>
                  <button
                    type="button"
                    onClick={() => setExternalLink(null)}
                    aria-label="清除链接"
                    className="text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <Input
                  value={externalLink.title ?? ""}
                  onChange={(e) => updateLinkField("title", e.target.value)}
                  placeholder="标题（如：海底捞火锅）"
                  aria-label="标题"
                  autoComplete="off"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={externalLink.address ?? ""}
                    onChange={(e) => updateLinkField("address", e.target.value)}
                    placeholder="地址"
                    aria-label="地址"
                    autoComplete="off"
                  />
                  <Input
                    value={externalLink.phone ?? ""}
                    onChange={(e) => updateLinkField("phone", e.target.value)}
                    placeholder="电话"
                    aria-label="电话"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={externalLink.rating?.toString() ?? ""}
                    onChange={(e) => updateLinkRating(e.target.value)}
                    placeholder="评分（如 4.5）"
                    inputMode="decimal"
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    aria-label="评分"
                    autoComplete="off"
                  />
                  <Input
                    value={externalLink.price ?? ""}
                    onChange={(e) => updateLinkField("price", e.target.value)}
                    placeholder="人均（如 ¥80/人）"
                    aria-label="人均"
                    autoComplete="off"
                  />
                </div>
                <Input
                  value={externalLink.coverImage ?? ""}
                  onChange={(e) => updateLinkField("coverImage", e.target.value)}
                  placeholder="封面图 URL"
                  aria-label="封面图 URL"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                />

                <ExternalLinkCard link={externalLink} />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="touch-manipulation active:scale-[0.97]"
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="touch-manipulation active:scale-[0.97]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
