"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Link2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GroupSelector } from "@/components/group/GroupSelector";
import { ExternalLinkCard } from "@/components/activity/ExternalLinkCard";
import { createActivity } from "@/hooks/useActivity";
import { fetchData } from "@/lib/fetcher";
import { isUrl, detectPlatform, extractUrlFromText } from "@/lib/utils";
import type { ExternalLink, Group } from "@/types";

interface ActivityFormProps {
  defaultGroupId?: string;
  groups: Group[];
  repostOfId?: string;
  repostAuthorName?: string;
}

export function ActivityForm({
  defaultGroupId,
  groups,
  repostOfId,
  repostAuthorName,
}: ActivityFormProps) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [externalLink, setExternalLink] = useState<ExternalLink | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groups, groupId]);

  const parseLink = async () => {
    const input = linkUrl.trim();
    if (!input) {
      toast.error("请输入链接或分享文本");
      return;
    }
    // 支持纯 URL 或含 URL 的分享文本
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
      // 降级：直接使用基础信息
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

  const submit = async () => {
    if (!groupId) {
      toast.error("请选择团体");
      return;
    }
    if (!content.trim() && !externalLink && !repostOfId) {
      toast.error("请填写内容或粘贴链接");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createActivity({
        groupId,
        content: content.trim() || undefined,
        externalLink: externalLink ?? undefined,
        repostOfId: repostOfId,
        repostComment: repostOfId ? content.trim() || undefined : undefined,
      });
      toast.success("发布成功");
      router.push(`/g/${groupId}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 团体选择 */}
      <div className="space-y-1.5">
        <Label htmlFor="group-select">发布到</Label>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            你还未加入任何团体，请先{" "}
            <a href="/groups/new" className="text-primary hover:underline">
              创建团体
            </a>{" "}
            或{" "}
            <a href="/join" className="text-primary hover:underline">
              加入团体
            </a>
          </p>
        ) : (
          <GroupSelector
            id="group-select"
            currentGroupId={groupId}
            onSelect={(g) => setGroupId(g.id)}
          />
        )}
      </div>

      {/* 分享提示 */}
      {repostOfId ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground">
            分享 <span className="font-medium text-foreground">@{repostAuthorName}</span> 的动态
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            下方输入框内容将作为分享附言
          </p>
        </div>
      ) : null}

      {/* 文字内容 */}
      <div className="space-y-1.5">
        <Label htmlFor="content">
          {repostOfId ? "附言（可选）" : "想说点什么"}
        </Label>
        <Textarea
          id="content"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            repostOfId
              ? "添加分享附言…"
              : "今晚吃火锅！@大家 7点老地方见"
          }
          rows={4}
          maxLength={1000}
          autoComplete="off"
        />
        <div className="text-right text-xs text-muted-foreground">
          {content.length}/1000
        </div>
      </div>

      {/* 外部链接 */}
      {repostOfId ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="link-url">美团/点评链接（可选）</Label>
          <div className="flex gap-2">
            <Input
              id="link-url"
              name="link-url"
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
                  onChange={(e) =>
                    setExternalLink((prev) =>
                      prev
                        ? {
                            ...prev,
                            rating: e.target.value
                              ? parseFloat(e.target.value) || null
                              : null,
                          }
                        : prev
                    )
                  }
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
                onChange={(e) =>
                  updateLinkField("coverImage", e.target.value)
                }
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
      )}

      {/* 提交 */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          disabled={submitting}
        >
          取消
        </Button>
        <Button onClick={submit} disabled={submitting || !groupId}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          发布
        </Button>
      </div>
    </div>
  );
}
